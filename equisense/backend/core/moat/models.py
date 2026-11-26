from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, model_validator


class MoatDimension(str, Enum):
    """5가지 경제적 해자 유형 (Morningstar 프레임워크 기반)."""

    COST_ADVANTAGE = "cost_advantage"  # 비용 우위
    INTANGIBLE_ASSETS = "intangible_assets"  # 무형 자산 (브랜드·특허·라이선스)
    SWITCHING_COSTS = "switching_costs"  # 전환 비용
    NETWORK_EFFECTS = "network_effects"  # 네트워크 효과
    EFFICIENT_SCALE = "efficient_scale"  # 효율적 규모


CORE_MOAT_DIMENSIONS: frozenset[MoatDimension] = frozenset(
    {
        MoatDimension.COST_ADVANTAGE,
        MoatDimension.INTANGIBLE_ASSETS,
        MoatDimension.SWITCHING_COSTS,
        MoatDimension.NETWORK_EFFECTS,
    }
)


class CompoundMoat(BaseModel):
    """복합 해자 (2개 이상의 차원이 동반 강세일 때 시너지)."""

    type: str
    name: str
    description: str
    dimensions: tuple[MoatDimension, MoatDimension]


class MoatGrade(str, Enum):
    """해자 등급 (종합 점수 기반)."""

    WIDE = "wide"  # 광역 해자: 7.5점 이상
    NARROW = "narrow"  # 협역 해자: 5.0~7.4점
    NONE = "none"  # 해자 없음: 5.0점 미만


class DimensionScore(BaseModel):
    """개별 해자 차원 점수."""

    dimension: MoatDimension
    score: float = Field(ge=0.0, le=10.0)  # 0.0~10.0점
    rationale: Optional[str] = None  # 점수 근거 (분석가 메모)


class MoatScoreInput(BaseModel):
    """해자 점수 계산 입력 모델. 핵심 4개 차원이 필요하며 효율적 규모(5번째 차원)는 선택입니다."""

    ticker: str
    market: str  # 'KR' | 'US'
    fiscal_year: int
    dimension_scores: list[DimensionScore]
    sector: Optional[str] = None
    analyst_note: Optional[str] = None

    @model_validator(mode="after")
    def validate_dimensions(self) -> MoatScoreInput:
        """핵심 4개 차원이 모두 존재하고 중복이 없는지 검증합니다."""
        provided = [ds.dimension for ds in self.dimension_scores]

        # 중복 검사를 먼저 수행 (중복이 있으면 누락 검사가 잘못된 결과를 냄)
        if len(provided) != len(set(provided)):
            raise ValueError("해자 차원이 중복되었습니다")

        missing = CORE_MOAT_DIMENSIONS - set(provided)
        if missing:
            missing_names = ", ".join(sorted(d.value for d in missing))
            raise ValueError(f"누락된 해자 차원: {missing_names}")

        return self


class MoatAnalysis(BaseModel):
    """해자 분석 전체 결과 (차원별 점수 + 복합 해자 + 종합 등급)."""

    ticker: str
    market: str
    fiscal_year: int
    dimension_scores: list[DimensionScore]
    compound_moats: list[CompoundMoat] = Field(default_factory=list)
    composite_score: float  # 가중 평균 종합 점수 (0.0~10.0)
    grade: MoatGrade
    analyst_note: Optional[str] = None
    scored_at: str  # ISO 8601 형식 타임스탬프
