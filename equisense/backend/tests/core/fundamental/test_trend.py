import pytest

from core.fundamental.models import FundamentalMetrics, TrendDirection
from core.fundamental.trend import (
    analyze_all_trends,
    analyze_trend,
    calculate_cagr,
    calculate_yoy_change,
)


class TestCalculateCAGR:
    def test_positive_growth(self):
        # 100 * 1.05^10 = 162.89 → CAGR = 5%
        assert calculate_cagr(100, 162.89, 10) == pytest.approx(5.0, abs=0.1)

    def test_zero_growth(self):
        assert calculate_cagr(100, 100, 5) == pytest.approx(0.0, abs=0.01)

    def test_decline(self):
        # 100 → 90.25 in 2년 ≈ -5% CAGR
        assert calculate_cagr(100, 90.25, 2) == pytest.approx(-5.0, abs=0.1)

    def test_zero_start_returns_none(self):
        assert calculate_cagr(0, 100, 5) is None

    def test_negative_start_returns_none(self):
        assert calculate_cagr(-100, 100, 5) is None

    def test_sign_change_positive_to_negative_returns_none(self):
        assert calculate_cagr(100, -50, 3) is None

    def test_zero_years_returns_none(self):
        assert calculate_cagr(100, 200, 0) is None

    def test_negative_years_returns_none(self):
        assert calculate_cagr(100, 200, -1) is None

    def test_one_year_doubling(self):
        # 100 → 200 in 1년 = 100% CAGR
        assert calculate_cagr(100, 200, 1) == pytest.approx(100.0, abs=0.01)


class TestCalculateYoYChange:
    def test_positive_change(self):
        assert calculate_yoy_change(100, 120) == 20.0

    def test_negative_change(self):
        assert calculate_yoy_change(100, 80) == -20.0

    def test_zero_prev_returns_none(self):
        assert calculate_yoy_change(0, 100) is None

    def test_negative_base_uses_abs_value(self):
        # |prev| = 100, change = -50 - (-100) = 50 → +50%
        assert calculate_yoy_change(-100, -50) == pytest.approx(50.0, abs=0.01)

    def test_no_change(self):
        assert calculate_yoy_change(100, 100) == 0.0


class TestAnalyzeTrend:
    def test_improving_trend(self):
        values = [(2019, 10.0), (2020, 11.0), (2021, 12.0), (2022, 13.0), (2023, 14.0)]
        trend = analyze_trend("roe", values)
        assert trend.direction == TrendDirection.IMPROVING
        assert trend.cagr is not None
        assert trend.cagr > 2.0

    def test_deteriorating_trend(self):
        values = [(2019, 20.0), (2020, 18.0), (2021, 16.0), (2022, 14.0), (2023, 12.0)]
        trend = analyze_trend("roe", values)
        assert trend.direction == TrendDirection.DETERIORATING

    def test_stable_trend(self):
        # CAGR ≈ 0.25% → STABLE
        values = [(2019, 10.0), (2020, 10.1), (2021, 10.0), (2022, 10.2), (2023, 10.1)]
        trend = analyze_trend("roe", values)
        assert trend.direction == TrendDirection.STABLE

    def test_single_value_is_stable(self):
        trend = analyze_trend("roe", [(2023, 10.0)])
        assert trend.cagr is None
        assert trend.direction == TrendDirection.STABLE
        assert trend.yoy_changes == []

    def test_empty_values_is_stable(self):
        trend = analyze_trend("roe", [])
        assert trend.cagr is None
        assert trend.direction == TrendDirection.STABLE
        assert trend.values == []

    def test_none_values_excluded_from_analysis(self):
        values = [(2019, None), (2020, 10.0), (2021, 11.0), (2022, None), (2023, 12.0)]
        trend = analyze_trend("roe", values)
        assert len(trend.values) == 3
        assert trend.cagr is not None

    def test_yoy_changes_count_is_n_minus_1(self):
        values = [(2019, 10.0), (2020, 11.0), (2021, 12.0)]
        trend = analyze_trend("roe", values)
        assert len(trend.yoy_changes) == 2

    def test_yoy_change_values(self):
        values = [(2019, 10.0), (2020, 11.0), (2021, 12.0)]
        trend = analyze_trend("roe", values)
        year_2020, change_2020 = trend.yoy_changes[0]
        year_2021, change_2021 = trend.yoy_changes[1]
        assert year_2020 == 2020
        assert change_2020 == pytest.approx(10.0, abs=0.01)  # 10→11 = +10%
        assert year_2021 == 2021
        assert change_2021 == pytest.approx(9.09, abs=0.1)  # 11→12 ≈ +9.09%

    def test_lower_is_better_rising_is_deteriorating(self):
        # 부채비율이 오르면 DETERIORATING
        values = [(2019, 60.0), (2020, 65.0), (2021, 70.0), (2022, 75.0), (2023, 80.0)]
        trend = analyze_trend("debt_ratio", values, lower_is_better=True)
        assert trend.direction == TrendDirection.DETERIORATING

    def test_lower_is_better_falling_is_improving(self):
        # 부채비율이 내리면 IMPROVING
        values = [(2019, 80.0), (2020, 75.0), (2021, 70.0), (2022, 65.0), (2023, 60.0)]
        trend = analyze_trend("debt_ratio", values, lower_is_better=True)
        assert trend.direction == TrendDirection.IMPROVING

    def test_metric_name_preserved(self):
        trend = analyze_trend("operating_margin", [(2023, 15.0)])
        assert trend.metric_name == "operating_margin"


class TestAnalyzeAllTrends:
    def _make_metrics(self, years: list[int]) -> list[FundamentalMetrics]:
        return [
            FundamentalMetrics(
                fiscal_year=y,
                roe=10.0 + (y - 2019),
                roa=5.0,
                debt_ratio=60.0,
                operating_margin=20.0,
                fcf=100_000,
            )
            for y in years
        ]

    def test_returns_all_five_metrics(self):
        metrics = self._make_metrics(range(2019, 2024))
        trends = analyze_all_trends(metrics)
        assert set(trends.keys()) == {"roe", "roa", "operating_margin", "fcf", "debt_ratio"}

    def test_roe_improving_when_rising(self):
        metrics = self._make_metrics(range(2019, 2024))
        trends = analyze_all_trends(metrics)
        assert trends["roe"].direction == TrendDirection.IMPROVING

    def test_debt_ratio_deteriorating_when_rising(self):
        # 부채비율이 매년 5% 상승 → DETERIORATING
        metrics = [
            FundamentalMetrics(
                fiscal_year=y,
                roe=15.0,
                roa=8.0,
                debt_ratio=60.0 + (y - 2019) * 5,  # 60, 65, 70, 75, 80
                operating_margin=20.0,
                fcf=100_000,
            )
            for y in range(2019, 2024)
        ]
        trends = analyze_all_trends(metrics)
        assert trends["debt_ratio"].direction == TrendDirection.DETERIORATING

    def test_single_year_all_stable(self):
        metrics = [
            FundamentalMetrics(
                fiscal_year=2023,
                roe=12.5,
                roa=7.5,
                debt_ratio=66.67,
                operating_margin=20.0,
                fcf=200_000,
            )
        ]
        trends = analyze_all_trends(metrics)
        for trend in trends.values():
            assert trend.direction == TrendDirection.STABLE
            assert trend.cagr is None

    def test_empty_metrics_returns_stable_trends(self):
        trends = analyze_all_trends([])
        for trend in trends.values():
            assert trend.direction == TrendDirection.STABLE
            assert trend.values == []
