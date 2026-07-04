"""core.technical_screener 단위 테스트."""

from __future__ import annotations

from unittest.mock import patch

import core.technical_screener as module


class TestClassify:
    def test_undervalued_signal(self):
        # price < week_52_low * 1.2
        quote = {"price": "100.0", "week_52_high": "200.0", "week_52_low": "90.0"}
        result = module._classify("AAPL", "US", quote)

        # 100 < 90 * 1.2 = 108 → undervalued
        assert result["is_undervalued"] is True
        assert result["is_overbought"] is False
        assert result["signal"] == "undervalued"

    def test_overbought_signal(self):
        # price > week_52_high * 0.9
        quote = {"price": "185.0", "week_52_high": "190.0", "week_52_low": "100.0"}
        result = module._classify("AAPL", "US", quote)

        # 185 > 190 * 0.9 = 171 → overbought
        assert result["is_overbought"] is True
        assert result["is_undervalued"] is False
        assert result["signal"] == "overbought"

    def test_neutral_signal(self):
        quote = {"price": "150.0", "week_52_high": "200.0", "week_52_low": "100.0"}
        result = module._classify("AAPL", "US", quote)

        assert result["signal"] == "neutral"
        assert result["is_undervalued"] is False
        assert result["is_overbought"] is False

    def test_zero_price_yields_neutral(self):
        quote = {"price": "0", "week_52_high": "200.0", "week_52_low": "100.0"}
        result = module._classify("AAPL", "US", quote)

        assert result["is_undervalued"] is False
        assert result["is_overbought"] is False


class TestSignalLabel:
    def test_undervalued_only(self):
        assert module._signal_label(True, False) == "undervalued"

    def test_overbought_only(self):
        assert module._signal_label(False, True) == "overbought"

    def test_both_yields_neutral(self):
        assert module._signal_label(True, True) == "neutral"

    def test_neither_yields_neutral(self):
        assert module._signal_label(False, False) == "neutral"


class TestScreenAllCompanies:
    def test_screens_all_tickers_with_cached_prices(self):
        tickers = [("AAPL", "US"), ("MSFT", "US")]
        quote = {"price": "150.0", "week_52_high": "200.0", "week_52_low": "100.0"}

        with patch.object(module, "_get_all_tickers", return_value=tickers):
            with patch.object(module, "_get_cached_price", return_value=quote):
                with patch.object(module, "_save_result") as mock_save:
                    result = module.screen_all_companies()

        assert result["screened"] == 2
        assert mock_save.call_count == 2
        assert result["errors"] == []

    def test_skips_tickers_without_cached_price(self):
        tickers = [("AAPL", "US"), ("MSFT", "US")]

        with patch.object(module, "_get_all_tickers", return_value=tickers):
            with patch.object(module, "_get_cached_price", return_value=None):
                with patch.object(module, "_save_result") as mock_save:
                    module.screen_all_companies()

        assert mock_save.call_count == 0

    def test_handles_single_ticker_error_gracefully(self):
        tickers = [("ERR", "US"), ("AAPL", "US")]
        quote = {"price": "150.0", "week_52_high": "200.0", "week_52_low": "100.0"}
        call_count = [0]

        def side_effect(ticker):
            call_count[0] += 1
            if ticker == "ERR":
                raise Exception("DB error")
            return quote

        with patch.object(module, "_get_all_tickers", return_value=tickers):
            with patch.object(module, "_get_cached_price", side_effect=side_effect):
                with patch.object(module, "_save_result"):
                    result = module.screen_all_companies()

        assert len(result["errors"]) == 1
        assert "ERR" in result["errors"][0]

    def test_identifies_undervalued_tickers(self):
        tickers = [("CHEAP", "US")]
        # price 100, 52w_low 90 → 100 < 90*1.2=108 → undervalued
        quote = {"price": "100.0", "week_52_high": "200.0", "week_52_low": "90.0"}

        with patch.object(module, "_get_all_tickers", return_value=tickers):
            with patch.object(module, "_get_cached_price", return_value=quote):
                with patch.object(module, "_save_result"):
                    result = module.screen_all_companies()

        assert "CHEAP" in result["undervalued"]
        assert "CHEAP" not in result["overbought"]
