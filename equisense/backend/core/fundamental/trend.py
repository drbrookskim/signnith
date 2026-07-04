from __future__ import annotations

from typing import Optional

from .models import FundamentalMetrics, MetricTrend, TrendDirection

_TREND_THRESHOLD_PCT = 2.0  # CAGR ±2% 기준으로 추세 판단
_ROUND = 2

# 값이 낮을수록 좋은 지표: CAGR이 양수여도 DETERIORATING으로 해석
_LOWER_IS_BETTER: frozenset[str] = frozenset({"debt_ratio"})

_TREND_METRICS: tuple[str, ...] = ("roe", "roa", "operating_margin", "fcf", "debt_ratio")


def calculate_cagr(start_value: float, end_value: float, n_years: int) -> Optional[float]:
    """연평균성장률(CAGR): (end/start)^(1/n) - 1 (%)

    음수 시작값 또는 양→음 부호 전환 시 None 반환 (수학적으로 CAGR 정의 불가).

    Args:
        start_value: 시작 연도 값
        end_value: 종료 연도 값
        n_years: 연도 수 (양의 정수)
    """
    if n_years <= 0 or start_value == 0:
        return None
    if start_value < 0:
        return None
    ratio = end_value / start_value
    if ratio < 0:
        return None
    return round((ratio ** (1.0 / n_years) - 1) * 100, _ROUND)


def calculate_yoy_change(prev: float, current: float) -> Optional[float]:
    """전년 대비 변화율 (%): (current - prev) / |prev| × 100

    prev가 0이면 None 반환.
    """
    if prev == 0:
        return None
    return round((current - prev) / abs(prev) * 100, _ROUND)


def _determine_direction(cagr: Optional[float], lower_is_better: bool) -> TrendDirection:
    """CAGR과 지표 특성(높을수록/낮을수록 좋음)을 고려해 추세 방향을 결정합니다."""
    if cagr is None:
        return TrendDirection.STABLE
    effective = -cagr if lower_is_better else cagr
    if effective >= _TREND_THRESHOLD_PCT:
        return TrendDirection.IMPROVING
    if effective <= -_TREND_THRESHOLD_PCT:
        return TrendDirection.DETERIORATING
    return TrendDirection.STABLE


def analyze_trend(
    metric_name: str,
    yearly_values: list[tuple[int, Optional[float]]],
    lower_is_better: bool = False,
) -> MetricTrend:
    """특정 재무 지표의 다년도 추세를 분석합니다.

    Args:
        metric_name: 지표명 (예: "roe", "debt_ratio")
        yearly_values: [(회계연도, 지표값), ...] — None값 포함 가능
        lower_is_better: True이면 값이 낮을수록 좋은 지표 (부채비율 등)

    Returns:
        MetricTrend. 유효한 데이터가 2개 미만이면 cagr=None, direction=STABLE.
    """
    valid = sorted(
        [(year, val) for year, val in yearly_values if val is not None],
        key=lambda x: x[0],
    )

    cagr = None
    if len(valid) >= 2:
        start_year, start_val = valid[0]
        end_year, end_val = valid[-1]
        cagr = calculate_cagr(start_val, end_val, end_year - start_year)

    yoy_changes = [
        (valid[i][0], calculate_yoy_change(valid[i - 1][1], valid[i][1]))
        for i in range(1, len(valid))
    ]

    return MetricTrend(
        metric_name=metric_name,
        values=valid,
        cagr=cagr,
        direction=_determine_direction(cagr, lower_is_better),
        yoy_changes=yoy_changes,
    )


def analyze_all_trends(metrics_by_year: list[FundamentalMetrics]) -> dict[str, MetricTrend]:
    """다년도 FundamentalMetrics에서 모든 핵심 지표의 추세를 분석합니다.

    Args:
        metrics_by_year: fiscal_year 오름차순으로 정렬된 FundamentalMetrics 리스트

    Returns:
        {metric_name: MetricTrend} 딕셔너리
    """
    return {
        metric: analyze_trend(
            metric_name=metric,
            yearly_values=[(m.fiscal_year, getattr(m, metric)) for m in metrics_by_year],
            lower_is_better=metric in _LOWER_IS_BETTER,
        )
        for metric in _TREND_METRICS
    }
