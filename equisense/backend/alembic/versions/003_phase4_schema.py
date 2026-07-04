"""phase4 schema: macro_indicators, screener_results, ws_connections

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-05-21

신규 테이블:
  - macro_indicators: 거시 지표 이력 (금리·CPI·실업률·GDP)
  - screener_results: 기술적 스크리닝 결과 (저평가·과열 신호)
  - ws_connections:   활성 WebSocket 연결 관리
"""

from __future__ import annotations

from alembic import op

revision = "c3d4e5f6a7b8"
down_revision = "b2c3d4e5f6a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS macro_indicators (
            id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            indicator   VARCHAR(50) NOT NULL,
            value       NUMERIC(12,4) NOT NULL,
            date        DATE        NOT NULL,
            unit        VARCHAR(20),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (indicator, date)
        )
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_macro_indicators_indicator_date
            ON macro_indicators (indicator, date DESC)
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS screener_results (
            id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            ticker         VARCHAR(10) NOT NULL,
            market         VARCHAR(5)  NOT NULL CHECK (market IN ('KR', 'US')),
            price          NUMERIC(12,4),
            week_52_high   NUMERIC(12,4),
            week_52_low    NUMERIC(12,4),
            signal         VARCHAR(20) NOT NULL
                CHECK (signal IN ('undervalued', 'overbought', 'neutral')),
            is_undervalued BOOLEAN     NOT NULL DEFAULT FALSE,
            is_overbought  BOOLEAN     NOT NULL DEFAULT FALSE,
            screened_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (ticker, market)
        )
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_screener_results_signal
            ON screener_results (signal, screened_at DESC)
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_connections (
            connection_id VARCHAR(128) PRIMARY KEY,
            user_id       VARCHAR(255) NOT NULL,
            connected_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_ws_connections_user_id
            ON ws_connections (user_id)
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_ws_connections_user_id")
    op.execute("DROP TABLE IF EXISTS ws_connections")
    op.execute("DROP INDEX IF EXISTS idx_screener_results_signal")
    op.execute("DROP TABLE IF EXISTS screener_results")
    op.execute("DROP INDEX IF EXISTS idx_macro_indicators_indicator_date")
    op.execute("DROP TABLE IF EXISTS macro_indicators")
