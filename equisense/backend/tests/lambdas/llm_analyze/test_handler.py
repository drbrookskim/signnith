"""LLMAnalyze Lambda 핸들러 테스트 (Step Functions State 4)."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from core.qualitative.llm_analyzer import LLMAnalyzeError
from lambdas.llm_analyze.handler import lambda_handler


class MockContext:
    aws_request_id = "test-request-id-llm"


_JOB_ID = "d1e2f3a4-b5c6-7890-def0-123456789012"

_BASE_EVENT = {
    "job_id": _JOB_ID,
    "ticker": "AAPL",
    "market": "US",
    "doc_type": "annual_report",
    "fiscal_year": 2024,
    "s3_raw_key": f"raw/{_JOB_ID}/AAPL_2024.pdf",
    "s3_chunks_key": f"chunks/{_JOB_ID}/chunks.json",
    "pinecone_namespace": "AAPL_2024",
}


class TestSuccessfulAnalysis:
    @patch("lambdas.llm_analyze.handler.analyze_and_save", return_value=None)
    def test_returns_event_plus_completed_status(self, mock_analyze):
        result = lambda_handler(_BASE_EVENT, MockContext())
        assert result["status"] == "COMPLETED"

    @patch("lambdas.llm_analyze.handler.analyze_and_save", return_value=None)
    def test_original_event_fields_preserved(self, mock_analyze):
        result = lambda_handler(_BASE_EVENT, MockContext())
        assert result["job_id"] == _JOB_ID
        assert result["ticker"] == "AAPL"
        assert result["pinecone_namespace"] == "AAPL_2024"

    @patch("lambdas.llm_analyze.handler.analyze_and_save", return_value=None)
    def test_calls_analyze_with_correct_args(self, mock_analyze):
        lambda_handler(_BASE_EVENT, MockContext())
        mock_analyze.assert_called_once_with(
            pinecone_namespace="AAPL_2024",
            ticker="AAPL",
            fiscal_year=2024,
            job_id=_JOB_ID,
        )

    @patch("lambdas.llm_analyze.handler.analyze_and_save", return_value=None)
    def test_fiscal_year_cast_to_int(self, mock_analyze):
        event = {**_BASE_EVENT, "fiscal_year": "2024"}
        lambda_handler(event, MockContext())
        call_kwargs = mock_analyze.call_args[1]
        assert call_kwargs["fiscal_year"] == 2024
        assert isinstance(call_kwargs["fiscal_year"], int)

    @patch("lambdas.llm_analyze.handler.analyze_and_save", return_value=None)
    def test_kr_ticker(self, mock_analyze):
        event = {**_BASE_EVENT, "ticker": "005930", "pinecone_namespace": "005930_2023"}
        result = lambda_handler(event, MockContext())
        call_kwargs = mock_analyze.call_args[1]
        assert call_kwargs["ticker"] == "005930"
        assert call_kwargs["pinecone_namespace"] == "005930_2023"
        assert result["status"] == "COMPLETED"


class TestLLMAnalyzeError:
    @patch(
        "lambdas.llm_analyze.handler.analyze_and_save",
        side_effect=LLMAnalyzeError("Claude API 호출 실패"),
    )
    def test_llm_error_propagates(self, mock_analyze):
        with pytest.raises(LLMAnalyzeError):
            lambda_handler(_BASE_EVENT, MockContext())

    @patch(
        "lambdas.llm_analyze.handler.analyze_and_save",
        side_effect=LLMAnalyzeError("Pinecone 검색 실패"),
    )
    def test_pinecone_error_message_preserved(self, mock_analyze):
        with pytest.raises(LLMAnalyzeError, match="Pinecone 검색 실패"):
            lambda_handler(_BASE_EVENT, MockContext())

    @patch(
        "lambdas.llm_analyze.handler.analyze_and_save",
        side_effect=LLMAnalyzeError("DB 저장 실패"),
    )
    def test_db_error_propagates(self, mock_analyze):
        with pytest.raises(LLMAnalyzeError, match="DB 저장 실패"):
            lambda_handler(_BASE_EVENT, MockContext())

    @patch(
        "lambdas.llm_analyze.handler.analyze_and_save",
        side_effect=LLMAnalyzeError("Claude 응답 JSON 파싱 실패"),
    )
    def test_json_parse_error_propagates(self, mock_analyze):
        with pytest.raises(LLMAnalyzeError, match="JSON 파싱"):
            lambda_handler(_BASE_EVENT, MockContext())
