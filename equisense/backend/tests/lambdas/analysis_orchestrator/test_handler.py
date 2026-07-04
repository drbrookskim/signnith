"""AnalysisOrchestrator Lambda 핸들러 테스트."""

from __future__ import annotations

import json
from unittest.mock import patch

import pytest

from lambdas.analysis_orchestrator.handler import DAILY_LIMIT, lambda_handler


class MockContext:
    aws_request_id = "test-request-id-orch"


def _event(
    ticker: str, market: str, fiscal_year: int = 2024, doc_type: str = "annual_report"
) -> dict:
    return {
        "pathParameters": {"ticker": ticker},
        "body": json.dumps({"market": market, "fiscal_year": fiscal_year, "doc_type": doc_type}),
    }


# ---------------------------------------------------------------------------
# 정상 흐름
# ---------------------------------------------------------------------------


class TestSuccessfulTrigger:
    @patch("lambdas.analysis_orchestrator.handler._enqueue_job")
    @patch("lambdas.analysis_orchestrator.handler.create_job", return_value="job-uuid-1234")
    @patch("lambdas.analysis_orchestrator.handler.count_jobs_today", return_value=0)
    def test_returns_202(self, mock_count, mock_create, mock_enqueue):
        response = lambda_handler(_event("AAPL", "US"), MockContext())
        assert response["statusCode"] == 202

    @patch("lambdas.analysis_orchestrator.handler._enqueue_job")
    @patch("lambdas.analysis_orchestrator.handler.create_job", return_value="job-uuid-1234")
    @patch("lambdas.analysis_orchestrator.handler.count_jobs_today", return_value=0)
    def test_response_contains_job_id(self, mock_count, mock_create, mock_enqueue):
        response = lambda_handler(_event("AAPL", "US"), MockContext())
        body = json.loads(response["body"])
        assert body["job_id"] == "job-uuid-1234"
        assert body["status"] == "PENDING"
        assert "estimated_seconds" in body

    @patch("lambdas.analysis_orchestrator.handler._enqueue_job")
    @patch("lambdas.analysis_orchestrator.handler.create_job", return_value="kr-job-uuid")
    @patch("lambdas.analysis_orchestrator.handler.count_jobs_today", return_value=0)
    def test_kr_ticker_returns_202(self, mock_count, mock_create, mock_enqueue):
        response = lambda_handler(_event("005930", "KR"), MockContext())
        assert response["statusCode"] == 202

    @patch("lambdas.analysis_orchestrator.handler._enqueue_job")
    @patch("lambdas.analysis_orchestrator.handler.create_job", return_value="job-uuid-1234")
    @patch("lambdas.analysis_orchestrator.handler.count_jobs_today", return_value=0)
    def test_create_job_called_with_correct_params(self, mock_count, mock_create, mock_enqueue):
        lambda_handler(_event("AAPL", "US", 2023, "earnings_call"), MockContext())
        mock_create.assert_called_once_with("AAPL", "US", "earnings_call", 2023)

    @patch("lambdas.analysis_orchestrator.handler._enqueue_job")
    @patch("lambdas.analysis_orchestrator.handler.create_job", return_value="job-uuid-1234")
    @patch("lambdas.analysis_orchestrator.handler.count_jobs_today", return_value=0)
    def test_enqueue_called_with_job_id(self, mock_count, mock_create, mock_enqueue):
        lambda_handler(_event("AAPL", "US"), MockContext())
        mock_enqueue.assert_called_once()
        call_args = mock_enqueue.call_args[0]
        assert call_args[0] == "job-uuid-1234"

    @patch("lambdas.analysis_orchestrator.handler._enqueue_job")
    @patch("lambdas.analysis_orchestrator.handler.create_job", return_value="job-uuid-1234")
    @patch("lambdas.analysis_orchestrator.handler.count_jobs_today", return_value=0)
    def test_lowercase_ticker_normalized(self, mock_count, mock_create, mock_enqueue):
        lambda_handler(_event("aapl", "us"), MockContext())
        mock_create.assert_called_once()
        assert mock_create.call_args[0][0] == "AAPL"


# ---------------------------------------------------------------------------
# 입력 검증 (400)
# ---------------------------------------------------------------------------


class TestInputValidation:
    @pytest.mark.parametrize(
        "ticker,market,fiscal_year,doc_type",
        [
            ("TOOLONG", "US", 2024, "annual_report"),
            ("12345", "KR", 2024, "annual_report"),
            ("AAPL", "JP", 2024, "annual_report"),
            ("AAPL", "US", 2024, "quarterly_report"),  # 허용 안 되는 doc_type
            ("AAPL", "US", 2009, "annual_report"),  # fiscal_year 범위 밖
            ("AAPL", "US", 2031, "annual_report"),
        ],
    )
    def test_invalid_input_returns_400(self, ticker, market, fiscal_year, doc_type):
        response = lambda_handler(_event(ticker, market, fiscal_year, doc_type), MockContext())
        assert response["statusCode"] == 400
        body = json.loads(response["body"])
        assert body["error"]["code"] == "INVALID_PARAMS"

    def test_missing_body_returns_400(self):
        event = {"pathParameters": {"ticker": "AAPL"}, "body": None}
        response = lambda_handler(event, MockContext())
        assert response["statusCode"] == 400

    def test_missing_ticker_returns_400(self):
        event = {
            "pathParameters": None,
            "body": json.dumps({"market": "US", "fiscal_year": 2024}),
        }
        response = lambda_handler(event, MockContext())
        assert response["statusCode"] == 400


# ---------------------------------------------------------------------------
# 일별 제한 (429)
# ---------------------------------------------------------------------------


class TestRateLimit:
    @patch("lambdas.analysis_orchestrator.handler.count_jobs_today", return_value=DAILY_LIMIT)
    def test_rate_limit_returns_429(self, mock_count):
        response = lambda_handler(_event("AAPL", "US"), MockContext())
        assert response["statusCode"] == 429
        body = json.loads(response["body"])
        assert body["error"]["code"] == "RATE_LIMIT_EXCEEDED"

    @patch("lambdas.analysis_orchestrator.handler._enqueue_job")
    @patch("lambdas.analysis_orchestrator.handler.create_job", return_value="job-id")
    @patch(
        "lambdas.analysis_orchestrator.handler.count_jobs_today",
        return_value=DAILY_LIMIT - 1,
    )
    def test_below_limit_returns_202(self, mock_count, mock_create, mock_enqueue):
        response = lambda_handler(_event("AAPL", "US"), MockContext())
        assert response["statusCode"] == 202


# ---------------------------------------------------------------------------
# DB / SQS 오류 (503)
# ---------------------------------------------------------------------------


class TestServiceErrors:
    @patch(
        "lambdas.analysis_orchestrator.handler.count_jobs_today",
        side_effect=Exception("db conn failed"),
    )
    def test_db_error_on_rate_limit_check_returns_503(self, mock_count):
        response = lambda_handler(_event("AAPL", "US"), MockContext())
        assert response["statusCode"] == 503
        body = json.loads(response["body"])
        assert body["error"]["code"] == "DB_ERROR"

    @patch(
        "lambdas.analysis_orchestrator.handler.create_job",
        side_effect=Exception("db insert failed"),
    )
    @patch("lambdas.analysis_orchestrator.handler.count_jobs_today", return_value=0)
    def test_db_error_on_create_returns_503(self, mock_count, mock_create):
        response = lambda_handler(_event("AAPL", "US"), MockContext())
        assert response["statusCode"] == 503

    @patch(
        "lambdas.analysis_orchestrator.handler._enqueue_job",
        side_effect=Exception("sqs timeout"),
    )
    @patch("lambdas.analysis_orchestrator.handler.create_job", return_value="job-id")
    @patch("lambdas.analysis_orchestrator.handler.count_jobs_today", return_value=0)
    def test_sqs_error_returns_503(self, mock_count, mock_create, mock_enqueue):
        response = lambda_handler(_event("AAPL", "US"), MockContext())
        assert response["statusCode"] == 503
        body = json.loads(response["body"])
        assert body["error"]["code"] == "QUEUE_ERROR"
