"""llm_analyzer 핵심 로직 단위 테스트 (anthropic/openai/pinecone mocked via sys.modules)."""

from __future__ import annotations

import json
import sys
from unittest.mock import MagicMock, patch

import pytest

# 테스트 환경에서 설치되지 않은 Lambda 의존성을 사전 mock
for _mod in ("anthropic", "openai", "pinecone"):
    sys.modules.setdefault(_mod, MagicMock())

from core.qualitative.llm_analyzer import (  # noqa: E402
    ANALYSIS_QUERIES,
    LLMAnalyzeError,
    _call_claude,
    analyze_and_save,
)

_FAKE_RESULT = {
    "integrity_score": 75,
    "summary_ko": "경영진은 대부분의 목표를 달성했습니다.",
    "risk_factors": [{"title": "금리 상승", "description": "이자 비용 증가", "severity": "medium"}],
    "growth_drivers": [{"title": "클라우드 확장", "description": "AWS 매출 성장"}],
    "noise_filter": [
        {"claim": "시장 1위 달성", "is_substantiated": True, "evidence": "점유율 데이터"}
    ],
}


class TestAnalyzeAndSave:
    @patch("core.qualitative.llm_analyzer._embed_queries")
    @patch("core.qualitative.llm_analyzer._retrieve_context")
    @patch("core.qualitative.llm_analyzer._call_claude")
    @patch("core.qualitative.llm_analyzer._persist")
    def test_calls_all_stages_in_order(self, mock_persist, mock_claude, mock_retrieve, mock_embed):
        fake_emb = [[0.1] * 1536] * 3
        mock_embed.return_value = fake_emb
        mock_retrieve.return_value = ["chunk1", "chunk2"]
        mock_claude.return_value = _FAKE_RESULT

        analyze_and_save(
            pinecone_namespace="AAPL_2024",
            ticker="AAPL",
            fiscal_year=2024,
            job_id="job123",
        )

        mock_embed.assert_called_once_with(ANALYSIS_QUERIES)
        mock_retrieve.assert_called_once_with(
            query_embeddings=fake_emb,
            namespace="AAPL_2024",
        )
        mock_claude.assert_called_once_with(
            context_chunks=["chunk1", "chunk2"],
            ticker="AAPL",
            fiscal_year=2024,
        )
        mock_persist.assert_called_once_with(
            job_id="job123",
            ticker="AAPL",
            fiscal_year=2024,
            result=_FAKE_RESULT,
        )

    @patch("core.qualitative.llm_analyzer._embed_queries")
    def test_embed_failure_raises_llm_analyze_error(self, mock_embed):
        mock_embed.side_effect = LLMAnalyzeError("쿼리 임베딩 실패")
        with pytest.raises(LLMAnalyzeError, match="쿼리 임베딩 실패"):
            analyze_and_save(
                pinecone_namespace="AAPL_2024",
                ticker="AAPL",
                fiscal_year=2024,
                job_id="job123",
            )

    @patch("core.qualitative.llm_analyzer._embed_queries")
    @patch("core.qualitative.llm_analyzer._retrieve_context")
    def test_pinecone_failure_raises_llm_analyze_error(self, mock_retrieve, mock_embed):
        mock_embed.return_value = [[0.1] * 1536] * 3
        mock_retrieve.side_effect = LLMAnalyzeError("Pinecone 검색 실패")
        with pytest.raises(LLMAnalyzeError, match="Pinecone"):
            analyze_and_save(
                pinecone_namespace="AAPL_2024",
                ticker="AAPL",
                fiscal_year=2024,
                job_id="job123",
            )


class TestCallClaude:
    @patch.dict("os.environ", {"ANTHROPIC_API_KEY": "test-key"})
    def test_parses_valid_json_response(self):
        mock_client = MagicMock()
        mock_message = MagicMock()
        mock_message.content = [MagicMock(text=json.dumps(_FAKE_RESULT))]
        mock_client.messages.create.return_value = mock_message

        mock_anthropic = MagicMock()
        mock_anthropic.Anthropic.return_value = mock_client

        with patch.dict("sys.modules", {"anthropic": mock_anthropic}):
            result = _call_claude(context_chunks=["chunk"], ticker="AAPL", fiscal_year=2024)

        assert result["integrity_score"] == 75
        assert result["summary_ko"] == "경영진은 대부분의 목표를 달성했습니다."

    @patch.dict("os.environ", {"ANTHROPIC_API_KEY": "test-key"})
    def test_strips_markdown_code_fence(self):
        mock_client = MagicMock()
        raw = f"```json\n{json.dumps(_FAKE_RESULT)}\n```"
        mock_client.messages.create.return_value = MagicMock(content=[MagicMock(text=raw)])
        mock_anthropic = MagicMock()
        mock_anthropic.Anthropic.return_value = mock_client

        with patch.dict("sys.modules", {"anthropic": mock_anthropic}):
            result = _call_claude(context_chunks=["chunk"], ticker="AAPL", fiscal_year=2024)
        assert result["integrity_score"] == 75

    @patch.dict("os.environ", {"ANTHROPIC_API_KEY": "test-key"})
    def test_invalid_json_raises_llm_analyze_error(self):
        mock_client = MagicMock()
        mock_client.messages.create.return_value = MagicMock(
            content=[MagicMock(text="이것은 JSON이 아닙니다")]
        )
        mock_anthropic = MagicMock()
        mock_anthropic.Anthropic.return_value = mock_client

        with patch.dict("sys.modules", {"anthropic": mock_anthropic}):
            with pytest.raises(LLMAnalyzeError, match="JSON 파싱"):
                _call_claude(context_chunks=["chunk"], ticker="AAPL", fiscal_year=2024)

    @patch.dict("os.environ", {"ANTHROPIC_API_KEY": "test-key"})
    def test_api_exception_raises_llm_analyze_error(self):
        mock_client = MagicMock()
        mock_client.messages.create.side_effect = Exception("API 오류")
        mock_anthropic = MagicMock()
        mock_anthropic.Anthropic.return_value = mock_client

        with patch.dict("sys.modules", {"anthropic": mock_anthropic}):
            with pytest.raises(LLMAnalyzeError, match="Claude API 호출 실패"):
                _call_claude(context_chunks=["chunk"], ticker="AAPL", fiscal_year=2024)


class TestAnalysisQueries:
    def test_three_analysis_queries_defined(self):
        assert len(ANALYSIS_QUERIES) == 3

    def test_queries_are_nonempty_strings(self):
        for q in ANALYSIS_QUERIES:
            assert isinstance(q, str)
            assert len(q) > 0
