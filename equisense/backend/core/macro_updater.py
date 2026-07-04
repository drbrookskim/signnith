"""거시 지표 수집 및 캐싱 — MacroUpdateWorker 핵심 로직.

Alpha Vantage API에서 금리·CPI·실업률 등 거시 지표를 수집하여
Neon DB `macro_indicators` 테이블에 저장하고 Upstash Redis에 캐싱합니다.
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
MACRO_TTL = 86_400  # 24시간 (초)
MAX_RETRIES = 3
RETRY_DELAYS = (1, 2, 4)
REQUEST_TIMEOUT = 10

# 수집 대상 지표: (function, key, 단위)
INDICATORS = [
    ("FEDERAL_FUNDS_RATE", "federal_funds_rate", "%"),
    ("CPI", "cpi", "index"),
    ("UNEMPLOYMENT", "unemployment", "%"),
    ("REAL_GDP", "real_gdp", "billion_usd"),
]


class MacroUpdateError(Exception):
    """거시 지표 수집 실패 시 발생합니다."""


def update_all_indicators() -> dict[str, Any]:
    """모든 거시 지표를 수집하여 DB와 Redis에 저장하고 결과 요약을 반환합니다."""
    api_key = os.environ.get("ALPHA_VANTAGE_API_KEY", "")
    if not api_key:
        raise MacroUpdateError("ALPHA_VANTAGE_API_KEY 환경변수가 설정되지 않았습니다")

    results: dict[str, Any] = {}
    errors: list[str] = []

    for function, cache_key, unit in INDICATORS:
        try:
            value, date = _fetch_indicator(function, api_key)
            _save_to_db(cache_key, value, date, unit)
            _cache_indicator(cache_key, value, date, unit)
            results[cache_key] = {"value": value, "date": date, "unit": unit}
            logger.info("Updated macro indicator: %s = %s (%s)", cache_key, value, date)
        except Exception as e:  # noqa: BLE001
            logger.error("Failed to update indicator %s: %s", cache_key, e)
            errors.append(f"{cache_key}: {e}")

    if errors:
        logger.warning("Partial macro update failure: %s", errors)

    return {"updated": results, "errors": errors}


def _fetch_indicator(function: str, api_key: str) -> tuple[float, str]:
    """Alpha Vantage API에서 지표의 최신값과 날짜를 조회합니다."""
    url = f"{AV_BASE}?function={function}&apikey={api_key}&datatype=json"
    data = _fetch_json(url)
    data_list = data.get("data", [])
    if not data_list:
        raise MacroUpdateError(f"Alpha Vantage: no data returned for {function}")
    latest = data_list[0]
    return float(latest["value"]), latest["date"]


def _save_to_db(indicator: str, value: float, date: str, unit: str) -> None:
    """Neon DB macro_indicators 테이블에 지표를 저장(upsert)합니다."""
    from core.db import get_connection  # noqa: PLC0415

    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO macro_indicators (indicator, value, date, unit)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (indicator, date)
            DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
            """,
            (indicator, value, date, unit),
        )
    conn.commit()


def _cache_indicator(indicator: str, value: float, date: str, unit: str) -> None:
    """Upstash Redis에 거시 지표를 TTL 24h로 캐싱합니다."""
    from core.cache import _get_client  # noqa: PLC0415

    payload = json.dumps({"value": value, "date": date, "unit": unit})
    _get_client().setex(f"macro:{indicator}", MACRO_TTL, payload)


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
    raise MacroUpdateError(f"HTTP fetch failed after {MAX_RETRIES} retries: {last_err}")
