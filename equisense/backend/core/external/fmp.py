"""Financial Modeling Prep(FMP) API 클라이언트.

지수 백오프 재시도 로직을 포함하며, AC-M1-005 요구사항(1초/2초/4초, 최대 3회)을 준수합니다.
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from typing import Any

FMP_BASE_URL = "https://financialmodelingprep.com/api/v3"

MAX_RETRIES = 3
RETRY_DELAYS = (1, 2, 4)  # 초 단위 지수 백오프
REQUEST_TIMEOUT = 8  # 초


class ExternalAPIError(Exception):
    """외부 API 호출 실패 시 발생합니다 (재시도 횟수 초과 포함)."""


def _fetch_json(url: str) -> Any:
    """지수 백오프 재시도를 포함하여 URL에서 JSON을 가져옵니다.

    Args:
        url: 조회할 URL (API 키 포함)

    Raises:
        ExternalAPIError: MAX_RETRIES 초과 후에도 실패하면 발생
    """
    last_error: Exception | None = None
    for attempt, delay in enumerate(RETRY_DELAYS[:MAX_RETRIES], start=1):
        try:
            with urllib.request.urlopen(url, timeout=REQUEST_TIMEOUT) as resp:  # nosec B310
                return json.loads(resp.read())
        except (urllib.error.URLError, OSError) as e:
            last_error = e
            if attempt < MAX_RETRIES:
                time.sleep(delay)
    msg = f"FMP API 호출 실패 ({MAX_RETRIES}회 재시도 후): {last_error}"
    raise ExternalAPIError(msg) from last_error


def _to_fmp_ticker(ticker: str, market: str) -> str:
    """KR 종목코드에 .KS 접미사를 추가합니다 (FMP KRX 형식)."""
    return f"{ticker}.KS" if market == "KR" else ticker


def fetch_income_statements(ticker: str, market: str, limit: int = 5) -> list[dict]:
    """FMP에서 연간 손익계산서를 최근 n개 조회합니다."""
    fmp_ticker = _to_fmp_ticker(ticker, market)
    api_key = os.environ["FMP_API_KEY"]
    url = (
        f"{FMP_BASE_URL}/income-statement/{fmp_ticker}"
        f"?period=annual&limit={limit}&apikey={api_key}"
    )
    return _fetch_json(url)


def fetch_balance_sheets(ticker: str, market: str, limit: int = 5) -> list[dict]:
    """FMP에서 연간 대차대조표를 최근 n개 조회합니다."""
    fmp_ticker = _to_fmp_ticker(ticker, market)
    api_key = os.environ["FMP_API_KEY"]
    url = (
        f"{FMP_BASE_URL}/balance-sheet-statement/{fmp_ticker}"
        f"?period=annual&limit={limit}&apikey={api_key}"
    )
    return _fetch_json(url)


def fetch_cash_flow_statements(ticker: str, market: str, limit: int = 5) -> list[dict]:
    """FMP에서 연간 현금흐름표를 최근 n개 조회합니다."""
    fmp_ticker = _to_fmp_ticker(ticker, market)
    api_key = os.environ["FMP_API_KEY"]
    url = (
        f"{FMP_BASE_URL}/cash-flow-statement/{fmp_ticker}"
        f"?period=annual&limit={limit}&apikey={api_key}"
    )
    return _fetch_json(url)


def fetch_company_profile(ticker: str, market: str) -> dict:
    """FMP에서 기업 개요(회사명, 사업 설명, CEO, 산업군)를 조회합니다."""
    fmp_ticker = _to_fmp_ticker(ticker, market)
    api_key = os.environ["FMP_API_KEY"]
    url = f"{FMP_BASE_URL}/profile/{fmp_ticker}?apikey={api_key}"
    result = _fetch_json(url)
    if isinstance(result, list) and result:
        return result[0]
    return {}


def fetch_historical_prices(
    ticker: str,
    market: str,
    from_date: str,
    to_date: str,
) -> list[dict]:
    """FMP에서 일별 주가 이력을 조회합니다.

    Args:
        ticker: 종목코드
        market: 'KR' | 'US'
        from_date: 조회 시작일 (YYYY-MM-DD)
        to_date: 조회 종료일 (YYYY-MM-DD)

    Returns:
        FMP ``historical`` 배열 (최신 날짜 순)
    """
    fmp_ticker = _to_fmp_ticker(ticker, market)
    api_key = os.environ["FMP_API_KEY"]
    url = (
        f"{FMP_BASE_URL}/historical-price-full/{fmp_ticker}"
        f"?from={from_date}&to={to_date}&apikey={api_key}"
    )
    result = _fetch_json(url)
    if isinstance(result, dict):
        return result.get("historical", [])
    return []
