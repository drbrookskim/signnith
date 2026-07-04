"""Step Functions State 4 Lambda — Pinecone RAG + Claude 분석 → DB 저장.

입력: {pinecone_namespace, job_id, ticker, fiscal_year, ...}
출력: 입력 + {status: "COMPLETED"}
"""

from __future__ import annotations

import logging
from typing import Any

from core.qualitative.llm_analyzer import LLMAnalyzeError, analyze_and_save

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def lambda_handler(event: dict, context: Any) -> dict:
    """RAG 분석을 수행하고 결과를 DB에 저장합니다.

    Args:
        event: Step Functions 입력 (pinecone_namespace, job_id, ticker, fiscal_year)
        context: Lambda 실행 컨텍스트

    Returns:
        입력 event + {status: "COMPLETED"}

    Raises:
        LLMAnalyzeError: 분석 실패 시 — Step Functions이 HandleFailure로 라우팅
    """
    job_id = event["job_id"]
    pinecone_namespace = event["pinecone_namespace"]
    ticker = event["ticker"]
    fiscal_year = int(event["fiscal_year"])

    logger.info(
        "LLMAnalyze: job_id=%s namespace=%s ticker=%s fiscal_year=%s",
        job_id,
        pinecone_namespace,
        ticker,
        fiscal_year,
    )

    try:
        analyze_and_save(
            pinecone_namespace=pinecone_namespace,
            ticker=ticker,
            fiscal_year=fiscal_year,
            job_id=job_id,
        )
    except LLMAnalyzeError as e:
        logger.error("LLMAnalyze failed for job %s: %s", job_id, e)
        raise

    return {**event, "status": "COMPLETED"}
