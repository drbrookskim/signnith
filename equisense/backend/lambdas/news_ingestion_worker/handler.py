"""EventBridge cron(0 9 * * ? *) Lambda 핸들러.

매일 KST 18:00(UTC 09:00)에 watchlist 종목의 최신 뉴스·공시를 수집합니다.
US 종목은 Alpha Vantage NEWS_SENTIMENT, KR 종목은 DART 공시 목록 API를 사용합니다.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

from core.news_ingester import NewsIngestionError, ingest_all_news

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

DEFAULT_TICKERS_ENV = "PRICE_WATCHLIST"  # PriceUpdateWorker와 동일한 watchlist 공유


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
    logger.info("NewsIngestionWorker triggered")

    tickers = _get_tickers(event)
    if not tickers:
        logger.warning("No tickers configured for NewsIngestionWorker")
        return {"statusCode": 400, "body": json.dumps({"error": "No tickers configured"})}

    logger.info("Ingesting news for %d tickers: %s", len(tickers), tickers)

    try:
        result = ingest_all_news(tickers)
        status = 200 if not result.get("errors") else 207
        logger.info(
            "News ingestion complete: %d tickers ingested, %d errors",
            len(result.get("ingested", {})),
            len(result.get("errors", [])),
        )
        return {"statusCode": status, "body": json.dumps(result)}
    except NewsIngestionError as e:
        logger.error("NewsIngestionWorker fatal error: %s", e)
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}
