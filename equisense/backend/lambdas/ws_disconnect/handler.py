"""API Gateway WebSocket $disconnect Lambda 핸들러.

연결 종료 시 ws_connections 테이블에서 연결 ID를 삭제합니다.
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def lambda_handler(event: dict, context: Any) -> dict:
    """WebSocket $disconnect 이벤트를 처리합니다.

    Returns:
        200 (항상 성공 반환 — 연결 종료 시 실패 응답은 무의미)
    """
    request_context = event.get("requestContext", {})
    connection_id = request_context.get("connectionId", "")

    logger.info("WsDisconnect: connection_id=%s", connection_id)

    try:
        _delete_connection(connection_id)
    except Exception as e:  # noqa: BLE001
        # 연결 삭제 실패는 비치명적 — 로그만 남기고 200 반환
        logger.error("Failed to delete WS connection %s: %s", connection_id, e)

    return {"statusCode": 200}


def _delete_connection(connection_id: str) -> None:
    """Neon DB ws_connections 테이블에서 연결 ID를 삭제합니다."""
    from core.db import get_connection  # noqa: PLC0415

    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            "DELETE FROM ws_connections WHERE connection_id = %s",
            (connection_id,),
        )
    conn.commit()
