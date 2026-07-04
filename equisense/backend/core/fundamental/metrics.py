from __future__ import annotations

from typing import Optional

from .models import BalanceSheet, CashFlowStatement, FundamentalMetrics, IncomeStatement

_ROUND = 2  # 소수점 자릿수


def _safe_divide(numerator: float, denominator: float) -> Optional[float]:
    """0 나누기를 안전하게 처리하는 내부 나눗셈 헬퍼."""
    if denominator == 0:
        return None
    return numerator / denominator


def calculate_roe(net_income: float, shareholders_equity: float) -> Optional[float]:
    """자기자본이익률: 당기순이익 / 자기자본 × 100 (%)

    자기자본이 0이면 None 반환.
    """
    result = _safe_divide(net_income, shareholders_equity)
    return round(result * 100, _ROUND) if result is not None else None


def calculate_roa(net_income: float, total_assets: float) -> Optional[float]:
    """총자산이익률: 당기순이익 / 총자산 × 100 (%)

    총자산이 0이면 None 반환.
    """
    result = _safe_divide(net_income, total_assets)
    return round(result * 100, _ROUND) if result is not None else None


def calculate_debt_ratio(total_liabilities: float, shareholders_equity: float) -> Optional[float]:
    """부채비율: 총부채 / 자기자본 × 100 (%)

    자기자본이 0이면 None 반환.
    """
    result = _safe_divide(total_liabilities, shareholders_equity)
    return round(result * 100, _ROUND) if result is not None else None


def calculate_operating_margin(operating_income: float, revenue: float) -> Optional[float]:
    """영업이익률: 영업이익 / 매출액 × 100 (%)

    매출액이 0이면 None 반환.
    """
    result = _safe_divide(operating_income, revenue)
    return round(result * 100, _ROUND) if result is not None else None


def calculate_fcf(operating_cash_flow: float, capital_expenditures: float) -> float:
    """잉여현금흐름: 영업현금흐름 - CAPEX"""
    return round(operating_cash_flow - capital_expenditures, _ROUND)


def calculate_per(price: float, eps: float) -> Optional[float]:
    """주가수익비율: 주가 / 주당순이익

    EPS가 0이면 None 반환.
    """
    result = _safe_divide(price, eps)
    return round(result, _ROUND) if result is not None else None


def calculate_pbr(price: float, book_value_per_share: float) -> Optional[float]:
    """주가순자산비율: 주가 / 주당순자산

    주당순자산이 0이면 None 반환.
    """
    result = _safe_divide(price, book_value_per_share)
    return round(result, _ROUND) if result is not None else None


def _book_value_per_share(shareholders_equity: float, shares_outstanding: float) -> Optional[float]:
    """주당순자산 = 자기자본 / 발행주식수 (내부 계산용)."""
    return _safe_divide(shareholders_equity, shares_outstanding)


def compute_metrics_for_year(
    income: IncomeStatement,
    balance: BalanceSheet,
    cash_flow: CashFlowStatement,
    price: Optional[float] = None,
) -> FundamentalMetrics:
    """단일 회계연도의 모든 핵심 재무 지표를 계산합니다.

    Args:
        income: 손익계산서 데이터
        balance: 대차대조표 데이터
        cash_flow: 현금흐름표 데이터
        price: 현재 주가 (PER/PBR 계산용, 선택)

    Returns:
        계산된 FundamentalMetrics. 분모가 0인 지표는 None.
    """
    per = None
    pbr = None
    if price is not None and price > 0:
        if income.eps is not None:
            per = calculate_per(price, income.eps)
        if balance.shares_outstanding is not None and balance.shares_outstanding > 0:
            bvps = _book_value_per_share(balance.shareholders_equity, balance.shares_outstanding)
            if bvps is not None:
                pbr = calculate_pbr(price, bvps)

    return FundamentalMetrics(
        fiscal_year=income.fiscal_year,
        roe=calculate_roe(income.net_income, balance.shareholders_equity),
        roa=calculate_roa(income.net_income, balance.total_assets),
        debt_ratio=calculate_debt_ratio(balance.total_liabilities, balance.shareholders_equity),
        operating_margin=calculate_operating_margin(income.operating_income, income.revenue),
        fcf=calculate_fcf(cash_flow.operating_cash_flow, cash_flow.capital_expenditures),
        per=per,
        pbr=pbr,
    )


def compute_multi_year_metrics(
    income_statements: list[IncomeStatement],
    balance_sheets: list[BalanceSheet],
    cash_flow_statements: list[CashFlowStatement],
    prices: Optional[dict[int, float]] = None,
) -> list[FundamentalMetrics]:
    """3대 재무제표 다년도 데이터로 모든 연도의 핵심 지표를 계산합니다.

    Args:
        income_statements: 연도별 손익계산서 리스트
        balance_sheets: 연도별 대차대조표 리스트
        cash_flow_statements: 연도별 현금흐름표 리스트
        prices: {회계연도: 주가} 딕셔너리 (선택)

    Returns:
        회계연도 오름차순 FundamentalMetrics 리스트.
        3대 재무제표가 모두 존재하는 연도만 포함됩니다.
    """
    bs_by_year = {b.fiscal_year: b for b in balance_sheets}
    cf_by_year = {c.fiscal_year: c for c in cash_flow_statements}
    prices = prices or {}

    results = []
    for income in income_statements:
        year = income.fiscal_year
        if year not in bs_by_year or year not in cf_by_year:
            continue
        results.append(
            compute_metrics_for_year(
                income=income,
                balance=bs_by_year[year],
                cash_flow=cf_by_year[year],
                price=prices.get(year),
            )
        )

    results.sort(key=lambda m: m.fiscal_year)
    return results
