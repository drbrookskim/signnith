"""news_articles 테이블 추가 — NewsIngestionWorker 결과 저장

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-05-25

Alpha Vantage 뉴스(US)와 DART 공시(KR)를 저장합니다.
Redis TTL(1h) 만료 후에도 히스토리 조회와 RAG 파이프라인에서 활용됩니다.
"""

from __future__ import annotations

from alembic import op

revision = "d4e5f6a7b8c9"
down_revision = "c3d4e5f6a7b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS news_articles (
            id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            ticker          VARCHAR(10) NOT NULL,
            market          VARCHAR(5)  NOT NULL CHECK (market IN ('KR', 'US')),
            title           TEXT        NOT NULL,
            url             TEXT        NOT NULL,
            source          VARCHAR(100),
            published_at    VARCHAR(20),
            summary         TEXT,
            sentiment_score NUMERIC(5,4),
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (ticker, url)
        )
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_news_articles_ticker_created
            ON news_articles (ticker, created_at DESC)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_news_articles_market
            ON news_articles (market, created_at DESC)
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_news_articles_market")
    op.execute("DROP INDEX IF EXISTS idx_news_articles_ticker_created")
    op.execute("DROP TABLE IF EXISTS news_articles")
