"""해자 점수 계산 엔진.

분석가가 입력한 4개 차원 점수(0~10)를 가중 평균하여 종합 점수와 등급을 산출합니다.
등급 기준은 Morningstar의 Wide/Narrow/None 분류 체계를 따릅니다.
"""

from __future__ import annotations

from datetime import UTC, datetime

from .models import DimensionScore, MoatAnalysis, MoatDimension, MoatGrade, MoatScoreInput

# 4개 차원 동일 가중치 (향후 섹터별 커스터마이징 가능)
DIMENSION_WEIGHTS: dict[MoatDimension, float] = {
    MoatDimension.COST_ADVANTAGE: 0.25,
    MoatDimension.INTANGIBLE_ASSETS: 0.25,
    MoatDimension.SWITCHING_COSTS: 0.25,
    MoatDimension.NETWORK_EFFECTS: 0.25,
}

WIDE_MOAT_THRESHOLD = 7.0  # 이상 → Wide
NARROW_MOAT_THRESHOLD = 4.0  # 이상 → Narrow, 미만 → None

_ROUND = 2


def calculate_composite_score(dimension_scores: list[DimensionScore]) -> float:
    """차원별 가중 평균으로 종합 해자 점수를 계산합니다.

    Args:
        dimension_scores: 개별 차원 점수 리스트

    Returns:
        소수점 2자리로 반올림된 종합 점수 (0.0~10.0)
    """
    total_weight = sum(DIMENSION_WEIGHTS[ds.dimension] for ds in dimension_scores)
    if total_weight == 0:
        return 0.0
    weighted_sum = sum(DIMENSION_WEIGHTS[ds.dimension] * ds.score for ds in dimension_scores)
    return round(weighted_sum / total_weight, _ROUND)


def determine_grade(composite_score: float) -> MoatGrade:
    """종합 점수로 해자 등급을 결정합니다.

    Args:
        composite_score: calculate_composite_score의 반환값

    Returns:
        MoatGrade.WIDE (≥7.0) | NARROW (≥4.0) | NONE (<4.0)
    """
    if composite_score >= WIDE_MOAT_THRESHOLD:
        return MoatGrade.WIDE
    if composite_score >= NARROW_MOAT_THRESHOLD:
        return MoatGrade.NARROW
    return MoatGrade.NONE


def score_moat(input_data: MoatScoreInput) -> MoatAnalysis:
    """해자 입력 점수를 계산하여 완전한 분석 결과를 생성합니다.

    Args:
        input_data: MoatScoreInput — 4개 차원 점수가 모두 포함되어야 합니다

    Returns:
        종합 점수, 등급, 타임스탬프가 포함된 MoatAnalysis
    """
    composite = calculate_composite_score(input_data.dimension_scores)
    return MoatAnalysis(
        ticker=input_data.ticker,
        market=input_data.market,
        fiscal_year=input_data.fiscal_year,
        dimension_scores=input_data.dimension_scores,
        composite_score=composite,
        grade=determine_grade(composite),
        analyst_note=input_data.analyst_note,
        scored_at=datetime.now(UTC).isoformat(),
    )
