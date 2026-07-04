"""core.price_updater 단위 테스트."""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

import core.price_updater as module


class TestFetchQuote:
    def test_returns_parsed_quote(self):
        fake_data = {
            "Global Quote": {
                "05. price": "185.50",
                "09. change": "1.25",
                "10. change percent": "0.68%",
                "06. volume": "55000000",
                "07. latest trading day": "2024-01-15",
                "08. previous close": "184.25",
                "03. high": "198.00",
                "04. low": "124.17",
            }
        }
        with patch.object(module, "_fetch_json", return_value=fake_data):
            quote = module._fetch_quote("AAPL", "test_key")

        assert quote["ticker"] == "AAPL"
        assert quote["price"] == 185.50
        assert quote["week_52_high"] == 198.00
        assert quote["week_52_low"] == 124.17

    def test_raises_on_empty_quote(self):
        with patch.object(module, "_fetch_json", return_value={"Global Quote": {}}):
            with pytest.raises(module.PriceUpdateError, match="no quote data"):
                module._fetch_quote("AAPL", "test_key")


class TestCachePrice:
    def test_stores_with_correct_key_and_ttl(self):
        mock_client = MagicMock()
        with patch("core.cache._get_client", return_value=mock_client):
            module._cache_price("AAPL", {"ticker": "AAPL", "price": 185.5})

        mock_client.setex.assert_called_once()
        args = mock_client.setex.call_args[0]
        assert args[0] == "price:AAPL"
        assert args[1] == module.PRICE_TTL
        assert json.loads(args[2])["price"] == 185.5


class TestUpdateWatchlistPrices:
    def test_updates_all_tickers(self):
        fake_quote = {
            "ticker": "AAPL",
            "price": 185.5,
            "week_52_high": 198.0,
            "week_52_low": 124.17,
        }

        with patch.dict("os.environ", {"ALPHA_VANTAGE_API_KEY": "key"}):
            with patch.object(module, "_fetch_quote", return_value=fake_quote):
                with patch.object(module, "_cache_price") as mock_cache:
                    with patch("time.sleep"):  # rate limit 대기 스킵
                        result = module.update_watchlist_prices(["AAPL", "MSFT"])

        assert len(result["updated"]) == 2
        assert result["errors"] == []
        assert mock_cache.call_count == 2

    def test_partial_success_on_single_failure(self):
        call_count = [0]

        def side_effect(ticker, api_key):
            call_count[0] += 1
            if ticker == "BAD":
                raise module.PriceUpdateError("Network error")
            return {"ticker": ticker, "price": 100.0}

        with patch.dict("os.environ", {"ALPHA_VANTAGE_API_KEY": "key"}):
            with patch.object(module, "_fetch_quote", side_effect=side_effect):
                with patch.object(module, "_cache_price"):
                    with patch("time.sleep"):
                        result = module.update_watchlist_prices(["AAPL", "BAD"])

        assert len(result["updated"]) == 1
        assert len(result["errors"]) == 1

    def test_raises_on_missing_api_key(self):
        with patch.dict("os.environ", {}, clear=True):
            with pytest.raises(module.PriceUpdateError, match="ALPHA_VANTAGE_API_KEY"):
                module.update_watchlist_prices(["AAPL"])

    def test_no_rate_limit_sleep_for_single_ticker(self):
        fake_quote = {"ticker": "AAPL", "price": 100.0}
        with patch.dict("os.environ", {"ALPHA_VANTAGE_API_KEY": "key"}):
            with patch.object(module, "_fetch_quote", return_value=fake_quote):
                with patch.object(module, "_cache_price"):
                    with patch("time.sleep") as mock_sleep:
                        module.update_watchlist_prices(["AAPL"])

        mock_sleep.assert_not_called()
