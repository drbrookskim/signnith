"""Step Functions State 2 — S3 PDF 텍스트 추출 및 토큰 청킹."""

from __future__ import annotations

import io
import json
import logging
import os
from typing import Optional

import boto3

logger = logging.getLogger(__name__)

CHUNK_TOKENS = 512
OVERLAP_TOKENS = 50
MAX_CHUNKS = 500  # Step Functions 5분 제한 대응

_s3_client: Optional[object] = None


class ChunkError(Exception):
    """청킹 실패 시 발생합니다."""


def _get_s3():
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client("s3")
    return _s3_client


def chunk_and_upload(s3_raw_key: str, job_id: str) -> str:
    """S3 PDF → 텍스트 추출 → 청킹 → 청크 JSON S3 저장.

    Args:
        s3_raw_key: 원본 PDF S3 키
        job_id: 분석 작업 ID

    Returns:
        청크 JSON이 저장된 S3 키 (chunks/{job_id}/chunks.json)

    Raises:
        ChunkError: 텍스트 추출 또는 청킹 실패 시
    """
    bucket = os.environ["RAG_DOCS_BUCKET"]

    try:
        response = _get_s3().get_object(Bucket=bucket, Key=s3_raw_key)
        pdf_bytes = response["Body"].read()
    except Exception as e:
        raise ChunkError(f"S3 GetObject 실패 ({s3_raw_key}): {e}") from e

    text = _extract_text(pdf_bytes)
    if not text.strip():
        raise ChunkError("PDF에서 텍스트를 추출하지 못했습니다.")

    chunks = _chunk_text(text)
    logger.info("ChunkDoc: %d 청크 생성 (job_id=%s)", len(chunks), job_id)

    chunks_key = f"chunks/{job_id}/chunks.json"
    try:
        _get_s3().put_object(
            Bucket=bucket,
            Key=chunks_key,
            Body=json.dumps(chunks, ensure_ascii=False).encode("utf-8"),
            ContentType="application/json",
        )
    except Exception as e:
        raise ChunkError(f"S3 PutObject 실패 ({chunks_key}): {e}") from e

    return chunks_key


def _extract_text(pdf_bytes: bytes) -> str:
    """pypdf → pdfminer 순서로 PDF에서 텍스트를 추출합니다."""
    try:
        import pypdf

        reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
        parts = [page.extract_text() or "" for page in reader.pages]
        text = "\n".join(parts)
        if text.strip():
            return text
    except Exception:
        pass

    try:
        from pdfminer.high_level import extract_text_to_fp
        from pdfminer.layout import LAParams

        output = io.StringIO()
        extract_text_to_fp(io.BytesIO(pdf_bytes), output, laparams=LAParams())
        return output.getvalue()
    except Exception as e:
        raise ChunkError(f"PDF 텍스트 추출 실패: {e}") from e


def _get_encoding():
    import tiktoken

    return tiktoken.get_encoding("cl100k_base")


def _chunk_text(text: str) -> list[str]:
    """512토큰 슬라이딩 윈도우(50토큰 오버랩)로 텍스트를 청킹합니다."""
    enc = _get_encoding()
    tokens = enc.encode(text)
    chunks: list[str] = []
    start = 0
    while start < len(tokens):
        end = min(start + CHUNK_TOKENS, len(tokens))
        chunks.append(enc.decode(tokens[start:end]))
        if len(chunks) >= MAX_CHUNKS:
            logger.warning("MAX_CHUNKS(%d) 도달 — 청킹 중단", MAX_CHUNKS)
            break
        if end >= len(tokens):
            break
        start = end - OVERLAP_TOKENS
    return chunks
