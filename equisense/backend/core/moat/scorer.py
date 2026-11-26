"""해자 점수 계산 엔진.

프론트엔드 어댑터와 동일한 5차원·업종별 가중치·복합 해자·등급 기준(Wide ≥ 7.5, Narrow ≥ 5.0)을 적용합니다.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Optional

from .models import (
    CompoundMoat,
    DimensionScore,
    MoatAnalysis,
    MoatDimension,
    MoatGrade,
    MoatScoreInput,
)

# 기본 동일 가중치 (프론트엔드 DEFAULT_DIMENSION_WEIGHTS와 일치)
DIMENSION_WEIGHTS: dict[MoatDimension, float] = {
    MoatDimension.COST_ADVANTAGE: 0.20,
    MoatDimension.INTANGIBLE_ASSETS: 0.20,
    MoatDimension.SWITCHING_COSTS: 0.20,
    MoatDimension.NETWORK_EFFECTS: 0.20,
    MoatDimension.EFFICIENT_SCALE: 0.20,
}

SECTOR_DIMENSION_WEIGHTS: dict[str, dict[MoatDimension, float]] = {
    "Technology": {
        MoatDimension.COST_ADVANTAGE: 0.15,
        MoatDimension.INTANGIBLE_ASSETS: 0.20,
        MoatDimension.SWITCHING_COSTS: 0.30,
        MoatDimension.NETWORK_EFFECTS: 0.25,
        MoatDimension.EFFICIENT_SCALE: 0.10,
    },
    "Communication Services": {
        MoatDimension.COST_ADVANTAGE: 0.15,
        MoatDimension.INTANGIBLE_ASSETS: 0.20,
        MoatDimension.SWITCHING_COSTS: 0.20,
        MoatDimension.NETWORK_EFFECTS: 0.30,
        MoatDimension.EFFICIENT_SCALE: 0.15,
    },
    "Healthcare": {
        MoatDimension.COST_ADVANTAGE: 0.15,
        MoatDimension.INTANGIBLE_ASSETS: 0.35,
        MoatDimension.SWITCHING_COSTS: 0.20,
        MoatDimension.NETWORK_EFFECTS: 0.10,
        MoatDimension.EFFICIENT_SCALE: 0.20,
    },
    "Utilities": {
        MoatDimension.COST_ADVANTAGE: 0.25,
        MoatDimension.INTANGIBLE_ASSETS: 0.10,
        MoatDimension.SWITCHING_COSTS: 0.15,
        MoatDimension.NETWORK_EFFECTS: 0.05,
        MoatDimension.EFFICIENT_SCALE: 0.45,
    },
}

_COMPOUND_DEFS: tuple[tuple[str, str, str, tuple[MoatDimension, MoatDimension], float], ...] = (
    (
        "lock_in_ring",
        "잠금 고리",
        "고객이 떠나기 어렵고, 남을수록 가치가 커지는 이중 잠금 구조",
        (MoatDimension.SWITCHING_COSTS, MoatDimension.NETWORK_EFFECTS),
        6.0,
    ),
    (
        "value_flywheel",
        "가치 플라이휠",
        "브랜드·IP 기반 프리미엄이 효율적 원가 구조로 증폭되는 선순환",
        (MoatDimension.INTANGIBLE_ASSETS, MoatDimension.COST_ADVANTAGE),
        6.0,
    ),
    (
        "scale_fortress",
        "규모 요새",
        "구조적 진입 장벽과 원가 우위가 결합된 철옹성",
        (MoatDimension.EFFICIENT_SCALE, MoatDimension.COST_ADVANTAGE),
        6.0,
    ),
)

WIDE_MOAT_THRESHOLD = 7.5  # 이상 → Wide
NARROW_MOAT_THRESHOLD = 5.0  # 이상 → Narrow, 미만 → None

_ROUND = 2


def detect_compound_moats(dimension_scores: list[DimensionScore]) -> list[CompoundMoat]:
    """2개 이상 차원이 임계값(6.0) 이상일 때 복합 해자를 탐지합니다."""
    score_map = {ds.dimension: ds.score for ds in dimension_scores}
    found: list[CompoundMoat] = []
    for m_type, name, desc, dims, threshold in _COMPOUND_DEFS:
        if all(score_map.get(d, 0.0) >= threshold for d in dims):
            found.append(CompoundMoat(type=m_type, name=name, description=desc, dimensions=dims))
    return found


def calculate_composite_score(
    dimension_scores: list[DimensionScore],
    sector: Optional[str] = None,
) -> float:
    """차원별 가중 평균으로 종합 해자 점수를 계산합니다."""
    weights = SECTOR_DIMENSION_WEIGHTS.get(sector or "", DIMENSION_WEIGHTS)
    total_weight = sum(weights[ds.dimension] for ds in dimension_scores)
    if total_weight == 0:
        return 0.0
    weighted_sum = sum(weights[ds.dimension] * ds.score for ds in dimension_scores)
    return round(weighted_sum / total_weight, _ROUND)


def determine_grade(composite_score: float) -> MoatGrade:
    """종합 점수로 해자 등급을 결정합니다."""
    if composite_score >= WIDE_MOAT_THRESHOLD:
        return MoatGrade.WIDE
    if composite_score >= NARROW_MOAT_THRESHOLD:
        return MoatGrade.NARROW
    return MoatGrade.NONE


def score_moat(input_data: MoatScoreInput) -> MoatAnalysis:
    """해자 입력 점수를 계산하여 완전한 분석 결과를 생성합니다."""
    raw_composite = calculate_composite_score(input_data.dimension_scores, input_data.sector)
    compound_moats = detect_compound_moats(input_data.dimension_scores)
    compound_bonus = min(0.6, len(compound_moats) * 0.3)
    composite = round(min(10.0, raw_composite + compound_bonus), _ROUND)
    return MoatAnalysis(
        ticker=input_data.ticker,
        market=input_data.market,
        fiscal_year=input_data.fiscal_year,
        dimension_scores=input_data.dimension_scores,
        compound_moats=compound_moats,
        composite_score=composite,
        grade=determine_grade(composite),
        analyst_note=input_data.analyst_note,
        scored_at=datetime.now(UTC).isoformat(),
    )
