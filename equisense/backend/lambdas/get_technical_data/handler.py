"""GET /companies/{ticker}/technical Lambda 핸들러.

흐름: 입력 검증 → Redis 캐시 조회 → FMP API 호출(캐시 미스 시) → 분석 계산 → 캐시 저장 → 응답
"""

from __future__ import annotations

import datetime
import logging
import re
import uuid
from typing import Any

from pydantic import BaseModel, ValidationError, model_validator

from core.cache import cache_get, cache_set
from core.external.fmp import ExternalAPIError, fetch_historical_prices
from core.response import error, ok
from core.technical import build_technical_analysis

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

_KR_TICKER_RE = re.compile(r"^\d{6}$")
_US_TICKER_RE = re.compile(r"^[A-Z]{1,5}$")

PERIOD_DAYS: dict[str, int] = {"1m": 30, "3m": 90, "6m": 180, "1y": 365, "3y": 1095}
VALID_PERIODS = frozenset(PERIOD_DAYS)
DEFAULT_PERIOD = "1y"

PRICE_TTL_MARKET_HOURS = 900
PRICE_TTL_AFTER_CLOSE = 86_400

_US_OPEN = datetime.time(13, 30)
_US_CLOSE = datetime.time(20, 0)
_KR_OPEN = datetime.time(0, 0)
_KR_CLOSE = datetime.time(6, 30)


class TechnicalRequest(BaseModel):
    ticker: str
    market: str
    period: str = DEFAULT_PERIOD

    @model_validator(mode="after")
    def validate_params(self) -> TechnicalRequest:
        if self.market == "KR":
            if not _KR_TICKER_RE.match(self.ticker):
                raise ValueError("KR 종목코드는 6자리 숫자여야 합니다 (예: 005930)")
        elif self.market == "US":
            if not _US_TICKER_RE.match(self.ticker):
                raise ValueError("US 티커는 1~5자리 대문자 영문이어야 합니다 (예: AAPL)")
        else:
            raise ValueError("market은 'KR' 또는 'US'여야 합니다")
        if self.period not in VALID_PERIODS:
            valid = ", ".join(sorted(VALID_PERIODS))
            raise ValueError(f"period는 {valid} 중 하나여야 합니다")
        return self


def _parse_request(event: dict) -> TechnicalRequest:
    path_params = event.get("pathParameters") or {}
    query_params = event.get("queryStringParameters") or {}
    return TechnicalRequest(
        ticker=(path_params.get("ticker") or "").strip().upper(),
        market=(query_params.get("market") or "").strip().upper(),
        period=(query_params.get("period") or DEFAULT_PERIOD).strip().lower(),
    )


def _is_market_open(market: str) -> bool:
    now = datetime.datetime.now(datetime.UTC)
    if now.weekday() >= 5:
        return False
    t = now.time().replace(tzinfo=None)
    if market == "US":
        return _US_OPEN <= t < _US_CLOSE
    if market == "KR":
        return _KR_OPEN <= t < _KR_CLOSE
    return False


def _get_price_ttl(market: str) -> int:
    return PRICE_TTL_MARKET_HOURS if _is_market_open(market) else PRICE_TTL_AFTER_CLOSE


def _date_range(period: str) -> tuple[str, str]:
    today = datetime.date.today()
    delta = datetime.timedelta(days=PERIOD_DAYS[period])
    from_date = (today - delta).strftime("%Y-%m-%d")
    to_date = today.strftime("%Y-%m-%d")
    return from_date, to_date


def lambda_handler(event: dict, context: Any) -> dict:
    """GET /companies/{ticker}/technical 요청을 처리합니다."""
    request_id = getattr(context, "aws_request_id", str(uuid.uuid4()))

    try:
        params = _parse_request(event)
    except (ValidationError, Exception) as e:
        return error(400, "INVALID_PARAMS", str(e), request_id)

    logger.info(
        "Technical request: ticker=%s market=%s period=%s",
        params.ticker,
        params.market,
        params.period,
    )

    cache_key = f"technical:{params.market}:{params.ticker}:{params.period}"
    cached = cache_get(cache_key)
    if cached is not None:
        logger.info("Cache hit: %s", cache_key)
        return ok(cached)

    from_date, to_date = _date_range(params.period)
    try:
        raw_history = fetch_historical_prices(params.ticker, params.market, from_date, to_date)
    except ExternalAPIError as e:
        logger.error("FMP API error for %s: %s", params.ticker, e)
        return error(503, "EXTERNAL_API_ERROR", "Service temporarily unavailable", request_id)

    if not raw_history:
        return error(
            404,
            "TICKER_NOT_FOUND",
            f"No price data found for {params.ticker} ({params.period})",
            request_id,
        )

    analysis = build_technical_analysis(raw_history, params.ticker, params.market, params.period)
    payload = analysis.model_dump()
    ttl = _get_price_ttl(params.market)
    cache_set(cache_key, payload, ttl)
    logger.info("Cached %s with TTL %ds", cache_key, ttl)
    return ok(payload)
