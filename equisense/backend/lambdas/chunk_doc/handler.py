"""Step Functions State 2 Lambda — S3 PDF 청킹.

입력: {s3_raw_key, job_id, ticker, market, doc_type, fiscal_year}
출력: 입력 + {s3_chunks_key: "chunks/{job_id}/chunks.json"}
"""

from __future__ import annotations

import logging
from typing import Any

from core.qualitative.document_chunker import ChunkError, chunk_and_upload

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def lambda_handler(event: dict, context: Any) -> dict:
    """PDF를 청킹하여 S3에 저장합니다.

    Args:
        event: Step Functions 입력 (s3_raw_key, job_id, ...)
        context: Lambda 실행 컨텍스트

    Returns:
        입력 event + s3_chunks_key 필드 추가

    Raises:
        ChunkError: 청킹 실패 시 — Step Functions이 HandleFailure로 라우팅
    """
    job_id = event["job_id"]
    s3_raw_key = event["s3_raw_key"]

    logger.info("ChunkDoc: job_id=%s s3_raw_key=%s", job_id, s3_raw_key)

    try:
        s3_chunks_key = chunk_and_upload(s3_raw_key=s3_raw_key, job_id=job_id)
    except ChunkError as e:
        logger.error("ChunkDoc failed for job %s: %s", job_id, e)
        raise

    logger.info("Chunks stored at %s for job %s", s3_chunks_key, job_id)
    return {**event, "s3_chunks_key": s3_chunks_key}
