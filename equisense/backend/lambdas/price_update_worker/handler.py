"""EventBridge rate(5 minutes) Lambda 핸들러.

장중 5분 간격으로 watchlist 종목의 최신 주가를 수집하여 Redis를 갱신합니다.
watchlist는 EventBridge 이벤트 페이로드 또는 환경변수로 전달됩니다.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

from core.price_updater import PriceUpdateError, update_watchlist_prices

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

DEFAULT_TICKERS_ENV = "PRICE_WATCHLIST"  # 쉼표 구분 종목 코드 (예: "AAPL,MSFT,005930")


def _get_tickers(event: dict) -> list[str]:
    """이벤트 페이로드 또는 환경변수에서 종목 목록을 가져옵니다."""
    if "tickers" in event:
        return [t.strip().upper() for t in event["tickers"] if t.strip()]
    raw = os.environ.get(DEFAULT_TICKERS_ENV, "")
    return [t.strip().upper() for t in raw.split(",") if t.strip()]


def lambda_handler(event: dict, context: Any) -> dict:
    """EventBridge 스케줄 이벤트를 처리합니다.

    Returns:
        {"statusCode": 200|207|400|500, "body": {...}}
    """
    logger.info("PriceUpdateWorker triggered")

    tickers = _get_tickers(event)
    if not tickers:
        logger.warning("No tickers configured for PriceUpdateWorker")
        return {"statusCode": 400, "body": json.dumps({"error": "No tickers configured"})}

    logger.info("Updating prices for %d tickers: %s", len(tickers), tickers)

    try:
        result = update_watchlist_prices(tickers)
        status = 200 if not result.get("errors") else 207
        logger.info(
            "Price update complete: %d updated, %d errors",
            len(result.get("updated", {})),
            len(result.get("errors", [])),
        )
        return {"statusCode": status, "body": json.dumps(result)}
    except PriceUpdateError as e:
        logger.error("PriceUpdateWorker fatal error: %s", e)
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}
