"""EventBridge cron(0 16 * * ? *) Lambda 핸들러.

장 마감 직후 UTC 16:00에 모든 종목의 저평가·과열 스크리닝을 실행합니다.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from core.technical_screener import ScreenerError, screen_all_companies

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def lambda_handler(event: dict, context: Any) -> dict:
    """EventBridge 스케줄 이벤트를 처리합니다.

    Returns:
        {"statusCode": 200|207|500, "body": {"screened": int, ...}}
    """
    logger.info("TechnicalScreener triggered by EventBridge")

    try:
        result = screen_all_companies()
        status = 200 if not result.get("errors") else 207
        logger.info(
            "Screening complete: %d screened, %d undervalued, %d overbought",
            result.get("screened", 0),
            len(result.get("undervalued", [])),
            len(result.get("overbought", [])),
        )
        return {"statusCode": status, "body": json.dumps(result)}
    except ScreenerError as e:
        logger.error("TechnicalScreener fatal error: %s", e)
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}
