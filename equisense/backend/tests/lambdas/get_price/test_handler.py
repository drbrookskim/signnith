"""lambdas/get_price/handler 단위 테스트."""

from __future__ import annotations

import json
from unittest.mock import patch

from lambdas.get_price.handler import lambda_handler


def _make_event(ticker: str) -> dict:
    return {"pathParameters": {"ticker": ticker}}


class TestValidTicker:
    def test_returns_cached_data_when_hit(self):
        price_data = {"ticker": "AAPL", "price": 175.5, "change": 1.2}
        with patch("lambdas.get_price.handler._get_client") as mock_redis:
            mock_redis.return_value.get.return_value = json.dumps(price_data)
            result = lambda_handler(_make_event("AAPL"), None)

        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        assert body["cached"] is True
        assert body["ticker"] == "AAPL"
        assert body["data"]["price"] == 175.5

    def test_returns_null_data_on_cache_miss(self):
        with patch("lambdas.get_price.handler._get_client") as mock_redis:
            mock_redis.return_value.get.return_value = None
            result = lambda_handler(_make_event("MSFT"), None)

        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        assert body["cached"] is False
        assert body["data"] is None

    def test_normalises_ticker_to_uppercase(self):
        with patch("lambdas.get_price.handler._get_client") as mock_redis:
            mock_redis.return_value.get.return_value = None
            lambda_handler(_make_event("aapl"), None)
            mock_redis.return_value.get.assert_called_once_with("price:AAPL")

    def test_includes_cors_headers(self):
        with patch("lambdas.get_price.handler._get_client") as mock_redis:
            mock_redis.return_value.get.return_value = None
            result = lambda_handler(_make_event("AAPL"), None)

        assert "Access-Control-Allow-Origin" in result["headers"]


class TestInvalidTicker:
    def test_rejects_empty_ticker(self):
        result = lambda_handler({"pathParameters": {"ticker": ""}}, None)
        assert result["statusCode"] == 400

    def test_rejects_ticker_with_special_chars(self):
        result = lambda_handler(_make_event("AAPL;DROP"), None)
        assert result["statusCode"] == 400

    def test_rejects_ticker_over_10_chars(self):
        result = lambda_handler(_make_event("A" * 11), None)
        assert result["statusCode"] == 400


class TestRedisError:
    def test_returns_503_on_redis_failure(self):
        with patch("lambdas.get_price.handler._get_client") as mock_redis:
            mock_redis.return_value.get.side_effect = Exception("connection refused")
            result = lambda_handler(_make_event("AAPL"), None)

        assert result["statusCode"] == 503
