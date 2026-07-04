"""RAGTrigger Lambda 핸들러 테스트."""

from __future__ import annotations

import json
from unittest.mock import patch

import pytest

from lambdas.rag_trigger.handler import lambda_handler


class MockContext:
    aws_request_id = "test-request-id-rag"


_JOB_ID = "c1d2e3f4-a5b6-7890-cdef-012345678901"


def _sqs_event(job_id: str = _JOB_ID, ticker: str = "AAPL", market: str = "US") -> dict:
    payload = {"job_id": job_id, "ticker": ticker, "market": market, "fiscal_year": 2024}
    return {"Records": [{"body": json.dumps(payload)}]}


# ---------------------------------------------------------------------------
# 정상 흐름
# ---------------------------------------------------------------------------


class TestSuccessfulProcessing:
    @patch("lambdas.rag_trigger.handler._start_step_functions", return_value="arn:aws:states::exec")
    @patch("lambdas.rag_trigger.handler.update_job_status")
    def test_status_updated_to_processing(self, mock_update, mock_sfn):
        lambda_handler(_sqs_event(), MockContext())
        mock_update.assert_any_call(_JOB_ID, "PROCESSING")

    @patch("lambdas.rag_trigger.handler._start_step_functions", return_value="arn:aws:states::exec")
    @patch("lambdas.rag_trigger.handler.update_job_status")
    def test_step_functions_started(self, mock_update, mock_sfn):
        lambda_handler(_sqs_event(), MockContext())
        mock_sfn.assert_called_once()
        call_payload = mock_sfn.call_args[0][0]
        assert call_payload["job_id"] == _JOB_ID

    @patch("lambdas.rag_trigger.handler._start_step_functions", return_value="arn:aws:states::exec")
    @patch("lambdas.rag_trigger.handler.update_job_status")
    def test_processing_update_before_sfn(self, mock_update, mock_sfn):
        """PROCESSING 상태 업데이트가 Step Functions 실행보다 먼저 일어나야 합니다."""
        call_order = []
        mock_update.side_effect = lambda *a, **kw: call_order.append("update")
        mock_sfn.side_effect = lambda *a, **kw: call_order.append("sfn") or "arn"

        lambda_handler(_sqs_event(), MockContext())
        assert call_order.index("update") < call_order.index("sfn")

    @patch("lambdas.rag_trigger.handler._start_step_functions", return_value="arn:aws:states::exec")
    @patch("lambdas.rag_trigger.handler.update_job_status")
    def test_kr_ticker_processed(self, mock_update, mock_sfn):
        lambda_handler(_sqs_event(ticker="005930", market="KR"), MockContext())
        mock_sfn.assert_called_once()

    @patch("lambdas.rag_trigger.handler._start_step_functions", return_value="arn:aws:states::exec")
    @patch("lambdas.rag_trigger.handler.update_job_status")
    def test_empty_records_no_error(self, mock_update, mock_sfn):
        lambda_handler({"Records": []}, MockContext())
        mock_update.assert_not_called()
        mock_sfn.assert_not_called()


# ---------------------------------------------------------------------------
# DB 오류 — SQS 재처리 유도
# ---------------------------------------------------------------------------


class TestDbError:
    @patch("lambdas.rag_trigger.handler.update_job_status", side_effect=Exception("db timeout"))
    def test_db_error_raises_for_sqs_retry(self, mock_update):
        with pytest.raises(Exception, match="db timeout"):
            lambda_handler(_sqs_event(), MockContext())

    @patch("lambdas.rag_trigger.handler.update_job_status", side_effect=Exception("db timeout"))
    def test_sfn_not_called_if_db_fails(self, mock_update):
        with pytest.raises(Exception):
            lambda_handler(_sqs_event(), MockContext())


# ---------------------------------------------------------------------------
# Step Functions 오류 — FAILED 상태 기록 후 재처리 유도
# ---------------------------------------------------------------------------


class TestStepFunctionsError:
    @patch(
        "lambdas.rag_trigger.handler._start_step_functions",
        side_effect=Exception("sfn throttle"),
    )
    @patch("lambdas.rag_trigger.handler.update_job_status")
    def test_sfn_error_raises_for_sqs_retry(self, mock_update, mock_sfn):
        with pytest.raises(Exception, match="sfn throttle"):
            lambda_handler(_sqs_event(), MockContext())

    @patch(
        "lambdas.rag_trigger.handler._start_step_functions",
        side_effect=Exception("sfn throttle"),
    )
    @patch("lambdas.rag_trigger.handler.update_job_status")
    def test_sfn_error_marks_job_failed(self, mock_update, mock_sfn):
        with pytest.raises(Exception):
            lambda_handler(_sqs_event(), MockContext())

        failed_calls = [c for c in mock_update.call_args_list if c[0][1] == "FAILED"]
        assert len(failed_calls) == 1
        assert _JOB_ID in failed_calls[0][0]
