"""GetJobStatus Lambda 핸들러 테스트."""

from __future__ import annotations

import json
from datetime import datetime
from unittest.mock import patch

import pytest

from core.qualitative.models import AnalysisJob, JobStatus, QualitativeResult
from lambdas.get_job_status.handler import lambda_handler


class MockContext:
    aws_request_id = "test-request-id-job"


_VALID_JOB_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
_VALID_JOB_ID_2 = "b2c3d4e5-f6a7-8901-bcde-f01234567891"


def _make_job(status: str = "PENDING", error_message: str | None = None) -> AnalysisJob:
    return AnalysisJob(
        id=_VALID_JOB_ID,
        ticker="AAPL",
        market="US",
        doc_type="annual_report",
        fiscal_year=2024,
        status=JobStatus(status),
        retry_count=0,
        error_message=error_message,
        created_at=datetime(2024, 1, 1).isoformat(),
        updated_at=datetime(2024, 1, 1).isoformat(),
    )


def _make_qual_result() -> QualitativeResult:
    return QualitativeResult(
        id="res-uuid-001",
        job_id=_VALID_JOB_ID,
        ticker="AAPL",
        fiscal_period="2024",
        integrity_score=85,
        summary_ko="사업보고서 요약입니다.",
        risk_factors=[{"title": "경쟁 심화", "severity": "high", "description": ""}],
        growth_drivers=[{"title": "신제품 출시", "description": ""}],
        noise_filter=[{"claim": "일회성 비용", "is_substantiated": False, "evidence": ""}],
        created_at=datetime(2024, 1, 1).isoformat(),
    )


def _event(job_id: str) -> dict:
    return {"pathParameters": {"job_id": job_id}}


# ---------------------------------------------------------------------------
# 정상 흐름
# ---------------------------------------------------------------------------


class TestSuccessfulLookup:
    @patch("lambdas.get_job_status.handler.get_job", return_value=(_make_job("PENDING"), None))
    def test_pending_job_returns_200(self, mock_get):
        response = lambda_handler(_event(_VALID_JOB_ID), MockContext())
        assert response["statusCode"] == 200

    @patch("lambdas.get_job_status.handler.get_job", return_value=(_make_job("PENDING"), None))
    def test_pending_job_body_has_status(self, mock_get):
        response = lambda_handler(_event(_VALID_JOB_ID), MockContext())
        body = json.loads(response["body"])
        assert body["status"] == "PENDING"
        assert body["job_id"] == _VALID_JOB_ID
        assert body["result"] is None

    @patch("lambdas.get_job_status.handler.get_job", return_value=(_make_job("PROCESSING"), None))
    def test_processing_job_returns_200(self, mock_get):
        response = lambda_handler(_event(_VALID_JOB_ID), MockContext())
        assert response["statusCode"] == 200
        body = json.loads(response["body"])
        assert body["status"] == "PROCESSING"

    @patch(
        "lambdas.get_job_status.handler.get_job",
        return_value=(_make_job("COMPLETED"), _make_qual_result()),
    )
    def test_completed_job_returns_result(self, mock_get):
        response = lambda_handler(_event(_VALID_JOB_ID), MockContext())
        assert response["statusCode"] == 200
        body = json.loads(response["body"])
        assert body["status"] == "COMPLETED"
        assert body["result"] is not None
        assert body["result"]["integrity_score"] == 85
        assert body["result"]["ticker"] == "AAPL"

    @patch(
        "lambdas.get_job_status.handler.get_job",
        return_value=(_make_job("FAILED", "fetch error: timeout"), None),
    )
    def test_failed_job_returns_error_field(self, mock_get):
        response = lambda_handler(_event(_VALID_JOB_ID), MockContext())
        body = json.loads(response["body"])
        assert body["status"] == "FAILED"
        assert body["error"] == "fetch error: timeout"
        assert body["result"] is None

    @patch("lambdas.get_job_status.handler.get_job", return_value=(_make_job("PENDING"), None))
    def test_error_field_none_for_non_failed(self, mock_get):
        response = lambda_handler(_event(_VALID_JOB_ID), MockContext())
        body = json.loads(response["body"])
        assert body["error"] is None


# ---------------------------------------------------------------------------
# 입력 검증 (400)
# ---------------------------------------------------------------------------


class TestInputValidation:
    @pytest.mark.parametrize(
        "job_id",
        [
            "not-a-uuid",
            "12345",
            "",
            "gggggggg-gggg-gggg-gggg-gggggggggggg",  # 유효하지 않은 hex
            "a1b2c3d4e5f67890abcdef1234567890",  # 하이픈 없음
        ],
    )
    def test_invalid_uuid_returns_400(self, job_id):
        response = lambda_handler(_event(job_id), MockContext())
        assert response["statusCode"] == 400
        body = json.loads(response["body"])
        assert body["error"]["code"] == "INVALID_PARAMS"

    def test_missing_path_params_returns_400(self):
        response = lambda_handler({"pathParameters": None}, MockContext())
        assert response["statusCode"] == 400

    def test_missing_job_id_key_returns_400(self):
        response = lambda_handler({"pathParameters": {}}, MockContext())
        assert response["statusCode"] == 400


# ---------------------------------------------------------------------------
# 404 — 존재하지 않는 작업
# ---------------------------------------------------------------------------


class TestJobNotFound:
    @patch("lambdas.get_job_status.handler.get_job", return_value=None)
    def test_unknown_job_returns_404(self, mock_get):
        response = lambda_handler(_event(_VALID_JOB_ID), MockContext())
        assert response["statusCode"] == 404
        body = json.loads(response["body"])
        assert body["error"]["code"] == "JOB_NOT_FOUND"


# ---------------------------------------------------------------------------
# DB 오류 (503)
# ---------------------------------------------------------------------------


class TestServiceErrors:
    @patch(
        "lambdas.get_job_status.handler.get_job",
        side_effect=Exception("connection refused"),
    )
    def test_db_error_returns_503(self, mock_get):
        response = lambda_handler(_event(_VALID_JOB_ID), MockContext())
        assert response["statusCode"] == 503
        body = json.loads(response["body"])
        assert body["error"]["code"] == "DB_ERROR"
