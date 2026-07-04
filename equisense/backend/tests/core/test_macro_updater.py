"""core.macro_updater 단위 테스트."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

import core.macro_updater as module

# ---------------------------------------------------------------------------
# _fetch_json
# ---------------------------------------------------------------------------


class TestFetchJson:
    def test_returns_parsed_json(self):
        fake_resp = MagicMock()
        fake_resp.read.return_value = b'{"data": [{"value": "5.25", "date": "2024-01-01"}]}'
        fake_resp.__enter__ = lambda s: s
        fake_resp.__exit__ = MagicMock(return_value=False)

        with patch("urllib.request.urlopen", return_value=fake_resp):
            result = module._fetch_json("http://example.com")

        assert result["data"][0]["value"] == "5.25"

    def test_retries_on_network_error(self):
        import urllib.error

        with patch("urllib.request.urlopen", side_effect=urllib.error.URLError("timeout")):
            with patch("time.sleep"):
                with pytest.raises(module.MacroUpdateError, match="retries"):
                    module._fetch_json("http://example.com")


# ---------------------------------------------------------------------------
# _fetch_indicator
# ---------------------------------------------------------------------------


class TestFetchIndicator:
    def test_returns_value_and_date(self):
        fake_data = {"data": [{"value": "5.33", "date": "2024-01-15"}]}
        with patch.object(module, "_fetch_json", return_value=fake_data):
            value, date = module._fetch_indicator("FEDERAL_FUNDS_RATE", "test_key")

        assert value == 5.33
        assert date == "2024-01-15"

    def test_raises_on_empty_data(self):
        with patch.object(module, "_fetch_json", return_value={"data": []}):
            with pytest.raises(module.MacroUpdateError, match="no data"):
                module._fetch_indicator("FEDERAL_FUNDS_RATE", "test_key")


# ---------------------------------------------------------------------------
# update_all_indicators
# ---------------------------------------------------------------------------


class TestUpdateAllIndicators:
    def test_updates_all_indicators(self):
        with patch.dict("os.environ", {"ALPHA_VANTAGE_API_KEY": "test_key"}):
            with patch.object(module, "_fetch_indicator", return_value=(5.25, "2024-01-01")):
                with patch.object(module, "_save_to_db") as mock_save:
                    with patch.object(module, "_cache_indicator") as mock_cache:
                        result = module.update_all_indicators()

        assert "updated" in result
        assert "errors" in result
        assert len(result["updated"]) == len(module.INDICATORS)
        assert mock_save.call_count == len(module.INDICATORS)
        assert mock_cache.call_count == len(module.INDICATORS)
        assert result["errors"] == []

    def test_partial_success_when_one_indicator_fails(self):
        call_count = [0]

        def side_effect(function, api_key):
            call_count[0] += 1
            if call_count[0] == 1:
                raise module.MacroUpdateError("API error")
            return (5.25, "2024-01-01")

        with patch.dict("os.environ", {"ALPHA_VANTAGE_API_KEY": "test_key"}):
            with patch.object(module, "_fetch_indicator", side_effect=side_effect):
                with patch.object(module, "_save_to_db"):
                    with patch.object(module, "_cache_indicator"):
                        result = module.update_all_indicators()

        assert len(result["errors"]) == 1
        assert len(result["updated"]) == len(module.INDICATORS) - 1

    def test_raises_when_no_api_key(self):
        with patch.dict("os.environ", {}, clear=True):
            with pytest.raises(module.MacroUpdateError, match="ALPHA_VANTAGE_API_KEY"):
                module.update_all_indicators()

    def test_cache_key_format(self):
        cached_keys: list[str] = []

        def capture_cache(indicator, value, date, unit):
            cached_keys.append(indicator)

        with patch.dict("os.environ", {"ALPHA_VANTAGE_API_KEY": "key"}):
            with patch.object(module, "_fetch_indicator", return_value=(1.0, "2024-01-01")):
                with patch.object(module, "_save_to_db"):
                    with patch.object(module, "_cache_indicator", side_effect=capture_cache):
                        module.update_all_indicators()

        for _, cache_key, _ in module.INDICATORS:
            assert cache_key in cached_keys
