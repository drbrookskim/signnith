"""core.technical.analyzer 단위 테스트."""

from __future__ import annotations

import pytest

from core.technical.analyzer import _compute_summary, build_technical_analysis
from core.technical.models import TechnicalDataPoint

# ---------------------------------------------------------------------------
# 샘플 FMP historical 데이터 (최신 날짜 순 — FMP 기본 정렬)
# ---------------------------------------------------------------------------

_SAMPLE_HISTORY = [
    {
        "date": "2024-05-20",
        "open": 192.0,
        "high": 193.0,
        "low": 190.0,
        "close": 191.0,
        "volume": 55_000_000,
        "changePercent": 0.52,
    },
    {
        "date": "2024-05-19",
        "open": 190.0,
        "high": 192.5,
        "low": 189.0,
        "close": 190.0,
        "volume": 60_000_000,
        "changePercent": 0.0,
    },
    {
        "date": "2024-05-18",
        "open": 185.0,
        "high": 191.0,
        "low": 184.0,
        "close": 190.0,
        "volume": 50_000_000,
        "changePercent": 2.7,
    },
]


# ---------------------------------------------------------------------------
# build_technical_analysis
# ---------------------------------------------------------------------------


class TestBuildTechnicalAnalysis:
    def test_returns_ticker_market_period(self):
        result = build_technical_analysis(_SAMPLE_HISTORY, "AAPL", "US", "1m")
        assert result.ticker == "AAPL"
        assert result.market == "US"
        assert result.period == "1m"

    def test_data_points_sorted_ascending(self):
        result = build_technical_analysis(_SAMPLE_HISTORY, "AAPL", "US", "1m")
        dates = [dp.date for dp in result.data_points]
        assert dates == sorted(dates)

    def test_data_points_count(self):
        result = build_technical_analysis(_SAMPLE_HISTORY, "AAPL", "US", "1m")
        assert len(result.data_points) == 3

    def test_close_price_mapped(self):
        result = build_technical_analysis(_SAMPLE_HISTORY, "AAPL", "US", "1m")
        first = result.data_points[0]  # 2024-05-18 (오름차순 첫번째)
        assert first.close == pytest.approx(190.0)

    def test_volume_mapped_as_int(self):
        result = build_technical_analysis(_SAMPLE_HISTORY, "AAPL", "US", "1m")
        assert result.data_points[0].volume == 50_000_000

    def test_change_pct_mapped(self):
        result = build_technical_analysis(_SAMPLE_HISTORY, "AAPL", "US", "1m")
        assert result.data_points[0].change_pct == pytest.approx(2.7)

    def test_empty_history_returns_empty_data_points(self):
        result = build_technical_analysis([], "AAPL", "US", "1m")
        assert result.data_points == []

    def test_entry_missing_close_is_skipped(self):
        bad = [{"date": "2024-01-01", "open": 100.0}]  # close 없음
        result = build_technical_analysis(bad, "AAPL", "US", "1m")
        assert result.data_points == []


# ---------------------------------------------------------------------------
# _compute_summary
# ---------------------------------------------------------------------------


class TestComputeSummary:
    def _make_points(self, rows: list[dict]) -> list[TechnicalDataPoint]:
        return [TechnicalDataPoint(**r) for r in rows]

    def test_period_return_pct(self):
        points = self._make_points(
            [
                {"date": "2024-01-01", "close": 100.0, "high": 105.0, "low": 98.0, "volume": 1000},
                {"date": "2024-01-02", "close": 110.0, "high": 112.0, "low": 108.0, "volume": 2000},
            ]
        )
        summary = _compute_summary(points)
        assert summary.period_return_pct == pytest.approx(10.0)

    def test_start_and_end_price(self):
        points = self._make_points(
            [
                {"date": "2024-01-01", "close": 100.0},
                {"date": "2024-01-02", "close": 120.0},
            ]
        )
        summary = _compute_summary(points)
        assert summary.start_price == pytest.approx(100.0)
        assert summary.end_price == pytest.approx(120.0)

    def test_high_period_is_max_of_highs(self):
        points = self._make_points(
            [
                {"date": "2024-01-01", "close": 100.0, "high": 105.0, "low": 98.0},
                {"date": "2024-01-02", "close": 110.0, "high": 115.0, "low": 108.0},
            ]
        )
        summary = _compute_summary(points)
        assert summary.high_period == pytest.approx(115.0)

    def test_low_period_is_min_of_lows(self):
        points = self._make_points(
            [
                {"date": "2024-01-01", "close": 100.0, "low": 95.0},
                {"date": "2024-01-02", "close": 110.0, "low": 108.0},
            ]
        )
        summary = _compute_summary(points)
        assert summary.low_period == pytest.approx(95.0)

    def test_avg_volume(self):
        points = self._make_points(
            [
                {"date": "2024-01-01", "close": 100.0, "volume": 1_000_000},
                {"date": "2024-01-02", "close": 110.0, "volume": 3_000_000},
            ]
        )
        summary = _compute_summary(points)
        assert summary.avg_volume == 2_000_000

    def test_empty_points_returns_none_fields(self):
        summary = _compute_summary([])
        assert summary.start_price is None
        assert summary.end_price is None
        assert summary.period_return_pct is None
        assert summary.avg_volume is None

    def test_zero_start_price_period_return_is_none(self):
        points = self._make_points(
            [
                {"date": "2024-01-01", "close": 0.0},
                {"date": "2024-01-02", "close": 10.0},
            ]
        )
        summary = _compute_summary(points)
        assert summary.period_return_pct is None
