"""GET /companies/{ticker}/fundamentals Lambda 핸들러.

흐름: 입력 검증 → Redis 캐시 조회 → FMP API 호출(캐시 미스 시) → 지표 계산 → 캐시 저장 → 응답
"""

from __future__ import annotations

import logging
import re
import uuid
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, ValidationError, model_validator

from core.cache import FINANCIAL_DATA_TTL, cache_get, cache_set
from core.external.fmp import (
    ExternalAPIError,
    fetch_balance_sheets,
    fetch_cash_flow_statements,
    fetch_income_statements,
)
from core.external.normalizer import normalize_all
from core.fundamental import analyze_fundamentals
from core.fundamental.models import BalanceSheet, CashFlowStatement, IncomeStatement
from core.response import error, ok

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

_KR_TICKER_RE = re.compile(r"^\d{6}$")
_US_TICKER_RE = re.compile(r"^[A-Z]{1,5}$")

STATEMENTS_LIMIT = 5  # 최근 5개 회계연도


class FundamentalsRequest(BaseModel):
    """API Gateway 경로/쿼리 파라미터 입력 검증 모델."""

    ticker: str
    market: str

    @model_validator(mode="after")
    def validate_ticker_format(self) -> FundamentalsRequest:
        if self.market == "KR":
            if not _KR_TICKER_RE.match(self.ticker):
                raise ValueError("KR 종목코드는 6자리 숫자여야 합니다 (예: 005930)")
        elif self.market == "US":
            if not _US_TICKER_RE.match(self.ticker):
                raise ValueError("US 티커는 1~5자리 대문자 영문이어야 합니다 (예: AAPL)")
        else:
            raise ValueError("market은 'KR' 또는 'US'여야 합니다")
        return self


@dataclass
class RawStatements:
    income_statements: list[IncomeStatement]
    balance_sheets: list[BalanceSheet]
    cash_flow_statements: list[CashFlowStatement]


def _parse_request(event: dict) -> FundamentalsRequest:
    path_params = event.get("pathParameters") or {}
    query_params = event.get("queryStringParameters") or {}
    return FundamentalsRequest(
        ticker=(path_params.get("ticker") or "").strip().upper(),
        market=(query_params.get("market") or "").strip().upper(),
    )


def _fetch_and_normalize(ticker: str, market: str) -> RawStatements:
    raw_incomes = fetch_income_statements(ticker, market, limit=STATEMENTS_LIMIT)
    raw_balances = fetch_balance_sheets(ticker, market, limit=STATEMENTS_LIMIT)
    raw_cfs = fetch_cash_flow_statements(ticker, market, limit=STATEMENTS_LIMIT)
    incomes, balances, cfs = normalize_all(raw_incomes, raw_balances, raw_cfs)
    return RawStatements(
        income_statements=incomes, balance_sheets=balances, cash_flow_statements=cfs
    )


def lambda_handler(event: dict, context: Any) -> dict:
    """GET /companies/{ticker}/fundamentals 요청을 처리합니다."""
    request_id = getattr(context, "aws_request_id", str(uuid.uuid4()))

    try:
        params = _parse_request(event)
    except (ValidationError, Exception) as e:
        return error(400, "INVALID_PARAMS", str(e), request_id)

    logger.info("Fundamentals request: ticker=%s market=%s", params.ticker, params.market)

    cache_key = f"fundamentals:{params.market}:{params.ticker}"
    cached = cache_get(cache_key)
    if cached is not None:
        logger.info("Cache hit: %s", cache_key)
        return ok(cached)

    try:
        raw = _fetch_and_normalize(params.ticker, params.market)
    except ExternalAPIError as e:
        logger.error("FMP API error for %s: %s", params.ticker, e)
        return error(503, "EXTERNAL_API_ERROR", "Service temporarily unavailable", request_id)

    if not raw.income_statements:
        return error(
            404, "TICKER_NOT_FOUND", f"No financial data found for {params.ticker}", request_id
        )

    analysis = analyze_fundamentals(
        income_statements=raw.income_statements,
        balance_sheets=raw.balance_sheets,
        cash_flow_statements=raw.cash_flow_statements,
        ticker=params.ticker,
        market=params.market,
    )

    payload = analysis.model_dump()
    cache_set(cache_key, payload, FINANCIAL_DATA_TTL)
    return ok(payload)
