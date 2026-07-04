"""FMP API 응답 JSON → 내부 Pydantic 모델 변환기.

FMP v3 응답 필드명을 우리 도메인 모델로 매핑합니다.
핵심 주의사항: FMP의 capitalExpenditure는 음수(현금 유출)이므로 abs() 처리합니다.
"""

from __future__ import annotations

from core.fundamental.models import BalanceSheet, CashFlowStatement, IncomeStatement


def normalize_income_statement(raw: dict) -> IncomeStatement:
    """FMP 손익계산서 응답 항목을 IncomeStatement로 변환합니다."""
    return IncomeStatement(
        fiscal_year=int(raw["calendarYear"]),
        revenue=float(raw.get("revenue") or 0),
        operating_income=float(raw.get("operatingIncome") or 0),
        net_income=float(raw.get("netIncome") or 0),
        eps=float(raw["eps"]) if raw.get("eps") is not None else None,
    )


def normalize_balance_sheet(raw: dict) -> BalanceSheet:
    """FMP 대차대조표 응답 항목을 BalanceSheet으로 변환합니다."""
    shares_raw = raw.get("commonStockSharesOutstanding")
    return BalanceSheet(
        fiscal_year=int(raw["calendarYear"]),
        total_assets=float(raw.get("totalAssets") or 0),
        total_liabilities=float(raw.get("totalLiabilities") or 0),
        shareholders_equity=float(raw.get("totalStockholdersEquity") or 0),
        shares_outstanding=float(shares_raw) if shares_raw is not None else None,
    )


def normalize_cash_flow_statement(raw: dict) -> CashFlowStatement:
    """FMP 현금흐름표 응답 항목을 CashFlowStatement로 변환합니다."""
    capex_raw = raw.get("capitalExpenditure") or 0
    return CashFlowStatement(
        fiscal_year=int(raw["calendarYear"]),
        operating_cash_flow=float(raw.get("operatingCashFlow") or 0),
        capital_expenditures=abs(float(capex_raw)),  # FMP는 음수값으로 반환
    )


def normalize_all(
    raw_incomes: list[dict],
    raw_balances: list[dict],
    raw_cfs: list[dict],
) -> tuple[list[IncomeStatement], list[BalanceSheet], list[CashFlowStatement]]:
    """3대 재무제표 FMP 응답 리스트를 내부 모델 리스트로 일괄 변환합니다."""
    return (
        [normalize_income_statement(r) for r in raw_incomes],
        [normalize_balance_sheet(r) for r in raw_balances],
        [normalize_cash_flow_statement(r) for r in raw_cfs],
    )
