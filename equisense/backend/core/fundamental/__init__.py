from __future__ import annotations

from .metrics import (
    calculate_debt_ratio,
    calculate_fcf,
    calculate_operating_margin,
    calculate_pbr,
    calculate_per,
    calculate_roa,
    calculate_roe,
    compute_metrics_for_year,
    compute_multi_year_metrics,
)
from .models import (
    BalanceSheet,
    CashFlowStatement,
    FundamentalAnalysis,
    FundamentalMetrics,
    IncomeStatement,
    MetricTrend,
    TrendDirection,
)
from .trend import analyze_all_trends, analyze_trend, calculate_cagr, calculate_yoy_change


def analyze_fundamentals(
    income_statements: list[IncomeStatement],
    balance_sheets: list[BalanceSheet],
    cash_flow_statements: list[CashFlowStatement],
    ticker: str,
    market: str,
    prices: dict[int, float] | None = None,
) -> FundamentalAnalysis:
    """3대 재무제표 다년도 데이터로 펀더멘털 분석 전체 결과를 생성합니다.

    Args:
        income_statements: 연도별 손익계산서 리스트
        balance_sheets: 연도별 대차대조표 리스트
        cash_flow_statements: 연도별 현금흐름표 리스트
        ticker: 종목 코드 (예: "AAPL", "005930")
        market: 시장 구분 ("KR" 또는 "US")
        prices: {회계연도: 주가} 딕셔너리 (PER/PBR 계산용, 선택)

    Returns:
        FundamentalAnalysis — 다년도 지표와 추세 분석을 포함한 전체 결과
    """
    metrics_by_year = compute_multi_year_metrics(
        income_statements, balance_sheets, cash_flow_statements, prices
    )
    return FundamentalAnalysis(
        ticker=ticker,
        market=market,
        metrics_by_year=metrics_by_year,
        trends=analyze_all_trends(metrics_by_year),
    )


__all__ = [
    "IncomeStatement",
    "BalanceSheet",
    "CashFlowStatement",
    "FundamentalMetrics",
    "MetricTrend",
    "TrendDirection",
    "FundamentalAnalysis",
    "calculate_roe",
    "calculate_roa",
    "calculate_debt_ratio",
    "calculate_operating_margin",
    "calculate_fcf",
    "calculate_per",
    "calculate_pbr",
    "compute_metrics_for_year",
    "compute_multi_year_metrics",
    "calculate_cagr",
    "calculate_yoy_change",
    "analyze_trend",
    "analyze_all_trends",
    "analyze_fundamentals",
]
