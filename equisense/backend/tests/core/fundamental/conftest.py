import pytest

from core.fundamental.models import BalanceSheet, CashFlowStatement, IncomeStatement


@pytest.fixture
def sample_income() -> IncomeStatement:
    return IncomeStatement(
        fiscal_year=2023,
        revenue=1_000_000,
        operating_income=200_000,
        net_income=150_000,
        eps=5.0,
    )


@pytest.fixture
def sample_balance() -> BalanceSheet:
    return BalanceSheet(
        fiscal_year=2023,
        total_assets=2_000_000,
        total_liabilities=800_000,
        shareholders_equity=1_200_000,
        shares_outstanding=30_000,
    )


@pytest.fixture
def sample_cf() -> CashFlowStatement:
    return CashFlowStatement(
        fiscal_year=2023,
        operating_cash_flow=250_000,
        capital_expenditures=50_000,
    )
