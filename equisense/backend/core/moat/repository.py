"""Neon DB moat_scores 테이블 조회 레포지토리.

CREATE TABLE moat_scores (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticker            VARCHAR(10) NOT NULL,
    market            VARCHAR(5) NOT NULL,
    fiscal_year       SMALLINT NOT NULL,
    cost_advantage    NUMERIC(4,2) NOT NULL,
    intangible_assets NUMERIC(4,2) NOT NULL,
    switching_costs   NUMERIC(4,2) NOT NULL,
    network_effects   NUMERIC(4,2) NOT NULL,
    composite_score   NUMERIC(4,2) NOT NULL,
    grade             VARCHAR(10) NOT NULL,
    analyst_note      TEXT,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(ticker, market, fiscal_year)
);
"""

from __future__ import annotations

from typing import Optional

from core.db import get_connection
from core.moat.models import DimensionScore, MoatAnalysis, MoatDimension, MoatGrade

_SELECT_LATEST = """
    SELECT ticker, market, fiscal_year,
           cost_advantage, intangible_assets, switching_costs, network_effects,
           composite_score, grade, analyst_note, created_at
    FROM moat_scores
    WHERE ticker = %s AND market = %s
    ORDER BY fiscal_year DESC, created_at DESC
    LIMIT 1
"""


def get_latest_moat_score(ticker: str, market: str) -> Optional[MoatAnalysis]:
    """ticker의 가장 최근 회계연도 해자 점수를 조회합니다.

    Args:
        ticker: 종목 코드
        market: 'KR' 또는 'US'

    Returns:
        MoatAnalysis 또는 데이터 없을 경우 None

    Raises:
        psycopg2.Error: DB 연결 또는 쿼리 실패 시
    """
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(_SELECT_LATEST, (ticker, market))
        row = cur.fetchone()

    if row is None:
        return None

    (
        db_ticker,
        db_market,
        fiscal_year,
        cost_adv,
        intangible,
        switching,
        network,
        composite,
        grade,
        note,
        created_at,
    ) = row

    return MoatAnalysis(
        ticker=db_ticker,
        market=db_market,
        fiscal_year=int(fiscal_year),
        dimension_scores=[
            DimensionScore(dimension=MoatDimension.COST_ADVANTAGE, score=float(cost_adv)),
            DimensionScore(dimension=MoatDimension.INTANGIBLE_ASSETS, score=float(intangible)),
            DimensionScore(dimension=MoatDimension.SWITCHING_COSTS, score=float(switching)),
            DimensionScore(dimension=MoatDimension.NETWORK_EFFECTS, score=float(network)),
        ],
        composite_score=float(composite),
        grade=MoatGrade(grade),
        analyst_note=note,
        scored_at=created_at.isoformat(),
    )
