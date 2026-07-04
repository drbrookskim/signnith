"""주가 데이터 수집 및 캐싱 — PriceUpdateWorker 핵심 로직.

Alpha Vantage Quote API에서 watchlist 종목의 최신 주가를 수집하여
Upstash Redis에 TTL 6분으로 캐싱합니다.
"""

from __future__ import annotations

import json
import logging
import os
import time
import urllib.error
import urllib.request
from typing import Any, Optional

logger = logging.getLogger(__name__)

AV_BASE = "https://www.alphavantage.co/query"
PRICE_TTL = 360  # 6분 (초) — 장중 5분 간격 갱신 + 1분 여유
MAX_RETRIES = 3
RETRY_DELAYS = (1, 2, 4)
REQUEST_TIMEOUT = 10
# Alpha Vantage 무료 티어: 25 calls/day, 5 calls/min
AV_RATE_LIMIT_DELAY = 13  # 5 calls/min → 12초 간격 + 1초 여유


class PriceUpdateError(Exception):
    """주가 수집 실패 시 발생합니다."""


def update_watchlist_prices(tickers: list[str]) -> dict[str, Any]:
    """watchlist 종목의 최신 주가를 수집하고 Redis에 캐싱합니다.

    Args:
        tickers: 갱신할 종목 코드 목록 (예: ["AAPL", "MSFT", "005930"])

    Returns:
        {"updated": {...}, "errors": [...]}
    """
    api_key = os.environ.get("ALPHA_VANTAGE_API_KEY", "")
    if not api_key:
        raise PriceUpdateError("ALPHA_VANTAGE_API_KEY 환경변수가 설정되지 않았습니다")

    results: dict[str, Any] = {}
    errors: list[str] = []

    for i, ticker in enumerate(tickers):
        try:
            quote = _fetch_quote(ticker, api_key)
            _cache_price(ticker, quote)
            results[ticker] = quote
            logger.info("Updated price: %s = %s", ticker, quote.get("price"))
        except Exception as e:  # noqa: BLE001
            logger.error("Failed to update price for %s: %s", ticker, e)
            errors.append(f"{ticker}: {e}")

        # Rate limit 준수 — 마지막 요청 후에는 대기하지 않음
        if i < len(tickers) - 1:
            time.sleep(AV_RATE_LIMIT_DELAY)

    return {"updated": results, "errors": errors}


def _fetch_quote(ticker: str, api_key: str) -> dict[str, Any]:
    """Alpha Vantage Global Quote API에서 실시간 주가 데이터를 조회합니다."""
    url = f"{AV_BASE}?function=GLOBAL_QUOTE&symbol={ticker}&apikey={api_key}"
    data = _fetch_json(url)
    quote_data = data.get("Global Quote", {})
    if not quote_data:
        raise PriceUpdateError(f"Alpha Vantage: no quote data for ticker {ticker}")
    return {
        "ticker": ticker,
        "price": float(quote_data.get("05. price", 0)),
        "change": float(quote_data.get("09. change", 0)),
        "change_percent": quote_data.get("10. change percent", "0%").rstrip("%"),
        "volume": int(quote_data.get("06. volume", 0)),
        "latest_trading_day": quote_data.get("07. latest trading day", ""),
        "previous_close": float(quote_data.get("08. previous close", 0)),
        "week_52_high": float(quote_data.get("03. high", 0)),
        "week_52_low": float(quote_data.get("04. low", 0)),
    }


def _cache_price(ticker: str, quote: dict[str, Any]) -> None:
    """Upstash Redis에 주가 데이터를 TTL 6분으로 캐싱합니다."""
    from core.cache import _get_client  # noqa: PLC0415

    _get_client().setex(f"price:{ticker}", PRICE_TTL, json.dumps(quote))


def _fetch_json(url: str) -> dict:
    """지수 백오프 재시도로 URL에서 JSON을 가져옵니다."""
    last_err: Optional[Exception] = None
    for attempt, delay in enumerate(RETRY_DELAYS[:MAX_RETRIES], start=1):
        try:
            with urllib.request.urlopen(url, timeout=REQUEST_TIMEOUT) as resp:  # nosec B310
                return json.loads(resp.read())
        except (urllib.error.URLError, OSError) as e:
            last_err = e
            if attempt < MAX_RETRIES:
                time.sleep(delay)
    raise PriceUpdateError(f"HTTP fetch failed after {MAX_RETRIES} retries: {last_err}")
