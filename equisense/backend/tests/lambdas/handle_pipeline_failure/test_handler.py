"""lambdas/handle_pipeline_failure/handler 단위 테스트."""

from __future__ import annotations

from unittest.mock import patch

from lambdas.handle_pipeline_failure.handler import lambda_handler


def _make_event(job_id="job-123", error="States.TaskFailed", cause="timeout") -> dict:
    return {"job_id": job_id, "Error": error, "Cause": cause}


class TestNormalFailure:
    def test_returns_failed_status(self):
        with patch("lambdas.handle_pipeline_failure.handler.update_job_status"):
            result = lambda_handler(_make_event(), None)

        assert result == {"job_id": "job-123", "status": "FAILED"}

    def test_calls_update_job_status_with_failed(self):
        with patch("lambdas.handle_pipeline_failure.handler.update_job_status") as mock_update:
            lambda_handler(_make_event(job_id="abc", error="SomeError", cause="bad input"), None)

        mock_update.assert_called_once_with("abc", "FAILED", "SomeError: bad input")

    def test_error_message_combines_error_and_cause(self):
        captured = {}

        def capture(job_id, status, msg):
            captured["msg"] = msg

        patch_target = "lambdas.handle_pipeline_failure.handler.update_job_status"
        with patch(patch_target, side_effect=capture):
            lambda_handler(_make_event(error="LambdaError", cause="OOM"), None)

        assert captured["msg"] == "LambdaError: OOM"

    def test_error_message_without_cause(self):
        captured = {}

        def capture(job_id, status, msg):
            captured["msg"] = msg

        patch_target = "lambdas.handle_pipeline_failure.handler.update_job_status"
        with patch(patch_target, side_effect=capture):
            lambda_handler({"job_id": "j1", "Error": "TimeoutError", "Cause": ""}, None)

        assert captured["msg"] == "TimeoutError"

    def test_long_error_message_truncated_to_500(self):
        captured = {}

        def capture(job_id, status, msg):
            captured["msg"] = msg

        long_cause = "x" * 600
        patch_target = "lambdas.handle_pipeline_failure.handler.update_job_status"
        with patch(patch_target, side_effect=capture):
            lambda_handler({"job_id": "j1", "Error": "E", "Cause": long_cause}, None)

        assert len(captured["msg"]) == 500


class TestMissingFields:
    def test_missing_job_id_defaults_to_unknown(self):
        with patch("lambdas.handle_pipeline_failure.handler.update_job_status") as mock_update:
            result = lambda_handler({"Error": "SomeError", "Cause": ""}, None)

        assert result["job_id"] == "unknown"
        mock_update.assert_called_once_with("unknown", "FAILED", "SomeError")

    def test_missing_error_defaults(self):
        with patch("lambdas.handle_pipeline_failure.handler.update_job_status") as mock_update:
            result = lambda_handler({"job_id": "j1"}, None)

        assert result["status"] == "FAILED"
        mock_update.assert_called_once_with("j1", "FAILED", "Unknown error")

    def test_empty_event_does_not_raise(self):
        with patch("lambdas.handle_pipeline_failure.handler.update_job_status"):
            result = lambda_handler({}, None)

        assert result["status"] == "FAILED"


class TestDbUpdateFailure:
    def test_db_error_is_swallowed_and_still_returns_failed(self):
        with patch(
            "lambdas.handle_pipeline_failure.handler.update_job_status",
            side_effect=Exception("DB connection lost"),
        ):
            result = lambda_handler(_make_event(), None)

        assert result == {"job_id": "job-123", "status": "FAILED"}

    def test_job_id_preserved_even_when_db_fails(self):
        with patch(
            "lambdas.handle_pipeline_failure.handler.update_job_status",
            side_effect=RuntimeError("timeout"),
        ):
            result = lambda_handler(_make_event(job_id="specific-job"), None)

        assert result["job_id"] == "specific-job"
