"""GetTechnicalData Lambda 핸들러 테스트.

모든 외부 의존성(Redis, FMP API)은 unittest.mock으로 격리합니다.
"""

from __future__ import annotations

import json
from unittest.mock import patch

import pytest

from lambdas.get_technical_data.handler import lambda_handler

# ---------------------------------------------------------------------------
# 공통 픽스처
# ---------------------------------------------------------------------------


class MockContext:
    aws_request_id = "test-request-id-tech"


def _event(ticker: str, market: str, period: str | None = None) -> dict:
    qs: dict = {"market": market}
    if period is not None:
        qs["period"] = period
    return {
        "pathParameters": {"ticker": ticker},
        "queryStringParameters": qs,
    }


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
]


# ---------------------------------------------------------------------------
# 정상 흐름
# ---------------------------------------------------------------------------


class TestSuccessfulFetch:
    @patch("lambdas.get_technical_data.handler.cache_set")
    @patch("lambdas.get_technical_data.handler.cache_get", return_value=None)
    @patch(
        "lambdas.get_technical_data.handler.fetch_historical_prices",
        return_value=_SAMPLE_HISTORY,
    )
    def test_returns_200(self, mock_fmp, mock_get, mock_set):
        response = lambda_handler(_event("AAPL", "US"), MockContext())
        assert response["statusCode"] == 200

    @patch("lambdas.get_technical_data.handler.cache_set")
    @patch("lambdas.get_technical_data.handler.cache_get", return_value=None)
    @patch(
        "lambdas.get_technical_data.handler.fetch_historical_prices",
        return_value=_SAMPLE_HISTORY,
    )
    def test_response_body_fields(self, mock_fmp, mock_get, mock_set):
        response = lambda_handler(_event("AAPL", "US"), MockContext())
        body = json.loads(response["body"])
        assert body["ticker"] == "AAPL"
        assert body["market"] == "US"
        assert body["period"] == "1y"  # 기본값
        assert "data_points" in body
        assert "summary" in body

    @patch("lambdas.get_technical_data.handler.cache_set")
    @patch("lambdas.get_technical_data.handler.cache_get", return_value=None)
    @patch(
        "lambdas.get_technical_data.handler.fetch_historical_prices",
        return_value=_SAMPLE_HISTORY,
    )
    def test_data_points_sorted_ascending(self, mock_fmp, mock_get, mock_set):
        response = lambda_handler(_event("AAPL", "US", "1m"), MockContext())
        body = json.loads(response["body"])
        dates = [dp["date"] for dp in body["data_points"]]
        assert dates == sorted(dates)

    @patch("lambdas.get_technical_data.handler.cache_set")
    @patch("lambdas.get_technical_data.handler.cache_get", return_value=None)
    @patch(
        "lambdas.get_technical_data.handler.fetch_historical_prices",
        return_value=_SAMPLE_HISTORY,
    )
    def test_cache_set_called(self, mock_fmp, mock_get, mock_set):
        lambda_handler(_event("AAPL", "US"), MockContext())
        mock_set.assert_called_once()

    @patch("lambdas.get_technical_data.handler.cache_set")
    @patch("lambdas.get_technical_data.handler.cache_get", return_value=None)
    @patch(
        "lambdas.get_technical_data.handler.fetch_historical_prices",
        return_value=_SAMPLE_HISTORY,
    )
    def test_cache_key_contains_ticker_market_period(self, mock_fmp, mock_get, mock_set):
        lambda_handler(_event("AAPL", "US", "3m"), MockContext())
        cache_key = mock_set.call_args[0][0]
        assert "AAPL" in cache_key
        assert "US" in cache_key
        assert "3m" in cache_key

    @patch("lambdas.get_technical_data.handler.cache_set")
    @patch("lambdas.get_technical_data.handler.cache_get", return_value=None)
    @patch(
        "lambdas.get_technical_data.handler.fetch_historical_prices",
        return_value=_SAMPLE_HISTORY,
    )
    def test_kr_ticker_returns_200(self, mock_fmp, mock_get, mock_set):
        response = lambda_handler(_event("005930", "KR"), MockContext())
        assert response["statusCode"] == 200

    @patch("lambdas.get_technical_data.handler.cache_set")
    @patch("lambdas.get_technical_data.handler.cache_get", return_value=None)
    @patch(
        "lambdas.get_technical_data.handler.fetch_historical_prices",
        return_value=_SAMPLE_HISTORY,
    )
    def test_lowercase_ticker_normalized(self, mock_fmp, mock_get, mock_set):
        response = lambda_handler(_event("aapl", "us"), MockContext())
        body = json.loads(response["body"])
        assert body["ticker"] == "AAPL"


# ---------------------------------------------------------------------------
# 캐시 히트
# ---------------------------------------------------------------------------


class TestCacheHit:
    _cached = {
        "ticker": "AAPL",
        "market": "US",
        "period": "1y",
        "data_points": [],
        "summary": {},
    }

    @patch("lambdas.get_technical_data.handler.fetch_historical_prices")
    @patch(
        "lambdas.get_technical_data.handler.cache_get",
        return_value=_cached,
    )
    def test_returns_cached_response(self, mock_get, mock_fmp):
        response = lambda_handler(_event("AAPL", "US"), MockContext())
        assert response["statusCode"] == 200

    @patch("lambdas.get_technical_data.handler.fetch_historical_prices")
    @patch(
        "lambdas.get_technical_data.handler.cache_get",
        return_value=_cached,
    )
    def test_fmp_not_called_on_cache_hit(self, mock_get, mock_fmp):
        lambda_handler(_event("AAPL", "US"), MockContext())
        mock_fmp.assert_not_called()


# ---------------------------------------------------------------------------
# 입력 검증 (400)
# ---------------------------------------------------------------------------


class TestInputValidation:
    @pytest.mark.parametrize(
        "ticker,market,period",
        [
            ("TOOLONGTICKER", "US", None),
            ("12345", "KR", None),
            ("AAPL", "JP", None),
            ("", "US", None),
            ("AAPL", "US", "5y"),  # 허용되지 않는 period
            ("AAPL", "US", "2w"),
        ],
    )
    def test_invalid_input_returns_400(self, ticker, market, period):
        response = lambda_handler(_event(ticker, market, period), MockContext())
        assert response["statusCode"] == 400
        body = json.loads(response["body"])
        assert body["error"]["code"] == "INVALID_PARAMS"
        assert "request_id" in body["error"]

    def test_missing_path_params_returns_400(self):
        event = {"pathParameters": None, "queryStringParameters": {"market": "US"}}
        response = lambda_handler(event, MockContext())
        assert response["statusCode"] == 400

    def test_missing_query_params_returns_400(self):
        event = {"pathParameters": {"ticker": "AAPL"}, "queryStringParameters": None}
        response = lambda_handler(event, MockContext())
        assert response["statusCode"] == 400

    def test_missing_period_defaults_to_1y(self):
        """period 없으면 기본값 '1y'로 처리해야 합니다."""
        with (
            patch("lambdas.get_technical_data.handler.cache_get", return_value=None),
            patch("lambdas.get_technical_data.handler.cache_set"),
            patch(
                "lambdas.get_technical_data.handler.fetch_historical_prices",
                return_value=_SAMPLE_HISTORY,
            ),
        ):
            response = lambda_handler(_event("AAPL", "US"), MockContext())
        body = json.loads(response["body"])
        assert body["period"] == "1y"


# ---------------------------------------------------------------------------
# 외부 API 에러 (503)
# ---------------------------------------------------------------------------

_ExternalAPIError = __import__("core.external.fmp", fromlist=["ExternalAPIError"]).ExternalAPIError


class TestExternalAPIError:
    @patch("lambdas.get_technical_data.handler.cache_get", return_value=None)
    @patch(
        "lambdas.get_technical_data.handler.fetch_historical_prices",
        side_effect=_ExternalAPIError("timeout"),
    )
    def test_fmp_error_returns_503(self, mock_fmp, mock_get):
        response = lambda_handler(_event("AAPL", "US"), MockContext())
        assert response["statusCode"] == 503
        body = json.loads(response["body"])
        assert body["error"]["code"] == "EXTERNAL_API_ERROR"
        assert "timeout" not in body["error"]["message"]  # 내부 메시지 노출 금지


# ---------------------------------------------------------------------------
# 데이터 없음 (404)
# ---------------------------------------------------------------------------


class TestTickerNotFound:
    @patch("lambdas.get_technical_data.handler.cache_set")
    @patch("lambdas.get_technical_data.handler.cache_get", return_value=None)
    @patch(
        "lambdas.get_technical_data.handler.fetch_historical_prices",
        return_value=[],
    )
    def test_empty_history_returns_404(self, mock_fmp, mock_get, mock_set):
        response = lambda_handler(_event("ZZZZ", "US"), MockContext())
        assert response["statusCode"] == 404
        body = json.loads(response["body"])
        assert body["error"]["code"] == "TICKER_NOT_FOUND"

    @patch("lambdas.get_technical_data.handler.cache_set")
    @patch("lambdas.get_technical_data.handler.cache_get", return_value=None)
    @patch(
        "lambdas.get_technical_data.handler.fetch_historical_prices",
        return_value=[],
    )
    def test_not_found_not_cached(self, mock_fmp, mock_get, mock_set):
        lambda_handler(_event("ZZZZ", "US"), MockContext())
        mock_set.assert_not_called()


# ---------------------------------------------------------------------------
# 응답 형식
# ---------------------------------------------------------------------------


class TestResponseFormat:
    @patch("lambdas.get_technical_data.handler.cache_set")
    @patch("lambdas.get_technical_data.handler.cache_get", return_value=None)
    @patch(
        "lambdas.get_technical_data.handler.fetch_historical_prices",
        return_value=_SAMPLE_HISTORY,
    )
    def test_content_type_header(self, mock_fmp, mock_get, mock_set):
        response = lambda_handler(_event("AAPL", "US"), MockContext())
        assert response["headers"]["Content-Type"] == "application/json"

    def test_error_response_contains_request_id(self):
        response = lambda_handler(_event("BAD!!!", "US"), MockContext())
        body = json.loads(response["body"])
        assert body["error"]["request_id"] == MockContext.aws_request_id
