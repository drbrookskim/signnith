"""Step Functions State 3 — OpenAI 임베딩 및 Pinecone upsert."""

from __future__ import annotations

import json
import logging
import os
import time
from typing import Optional

import boto3

logger = logging.getLogger(__name__)

EMBED_MODEL = "text-embedding-3-small"
EMBED_BATCH_SIZE = 100
METADATA_TEXT_LIMIT = 500  # Pinecone 메타데이터 크기 제한 대응

_s3_client: Optional[object] = None


class EmbedError(Exception):
    """임베딩 실패 시 발생합니다."""


def _get_s3():
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client("s3")
    return _s3_client


def embed_and_upsert(
    s3_chunks_key: str,
    ticker: str,
    doc_type: str,
    fiscal_year: int,
    job_id: str,
) -> str:
    """청크를 임베딩하여 Pinecone에 업서트하고 namespace를 반환합니다.

    Args:
        s3_chunks_key: 청크 JSON S3 키
        ticker: 종목코드
        doc_type: 문서 유형
        fiscal_year: 회계연도
        job_id: 분석 작업 ID

    Returns:
        Pinecone namespace ("{ticker}_{fiscal_year}")

    Raises:
        EmbedError: 임베딩 또는 Pinecone 업서트 실패 시
    """
    bucket = os.environ["RAG_DOCS_BUCKET"]

    try:
        response = _get_s3().get_object(Bucket=bucket, Key=s3_chunks_key)
        chunks: list[str] = json.loads(response["Body"].read().decode("utf-8"))
    except Exception as e:
        raise EmbedError(f"S3 GetObject 실패 ({s3_chunks_key}): {e}") from e

    if not chunks:
        raise EmbedError("청크 목록이 비어 있습니다.")

    embeddings = _embed_chunks(chunks)

    namespace = f"{ticker}_{fiscal_year}"
    _upsert_to_pinecone(
        embeddings=embeddings,
        chunks=chunks,
        namespace=namespace,
        ticker=ticker,
        doc_type=doc_type,
        fiscal_year=fiscal_year,
        job_id=job_id,
    )

    logger.info(
        "EmbedChunks: %d 벡터 upsert 완료 (namespace=%s, job_id=%s)",
        len(chunks),
        namespace,
        job_id,
    )
    return namespace


def _embed_chunks(chunks: list[str]) -> list[list[float]]:
    """OpenAI text-embedding-3-small으로 배치 임베딩합니다."""
    from openai import OpenAI

    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    embeddings: list[list[float]] = []

    for i in range(0, len(chunks), EMBED_BATCH_SIZE):
        batch = chunks[i : i + EMBED_BATCH_SIZE]
        try:
            response = client.embeddings.create(model=EMBED_MODEL, input=batch)
            embeddings.extend([item.embedding for item in response.data])
        except Exception as e:
            raise EmbedError(f"OpenAI 임베딩 실패 (배치 {i}): {e}") from e
        time.sleep(0.1)  # Rate limit 대응

    return embeddings


def _upsert_to_pinecone(
    embeddings: list[list[float]],
    chunks: list[str],
    namespace: str,
    ticker: str,
    doc_type: str,
    fiscal_year: int,
    job_id: str,
) -> None:
    """Pinecone에 벡터와 메타데이터를 업서트합니다."""
    from pinecone import Pinecone

    pc = Pinecone(api_key=os.environ["PINECONE_API_KEY"])
    index = pc.Index(os.environ["PINECONE_INDEX_NAME"])

    vectors = [
        {
            "id": f"{job_id}_{i}",
            "values": emb,
            "metadata": {
                "ticker": ticker,
                "doc_type": doc_type,
                "fiscal_year": fiscal_year,
                "chunk_index": i,
                "text": chunk[:METADATA_TEXT_LIMIT],
            },
        }
        for i, (emb, chunk) in enumerate(zip(embeddings, chunks))
    ]

    try:
        for i in range(0, len(vectors), EMBED_BATCH_SIZE):
            index.upsert(vectors=vectors[i : i + EMBED_BATCH_SIZE], namespace=namespace)
    except Exception as e:
        raise EmbedError(f"Pinecone upsert 실패: {e}") from e
