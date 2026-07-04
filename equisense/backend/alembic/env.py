from __future__ import annotations

import os
from logging.config import fileConfig

from sqlalchemy import create_engine, pool

from alembic import context

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)


def _get_url() -> str:
    """NEON_DATABASE_URL 환경 변수를 우선 사용하고, 없으면 alembic.ini fallback."""
    url = os.environ.get("NEON_DATABASE_URL")
    if not url:
        raise RuntimeError(
            "NEON_DATABASE_URL 환경 변수가 설정되지 않았습니다. "
            ".env 파일을 확인하거나 export NEON_DATABASE_URL=... 로 설정하십시오."
        )
    return url


def run_migrations_online() -> None:
    """실제 DB에 연결하여 마이그레이션을 실행합니다.

    NullPool을 사용하여 마이그레이션 완료 후 연결을 즉시 반환합니다.
    Lambda 런타임이 아닌 CLI(배포 파이프라인)에서만 실행됩니다.
    """
    engine = create_engine(_get_url(), poolclass=pool.NullPool)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=None)
        with context.begin_transaction():
            context.run_migrations()


run_migrations_online()
