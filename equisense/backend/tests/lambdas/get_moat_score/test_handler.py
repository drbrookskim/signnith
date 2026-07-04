"""GetMoatScore Lambda 핸들러 테스트.

외부 의존성(Redis, Neon DB)은 unittest.mock으로 격리합니다.
"""

from __future__ import annotations

import json
from unittest.mock import patch

import pytest

from core.moat.models import DimensionScore, MoatAnalysis, MoatDimension, MoatGrade
from lambdas.get_moat_score.handler import lambda_handler

# ---------------------------------------------------------------------------
# 공통 픽스처
# ---------------------------------------------------------------------------


class MockContext:
    aws_request_id = "moat-test-request-id"


def _event(ticker: str, market: str) -> dict:
    return {
        "pathParameters": {"ticker": ticker},
        "queryStringParameters": {"market": market},
    }


def _sample_analysis(ticker: str = "AAPL", market: str = "US") -> MoatAnalysis:
    return MoatAnalysis(
        ticker=ticker,
        market=market,
        fiscal_year=2023,
        dimension_scores=[
            DimensionScore(dimension=MoatDimension.COST_ADVANTAGE, score=8.0),
            DimensionScore(dimension=MoatDimension.INTANGIBLE_ASSETS, score=9.0),
            DimensionScore(dimension=MoatDimension.SWITCHING_COSTS, score=8.5),
            DimensionScore(dimension=MoatDimension.NETWORK_EFFECTS, score=7.5),
        ],
        composite_score=8.25,
        grade=MoatGrade.WIDE,
        analyst_note="강력한 브랜드와 생태계",
        scored_at="2024-01-15T09:00:00+00:00",
    )


# ---------------------------------------------------------------------------
# 정상 흐름 테스트
# ---------------------------------------------------------------------------


class TestSuccessfulFetch:
    @patch("lambdas.get_moat_score.handler.cache_set")
    @patch("lambdas.get_moat_score.handler.cache_get", return_value=None)
    @patch("lambdas.get_moat_score.handler.get_latest_moat_score", return_value=_sample_analysis())
    def test_us_ticker_returns_200(self, mock_db, mock_get, mock_set):
        response = lambda_handler(_event("AAPL", "US"), MockContext())

        assert response["statusCode"] == 200
        body = json.loads(response["body"])
        assert body["ticker"] == "AAPL"
        assert body["market"] == "US"
        assert body["grade"] == "wide"
        assert body["composite_score"] == 8.25

    @patch("lambdas.get_moat_score.handler.cache_set")
    @patch("lambdas.get_moat_score.handler.cache_get", return_value=None)
    @patch(
        "lambdas.get_moat_score.handler.get_latest_moat_score",
        return_value=_sample_analysis("005930", "KR"),
    )
    def test_kr_ticker_returns_200(self, mock_db, mock_get, mock_set):
        response = lambda_handler(_event("005930", "KR"), MockContext())

        assert response["statusCode"] == 200
        body = json.loads(response["body"])
        assert body["ticker"] == "005930"
        assert body["market"] == "KR"

    @patch("lambdas.get_moat_score.handler.cache_set")
    @patch("lambdas.get_moat_score.handler.cache_get", return_value=None)
    @patch("lambdas.get_moat_score.handler.get_latest_moat_score", return_value=_sample_analysis())
    def test_response_contains_dimension_scores(self, mock_db, mock_get, mock_set):
        response = lambda_handler(_event("AAPL", "US"), MockContext())
        body = json.loads(response["body"])

        assert len(body["dimension_scores"]) == 4
        dimensions = {d["dimension"] for d in body["dimension_scores"]}
        assert "cost_advantage" in dimensions
        assert "network_effects" in dimensions

    @patch("lambdas.get_moat_score.handler.cache_set")
    @patch("lambdas.get_moat_score.handler.cache_get", return_value=None)
    @patch("lambdas.get_moat_score.handler.get_latest_moat_score", return_value=_sample_analysis())
    def test_result_cached_with_1h_ttl(self, mock_db, mock_get, mock_set):
        lambda_handler(_event("AAPL", "US"), MockContext())

        mock_set.assert_called_once()
        _, _, ttl = mock_set.call_args[0]
        assert ttl == 3_600

    @patch("lambdas.get_moat_score.handler.cache_set")
    @patch("lambdas.get_moat_score.handler.cache_get", return_value=None)
    @patch("lambdas.get_moat_score.handler.get_latest_moat_score", return_value=_sample_analysis())
    def test_cache_key_format(self, mock_db, mock_get, mock_set):
        lambda_handler(_event("AAPL", "US"), MockContext())

        cache_key = mock_set.call_args[0][0]
        assert "AAPL" in cache_key
        assert "US" in cache_key
        assert "moat" in cache_key


# ---------------------------------------------------------------------------
# 캐시 히트
# ---------------------------------------------------------------------------


class TestCacheHit:
    _cached = {
        "ticker": "AAPL",
        "market": "US",
        "fiscal_year": 2023,
        "dimension_scores": [],
        "composite_score": 8.25,
        "grade": "wide",
        "analyst_note": None,
        "scored_at": "2024-01-15T09:00:00+00:00",
    }

    @patch("lambdas.get_moat_score.handler.get_latest_moat_score")
    @patch("lambdas.get_moat_score.handler.cache_get", return_value=_cached)
    def test_returns_cached_data(self, mock_get, mock_db):
        response = lambda_handler(_event("AAPL", "US"), MockContext())

        assert response["statusCode"] == 200
        body = json.loads(response["body"])
        assert body["grade"] == "wide"

    @patch("lambdas.get_moat_score.handler.get_latest_moat_score")
    @patch("lambdas.get_moat_score.handler.cache_get", return_value=_cached)
    def test_db_not_called_on_cache_hit(self, mock_get, mock_db):
        lambda_handler(_event("AAPL", "US"), MockContext())
        mock_db.assert_not_called()


# ---------------------------------------------------------------------------
# 입력 검증 에러 (400)
# ---------------------------------------------------------------------------


class TestInputValidation:
    @pytest.mark.parametrize(
        "ticker,market",
        [
            ("TOOLONG", "US"),  # 5자 초과
            ("12345", "KR"),  # 5자리 (6자리 필요)
            ("1234567", "KR"),  # 7자리
            ("AAPL", "JP"),  # 미지원 시장
            ("", "US"),  # 빈 티커
        ],
    )
    def test_invalid_input_returns_400(self, ticker, market):
        response = lambda_handler(_event(ticker, market), MockContext())
        assert response["statusCode"] == 400
        body = json.loads(response["body"])
        assert body["error"]["code"] == "INVALID_PARAMS"
        assert body["error"]["request_id"] == MockContext.aws_request_id

    def test_missing_path_params_returns_400(self):
        event = {"pathParameters": None, "queryStringParameters": {"market": "US"}}
        response = lambda_handler(event, MockContext())
        assert response["statusCode"] == 400

    def test_lowercase_normalized_to_uppercase(self):
        with (
            patch("lambdas.get_moat_score.handler.cache_get", return_value=None),
            patch("lambdas.get_moat_score.handler.cache_set"),
            patch(
                "lambdas.get_moat_score.handler.get_latest_moat_score",
                return_value=_sample_analysis(),
            ),
        ):
            response = lambda_handler(_event("aapl", "us"), MockContext())

        assert response["statusCode"] == 200
        assert json.loads(response["body"])["ticker"] == "AAPL"


# ---------------------------------------------------------------------------
# 데이터 없음 (404)
# ---------------------------------------------------------------------------


class TestNotFound:
    @patch("lambdas.get_moat_score.handler.cache_set")
    @patch("lambdas.get_moat_score.handler.cache_get", return_value=None)
    @patch("lambdas.get_moat_score.handler.get_latest_moat_score", return_value=None)
    def test_no_score_returns_404(self, mock_db, mock_get, mock_set):
        response = lambda_handler(_event("ZZZZ", "US"), MockContext())

        assert response["statusCode"] == 404
        body = json.loads(response["body"])
        assert body["error"]["code"] == "MOAT_SCORE_NOT_FOUND"

    @patch("lambdas.get_moat_score.handler.cache_set")
    @patch("lambdas.get_moat_score.handler.cache_get", return_value=None)
    @patch("lambdas.get_moat_score.handler.get_latest_moat_score", return_value=None)
    def test_not_found_not_cached(self, mock_db, mock_get, mock_set):
        lambda_handler(_event("ZZZZ", "US"), MockContext())
        mock_set.assert_not_called()


# ---------------------------------------------------------------------------
# DB 에러 (503)
# ---------------------------------------------------------------------------


class TestDBError:
    @patch("lambdas.get_moat_score.handler.cache_get", return_value=None)
    @patch(
        "lambdas.get_moat_score.handler.get_latest_moat_score",
        side_effect=Exception("connection timeout"),
    )
    def test_db_exception_returns_503(self, mock_db, mock_get):
        response = lambda_handler(_event("AAPL", "US"), MockContext())

        assert response["statusCode"] == 503
        body = json.loads(response["body"])
        assert body["error"]["code"] == "DB_ERROR"
        # DB 내부 오류는 클라이언트에 노출되지 않아야 함
        assert "timeout" not in body["error"]["message"]


# ---------------------------------------------------------------------------
# 응답 형식
# ---------------------------------------------------------------------------


class TestResponseFormat:
    @patch("lambdas.get_moat_score.handler.cache_set")
    @patch("lambdas.get_moat_score.handler.cache_get", return_value=None)
    @patch("lambdas.get_moat_score.handler.get_latest_moat_score", return_value=_sample_analysis())
    def test_content_type_header(self, mock_db, mock_get, mock_set):
        response = lambda_handler(_event("AAPL", "US"), MockContext())
        assert response["headers"]["Content-Type"] == "application/json"

    @patch("lambdas.get_moat_score.handler.cache_set")
    @patch("lambdas.get_moat_score.handler.cache_get", return_value=None)
    @patch("lambdas.get_moat_score.handler.get_latest_moat_score", return_value=_sample_analysis())
    def test_body_is_valid_json(self, mock_db, mock_get, mock_set):
        response = lambda_handler(_event("AAPL", "US"), MockContext())
        body = json.loads(response["body"])
        assert isinstance(body, dict)
