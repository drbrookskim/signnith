"""lambdas/news_ingestion_worker/handler 단위 테스트."""

from __future__ import annotations

import json
from unittest.mock import patch

from lambdas.news_ingestion_worker.handler import lambda_handler


def _make_event(tickers: list[str] | None = None) -> dict:
    return {"tickers": tickers} if tickers is not None else {}


_FAKE_RESULT = {"ingested": {"AAPL": 3, "005930": 1}, "errors": []}
_PARTIAL_RESULT = {"ingested": {"AAPL": 3}, "errors": ["005930: timeout"]}


class TestSuccess:
    def test_returns_200_when_all_tickers_succeed(self):
        with patch(
            "lambdas.news_ingestion_worker.handler.ingest_all_news",
            return_value=_FAKE_RESULT,
        ):
            result = lambda_handler(_make_event(["AAPL", "005930"]), None)

        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        assert body["ingested"]["AAPL"] == 3

    def test_returns_207_on_partial_failure(self):
        with patch(
            "lambdas.news_ingestion_worker.handler.ingest_all_news",
            return_value=_PARTIAL_RESULT,
        ):
            result = lambda_handler(_make_event(["AAPL", "005930"]), None)

        assert result["statusCode"] == 207

    def test_reads_tickers_from_event(self):
        captured = []

        def capture(tickers):
            captured.extend(tickers)
            return _FAKE_RESULT

        with patch("lambdas.news_ingestion_worker.handler.ingest_all_news", side_effect=capture):
            lambda_handler(_make_event(["AAPL", "MSFT"]), None)

        assert captured == ["AAPL", "MSFT"]

    def test_reads_tickers_from_env(self, monkeypatch):
        monkeypatch.setenv("PRICE_WATCHLIST", "AAPL,MSFT,005930")
        captured = []

        def capture(tickers):
            captured.extend(tickers)
            return _FAKE_RESULT

        with patch("lambdas.news_ingestion_worker.handler.ingest_all_news", side_effect=capture):
            lambda_handler(_make_event(), None)

        assert set(captured) == {"AAPL", "MSFT", "005930"}


class TestEdgeCases:
    def test_returns_400_when_no_tickers(self, monkeypatch):
        monkeypatch.setenv("PRICE_WATCHLIST", "")
        result = lambda_handler(_make_event(), None)
        assert result["statusCode"] == 400

    def test_returns_500_on_fatal_error(self):
        from core.news_ingester import NewsIngestionError

        with patch(
            "lambdas.news_ingestion_worker.handler.ingest_all_news",
            side_effect=NewsIngestionError("API key missing"),
        ):
            result = lambda_handler(_make_event(["AAPL"]), None)

        assert result["statusCode"] == 500
        assert "API key missing" in result["body"]
