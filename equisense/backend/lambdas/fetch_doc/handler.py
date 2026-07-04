"""Step Functions State 1 Lambda — 문서 수집 및 S3 저장.

입력 (Step Functions input):
  {job_id, ticker, market, doc_type, fiscal_year}

출력:
  입력 + {s3_raw_key: "raw/{job_id}/{ticker}_{fiscal_year}.pdf"}
"""

from __future__ import annotations

import logging
from typing import Any

from core.qualitative.document_fetcher import DocumentFetchError, fetch_and_upload

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def lambda_handler(event: dict, context: Any) -> dict:
    """DART 또는 SEC EDGAR에서 문서를 다운로드하고 S3에 저장합니다.

    Args:
        event: Step Functions 입력 (job_id, ticker, market, doc_type, fiscal_year)
        context: Lambda 실행 컨텍스트

    Returns:
        입력 event + s3_raw_key 필드 추가

    Raises:
        DocumentFetchError: 문서 수집 실패 시 — Step Functions이 HandleFailure로 라우팅
    """
    job_id = event["job_id"]
    ticker = event["ticker"]
    market = event["market"]
    doc_type = event.get("doc_type", "annual_report")
    fiscal_year = int(event["fiscal_year"])

    logger.info(
        "FetchDoc: job_id=%s ticker=%s market=%s doc_type=%s fiscal_year=%s",
        job_id,
        ticker,
        market,
        doc_type,
        fiscal_year,
    )

    try:
        s3_key = fetch_and_upload(
            ticker=ticker,
            market=market,
            doc_type=doc_type,
            fiscal_year=fiscal_year,
            job_id=job_id,
        )
    except DocumentFetchError as e:
        logger.error("Document fetch failed for job %s: %s", job_id, e)
        raise  # Step Functions HandleFailure로 라우팅

    logger.info("Document stored at %s for job %s", s3_key, job_id)
    return {**event, "s3_raw_key": s3_key}
