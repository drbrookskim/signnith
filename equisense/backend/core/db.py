"""Neon PostgreSQL 연결 헬퍼.

Lambda 컨텍스트 재사용을 위해 모듈 레벨에서 연결 객체를 캐싱합니다.
Neon PgBouncer 풀링 URL(포트 6432)을 반드시 사용해야 합니다.
포트 5432 직접 연결은 Lambda 동시 실행 시 max_connections 초과를 유발합니다.
"""

from __future__ import annotations

import os

_conn = None  # Lambda 인스턴스 재사용 시 연결 재활용


def get_connection():
    """psycopg2 DB 연결을 반환합니다. 연결이 닫혔으면 재연결합니다."""
    global _conn
    if _conn is None or _conn.closed:
        import psycopg2  # Lambda 환경에서만 실제 연결. 테스트 시 모킹 대상.

        # keepalives: Lambda 컨테이너 유휴 후 재사용 시 stale connection 방지
        _conn = psycopg2.connect(
            os.environ["NEON_DATABASE_URL"],
            keepalives=1,
            keepalives_idle=30,
            keepalives_interval=10,
            keepalives_count=5,
        )
    return _conn
