"""ChunkDoc Lambda 핸들러 테스트 (Step Functions State 2)."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from core.qualitative.document_chunker import ChunkError
from lambdas.chunk_doc.handler import lambda_handler


class MockContext:
    aws_request_id = "test-request-id-chunk"


_BASE_EVENT = {
    "job_id": "d1e2f3a4-b5c6-7890-def0-123456789012",
    "ticker": "AAPL",
    "market": "US",
    "doc_type": "annual_report",
    "fiscal_year": 2024,
    "s3_raw_key": "raw/d1e2f3a4-b5c6-7890-def0-123456789012/AAPL_2024.pdf",
}

_CHUNKS_KEY = "chunks/d1e2f3a4-b5c6-7890-def0-123456789012/chunks.json"


class TestSuccessfulChunk:
    @patch("lambdas.chunk_doc.handler.chunk_and_upload", return_value=_CHUNKS_KEY)
    def test_returns_event_plus_chunks_key(self, mock_chunk):
        result = lambda_handler(_BASE_EVENT, MockContext())
        assert result["s3_chunks_key"] == _CHUNKS_KEY

    @patch("lambdas.chunk_doc.handler.chunk_and_upload", return_value=_CHUNKS_KEY)
    def test_original_event_fields_preserved(self, mock_chunk):
        result = lambda_handler(_BASE_EVENT, MockContext())
        assert result["job_id"] == _BASE_EVENT["job_id"]
        assert result["ticker"] == "AAPL"
        assert result["s3_raw_key"] == _BASE_EVENT["s3_raw_key"]
        assert result["fiscal_year"] == 2024

    @patch("lambdas.chunk_doc.handler.chunk_and_upload", return_value=_CHUNKS_KEY)
    def test_calls_chunk_and_upload_with_correct_args(self, mock_chunk):
        lambda_handler(_BASE_EVENT, MockContext())
        mock_chunk.assert_called_once_with(
            s3_raw_key=_BASE_EVENT["s3_raw_key"],
            job_id=_BASE_EVENT["job_id"],
        )

    @patch("lambdas.chunk_doc.handler.chunk_and_upload", return_value=_CHUNKS_KEY)
    def test_kr_ticker_event(self, mock_chunk):
        event = {**_BASE_EVENT, "ticker": "005930", "market": "KR"}
        result = lambda_handler(event, MockContext())
        assert result["ticker"] == "005930"
        assert "s3_chunks_key" in result

    @patch(
        "lambdas.chunk_doc.handler.chunk_and_upload",
        return_value="chunks/other-job/chunks.json",
    )
    def test_chunks_key_from_return_value(self, mock_chunk):
        result = lambda_handler(_BASE_EVENT, MockContext())
        assert result["s3_chunks_key"] == "chunks/other-job/chunks.json"


class TestChunkError:
    @patch(
        "lambdas.chunk_doc.handler.chunk_and_upload",
        side_effect=ChunkError("PDF 텍스트 추출 실패"),
    )
    def test_chunk_error_propagates(self, mock_chunk):
        with pytest.raises(ChunkError):
            lambda_handler(_BASE_EVENT, MockContext())

    @patch(
        "lambdas.chunk_doc.handler.chunk_and_upload",
        side_effect=ChunkError("S3 GetObject 실패"),
    )
    def test_s3_error_message_preserved(self, mock_chunk):
        with pytest.raises(ChunkError, match="S3 GetObject 실패"):
            lambda_handler(_BASE_EVENT, MockContext())

    @patch(
        "lambdas.chunk_doc.handler.chunk_and_upload",
        side_effect=ChunkError("PDF에서 텍스트를 추출하지 못했습니다."),
    )
    def test_empty_text_error_propagates(self, mock_chunk):
        with pytest.raises(ChunkError, match="텍스트"):
            lambda_handler(_BASE_EVENT, MockContext())
