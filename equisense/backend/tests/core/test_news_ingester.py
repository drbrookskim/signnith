"""core.news_ingester 단위 테스트."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

import core.news_ingester as module

# ---------------------------------------------------------------------------
# _is_kr_ticker
# ---------------------------------------------------------------------------


class TestIsKrTicker:
    def test_six_digit_number_is_kr(self):
        assert module._is_kr_ticker("005930") is True

    def test_us_ticker_is_not_kr(self):
        assert module._is_kr_ticker("AAPL") is False

    def test_five_digit_number_is_not_kr(self):
        assert module._is_kr_ticker("00593") is False

    def test_seven_digit_number_is_not_kr(self):
        assert module._is_kr_ticker("0059300") is False

    def test_mixed_alphanumeric_is_not_kr(self):
        assert module._is_kr_ticker("A05930") is False


# ---------------------------------------------------------------------------
# _fetch_json
# ---------------------------------------------------------------------------


class TestFetchJson:
    def test_returns_parsed_json(self):
        fake_resp = MagicMock()
        fake_resp.read.return_value = b'{"feed": []}'
        fake_resp.__enter__ = lambda s: s
        fake_resp.__exit__ = MagicMock(return_value=False)

        with patch("urllib.request.urlopen", return_value=fake_resp):
            result = module._fetch_json("http://example.com")

        assert result == {"feed": []}

    def test_retries_on_network_error_then_raises(self):
        import urllib.error

        with patch("urllib.request.urlopen", side_effect=urllib.error.URLError("timeout")):
            with patch("time.sleep"):
                with pytest.raises(module.NewsIngestionError, match="retries"):
                    module._fetch_json("http://example.com")


# ---------------------------------------------------------------------------
# _fetch_av_news
# ---------------------------------------------------------------------------


class TestFetchAvNews:
    def test_parses_feed_items(self):
        fake_data = {
            "feed": [
                {
                    "title": "Apple hits record",
                    "url": "https://example.com/1",
                    "time_published": "20240101T090000",
                    "source": "Bloomberg",
                    "summary": "Apple stock...",
                    "overall_sentiment_score": 0.35,
                }
            ]
        }
        with patch.object(module, "_fetch_json", return_value=fake_data):
            articles = module._fetch_av_news("AAPL", "test_key")

        assert len(articles) == 1
        assert articles[0]["title"] == "Apple hits record"
        assert articles[0]["sentiment_score"] == 0.35
        assert articles[0]["source"] == "Bloomberg"

    def test_returns_empty_list_when_no_feed(self):
        with patch.object(module, "_fetch_json", return_value={}):
            articles = module._fetch_av_news("AAPL", "test_key")

        assert articles == []

    def test_raises_when_no_api_key(self):
        with pytest.raises(module.NewsIngestionError, match="ALPHA_VANTAGE_API_KEY"):
            module._fetch_av_news("AAPL", "")


# ---------------------------------------------------------------------------
# _fetch_dart_disclosures
# ---------------------------------------------------------------------------


class TestFetchDartDisclosures:
    def _mock_fetch(self, responses: list[dict]):
        """순서대로 응답을 반환하는 mock."""
        responses_iter = iter(responses)
        return lambda url: next(responses_iter)

    def test_parses_disclosure_list(self):
        company_resp = {"corp_code": "00126380"}
        list_resp = {
            "list": [
                {
                    "report_nm": "사업보고서",
                    "rcept_no": "20240101000001",
                    "rcept_dt": "20240101",
                }
            ]
        }
        with patch.object(
            module, "_fetch_json", side_effect=self._mock_fetch([company_resp, list_resp])
        ):
            articles = module._fetch_dart_disclosures("005930", "dart_key")

        assert len(articles) == 1
        assert articles[0]["title"] == "사업보고서"
        assert articles[0]["source"] == "DART"
        assert "rcpNo=20240101000001" in articles[0]["url"]

    def test_raises_when_corp_code_not_found(self):
        with patch.object(module, "_fetch_json", return_value={"corp_code": ""}):
            with pytest.raises(module.NewsIngestionError, match="corp_code"):
                module._fetch_dart_disclosures("005930", "dart_key")

    def test_raises_when_no_dart_key(self):
        with pytest.raises(module.NewsIngestionError, match="DART_API_KEY"):
            module._fetch_dart_disclosures("005930", "")


# ---------------------------------------------------------------------------
# ingest_all_news
# ---------------------------------------------------------------------------


class TestIngestAllNews:
    def test_routes_us_ticker_to_av(self, monkeypatch):
        monkeypatch.setenv("ALPHA_VANTAGE_API_KEY", "av_key")
        monkeypatch.setenv("DART_API_KEY", "dart_key")
        av_mock = MagicMock(
            return_value=[
                {
                    "title": "t",
                    "url": "u",
                    "published_at": "",
                    "source": "s",
                    "summary": "",
                    "sentiment_score": 0.0,
                }
            ]
        )
        with (
            patch.object(module, "_fetch_av_news", av_mock),
            patch.object(module, "_cache_news"),
            patch.object(module, "_save_to_db"),
            patch("time.sleep"),
        ):
            result = module.ingest_all_news(["AAPL"])

        av_mock.assert_called_once_with("AAPL", "av_key")
        assert result["ingested"]["AAPL"] == 1

    def test_routes_kr_ticker_to_dart(self, monkeypatch):
        monkeypatch.setenv("ALPHA_VANTAGE_API_KEY", "av_key")
        monkeypatch.setenv("DART_API_KEY", "dart_key")
        dart_mock = MagicMock(return_value=[])
        with (
            patch.object(module, "_fetch_dart_disclosures", dart_mock),
            patch.object(module, "_cache_news"),
            patch.object(module, "_save_to_db"),
        ):
            module.ingest_all_news(["005930"])

        dart_mock.assert_called_once_with("005930", "dart_key")

    def test_records_error_on_per_ticker_failure(self, monkeypatch):
        monkeypatch.setenv("ALPHA_VANTAGE_API_KEY", "av_key")
        monkeypatch.setenv("DART_API_KEY", "")
        with (
            patch.object(module, "_fetch_av_news", side_effect=Exception("rate limit")),
            patch("time.sleep"),
        ):
            result = module.ingest_all_news(["AAPL"])

        assert len(result["errors"]) == 1
        assert "AAPL" in result["errors"][0]

    def test_raises_when_both_keys_missing(self, monkeypatch):
        monkeypatch.setenv("ALPHA_VANTAGE_API_KEY", "")
        monkeypatch.setenv("DART_API_KEY", "")
        with pytest.raises(module.NewsIngestionError, match="API 키"):
            module.ingest_all_news(["AAPL"])
