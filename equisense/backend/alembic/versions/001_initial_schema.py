"""initial schema

Revision ID: a1b2c3d4e5f6
Revises:
Create Date: 2026-05-17

5개 핵심 테이블 생성:
  - users             : 사용자 계정
  - companies         : 종목 기준 정보
  - moat_scores       : 경제적 해자 점수 (Module 2)
  - analysis_jobs     : 비동기 RAG 분석 작업 상태 (Module 3)
  - qualitative_results: RAG 분석 결과 (Module 3)
"""

from __future__ import annotations

from alembic import op

revision = "a1b2c3d4e5f6"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── users ──────────────────────────────────────────────────────────────
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            email      VARCHAR(255) NOT NULL UNIQUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """
    )

    # ── companies ──────────────────────────────────────────────────────────
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS companies (
            id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            ticker     VARCHAR(10) NOT NULL,
            market     VARCHAR(5)  NOT NULL CHECK (market IN ('KR', 'US')),
            name       VARCHAR(255),
            sector     VARCHAR(100),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (ticker, market)
        )
    """
    )

    # ── moat_scores (Module 2) ─────────────────────────────────────────────
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS moat_scores (
            id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            ticker            VARCHAR(10)  NOT NULL,
            market            VARCHAR(5)   NOT NULL CHECK (market IN ('KR', 'US')),
            fiscal_year       SMALLINT     NOT NULL,
            cost_advantage    NUMERIC(4,2) NOT NULL CHECK (cost_advantage    BETWEEN 0 AND 10),
            intangible_assets NUMERIC(4,2) NOT NULL CHECK (intangible_assets BETWEEN 0 AND 10),
            switching_costs   NUMERIC(4,2) NOT NULL CHECK (switching_costs   BETWEEN 0 AND 10),
            network_effects   NUMERIC(4,2) NOT NULL CHECK (network_effects   BETWEEN 0 AND 10),
            composite_score   NUMERIC(4,2) NOT NULL,
            grade             VARCHAR(10)  NOT NULL CHECK (grade IN ('wide', 'narrow', 'none')),
            analyst_note      TEXT,
            created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            UNIQUE (ticker, market, fiscal_year)
        )
    """
    )

    # ── analysis_jobs (Module 3 — 비동기 작업 상태) ─────────────────────────
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS analysis_jobs (
            id            UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id       UUID     NOT NULL REFERENCES users(id),
            ticker        VARCHAR(10) NOT NULL,
            market        VARCHAR(5)  NOT NULL CHECK (market IN ('KR', 'US')),
            status        VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                          CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
            retry_count   SMALLINT NOT NULL DEFAULT 0,
            error_message TEXT,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """
    )

    # ── qualitative_results (Module 3 — RAG 분석 결과) ──────────────────────
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS qualitative_results (
            id              UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
            job_id          UUID     NOT NULL REFERENCES analysis_jobs(id),
            ticker          VARCHAR(10)  NOT NULL,
            fiscal_period   VARCHAR(10)  NOT NULL,
            integrity_score SMALLINT     CHECK (integrity_score BETWEEN 0 AND 100),
            summary_ko      TEXT,
            risk_factors    JSONB,
            growth_drivers  JSONB,
            noise_filter    JSONB,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """
    )

    # ── 인덱스 ──────────────────────────────────────────────────────────────
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_moat_scores_ticker_market
            ON moat_scores (ticker, market)
    """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_analysis_jobs_user_status
            ON analysis_jobs (user_id, status)
    """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_analysis_jobs_ticker_market
            ON analysis_jobs (ticker, market)
    """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_qualitative_results_ticker
            ON qualitative_results (ticker)
    """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS qualitative_results CASCADE")
    op.execute("DROP TABLE IF EXISTS analysis_jobs CASCADE")
    op.execute("DROP TABLE IF EXISTS moat_scores CASCADE")
    op.execute("DROP TABLE IF EXISTS companies CASCADE")
    op.execute("DROP TABLE IF EXISTS users CASCADE")
