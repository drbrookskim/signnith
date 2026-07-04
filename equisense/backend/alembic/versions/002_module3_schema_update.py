"""module3 schema update

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-05-19

analysis_jobs 테이블 변경:
  - doc_type VARCHAR(50) 추가 (연간보고서·어닝콜 구분)
  - fiscal_year SMALLINT 추가 (분석 대상 회계연도)
  - user_id NOT NULL → NULL 허용 (Phase 3: Cognito 인증 전 임시 완화, Phase 4에서 복원)
"""

from __future__ import annotations

from alembic import op

revision = "b2c3d4e5f6a7"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE analysis_jobs
            ADD COLUMN IF NOT EXISTS doc_type    VARCHAR(50)  NOT NULL DEFAULT 'annual_report',
            ADD COLUMN IF NOT EXISTS fiscal_year SMALLINT     NOT NULL DEFAULT 2024,
            ALTER COLUMN user_id DROP NOT NULL
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_analysis_jobs_ticker_created
            ON analysis_jobs (ticker, created_at DESC)
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_analysis_jobs_ticker_created")
    op.execute(
        """
        ALTER TABLE analysis_jobs
            DROP COLUMN IF EXISTS doc_type,
            DROP COLUMN IF EXISTS fiscal_year,
            ALTER COLUMN user_id SET NOT NULL
        """
    )
