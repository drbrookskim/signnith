"""EmbedChunks Lambda 핸들러 테스트 (Step Functions State 3)."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from core.qualitative.embedder import EmbedError
from lambdas.embed_chunks.handler import lambda_handler


class MockContext:
    aws_request_id = "test-request-id-embed"


_JOB_ID = "d1e2f3a4-b5c6-7890-def0-123456789012"

_BASE_EVENT = {
    "job_id": _JOB_ID,
    "ticker": "AAPL",
    "market": "US",
    "doc_type": "annual_report",
    "fiscal_year": 2024,
    "s3_raw_key": f"raw/{_JOB_ID}/AAPL_2024.pdf",
    "s3_chunks_key": f"chunks/{_JOB_ID}/chunks.json",
}

_NAMESPACE = "AAPL_2024"


class TestSuccessfulEmbed:
    @patch("lambdas.embed_chunks.handler.embed_and_upsert", return_value=_NAMESPACE)
    def test_returns_event_plus_namespace(self, mock_embed):
        result = lambda_handler(_BASE_EVENT, MockContext())
        assert result["pinecone_namespace"] == _NAMESPACE

    @patch("lambdas.embed_chunks.handler.embed_and_upsert", return_value=_NAMESPACE)
    def test_original_event_fields_preserved(self, mock_embed):
        result = lambda_handler(_BASE_EVENT, MockContext())
        assert result["job_id"] == _JOB_ID
        assert result["ticker"] == "AAPL"
        assert result["s3_chunks_key"] == _BASE_EVENT["s3_chunks_key"]

    @patch("lambdas.embed_chunks.handler.embed_and_upsert", return_value=_NAMESPACE)
    def test_calls_embed_with_correct_args(self, mock_embed):
        lambda_handler(_BASE_EVENT, MockContext())
        mock_embed.assert_called_once_with(
            s3_chunks_key=_BASE_EVENT["s3_chunks_key"],
            ticker="AAPL",
            doc_type="annual_report",
            fiscal_year=2024,
            job_id=_JOB_ID,
        )

    @patch("lambdas.embed_chunks.handler.embed_and_upsert", return_value=_NAMESPACE)
    def test_fiscal_year_cast_to_int(self, mock_embed):
        event = {**_BASE_EVENT, "fiscal_year": "2024"}
        lambda_handler(event, MockContext())
        call_kwargs = mock_embed.call_args[1]
        assert call_kwargs["fiscal_year"] == 2024
        assert isinstance(call_kwargs["fiscal_year"], int)

    @patch("lambdas.embed_chunks.handler.embed_and_upsert", return_value=_NAMESPACE)
    def test_default_doc_type_annual_report(self, mock_embed):
        event = {k: v for k, v in _BASE_EVENT.items() if k != "doc_type"}
        lambda_handler(event, MockContext())
        call_kwargs = mock_embed.call_args[1]
        assert call_kwargs["doc_type"] == "annual_report"

    @patch("lambdas.embed_chunks.handler.embed_and_upsert", return_value="005930_2023")
    def test_kr_ticker_namespace(self, mock_embed):
        event = {**_BASE_EVENT, "ticker": "005930", "market": "KR", "fiscal_year": 2023}
        result = lambda_handler(event, MockContext())
        assert result["pinecone_namespace"] == "005930_2023"


class TestEmbedError:
    @patch(
        "lambdas.embed_chunks.handler.embed_and_upsert",
        side_effect=EmbedError("OpenAI 임베딩 실패"),
    )
    def test_embed_error_propagates(self, mock_embed):
        with pytest.raises(EmbedError):
            lambda_handler(_BASE_EVENT, MockContext())

    @patch(
        "lambdas.embed_chunks.handler.embed_and_upsert",
        side_effect=EmbedError("Pinecone upsert 실패"),
    )
    def test_pinecone_error_message_preserved(self, mock_embed):
        with pytest.raises(EmbedError, match="Pinecone upsert 실패"):
            lambda_handler(_BASE_EVENT, MockContext())

    @patch(
        "lambdas.embed_chunks.handler.embed_and_upsert",
        side_effect=EmbedError("청크 목록이 비어 있습니다."),
    )
    def test_empty_chunks_error_propagates(self, mock_embed):
        with pytest.raises(EmbedError, match="비어"):
            lambda_handler(_BASE_EVENT, MockContext())
