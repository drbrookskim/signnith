from __future__ import annotations

import json
import os
from typing import Any, Optional

FINANCIAL_DATA_TTL = 86_400  # 24시간 (초)

_client = None  # Lambda 컨텍스트 재사용을 위한 모듈 레벨 캐싱


def _get_client():
    """Upstash Redis 클라이언트를 반환합니다. 첫 호출 시 연결을 초기화합니다."""
    global _client
    if _client is None:
        import redis  # Lambda 환경에서만 실제 연결. 테스트 시 모킹 대상.

        _client = redis.from_url(os.environ["UPSTASH_REDIS_URL"], decode_responses=True)
    return _client


def cache_get(key: str) -> Optional[Any]:
    """캐시에서 JSON 역직렬화된 값을 조회합니다. 키가 없으면 None."""
    raw = _get_client().get(key)
    return json.loads(raw) if raw is not None else None


def cache_set(key: str, value: Any, ttl: int) -> None:
    """값을 JSON으로 직렬화하여 TTL(초)과 함께 캐시에 저장합니다."""
    _get_client().setex(key, ttl, json.dumps(value, default=str))
