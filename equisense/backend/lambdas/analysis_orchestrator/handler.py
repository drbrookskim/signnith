"""POST /companies/{ticker}/qualitative Lambda 핸들러.

흐름: 입력 검증 → 일별 요청 제한 확인 → DB PENDING 등록 → SQS 큐잉 → 202 반환
"""

from __future__ import annotations

import json
import logging
import os
import re
import uuid
from typing import Any, Optional

import boto3
from pydantic import BaseModel, ValidationError, model_validator

from core.qualitative.repository import count_jobs_today, create_job
from core.response import accepted, error

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

_KR_TICKER_RE = re.compile(r"^\d{6}$")
_US_TICKER_RE = re.compile(r"^[A-Z]{1,5}$")

VALID_DOC_TYPES = frozenset({"annual_report", "earnings_call"})
DAILY_LIMIT = 5
ESTIMATED_SECONDS = 120

# 모듈 레벨 boto3 클라이언트 캐싱 — 웜 컨테이너 재사용 시 재생성 방지
_sqs_client: Optional[Any] = None


def _get_sqs():
    global _sqs_client
    if _sqs_client is None:
        _sqs_client = boto3.client(
            "sqs", region_name=os.environ.get("AWS_REGION", "ap-northeast-2")
        )
    return _sqs_client


class TriggerQualitativeRequest(BaseModel):
    ticker: str
    market: str
    fiscal_year: int
    doc_type: str = "annual_report"

    @model_validator(mode="after")
    def validate_params(self) -> TriggerQualitativeRequest:
        if self.market == "KR":
            if not _KR_TICKER_RE.match(self.ticker):
                raise ValueError("KR 종목코드는 6자리 숫자여야 합니다")
        elif self.market == "US":
            if not _US_TICKER_RE.match(self.ticker):
                raise ValueError("US 티커는 1~5자리 대문자 영문이어야 합니다")
        else:
            raise ValueError("market은 'KR' 또는 'US'여야 합니다")
        if self.doc_type not in VALID_DOC_TYPES:
            raise ValueError(f"doc_type은 {sorted(VALID_DOC_TYPES)} 중 하나여야 합니다")
        if not (2010 <= self.fiscal_year <= 2030):
            raise ValueError("fiscal_year는 2010~2030 범위여야 합니다")
        return self


def _parse_request(event: dict) -> TriggerQualitativeRequest:
    path_params = event.get("pathParameters") or {}
    body: dict = {}
    raw_body = event.get("body")
    if raw_body:
        try:
            body = json.loads(raw_body)
        except (json.JSONDecodeError, TypeError):
            pass
    return TriggerQualitativeRequest(
        ticker=(path_params.get("ticker") or "").strip().upper(),
        market=(body.get("market") or "").strip().upper(),
        fiscal_year=int(body.get("fiscal_year", 0)),
        doc_type=(body.get("doc_type") or "annual_report").strip().lower(),
    )


def _enqueue_job(job_id: str, params: TriggerQualitativeRequest) -> None:
    message = {
        "job_id": job_id,
        "ticker": params.ticker,
        "market": params.market,
        "doc_type": params.doc_type,
        "fiscal_year": params.fiscal_year,
    }
    _get_sqs().send_message(
        QueueUrl=os.environ["RAG_JOBS_QUEUE_URL"],
        MessageBody=json.dumps(message),
    )


def lambda_handler(event: dict, context: Any) -> dict:
    """POST /companies/{ticker}/qualitative 요청을 처리합니다."""
    request_id = getattr(context, "aws_request_id", str(uuid.uuid4()))

    try:
        params = _parse_request(event)
    except (ValidationError, Exception) as e:
        return error(400, "INVALID_PARAMS", str(e), request_id)

    logger.info(
        "Qualitative trigger: ticker=%s market=%s fiscal_year=%s doc_type=%s",
        params.ticker,
        params.market,
        params.fiscal_year,
        params.doc_type,
    )

    try:
        today_count = count_jobs_today(params.ticker)
    except Exception as e:
        logger.error("DB error checking rate limit: %s", e)
        return error(503, "DB_ERROR", "Database temporarily unavailable", request_id)

    if today_count >= DAILY_LIMIT:
        return error(
            429,
            "RATE_LIMIT_EXCEEDED",
            f"Daily analysis limit of {DAILY_LIMIT} per ticker reached",
            request_id,
        )

    try:
        job_id = create_job(params.ticker, params.market, params.doc_type, params.fiscal_year)
    except Exception as e:
        logger.error("DB error creating job: %s", e)
        return error(503, "DB_ERROR", "Database temporarily unavailable", request_id)

    try:
        _enqueue_job(job_id, params)
    except Exception as e:
        logger.error("SQS error for job %s: %s", job_id, e)
        return error(503, "QUEUE_ERROR", "Failed to queue analysis job", request_id)

    logger.info("Job queued: job_id=%s", job_id)
    return accepted({"job_id": job_id, "status": "PENDING", "estimated_seconds": ESTIMATED_SECONDS})
