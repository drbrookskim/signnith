import pytest

from core.fundamental import analyze_fundamentals
from core.fundamental.metrics import (
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
from core.fundamental.models import BalanceSheet, CashFlowStatement, IncomeStatement


class TestCalculateROE:
    def test_normal(self):
        # 150_000 / 1_200_000 * 100 = 12.5
        assert calculate_roe(150_000, 1_200_000) == 12.5

    def test_zero_equity_returns_none(self):
        assert calculate_roe(100_000, 0) is None

    def test_negative_net_income(self):
        assert calculate_roe(-100_000, 1_000_000) == -10.0

    def test_negative_equity(self):
        assert calculate_roe(100_000, -500_000) == -20.0

    def test_rounding(self):
        # 1 / 3 * 100 = 33.333... → 33.33
        assert calculate_roe(1, 3) == 33.33


class TestCalculateROA:
    def test_normal(self):
        # 150_000 / 2_000_000 * 100 = 7.5
        assert calculate_roa(150_000, 2_000_000) == 7.5

    def test_zero_assets_returns_none(self):
        assert calculate_roa(100_000, 0) is None

    def test_negative_net_income(self):
        assert calculate_roa(-200_000, 2_000_000) == -10.0


class TestCalculateDebtRatio:
    def test_normal(self):
        # 800_000 / 1_200_000 * 100 = 66.67
        assert calculate_debt_ratio(800_000, 1_200_000) == 66.67

    def test_zero_equity_returns_none(self):
        assert calculate_debt_ratio(500_000, 0) is None

    def test_debt_free(self):
        assert calculate_debt_ratio(0, 1_000_000) == 0.0

    def test_over_100_percent(self):
        assert calculate_debt_ratio(2_000_000, 1_000_000) == 200.0


class TestCalculateOperatingMargin:
    def test_normal(self):
        # 200_000 / 1_000_000 * 100 = 20.0
        assert calculate_operating_margin(200_000, 1_000_000) == 20.0

    def test_zero_revenue_returns_none(self):
        assert calculate_operating_margin(100_000, 0) is None

    def test_negative_operating_income(self):
        assert calculate_operating_margin(-50_000, 1_000_000) == -5.0

    def test_high_margin(self):
        assert calculate_operating_margin(400_000, 1_000_000) == 40.0


class TestCalculateFCF:
    def test_positive_fcf(self):
        assert calculate_fcf(250_000, 50_000) == 200_000

    def test_negative_fcf(self):
        assert calculate_fcf(100_000, 150_000) == -50_000

    def test_zero_capex(self):
        assert calculate_fcf(200_000, 0) == 200_000

    def test_zero_operating_cash_flow(self):
        assert calculate_fcf(0, 80_000) == -80_000


class TestCalculatePER:
    def test_normal(self):
        # 100 / 5 = 20
        assert calculate_per(100.0, 5.0) == 20.0

    def test_zero_eps_returns_none(self):
        assert calculate_per(100.0, 0) is None

    def test_negative_eps(self):
        assert calculate_per(100.0, -5.0) == -20.0

    def test_rounding(self):
        assert calculate_per(100.0, 7.0) == pytest.approx(14.29, abs=0.01)


class TestCalculatePBR:
    def test_normal(self):
        # 주가 60, 주당순자산 40 → PBR 1.5
        assert calculate_pbr(60.0, 40.0) == 1.5

    def test_zero_bvps_returns_none(self):
        assert calculate_pbr(100.0, 0) is None

    def test_below_book_value(self):
        # 주가 < 주당순자산 → PBR < 1 (저평가 신호)
        assert calculate_pbr(30.0, 40.0) == 0.75


class TestComputeMetricsForYear:
    def test_all_metrics_calculated(self, sample_income, sample_balance, sample_cf):
        m = compute_metrics_for_year(sample_income, sample_balance, sample_cf)
        assert m.fiscal_year == 2023
        assert m.roe == 12.5
        assert m.roa == 7.5
        assert m.debt_ratio == 66.67
        assert m.operating_margin == 20.0
        assert m.fcf == 200_000

    def test_per_pbr_computed_when_price_given(self, sample_income, sample_balance, sample_cf):
        m = compute_metrics_for_year(sample_income, sample_balance, sample_cf, price=100.0)
        assert m.per == 20.0  # 100 / 5
        # bvps = 1_200_000 / 30_000 = 40 → pbr = 100 / 40 = 2.5
        assert m.pbr == 2.5

    def test_per_pbr_none_without_price(self, sample_income, sample_balance, sample_cf):
        m = compute_metrics_for_year(sample_income, sample_balance, sample_cf)
        assert m.per is None
        assert m.pbr is None

    def test_zero_equity_produces_none_roe_debt_ratio(self, sample_income, sample_cf):
        zero_equity_balance = BalanceSheet(
            fiscal_year=2023,
            total_assets=2_000_000,
            total_liabilities=2_000_000,
            shareholders_equity=0,
        )
        m = compute_metrics_for_year(sample_income, zero_equity_balance, sample_cf)
        assert m.roe is None
        assert m.debt_ratio is None
        assert m.roa == 7.5  # total_assets 기준이므로 정상 계산

    def test_zero_revenue_produces_none_operating_margin(self, sample_balance, sample_cf):
        zero_revenue = IncomeStatement(
            fiscal_year=2023, revenue=0, operating_income=0, net_income=100_000
        )
        m = compute_metrics_for_year(zero_revenue, sample_balance, sample_cf)
        assert m.operating_margin is None


class TestComputeMultiYearMetrics:
    def _make_data(self, years: list[int]):
        incomes = [
            IncomeStatement(
                fiscal_year=y,
                revenue=1_000_000 * y / 2020,
                operating_income=200_000 * y / 2020,
                net_income=150_000 * y / 2020,
                eps=5.0,
            )
            for y in years
        ]
        balances = [
            BalanceSheet(
                fiscal_year=y,
                total_assets=2_000_000,
                total_liabilities=800_000,
                shareholders_equity=1_200_000,
            )
            for y in years
        ]
        cfs = [
            CashFlowStatement(
                fiscal_year=y, operating_cash_flow=250_000, capital_expenditures=50_000
            )
            for y in years
        ]
        return incomes, balances, cfs

    def test_returns_sorted_by_fiscal_year(self):
        incomes, balances, cfs = self._make_data([2022, 2023, 2021])
        results = compute_multi_year_metrics(incomes, balances, cfs)
        assert [m.fiscal_year for m in results] == [2021, 2022, 2023]

    def test_skips_year_with_missing_balance_sheet(self):
        incomes, _, cfs = self._make_data([2022, 2023])
        balances_only_2023 = [
            BalanceSheet(
                fiscal_year=2023,
                total_assets=2_000_000,
                total_liabilities=800_000,
                shareholders_equity=1_200_000,
            )
        ]
        results = compute_multi_year_metrics(incomes, balances_only_2023, cfs)
        assert len(results) == 1
        assert results[0].fiscal_year == 2023

    def test_prices_applied_per_year(self):
        incomes, balances, cfs = self._make_data([2022, 2023])
        results = compute_multi_year_metrics(incomes, balances, cfs, prices={2023: 100.0})
        year_map = {m.fiscal_year: m for m in results}
        assert year_map[2022].per is None
        assert year_map[2023].per is not None


class TestAnalyzeFundamentals:
    def test_returns_fundamental_analysis(self, sample_income, sample_balance, sample_cf):
        result = analyze_fundamentals(
            income_statements=[sample_income],
            balance_sheets=[sample_balance],
            cash_flow_statements=[sample_cf],
            ticker="AAPL",
            market="US",
        )
        assert result.ticker == "AAPL"
        assert result.market == "US"
        assert len(result.metrics_by_year) == 1
        assert "roe" in result.trends
        assert "debt_ratio" in result.trends

    def test_trends_included_for_multi_year(self):
        years = list(range(2019, 2024))
        incomes = [
            IncomeStatement(
                fiscal_year=y,
                revenue=1_000_000 + y * 50_000,
                operating_income=200_000,
                net_income=150_000,
            )
            for y in years
        ]
        balances = [
            BalanceSheet(
                fiscal_year=y,
                total_assets=2_000_000,
                total_liabilities=800_000,
                shareholders_equity=1_200_000,
            )
            for y in years
        ]
        cfs = [
            CashFlowStatement(
                fiscal_year=y, operating_cash_flow=250_000, capital_expenditures=50_000
            )
            for y in years
        ]
        result = analyze_fundamentals(incomes, balances, cfs, ticker="005930", market="KR")
        assert result.trends["operating_margin"].cagr is not None
        assert len(result.metrics_by_year) == 5
