"""해자 점수 계산 엔진 테스트."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from core.moat.models import DimensionScore, MoatDimension, MoatGrade, MoatScoreInput
from core.moat.scorer import (
    NARROW_MOAT_THRESHOLD,
    WIDE_MOAT_THRESHOLD,
    calculate_composite_score,
    determine_grade,
    score_moat,
)

# ---------------------------------------------------------------------------
# 픽스처
# ---------------------------------------------------------------------------


def _make_scores(cost=5.0, intangible=5.0, switching=5.0, network=5.0) -> list[DimensionScore]:
    """4개 차원 점수 리스트 생성 헬퍼."""
    return [
        DimensionScore(dimension=MoatDimension.COST_ADVANTAGE, score=cost),
        DimensionScore(dimension=MoatDimension.INTANGIBLE_ASSETS, score=intangible),
        DimensionScore(dimension=MoatDimension.SWITCHING_COSTS, score=switching),
        DimensionScore(dimension=MoatDimension.NETWORK_EFFECTS, score=network),
    ]


def _make_input(**kwargs) -> MoatScoreInput:
    scores = kwargs.pop("scores", _make_scores())
    return MoatScoreInput(
        ticker=kwargs.pop("ticker", "AAPL"),
        market=kwargs.pop("market", "US"),
        fiscal_year=kwargs.pop("fiscal_year", 2023),
        dimension_scores=scores,
        **kwargs,
    )


# ---------------------------------------------------------------------------
# calculate_composite_score
# ---------------------------------------------------------------------------


class TestCalculateCompositeScore:
    def test_equal_scores_returns_average(self):
        scores = _make_scores(8.0, 8.0, 8.0, 8.0)
        assert calculate_composite_score(scores) == 8.0

    def test_mixed_scores_weighted_average(self):
        # 동일 가중치(0.25) → 단순 평균
        # (6 + 8 + 4 + 10) / 4 = 7.0
        scores = _make_scores(cost=6.0, intangible=8.0, switching=4.0, network=10.0)
        assert calculate_composite_score(scores) == 7.0

    def test_all_zero_returns_zero(self):
        scores = _make_scores(0.0, 0.0, 0.0, 0.0)
        assert calculate_composite_score(scores) == 0.0

    def test_all_max_returns_ten(self):
        scores = _make_scores(10.0, 10.0, 10.0, 10.0)
        assert calculate_composite_score(scores) == 10.0

    def test_result_rounded_to_two_decimal_places(self):
        # (7 + 7 + 7 + 8) / 4 = 7.25 → 소수점 2자리
        scores = _make_scores(7.0, 7.0, 7.0, 8.0)
        assert calculate_composite_score(scores) == 7.25

    def test_non_integer_scores(self):
        scores = _make_scores(7.5, 8.5, 6.5, 9.5)
        # (7.5 + 8.5 + 6.5 + 9.5) / 4 = 8.0
        assert calculate_composite_score(scores) == pytest.approx(8.0, abs=0.01)


# ---------------------------------------------------------------------------
# determine_grade
# ---------------------------------------------------------------------------


class TestDetermineGrade:
    def test_above_wide_threshold_is_wide(self):
        assert determine_grade(WIDE_MOAT_THRESHOLD) == MoatGrade.WIDE
        assert determine_grade(10.0) == MoatGrade.WIDE
        assert determine_grade(7.5) == MoatGrade.WIDE

    def test_between_thresholds_is_narrow(self):
        assert determine_grade(NARROW_MOAT_THRESHOLD) == MoatGrade.NARROW
        assert determine_grade(5.0) == MoatGrade.NARROW
        assert determine_grade(6.99) == MoatGrade.NARROW

    def test_below_narrow_threshold_is_none(self):
        assert determine_grade(0.0) == MoatGrade.NONE
        assert determine_grade(3.99) == MoatGrade.NONE
        assert determine_grade(NARROW_MOAT_THRESHOLD - 0.01) == MoatGrade.NONE

    def test_exact_wide_threshold(self):
        assert determine_grade(7.0) == MoatGrade.WIDE

    def test_just_below_wide_threshold(self):
        assert determine_grade(6.99) == MoatGrade.NARROW

    def test_exact_narrow_threshold(self):
        assert determine_grade(4.0) == MoatGrade.NARROW

    def test_just_below_narrow_threshold(self):
        assert determine_grade(3.99) == MoatGrade.NONE


# ---------------------------------------------------------------------------
# score_moat
# ---------------------------------------------------------------------------


class TestScoreMoat:
    def test_returns_moat_analysis(self):
        inp = _make_input(scores=_make_scores(8.0, 9.0, 7.0, 8.0))
        result = score_moat(inp)
        assert result.ticker == "AAPL"
        assert result.market == "US"
        assert result.fiscal_year == 2023

    def test_wide_moat_company(self):
        inp = _make_input(scores=_make_scores(8.0, 9.0, 8.0, 8.0))
        result = score_moat(inp)
        assert result.composite_score == 8.25
        assert result.grade == MoatGrade.WIDE

    def test_narrow_moat_company(self):
        inp = _make_input(scores=_make_scores(5.0, 6.0, 5.0, 4.0))
        result = score_moat(inp)
        assert result.composite_score == 5.0
        assert result.grade == MoatGrade.NARROW

    def test_no_moat_company(self):
        inp = _make_input(scores=_make_scores(2.0, 3.0, 1.0, 2.0))
        result = score_moat(inp)
        assert result.composite_score == 2.0
        assert result.grade == MoatGrade.NONE

    def test_analyst_note_preserved(self):
        inp = _make_input(analyst_note="Apple의 생태계는 강력한 전환 비용을 형성합니다.")
        result = score_moat(inp)
        assert result.analyst_note == "Apple의 생태계는 강력한 전환 비용을 형성합니다."

    def test_scored_at_is_iso8601(self):
        result = score_moat(_make_input())
        from datetime import datetime

        # ISO 8601 형식으로 파싱 가능해야 함
        dt = datetime.fromisoformat(result.scored_at)
        assert dt is not None

    def test_dimension_scores_preserved(self):
        scores = _make_scores(7.0, 8.0, 6.0, 9.0)
        result = score_moat(_make_input(scores=scores))
        assert len(result.dimension_scores) == 4


# ---------------------------------------------------------------------------
# MoatScoreInput 유효성 검증
# ---------------------------------------------------------------------------


class TestMoatScoreInputValidation:
    def test_valid_input_passes(self):
        inp = _make_input()
        assert inp is not None

    def test_missing_dimension_raises(self):
        incomplete_scores = [
            DimensionScore(dimension=MoatDimension.COST_ADVANTAGE, score=8.0),
            DimensionScore(dimension=MoatDimension.INTANGIBLE_ASSETS, score=7.0),
            # switching_costs, network_effects 누락
        ]
        with pytest.raises(ValidationError) as exc_info:
            MoatScoreInput(
                ticker="AAPL", market="US", fiscal_year=2023, dimension_scores=incomplete_scores
            )
        assert "누락된 해자 차원" in str(exc_info.value)

    def test_duplicate_dimension_raises(self):
        duplicate_scores = [
            DimensionScore(dimension=MoatDimension.COST_ADVANTAGE, score=8.0),
            DimensionScore(dimension=MoatDimension.COST_ADVANTAGE, score=7.0),  # 중복
            DimensionScore(dimension=MoatDimension.INTANGIBLE_ASSETS, score=6.0),
            DimensionScore(dimension=MoatDimension.SWITCHING_COSTS, score=5.0),
        ]
        with pytest.raises(ValidationError) as exc_info:
            MoatScoreInput(
                ticker="AAPL", market="US", fiscal_year=2023, dimension_scores=duplicate_scores
            )
        assert "중복" in str(exc_info.value)

    def test_score_above_10_raises(self):
        with pytest.raises(ValidationError):
            DimensionScore(dimension=MoatDimension.COST_ADVANTAGE, score=10.1)

    def test_score_below_0_raises(self):
        with pytest.raises(ValidationError):
            DimensionScore(dimension=MoatDimension.COST_ADVANTAGE, score=-0.1)

    def test_score_boundary_values_valid(self):
        DimensionScore(dimension=MoatDimension.COST_ADVANTAGE, score=0.0)
        DimensionScore(dimension=MoatDimension.COST_ADVANTAGE, score=10.0)

    def test_kr_ticker(self):
        inp = MoatScoreInput(
            ticker="005930", market="KR", fiscal_year=2023, dimension_scores=_make_scores()
        )
        assert inp.ticker == "005930"
