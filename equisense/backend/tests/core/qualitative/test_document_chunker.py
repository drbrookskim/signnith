"""document_chunker 핵심 로직 단위 테스트 (tiktoken/pypdf mocked)."""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# tiktoken mock 설정 — _get_encoding()이 호출하는 tiktoken을 전역 mock
# ---------------------------------------------------------------------------


def _make_fake_encoding():
    """각 문자를 단일 토큰으로 취급하는 간단한 mock encoder를 반환합니다."""
    enc = MagicMock()
    enc.encode.side_effect = lambda text: list(range(len(text)))  # 문자 수 = 토큰 수
    enc.decode.side_effect = lambda tokens: "x" * len(tokens)
    return enc


@pytest.fixture(autouse=True)
def mock_tiktoken(monkeypatch):
    """모든 테스트에서 tiktoken을 mock합니다."""
    fake_enc = _make_fake_encoding()
    monkeypatch.setattr(
        "core.qualitative.document_chunker._get_encoding",
        lambda: fake_enc,
    )
    return fake_enc


# ---------------------------------------------------------------------------
# import after fixture setup
# ---------------------------------------------------------------------------

from core.qualitative.document_chunker import (  # noqa: E402
    CHUNK_TOKENS,
    MAX_CHUNKS,
    ChunkError,
    _chunk_text,
    _extract_text,
    chunk_and_upload,
)

# ---------------------------------------------------------------------------
# _chunk_text 청킹 로직
# ---------------------------------------------------------------------------


class TestChunkText:
    def test_short_text_produces_single_chunk(self):
        # 10자 = 10토큰 < 512 → 단일 청크
        chunks = _chunk_text("a" * 10)
        assert len(chunks) == 1

    def test_empty_text_produces_no_chunks(self):
        chunks = _chunk_text("")
        assert chunks == []

    def test_long_text_produces_multiple_chunks(self):
        # CHUNK_TOKENS(512) + 1자 → 2개 청크
        chunks = _chunk_text("a" * (CHUNK_TOKENS + 1))
        assert len(chunks) >= 2

    def test_max_chunks_limit(self):
        # MAX_CHUNKS * CHUNK_TOKENS 를 훨씬 초과하는 텍스트
        chunks = _chunk_text("a" * (MAX_CHUNKS * CHUNK_TOKENS + 1000))
        assert len(chunks) <= MAX_CHUNKS

    def test_overlap_produces_more_chunks_than_non_overlap(self):
        # 512 * 2 = 1024자 텍스트는 오버랩 없으면 2청크, 오버랩 있으면 ≥2청크
        chunks = _chunk_text("a" * (CHUNK_TOKENS * 2))
        assert len(chunks) >= 2

    def test_each_chunk_within_token_limit(self):
        chunks = _chunk_text("a" * (CHUNK_TOKENS * 3))
        for chunk in chunks:
            # mock encoder: len(chunk) = 토큰 수
            assert len(chunk) <= CHUNK_TOKENS


# ---------------------------------------------------------------------------
# _extract_text — pypdf 폴백 흐름
# ---------------------------------------------------------------------------


class TestExtractText:
    def test_raises_chunk_error_when_both_extractors_fail(self):
        with patch.dict(
            "sys.modules",
            {"pypdf": None, "pdfminer": None, "pdfminer.high_level": None},
        ):
            with pytest.raises((ChunkError, Exception)):
                _extract_text(b"not a pdf")

    def test_pypdf_result_returned_when_nonempty(self):
        mock_page = MagicMock()
        mock_page.extract_text.return_value = "Sample text from PDF"
        mock_reader = MagicMock()
        mock_reader.pages = [mock_page]
        mock_pypdf = MagicMock()
        mock_pypdf.PdfReader.return_value = mock_reader

        with patch.dict("sys.modules", {"pypdf": mock_pypdf}):
            text = _extract_text(b"%PDF-fake")
        assert "Sample text" in text

    def test_falls_back_to_pdfminer_when_pypdf_returns_empty(self):
        mock_page = MagicMock()
        mock_page.extract_text.return_value = ""
        mock_reader = MagicMock()
        mock_reader.pages = [mock_page]
        mock_pypdf = MagicMock()
        mock_pypdf.PdfReader.return_value = mock_reader

        mock_pdfminer_hl = MagicMock()

        def fake_extract(src, out, laparams=None):
            out.write("Fallback text from pdfminer")

        mock_pdfminer_hl.extract_text_to_fp.side_effect = fake_extract
        mock_pdfminer_layout = MagicMock()
        mock_pdfminer_layout.LAParams.return_value = MagicMock()

        with patch.dict(
            "sys.modules",
            {
                "pypdf": mock_pypdf,
                "pdfminer": MagicMock(),
                "pdfminer.high_level": mock_pdfminer_hl,
                "pdfminer.layout": mock_pdfminer_layout,
            },
        ):
            text = _extract_text(b"%PDF-fake")
        assert "Fallback" in text


# ---------------------------------------------------------------------------
# chunk_and_upload 통합 흐름 (S3 mock)
# ---------------------------------------------------------------------------


class TestChunkAndUpload:
    @patch.dict("os.environ", {"RAG_DOCS_BUCKET": "test-bucket"})
    @patch("core.qualitative.document_chunker._chunk_text", return_value=["chunk1", "chunk2"])
    @patch("core.qualitative.document_chunker._extract_text", return_value="Hello world text")
    @patch("core.qualitative.document_chunker._get_s3")
    def test_returns_correct_s3_key(self, mock_s3_factory, mock_extract, mock_chunk):
        mock_s3 = MagicMock()
        mock_s3.get_object.return_value = {"Body": MagicMock(read=lambda: b"%PDF-fake")}
        mock_s3.put_object.return_value = {}
        mock_s3_factory.return_value = mock_s3

        result = chunk_and_upload(s3_raw_key="raw/job123/AAPL_2024.pdf", job_id="job123")
        assert result == "chunks/job123/chunks.json"

    @patch.dict("os.environ", {"RAG_DOCS_BUCKET": "test-bucket"})
    @patch("core.qualitative.document_chunker._get_s3")
    def test_s3_get_failure_raises_chunk_error(self, mock_s3_factory):
        mock_s3 = MagicMock()
        mock_s3.get_object.side_effect = Exception("S3 접근 거부")
        mock_s3_factory.return_value = mock_s3

        with pytest.raises(ChunkError, match="S3 GetObject 실패"):
            chunk_and_upload(s3_raw_key="raw/job/file.pdf", job_id="job123")

    @patch.dict("os.environ", {"RAG_DOCS_BUCKET": "test-bucket"})
    @patch("core.qualitative.document_chunker._extract_text", return_value="   ")
    @patch("core.qualitative.document_chunker._get_s3")
    def test_empty_text_raises_chunk_error(self, mock_s3_factory, mock_extract):
        mock_s3 = MagicMock()
        mock_s3.get_object.return_value = {"Body": MagicMock(read=lambda: b"%PDF-fake")}
        mock_s3_factory.return_value = mock_s3

        with pytest.raises(ChunkError, match="텍스트를 추출하지 못했습니다"):
            chunk_and_upload(s3_raw_key="raw/job/file.pdf", job_id="job123")

    @patch.dict("os.environ", {"RAG_DOCS_BUCKET": "test-bucket"})
    @patch("core.qualitative.document_chunker._chunk_text", return_value=["chunk1"])
    @patch("core.qualitative.document_chunker._extract_text", return_value="Good text content")
    @patch("core.qualitative.document_chunker._get_s3")
    def test_s3_put_failure_raises_chunk_error(self, mock_s3_factory, mock_extract, mock_chunk):
        mock_s3 = MagicMock()
        mock_s3.get_object.return_value = {"Body": MagicMock(read=lambda: b"%PDF-fake")}
        mock_s3.put_object.side_effect = Exception("S3 쓰기 실패")
        mock_s3_factory.return_value = mock_s3

        with pytest.raises(ChunkError, match="S3 PutObject 실패"):
            chunk_and_upload(s3_raw_key="raw/job/file.pdf", job_id="job123")

    @patch.dict("os.environ", {"RAG_DOCS_BUCKET": "test-bucket"})
    @patch("core.qualitative.document_chunker._chunk_text", return_value=["chunk1", "chunk2"])
    @patch("core.qualitative.document_chunker._extract_text", return_value="Hello world text")
    @patch("core.qualitative.document_chunker._get_s3")
    def test_chunks_uploaded_as_valid_json(self, mock_s3_factory, mock_extract, mock_chunk):
        mock_s3 = MagicMock()
        mock_s3.get_object.return_value = {"Body": MagicMock(read=lambda: b"%PDF-fake")}
        mock_s3_factory.return_value = mock_s3

        chunk_and_upload(s3_raw_key="raw/job/file.pdf", job_id="job123")

        put_call = mock_s3.put_object.call_args
        body = put_call[1]["Body"]
        parsed = json.loads(body.decode("utf-8"))
        assert isinstance(parsed, list)
        assert parsed == ["chunk1", "chunk2"]
