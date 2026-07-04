"""Module 4 기술적 분석 Pydantic 모델."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class TechnicalDataPoint(BaseModel):
    """일별 주가 데이터 포인트."""

    date: str
    open: Optional[float] = None
    high: Optional[float] = None
    low: Optional[float] = None
    close: Optional[float] = None
    volume: Optional[int] = None
    change_pct: Optional[float] = None  # 전일 대비 등락률 (%)


class TechnicalSummary(BaseModel):
    """요청 기간 전체에 대한 요약 통계."""

    start_price: Optional[float] = None
    end_price: Optional[float] = None
    period_return_pct: Optional[float] = None  # (종가 - 시작가) / 시작가 * 100
    high_period: Optional[float] = None  # 기간 내 일중 고가 최대값
    low_period: Optional[float] = None  # 기간 내 일중 저가 최소값
    avg_volume: Optional[int] = None  # 기간 평균 거래량


class TechnicalAnalysis(BaseModel):
    """GET /companies/{ticker}/technical 최종 응답 모델."""

    ticker: str
    market: str
    period: str
    data_points: list[TechnicalDataPoint]
    summary: TechnicalSummary
