"""Step Functions State 3 Lambda — OpenAI 임베딩 → Pinecone upsert.

입력: {s3_chunks_key, job_id, ticker, market, doc_type, fiscal_year}
출력: 입력 + {pinecone_namespace: "{ticker}_{fiscal_year}"}
"""

from __future__ import annotations

import logging
from typing import Any

from core.qualitative.embedder import EmbedError, embed_and_upsert

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def lambda_handler(event: dict, context: Any) -> dict:
    """청크를 임베딩하여 Pinecone에 저장합니다.

    Args:
        event: Step Functions 입력 (s3_chunks_key, job_id, ticker, doc_type, fiscal_year)
        context: Lambda 실행 컨텍스트

    Returns:
        입력 event + pinecone_namespace 필드 추가

    Raises:
        EmbedError: 임베딩 실패 시 — Step Functions이 HandleFailure로 라우팅
    """
    job_id = event["job_id"]
    s3_chunks_key = event["s3_chunks_key"]
    ticker = event["ticker"]
    doc_type = event.get("doc_type", "annual_report")
    fiscal_year = int(event["fiscal_year"])

    logger.info(
        "EmbedChunks: job_id=%s ticker=%s fiscal_year=%s",
        job_id,
        ticker,
        fiscal_year,
    )

    try:
        namespace = embed_and_upsert(
            s3_chunks_key=s3_chunks_key,
            ticker=ticker,
            doc_type=doc_type,
            fiscal_year=fiscal_year,
            job_id=job_id,
        )
    except EmbedError as e:
        logger.error("EmbedChunks failed for job %s: %s", job_id, e)
        raise

    logger.info("Vectors upserted to namespace=%s for job %s", namespace, job_id)
    return {**event, "pinecone_namespace": namespace}
