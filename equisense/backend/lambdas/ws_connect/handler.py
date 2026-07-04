"""API Gateway WebSocket $connect Lambda 핸들러.

WebSocket 연결 ID를 Neon DB ws_connections 테이블에 저장합니다.
Cognito JWT 검증은 API Gateway Authorizer가 처리하므로 핸들러는 연결 저장에만 집중합니다.
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def lambda_handler(event: dict, context: Any) -> dict:
    """WebSocket $connect 이벤트를 처리합니다.

    Args:
        event: API Gateway WebSocket 이벤트
               event["requestContext"]["connectionId"]: 연결 ID
               event["requestContext"]["authorizer"]["sub"]: Cognito 사용자 ID

    Returns:
        200 (연결 허용) 또는 500 (저장 실패)
    """
    request_context = event.get("requestContext", {})
    connection_id = request_context.get("connectionId", "")
    authorizer = request_context.get("authorizer", {})
    user_id = authorizer.get("sub", "anonymous")

    logger.info("WsConnect: connection_id=%s user_id=%s", connection_id, user_id)

    try:
        _save_connection(connection_id, user_id)
        return {"statusCode": 200}
    except Exception as e:
        logger.error("Failed to save WS connection %s: %s", connection_id, e)
        return {"statusCode": 500}


def _save_connection(connection_id: str, user_id: str) -> None:
    """Neon DB ws_connections 테이블에 연결 정보를 저장합니다."""
    from core.db import get_connection  # noqa: PLC0415

    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO ws_connections (connection_id, user_id)
            VALUES (%s, %s)
            ON CONFLICT (connection_id) DO UPDATE SET
                user_id    = EXCLUDED.user_id,
                connected_at = NOW()
            """,
            (connection_id, user_id),
        )
    conn.commit()
