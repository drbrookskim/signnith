"""Step Functions State 4 — Pinecone RAG 검색 + Claude 분석."""

from __future__ import annotations

import json
import logging
import os

logger = logging.getLogger(__name__)

ANALYSIS_QUERIES = [
    "경영진이 이전 발표에서 한 약속을 지켰는가?",
    "가장 중요한 리스크 요인은 무엇인가?",
    "핵심 성장 동력은 무엇인가?",
]
TOP_K = 10
CLAUDE_MODEL = "claude-sonnet-4-6"
MAX_TOKENS = 2048


class LLMAnalyzeError(Exception):
    """LLM 분석 실패 시 발생합니다."""


def analyze_and_save(
    pinecone_namespace: str,
    ticker: str,
    fiscal_year: int,
    job_id: str,
) -> None:
    """RAG 검색 + Claude 분석 후 DB에 저장합니다.

    Args:
        pinecone_namespace: Pinecone namespace ("{ticker}_{fiscal_year}")
        ticker: 종목코드
        fiscal_year: 회계연도
        job_id: 분석 작업 ID

    Raises:
        LLMAnalyzeError: 분석 또는 DB 저장 실패 시
    """
    query_embeddings = _embed_queries(ANALYSIS_QUERIES)
    context_chunks = _retrieve_context(
        query_embeddings=query_embeddings,
        namespace=pinecone_namespace,
    )
    result = _call_claude(
        context_chunks=context_chunks,
        ticker=ticker,
        fiscal_year=fiscal_year,
    )
    _persist(job_id=job_id, ticker=ticker, fiscal_year=fiscal_year, result=result)
    logger.info(
        "LLMAnalyze: job_id=%s 완료 (integrity_score=%s)",
        job_id,
        result.get("integrity_score"),
    )


def _embed_queries(queries: list[str]) -> list[list[float]]:
    """분석 쿼리들을 OpenAI text-embedding-3-small으로 임베딩합니다."""
    from openai import OpenAI

    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    try:
        response = client.embeddings.create(model="text-embedding-3-small", input=queries)
        return [item.embedding for item in response.data]
    except Exception as e:
        raise LLMAnalyzeError(f"쿼리 임베딩 실패: {e}") from e


def _retrieve_context(
    query_embeddings: list[list[float]],
    namespace: str,
) -> list[str]:
    """Pinecone에서 각 쿼리에 대해 top-K 청크를 검색합니다 (중복 제거)."""
    from pinecone import Pinecone

    pc = Pinecone(api_key=os.environ["PINECONE_API_KEY"])
    index = pc.Index(os.environ["PINECONE_INDEX_NAME"])

    seen: set[str] = set()
    chunks: list[str] = []

    try:
        for emb in query_embeddings:
            results = index.query(
                vector=emb,
                top_k=TOP_K,
                namespace=namespace,
                include_metadata=True,
            )
            for match in results.matches:
                chunk_id = match.id
                text = match.metadata.get("text", "")
                if chunk_id not in seen and text:
                    seen.add(chunk_id)
                    chunks.append(text)
    except Exception as e:
        raise LLMAnalyzeError(f"Pinecone 검색 실패: {e}") from e

    return chunks


def _call_claude(
    context_chunks: list[str],
    ticker: str,
    fiscal_year: int,
) -> dict:
    """Claude Sonnet으로 RAG 분석을 수행하고 구조화된 결과를 반환합니다."""
    import anthropic

    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    context_text = "\n\n---\n\n".join(context_chunks)

    prompt = f"""다음은 {ticker} ({fiscal_year}년도) 사업보고서에서 추출한 핵심 내용입니다.

<context>
{context_text}
</context>

위 내용을 바탕으로 다음 JSON 형식으로 분석 결과를 반환하세요. JSON 외의 텍스트는 포함하지 마세요.

{{
  "integrity_score": <0~100 정수: 경영진이 이전 약속을 얼마나 지켰는지 점수>,
  "summary_ko": "<한국어 3~5문장 요약>",
  "risk_factors": [
    {{"title": "...", "description": "...", "severity": "high|medium|low"}}
  ],
  "growth_drivers": [
    {{"title": "...", "description": "..."}}
  ],
  "noise_filter": [
    {{"claim": "...", "is_substantiated": true|false, "evidence": "..."}}
  ]
}}"""

    try:
        message = client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=MAX_TOKENS,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = message.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw)
    except json.JSONDecodeError as e:
        raise LLMAnalyzeError(f"Claude 응답 JSON 파싱 실패: {e}") from e
    except Exception as e:
        raise LLMAnalyzeError(f"Claude API 호출 실패: {e}") from e


def _persist(job_id: str, ticker: str, fiscal_year: int, result: dict) -> None:
    """분석 결과를 DB에 저장하고 작업 상태를 COMPLETED로 업데이트합니다."""
    from core.qualitative.repository import save_qualitative_result, update_job_status

    try:
        save_qualitative_result(
            job_id=job_id,
            ticker=ticker,
            fiscal_period=str(fiscal_year),
            integrity_score=result.get("integrity_score"),
            summary_ko=result.get("summary_ko"),
            risk_factors=result.get("risk_factors"),
            growth_drivers=result.get("growth_drivers"),
            noise_filter=result.get("noise_filter"),
        )
        update_job_status(job_id, "COMPLETED")
    except Exception as e:
        raise LLMAnalyzeError(f"DB 저장 실패: {e}") from e
