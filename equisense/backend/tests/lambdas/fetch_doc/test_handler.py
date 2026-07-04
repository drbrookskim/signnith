"""FetchDoc Lambda 핸들러 테스트 (Step Functions State 1)."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from core.qualitative.document_fetcher import DocumentFetchError
from lambdas.fetch_doc.handler import lambda_handler


class MockContext:
    aws_request_id = "test-request-id-fetch"


_BASE_EVENT = {
    "job_id": "d1e2f3a4-b5c6-7890-def0-123456789012",
    "ticker": "AAPL",
    "market": "US",
    "doc_type": "annual_report",
    "fiscal_year": 2024,
}


# ---------------------------------------------------------------------------
# 정상 흐름
# ---------------------------------------------------------------------------


class TestSuccessfulFetch:
    @patch(
        "lambdas.fetch_doc.handler.fetch_and_upload",
        return_value="raw/d1e2f3a4-b5c6-7890-def0-123456789012/AAPL_2024.pdf",
    )
    def test_returns_event_plus_s3_key(self, mock_fetch):
        result = lambda_handler(_BASE_EVENT, MockContext())
        assert result["s3_raw_key"] == "raw/d1e2f3a4-b5c6-7890-def0-123456789012/AAPL_2024.pdf"

    @patch(
        "lambdas.fetch_doc.handler.fetch_and_upload",
        return_value="raw/d1e2f3a4-b5c6-7890-def0-123456789012/AAPL_2024.pdf",
    )
    def test_original_event_fields_preserved(self, mock_fetch):
        result = lambda_handler(_BASE_EVENT, MockContext())
        assert result["job_id"] == _BASE_EVENT["job_id"]
        assert result["ticker"] == "AAPL"
        assert result["market"] == "US"
        assert result["fiscal_year"] == 2024

    @patch(
        "lambdas.fetch_doc.handler.fetch_and_upload",
        return_value="raw/job/005930_2024.pdf",
    )
    def test_kr_ticker_passes_correct_params(self, mock_fetch):
        event = {**_BASE_EVENT, "ticker": "005930", "market": "KR"}
        result = lambda_handler(event, MockContext())
        mock_fetch.assert_called_once_with(
            ticker="005930",
            market="KR",
            doc_type="annual_report",
            fiscal_year=2024,
            job_id=_BASE_EVENT["job_id"],
        )
        assert "s3_raw_key" in result

    @patch(
        "lambdas.fetch_doc.handler.fetch_and_upload",
        return_value="raw/job/AAPL_2024.pdf",
    )
    def test_fiscal_year_cast_to_int(self, mock_fetch):
        event = {**_BASE_EVENT, "fiscal_year": "2024"}  # 문자열로 전달
        lambda_handler(event, MockContext())
        call_kwargs = mock_fetch.call_args[1]
        assert call_kwargs["fiscal_year"] == 2024
        assert isinstance(call_kwargs["fiscal_year"], int)

    @patch(
        "lambdas.fetch_doc.handler.fetch_and_upload",
        return_value="raw/job/AAPL_2024.pdf",
    )
    def test_default_doc_type_annual_report(self, mock_fetch):
        event = {k: v for k, v in _BASE_EVENT.items() if k != "doc_type"}
        lambda_handler(event, MockContext())
        call_kwargs = mock_fetch.call_args[1]
        assert call_kwargs["doc_type"] == "annual_report"

    @patch(
        "lambdas.fetch_doc.handler.fetch_and_upload",
        return_value="raw/job/AAPL_2024.pdf",
    )
    def test_earnings_call_doc_type(self, mock_fetch):
        event = {**_BASE_EVENT, "doc_type": "earnings_call"}
        lambda_handler(event, MockContext())
        call_kwargs = mock_fetch.call_args[1]
        assert call_kwargs["doc_type"] == "earnings_call"


# ---------------------------------------------------------------------------
# DocumentFetchError — Step Functions HandleFailure로 전파
# ---------------------------------------------------------------------------


class TestDocumentFetchError:
    @patch(
        "lambdas.fetch_doc.handler.fetch_and_upload",
        side_effect=DocumentFetchError("DART API key missing"),
    )
    def test_fetch_error_propagates(self, mock_fetch):
        with pytest.raises(DocumentFetchError):
            lambda_handler(_BASE_EVENT, MockContext())

    @patch(
        "lambdas.fetch_doc.handler.fetch_and_upload",
        side_effect=DocumentFetchError("SEC CIK not found"),
    )
    def test_sec_fetch_error_propagates(self, mock_fetch):
        with pytest.raises(DocumentFetchError, match="SEC CIK not found"):
            lambda_handler(_BASE_EVENT, MockContext())
