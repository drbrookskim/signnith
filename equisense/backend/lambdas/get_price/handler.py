"""GET /prices/{ticker} — Upstash Redis 캐시에서 실시간 주가 반환.

PriceUpdateWorker Lambda가 채운 캐시를 읽어 반환합니다.
Redis 접속 정보는 Lambda 환경변수에만 존재하며 클라이언트에 노출되지 않습니다.
캐시 미스 시 {data: null, cached: false}를 반환하고 클라이언트가 재시도합니다.

Cognito 인증 없음: 주가 데이터는 공개 정보이며, Redis 접근 보호가 목적입니다.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from core.cache import _get_client

_CORS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
}

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

TICKER_RE = re.compile(r"^[A-Z0-9]{1,10}$")


def lambda_handler(event: dict, context: Any) -> dict:
    """API Gateway GET /prices/{ticker} 이벤트를 처리합니다."""
    ticker: str = (event.get("pathParameters") or {}).get("ticker", "").upper()

    if not TICKER_RE.match(ticker):
        return {
            "statusCode": 400,
            "headers": _CORS,
            "body": json.dumps(
                {"error": {"code": "INVALID_TICKER", "message": "Invalid ticker format"}}
            ),
        }

    logger.info("GetPrice: ticker=%s", ticker)

    try:
        raw = _get_client().get(f"price:{ticker}")
    except Exception as e:  # noqa: BLE001
        logger.error("GetPrice: Redis error for %s — %s", ticker, e)
        return {
            "statusCode": 503,
            "headers": _CORS,
            "body": json.dumps(
                {"error": {"code": "CACHE_UNAVAILABLE", "message": "Cache unavailable"}}
            ),
        }

    if raw is None:
        return {
            "statusCode": 200,
            "headers": _CORS,
            "body": json.dumps({"data": None, "cached": False, "ticker": ticker}),
        }

    data = json.loads(raw) if isinstance(raw, (str, bytes)) else raw
    return {
        "statusCode": 200,
        "headers": {**_CORS, "Cache-Control": "public, max-age=60, stale-while-revalidate=300"},
        "body": json.dumps({"data": data, "cached": True, "ticker": ticker}),
    }
