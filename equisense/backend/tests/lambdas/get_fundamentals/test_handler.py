"""GetFundamentals Lambda 핸들러 테스트.

모든 외부 의존성(Redis, FMP API)은 unittest.mock으로 격리합니다.
"""

from __future__ import annotations

import json
from unittest.mock import patch

import pytest

from lambdas.get_fundamentals.handler import lambda_handler

# ---------------------------------------------------------------------------
# 공통 픽스처
# ---------------------------------------------------------------------------


class MockContext:
    aws_request_id = "test-request-id-1234"


def _event(ticker: str, market: str) -> dict:
    """API Gateway 프록시 이벤트 헬퍼."""
    return {
        "pathParameters": {"ticker": ticker},
        "queryStringParameters": {"market": market},
    }


# FMP API 샘플 응답 (Apple 2023 축소판)
_SAMPLE_INCOME = [
    {
        "calendarYear": "2023",
        "revenue": 383_285_000_000,
        "operatingIncome": 114_301_000_000,
        "netIncome": 96_995_000_000,
        "eps": 6.16,
    }
]
_SAMPLE_BALANCE = [
    {
        "calendarYear": "2023",
        "totalAssets": 352_583_000_000,
        "totalLiabilities": 290_437_000_000,
        "totalStockholdersEquity": 62_146_000_000,
        "commonStockSharesOutstanding": 15_550_061_000,
    }
]
_SAMPLE_CF = [
    {
        "calendarYear": "2023",
        "operatingCashFlow": 110_543_000_000,
        "capitalExpenditure": -10_959_000_000,  # FMP는 음수로 반환
    }
]


# ---------------------------------------------------------------------------
# 정상 흐름 테스트
# ---------------------------------------------------------------------------


class TestSuccessfulFetch:
    @patch("lambdas.get_fundamentals.handler.cache_set")
    @patch("lambdas.get_fundamentals.handler.cache_get", return_value=None)
    @patch("lambdas.get_fundamentals.handler.fetch_cash_flow_statements", return_value=_SAMPLE_CF)
    @patch("lambdas.get_fundamentals.handler.fetch_balance_sheets", return_value=_SAMPLE_BALANCE)
    @patch("lambdas.get_fundamentals.handler.fetch_income_statements", return_value=_SAMPLE_INCOME)
    def test_us_ticker_returns_200(self, mock_is, mock_bs, mock_cf, mock_get, mock_set):
        response = lambda_handler(_event("AAPL", "US"), MockContext())

        assert response["statusCode"] == 200
        body = json.loads(response["body"])
        assert body["ticker"] == "AAPL"
        assert body["market"] == "US"
        assert len(body["metrics_by_year"]) == 1
        assert "trends" in body

    @patch("lambdas.get_fundamentals.handler.cache_set")
    @patch("lambdas.get_fundamentals.handler.cache_get", return_value=None)
    @patch("lambdas.get_fundamentals.handler.fetch_cash_flow_statements", return_value=_SAMPLE_CF)
    @patch("lambdas.get_fundamentals.handler.fetch_balance_sheets", return_value=_SAMPLE_BALANCE)
    @patch("lambdas.get_fundamentals.handler.fetch_income_statements", return_value=_SAMPLE_INCOME)
    def test_kr_ticker_returns_200(self, mock_is, mock_bs, mock_cf, mock_get, mock_set):
        response = lambda_handler(_event("005930", "KR"), MockContext())

        assert response["statusCode"] == 200
        body = json.loads(response["body"])
        assert body["ticker"] == "005930"
        assert body["market"] == "KR"

    @patch("lambdas.get_fundamentals.handler.cache_set")
    @patch("lambdas.get_fundamentals.handler.cache_get", return_value=None)
    @patch("lambdas.get_fundamentals.handler.fetch_cash_flow_statements", return_value=_SAMPLE_CF)
    @patch("lambdas.get_fundamentals.handler.fetch_balance_sheets", return_value=_SAMPLE_BALANCE)
    @patch("lambdas.get_fundamentals.handler.fetch_income_statements", return_value=_SAMPLE_INCOME)
    def test_computed_metrics_are_correct(self, mock_is, mock_bs, mock_cf, mock_get, mock_set):
        response = lambda_handler(_event("AAPL", "US"), MockContext())
        body = json.loads(response["body"])
        metrics = body["metrics_by_year"][0]

        # ROE = 96_995_000_000 / 62_146_000_000 * 100 ≈ 156.07
        assert metrics["roe"] == pytest.approx(156.07, abs=0.1)
        # FCF = 110_543_000_000 - 10_959_000_000 = 99_584_000_000
        assert metrics["fcf"] == pytest.approx(99_584_000_000, rel=0.01)

    @patch("lambdas.get_fundamentals.handler.cache_set")
    @patch("lambdas.get_fundamentals.handler.cache_get", return_value=None)
    @patch("lambdas.get_fundamentals.handler.fetch_cash_flow_statements", return_value=_SAMPLE_CF)
    @patch("lambdas.get_fundamentals.handler.fetch_balance_sheets", return_value=_SAMPLE_BALANCE)
    @patch("lambdas.get_fundamentals.handler.fetch_income_statements", return_value=_SAMPLE_INCOME)
    def test_result_is_cached_with_24h_ttl(self, mock_is, mock_bs, mock_cf, mock_get, mock_set):
        lambda_handler(_event("AAPL", "US"), MockContext())

        mock_set.assert_called_once()
        _, _, ttl = mock_set.call_args[0]
        assert ttl == 86_400

    @patch("lambdas.get_fundamentals.handler.cache_set")
    @patch("lambdas.get_fundamentals.handler.cache_get", return_value=None)
    @patch("lambdas.get_fundamentals.handler.fetch_cash_flow_statements", return_value=_SAMPLE_CF)
    @patch("lambdas.get_fundamentals.handler.fetch_balance_sheets", return_value=_SAMPLE_BALANCE)
    @patch("lambdas.get_fundamentals.handler.fetch_income_statements", return_value=_SAMPLE_INCOME)
    def test_cache_key_includes_market_and_ticker(
        self, mock_is, mock_bs, mock_cf, mock_get, mock_set
    ):
        lambda_handler(_event("AAPL", "US"), MockContext())

        cache_key = mock_set.call_args[0][0]
        assert "AAPL" in cache_key
        assert "US" in cache_key


# ---------------------------------------------------------------------------
# 캐시 히트
# ---------------------------------------------------------------------------


class TestCompanyProfile:
    _SAMPLE_PROFILE = {
        "companyName": "Apple Inc.",
        "description": "Apple designs, manufactures, and markets smartphones.",
        "ceo": "Timothy Cook",
        "sector": "Technology",
        "industry": "Consumer Electronics",
        "website": "https://www.apple.com",
    }

    @patch("lambdas.get_fundamentals.handler.cache_set")
    @patch("lambdas.get_fundamentals.handler.cache_get", return_value=None)
    @patch("lambdas.get_fundamentals.handler.fetch_company_profile", return_value=_SAMPLE_PROFILE)
    @patch("lambdas.get_fundamentals.handler.fetch_cash_flow_statements", return_value=_SAMPLE_CF)
    @patch("lambdas.get_fundamentals.handler.fetch_balance_sheets", return_value=_SAMPLE_BALANCE)
    @patch("lambdas.get_fundamentals.handler.fetch_income_statements", return_value=_SAMPLE_INCOME)
    def test_profile_included_in_response(
        self, mock_is, mock_bs, mock_cf, mock_profile, mock_get, mock_set
    ):
        response = lambda_handler(_event("AAPL", "US"), MockContext())
        body = json.loads(response["body"])

        assert body["profile"]["name"] == "Apple Inc."
        assert body["profile"]["ceo"] == "Timothy Cook"

    @patch("lambdas.get_fundamentals.handler.cache_set")
    @patch("lambdas.get_fundamentals.handler.cache_get", return_value=None)
    @patch(
        "lambdas.get_fundamentals.handler.fetch_company_profile",
        side_effect=Exception("boom"),
    )
    @patch("lambdas.get_fundamentals.handler.fetch_cash_flow_statements", return_value=_SAMPLE_CF)
    @patch("lambdas.get_fundamentals.handler.fetch_balance_sheets", return_value=_SAMPLE_BALANCE)
    @patch("lambdas.get_fundamentals.handler.fetch_income_statements", return_value=_SAMPLE_INCOME)
    def test_profile_fetch_failure_does_not_break_response(
        self, mock_is, mock_bs, mock_cf, mock_profile, mock_get, mock_set
    ):
        response = lambda_handler(_event("AAPL", "US"), MockContext())
        body = json.loads(response["body"])

        assert response["statusCode"] == 200
        assert body["profile"] is None


class TestCacheHit:
    _cached_payload = {"ticker": "AAPL", "market": "US", "metrics_by_year": [], "trends": {}}

    @patch("lambdas.get_fundamentals.handler.fetch_income_statements")
    @patch("lambdas.get_fundamentals.handler.cache_get", return_value=_cached_payload)
    def test_returns_cached_response(self, mock_get, mock_is):
        response = lambda_handler(_event("AAPL", "US"), MockContext())

        assert response["statusCode"] == 200
        body = json.loads(response["body"])
        assert body["ticker"] == "AAPL"

    @patch("lambdas.get_fundamentals.handler.fetch_income_statements")
    @patch("lambdas.get_fundamentals.handler.cache_get", return_value=_cached_payload)
    def test_fmp_not_called_on_cache_hit(self, mock_get, mock_is):
        lambda_handler(_event("AAPL", "US"), MockContext())

        mock_is.assert_not_called()


# ---------------------------------------------------------------------------
# 입력 검증 에러 (400)
# ---------------------------------------------------------------------------


class TestInputValidation:
    @pytest.mark.parametrize(
        "ticker,market",
        [
            ("TOOLONGTICKER", "US"),  # US 티커 5자 초과
            ("12345", "KR"),  # KR 티커 5자리 (6자리 필요)
            ("1234567", "KR"),  # KR 티커 7자리
            ("AAPL", "JP"),  # 지원하지 않는 시장
            ("", "US"),  # 빈 티커
        ],
    )
    def test_invalid_input_returns_400(self, ticker, market):
        response = lambda_handler(_event(ticker, market), MockContext())
        assert response["statusCode"] == 400
        body = json.loads(response["body"])
        assert body["error"]["code"] == "INVALID_PARAMS"
        assert "request_id" in body["error"]

    def test_missing_path_parameters_returns_400(self):
        event = {"pathParameters": None, "queryStringParameters": {"market": "US"}}
        response = lambda_handler(event, MockContext())
        assert response["statusCode"] == 400

    def test_missing_query_parameters_returns_400(self):
        event = {"pathParameters": {"ticker": "AAPL"}, "queryStringParameters": None}
        response = lambda_handler(event, MockContext())
        assert response["statusCode"] == 400

    def test_lowercase_ticker_is_normalized_to_uppercase(self):
        """핸들러가 소문자 티커를 대문자로 정규화하는지 확인합니다."""
        patches = [
            patch("lambdas.get_fundamentals.handler.cache_get", return_value=None),
            patch("lambdas.get_fundamentals.handler.cache_set"),
            patch(
                "lambdas.get_fundamentals.handler.fetch_income_statements",
                return_value=_SAMPLE_INCOME,
            ),
            patch(
                "lambdas.get_fundamentals.handler.fetch_balance_sheets",
                return_value=_SAMPLE_BALANCE,
            ),
            patch(
                "lambdas.get_fundamentals.handler.fetch_cash_flow_statements",
                return_value=_SAMPLE_CF,
            ),
        ]
        with patches[0], patches[1], patches[2], patches[3], patches[4]:
            response = lambda_handler(_event("aapl", "us"), MockContext())

        assert response["statusCode"] == 200
        body = json.loads(response["body"])
        assert body["ticker"] == "AAPL"


# ---------------------------------------------------------------------------
# 외부 API 에러 (503)
# ---------------------------------------------------------------------------


_ExternalAPIError = __import__("core.external.fmp", fromlist=["ExternalAPIError"]).ExternalAPIError


class TestExternalAPIError:
    @patch("lambdas.get_fundamentals.handler.cache_get", return_value=None)
    @patch(
        "lambdas.get_fundamentals.handler.fetch_income_statements",
        side_effect=_ExternalAPIError("timeout"),
    )
    def test_fmp_error_returns_503(self, mock_is, mock_get):
        response = lambda_handler(_event("AAPL", "US"), MockContext())

        assert response["statusCode"] == 503
        body = json.loads(response["body"])
        assert body["error"]["code"] == "EXTERNAL_API_ERROR"
        # 내부 오류 메시지는 클라이언트에 노출되지 않아야 함 (AC-M1-005)
        assert "timeout" not in body["error"]["message"]


# ---------------------------------------------------------------------------
# 데이터 없음 (404)
# ---------------------------------------------------------------------------


class TestTickerNotFound:
    @patch("lambdas.get_fundamentals.handler.cache_set")
    @patch("lambdas.get_fundamentals.handler.cache_get", return_value=None)
    @patch("lambdas.get_fundamentals.handler.fetch_cash_flow_statements", return_value=[])
    @patch("lambdas.get_fundamentals.handler.fetch_balance_sheets", return_value=[])
    @patch("lambdas.get_fundamentals.handler.fetch_income_statements", return_value=[])
    def test_empty_fmp_response_returns_404(self, mock_is, mock_bs, mock_cf, mock_get, mock_set):
        response = lambda_handler(_event("ZZZZ", "US"), MockContext())

        assert response["statusCode"] == 404
        body = json.loads(response["body"])
        assert body["error"]["code"] == "TICKER_NOT_FOUND"

    @patch("lambdas.get_fundamentals.handler.cache_set")
    @patch("lambdas.get_fundamentals.handler.cache_get", return_value=None)
    @patch("lambdas.get_fundamentals.handler.fetch_cash_flow_statements", return_value=[])
    @patch("lambdas.get_fundamentals.handler.fetch_balance_sheets", return_value=[])
    @patch("lambdas.get_fundamentals.handler.fetch_income_statements", return_value=[])
    def test_not_found_response_not_cached(self, mock_is, mock_bs, mock_cf, mock_get, mock_set):
        lambda_handler(_event("ZZZZ", "US"), MockContext())
        mock_set.assert_not_called()


# ---------------------------------------------------------------------------
# 응답 형식 검증
# ---------------------------------------------------------------------------


class TestResponseFormat:
    @patch("lambdas.get_fundamentals.handler.cache_set")
    @patch("lambdas.get_fundamentals.handler.cache_get", return_value=None)
    @patch("lambdas.get_fundamentals.handler.fetch_cash_flow_statements", return_value=_SAMPLE_CF)
    @patch("lambdas.get_fundamentals.handler.fetch_balance_sheets", return_value=_SAMPLE_BALANCE)
    @patch("lambdas.get_fundamentals.handler.fetch_income_statements", return_value=_SAMPLE_INCOME)
    def test_content_type_header(self, mock_is, mock_bs, mock_cf, mock_get, mock_set):
        response = lambda_handler(_event("AAPL", "US"), MockContext())
        assert response["headers"]["Content-Type"] == "application/json"

    @patch("lambdas.get_fundamentals.handler.cache_set")
    @patch("lambdas.get_fundamentals.handler.cache_get", return_value=None)
    @patch("lambdas.get_fundamentals.handler.fetch_cash_flow_statements", return_value=_SAMPLE_CF)
    @patch("lambdas.get_fundamentals.handler.fetch_balance_sheets", return_value=_SAMPLE_BALANCE)
    @patch("lambdas.get_fundamentals.handler.fetch_income_statements", return_value=_SAMPLE_INCOME)
    def test_body_is_valid_json(self, mock_is, mock_bs, mock_cf, mock_get, mock_set):
        response = lambda_handler(_event("AAPL", "US"), MockContext())
        # JSON 파싱이 예외 없이 성공해야 함
        body = json.loads(response["body"])
        assert isinstance(body, dict)

    def test_error_response_contains_request_id(self):
        response = lambda_handler(_event("BAD!", "US"), MockContext())
        body = json.loads(response["body"])
        assert body["error"]["request_id"] == MockContext.aws_request_id
