"""GET /health Lambda 핸들러.

Neon DB 및 Upstash Redis 연결 상태를 확인하고 종합 헬스 상태를 반환합니다.
두 의존성 중 하나라도 비정상이면 HTTP 503을 반환합니다.
"""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

STATUS_OK = "ok"
STATUS_DEGRADED = "degraded"


def _check_redis() -> tuple[str, str | None]:
    """Redis PING 응답을 확인합니다.

    Returns:
        (status, error_message) — 정상이면 ("ok", None)
    """
    try:
        from core.cache import _get_client  # lazy import

        client = _get_client()
        client.ping()
        return STATUS_OK, None
    except Exception as e:  # noqa: BLE001
        logger.warning("Redis health check failed: %s", e)
        return STATUS_DEGRADED, "redis unreachable"


def _check_db() -> tuple[str, str | None]:
    """Neon DB 연결 및 간단한 쿼리를 확인합니다.

    Returns:
        (status, error_message) — 정상이면 ("ok", None)
    """
    try:
        from core.db import get_connection  # lazy import

        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
        return STATUS_OK, None
    except Exception as e:  # noqa: BLE001
        logger.warning("DB health check failed: %s", e)
        return STATUS_DEGRADED, "database unreachable"


def _response(status_code: int, body: Any) -> dict:
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        },
        "body": json.dumps(body),
    }


def lambda_handler(event: dict, context: Any) -> dict:
    """GET /health 요청을 처리합니다.

    Args:
        event: API Gateway 프록시 이벤트 (사용하지 않음)
        context: Lambda 실행 컨텍스트

    Returns:
        200 (모든 의존성 정상) 또는 503 (하나 이상 비정상)
    """
    request_id = getattr(context, "aws_request_id", str(uuid.uuid4()))

    redis_status, redis_error = _check_redis()
    db_status, db_error = _check_db()

    checks = {
        "redis": {"status": redis_status},
        "database": {"status": db_status},
    }
    if redis_error:
        checks["redis"]["error"] = redis_error
    if db_error:
        checks["database"]["error"] = db_error

    all_ok = redis_status == STATUS_OK and db_status == STATUS_OK
    overall = STATUS_OK if all_ok else STATUS_DEGRADED
    http_code = 200 if overall == STATUS_OK else 503

    body = {
        "status": overall,
        "checks": checks,
        "request_id": request_id,
    }
    logger.info("Health check: %s (redis=%s, db=%s)", overall, redis_status, db_status)
    return _response(http_code, body)
