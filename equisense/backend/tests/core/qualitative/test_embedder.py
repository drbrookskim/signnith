"""embedder 핵심 로직 단위 테스트."""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from core.qualitative.embedder import EmbedError, embed_and_upsert


def _make_fake_embedding(dim: int = 1536) -> list[float]:
    return [0.1] * dim


_CHUNKS = [f"chunk text {i}" for i in range(5)]
_CHUNKS_JSON = json.dumps(_CHUNKS).encode("utf-8")


class TestEmbedAndUpsert:
    @patch.dict(
        "os.environ",
        {
            "RAG_DOCS_BUCKET": "test-bucket",
            "OPENAI_API_KEY": "sk-test",
            "PINECONE_API_KEY": "pc-test",
            "PINECONE_INDEX_NAME": "equisense-rag",
        },
    )
    @patch("core.qualitative.embedder._get_s3")
    @patch("core.qualitative.embedder._embed_chunks")
    @patch("core.qualitative.embedder._upsert_to_pinecone")
    def test_returns_correct_namespace(self, mock_upsert, mock_embed, mock_s3_factory):
        mock_s3 = MagicMock()
        mock_s3.get_object.return_value = {"Body": MagicMock(read=lambda: _CHUNKS_JSON)}
        mock_s3_factory.return_value = mock_s3
        mock_embed.return_value = [_make_fake_embedding()] * len(_CHUNKS)

        result = embed_and_upsert(
            s3_chunks_key="chunks/job123/chunks.json",
            ticker="AAPL",
            doc_type="annual_report",
            fiscal_year=2024,
            job_id="job123",
        )
        assert result == "AAPL_2024"

    @patch.dict(
        "os.environ",
        {
            "RAG_DOCS_BUCKET": "test-bucket",
            "OPENAI_API_KEY": "sk-test",
            "PINECONE_API_KEY": "pc-test",
            "PINECONE_INDEX_NAME": "equisense-rag",
        },
    )
    @patch("core.qualitative.embedder._get_s3")
    def test_s3_get_failure_raises_embed_error(self, mock_s3_factory):
        mock_s3 = MagicMock()
        mock_s3.get_object.side_effect = Exception("접근 거부")
        mock_s3_factory.return_value = mock_s3

        with pytest.raises(EmbedError, match="S3 GetObject 실패"):
            embed_and_upsert(
                s3_chunks_key="chunks/job/chunks.json",
                ticker="AAPL",
                doc_type="annual_report",
                fiscal_year=2024,
                job_id="job123",
            )

    @patch.dict(
        "os.environ",
        {
            "RAG_DOCS_BUCKET": "test-bucket",
            "OPENAI_API_KEY": "sk-test",
            "PINECONE_API_KEY": "pc-test",
            "PINECONE_INDEX_NAME": "equisense-rag",
        },
    )
    @patch("core.qualitative.embedder._get_s3")
    def test_empty_chunks_raises_embed_error(self, mock_s3_factory):
        mock_s3 = MagicMock()
        mock_s3.get_object.return_value = {
            "Body": MagicMock(read=lambda: json.dumps([]).encode("utf-8"))
        }
        mock_s3_factory.return_value = mock_s3

        with pytest.raises(EmbedError, match="비어"):
            embed_and_upsert(
                s3_chunks_key="chunks/job/chunks.json",
                ticker="AAPL",
                doc_type="annual_report",
                fiscal_year=2024,
                job_id="job123",
            )

    @patch.dict(
        "os.environ",
        {
            "RAG_DOCS_BUCKET": "test-bucket",
            "OPENAI_API_KEY": "sk-test",
            "PINECONE_API_KEY": "pc-test",
            "PINECONE_INDEX_NAME": "equisense-rag",
        },
    )
    @patch("core.qualitative.embedder._get_s3")
    @patch("core.qualitative.embedder._embed_chunks")
    @patch("core.qualitative.embedder._upsert_to_pinecone")
    def test_kr_ticker_namespace_format(self, mock_upsert, mock_embed, mock_s3_factory):
        mock_s3 = MagicMock()
        mock_s3.get_object.return_value = {"Body": MagicMock(read=lambda: _CHUNKS_JSON)}
        mock_s3_factory.return_value = mock_s3
        mock_embed.return_value = [_make_fake_embedding()] * len(_CHUNKS)

        result = embed_and_upsert(
            s3_chunks_key="chunks/job/chunks.json",
            ticker="005930",
            doc_type="annual_report",
            fiscal_year=2023,
            job_id="job456",
        )
        assert result == "005930_2023"

    @patch.dict(
        "os.environ",
        {
            "RAG_DOCS_BUCKET": "test-bucket",
            "OPENAI_API_KEY": "sk-test",
            "PINECONE_API_KEY": "pc-test",
            "PINECONE_INDEX_NAME": "equisense-rag",
        },
    )
    @patch("core.qualitative.embedder._get_s3")
    @patch("core.qualitative.embedder._embed_chunks")
    @patch("core.qualitative.embedder._upsert_to_pinecone")
    def test_upsert_called_with_correct_metadata(self, mock_upsert, mock_embed, mock_s3_factory):
        mock_s3 = MagicMock()
        mock_s3.get_object.return_value = {"Body": MagicMock(read=lambda: _CHUNKS_JSON)}
        mock_s3_factory.return_value = mock_s3
        embeddings = [_make_fake_embedding()] * len(_CHUNKS)
        mock_embed.return_value = embeddings

        embed_and_upsert(
            s3_chunks_key="chunks/job/chunks.json",
            ticker="AAPL",
            doc_type="annual_report",
            fiscal_year=2024,
            job_id="job123",
        )

        mock_upsert.assert_called_once()
        kwargs = mock_upsert.call_args[1]
        assert kwargs["ticker"] == "AAPL"
        assert kwargs["doc_type"] == "annual_report"
        assert kwargs["fiscal_year"] == 2024
        assert kwargs["namespace"] == "AAPL_2024"
