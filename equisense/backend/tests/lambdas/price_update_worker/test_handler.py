"""lambdas/price_update_worker/handler 단위 테스트."""

from __future__ import annotations

from unittest.mock import patch

from lambdas.price_update_worker.handler import _get_tickers, lambda_handler


class TestGetTickers:
    def test_from_event_payload(self):
        event = {"tickers": ["AAPL", "MSFT"]}
        assert _get_tickers(event) == ["AAPL", "MSFT"]

    def test_from_environment_variable(self):
        with patch.dict("os.environ", {"PRICE_WATCHLIST": "AAPL,MSFT,005930"}):
            tickers = _get_tickers({})

        assert tickers == ["AAPL", "MSFT", "005930"]

    def test_strips_whitespace(self):
        event = {"tickers": [" AAPL ", " MSFT"]}
        tickers = _get_tickers(event)
        assert tickers == ["AAPL", "MSFT"]

    def test_uppercases_tickers(self):
        event = {"tickers": ["aapl"]}
        assert _get_tickers(event) == ["AAPL"]

    def test_returns_empty_when_no_config(self):
        with patch.dict("os.environ", {}, clear=True):
            assert _get_tickers({}) == []


class TestSuccess:
    def test_returns_200_when_all_updated(self):
        mock_result = {"updated": {"AAPL": {"price": 185.5}}, "errors": []}
        event = {"tickers": ["AAPL"]}

        patch_target = "lambdas.price_update_worker.handler.update_watchlist_prices"
        with patch(patch_target, return_value=mock_result):
            response = lambda_handler(event, None)

        assert response["statusCode"] == 200

    def test_returns_207_on_partial_success(self):
        mock_result = {"updated": {}, "errors": ["BAD: network error"]}
        event = {"tickers": ["BAD"]}

        patch_target = "lambdas.price_update_worker.handler.update_watchlist_prices"
        with patch(patch_target, return_value=mock_result):
            response = lambda_handler(event, None)

        assert response["statusCode"] == 207

    def test_returns_400_when_no_tickers(self):
        with patch.dict("os.environ", {}, clear=True):
            response = lambda_handler({}, None)

        assert response["statusCode"] == 400

    def test_returns_500_on_fatal_error(self):
        from core.price_updater import PriceUpdateError

        event = {"tickers": ["AAPL"]}
        with patch(
            "lambdas.price_update_worker.handler.update_watchlist_prices",
            side_effect=PriceUpdateError("No API key"),
        ):
            response = lambda_handler(event, None)

        assert response["statusCode"] == 500
