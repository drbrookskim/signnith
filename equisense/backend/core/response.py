"""Lambda 응답 헬퍼 — API Gateway 프록시 응답 형식.

모든 응답에 CORS 헤더를 포함합니다.
Lambda Proxy 통합에서는 API Gateway가 CORS 헤더를 자동 주입하지 않으므로
Lambda 응답에 직접 포함해야 합니다.
"""

from __future__ import annotations

import json
from typing import Any

_CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
}


def ok(body: Any) -> dict:
    """200 OK 응답을 반환합니다."""
    return {
        "statusCode": 200,
        "headers": _CORS_HEADERS,
        "body": json.dumps(body, default=str),
    }


def accepted(body: Any) -> dict:
    """202 Accepted 응답을 반환합니다."""
    return {
        "statusCode": 202,
        "headers": _CORS_HEADERS,
        "body": json.dumps(body, default=str),
    }


def error(status: int, code: str, message: str, request_id: str) -> dict:
    """표준 에러 스키마 응답을 반환합니다."""
    return {
        "statusCode": status,
        "headers": _CORS_HEADERS,
        "body": json.dumps({"error": {"code": code, "message": message, "request_id": request_id}}),
    }
