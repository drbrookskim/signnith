"""EventBridge cron(0 15 * * ? *) Lambda 핸들러.

매일 KST 00:00(UTC 15:00)에 거시 지표를 수집하여 DB와 Redis를 갱신합니다.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from core.macro_updater import MacroUpdateError, update_all_indicators

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def lambda_handler(event: dict, context: Any) -> dict:
    """EventBridge 스케줄 이벤트를 처리합니다.

    Returns:
        {"statusCode": 200|500, "body": {"updated": {...}, "errors": [...]}}
    """
    logger.info("MacroUpdateWorker triggered by EventBridge")

    try:
        result = update_all_indicators()
        status = 200 if not result.get("errors") else 207  # 207: partial success
        logger.info(
            "Macro update complete: %d indicators updated, %d errors",
            len(result.get("updated", {})),
            len(result.get("errors", [])),
        )
        return {"statusCode": status, "body": json.dumps(result)}
    except MacroUpdateError as e:
        logger.error("MacroUpdateWorker fatal error: %s", e)
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}
