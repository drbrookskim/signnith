from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel


class IncomeStatement(BaseModel):
    """손익계산서 단일 회계연도 데이터."""

    fiscal_year: int
    revenue: float
    operating_income: float
    net_income: float
    eps: Optional[float] = None  # 주당순이익


class BalanceSheet(BaseModel):
    """대차대조표 단일 회계연도 데이터."""

    fiscal_year: int
    total_assets: float
    total_liabilities: float
    shareholders_equity: float
    shares_outstanding: Optional[float] = None  # 발행주식수


class CashFlowStatement(BaseModel):
    """현금흐름표 단일 회계연도 데이터."""

    fiscal_year: int
    operating_cash_flow: float
    capital_expenditures: float  # 양수값으로 입력, FCF 계산 시 차감


class FundamentalMetrics(BaseModel):
    """단일 회계연도의 계산된 핵심 재무 지표."""

    fiscal_year: int
    roe: Optional[float] = None  # 자기자본이익률 (%)
    roa: Optional[float] = None  # 총자산이익률 (%)
    debt_ratio: Optional[float] = None  # 부채비율 (%)
    operating_margin: Optional[float] = None  # 영업이익률 (%)
    fcf: Optional[float] = None  # 잉여현금흐름 (절대값)
    per: Optional[float] = None  # 주가수익비율
    pbr: Optional[float] = None  # 주가순자산비율


class TrendDirection(str, Enum):
    """재무 지표의 추세 방향."""

    IMPROVING = "improving"
    DETERIORATING = "deteriorating"
    STABLE = "stable"


class MetricTrend(BaseModel):
    """특정 재무 지표의 다년도 추세 분석 결과."""

    metric_name: str
    values: list[tuple[int, float]]  # (회계연도, 지표값)
    cagr: Optional[float] = None  # 연평균성장률 (%)
    direction: TrendDirection  # 추세 방향 (사업적 해석 기준)
    yoy_changes: list[tuple[int, Optional[float]]]  # (회계연도, 전년비 변화율%)


class FundamentalAnalysis(BaseModel):
    """펀더멘털 분석 전체 결과 (다년도 지표 + 추세)."""

    ticker: str
    market: str  # 'KR' | 'US'
    metrics_by_year: list[FundamentalMetrics]  # fiscal_year 오름차순
    trends: dict[str, MetricTrend]  # metric_name → 추세
