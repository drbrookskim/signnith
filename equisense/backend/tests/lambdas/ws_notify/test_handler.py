"""lambdas/ws_notify/handler 단위 테스트."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import lambdas.ws_notify.handler as module
from lambdas.ws_notify.handler import lambda_handler


def _make_event(job_id: str = "job-001", ticker: str = "AAPL") -> dict:
    return {"detail": {"job_id": job_id, "ticker": ticker, "status": "COMPLETED"}}


FAKE_JOB_RESULT = {
    "status": "COMPLETED",
    "integrity_score": 85,
    "summary_ko": "분석 완료",
    "risk_factors": [],
    "growth_drivers": [],
    "noise_filter": [],
}


class TestSuccess:
    def test_returns_200_and_pushes_to_connections(self):
        event = _make_event()

        with patch.object(module, "_get_job_result", return_value=FAKE_JOB_RESULT):
            with patch.object(module, "_get_connections_for_job", return_value=["conn-1"]):
                with patch.object(module, "_push_to_connections") as mock_push:
                    response = lambda_handler(event, None)

        assert response["statusCode"] == 200
        mock_push.assert_called_once()
        message_arg = mock_push.call_args[0][1]
        import json

        msg = json.loads(message_arg)
        assert msg["type"] == "ANALYSIS_COMPLETE"
        assert msg["job_id"] == "job-001"

    def test_returns_200_with_no_connections(self):
        event = _make_event()

        with patch.object(module, "_get_job_result", return_value=FAKE_JOB_RESULT):
            with patch.object(module, "_get_connections_for_job", return_value=[]):
                response = lambda_handler(event, None)

        assert response["statusCode"] == 200
        assert "no_connections" in response.get("body", "")

    def test_handles_eventbridge_envelope(self):
        """EventBridge는 detail 필드 안에 페이로드를 담습니다."""
        event = {"detail": {"job_id": "job-eb", "ticker": "MSFT"}}

        with patch.object(module, "_get_job_result", return_value=FAKE_JOB_RESULT):
            with patch.object(module, "_get_connections_for_job", return_value=[]):
                response = lambda_handler(event, None)

        assert response["statusCode"] == 200


class TestEdgeCases:
    def test_returns_400_when_no_job_id(self):
        event = {"detail": {}}
        response = lambda_handler(event, None)
        assert response["statusCode"] == 400

    def test_returns_404_when_job_not_found(self):
        event = _make_event("nonexistent-job")

        with patch.object(module, "_get_job_result", return_value=None):
            response = lambda_handler(event, None)

        assert response["statusCode"] == 404

    def test_returns_500_on_unexpected_error(self):
        event = _make_event()

        with patch.object(module, "_get_job_result", side_effect=Exception("DB crash")):
            response = lambda_handler(event, None)

        assert response["statusCode"] == 500


class TestPushToConnections:
    def test_cleans_up_gone_connections(self):
        mock_client = MagicMock()
        gone_exc = type("GoneException", (Exception,), {})
        mock_client.exceptions.GoneException = gone_exc
        mock_client.post_to_connection.side_effect = gone_exc("gone")

        mock_db_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_db_conn.cursor.return_value.__enter__ = lambda s: mock_cursor
        mock_db_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

        with patch.object(module, "_get_apigw_client", return_value=mock_client):
            with patch("core.db.get_connection", return_value=mock_db_conn):
                module._push_to_connections(["conn-gone"], '{"test": true}')

        # 만료 연결은 DB에서 삭제되어야 합니다
        mock_cursor.execute.assert_called_once()
        assert "DELETE" in mock_cursor.execute.call_args[0][0]
