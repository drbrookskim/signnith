"""lambdas/ws_disconnect/handler 단위 테스트."""

from __future__ import annotations

from unittest.mock import patch

from lambdas.ws_disconnect.handler import lambda_handler


def _make_event(connection_id: str) -> dict:
    return {"requestContext": {"connectionId": connection_id}}


class TestSuccess:
    def test_returns_200_on_successful_disconnect(self):
        with patch("lambdas.ws_disconnect.handler._delete_connection") as mock_del:
            response = lambda_handler(_make_event("conn-abc"), None)

        assert response["statusCode"] == 200
        mock_del.assert_called_once_with("conn-abc")

    def test_returns_200_even_when_delete_fails(self):
        """비치명적 오류는 무시하고 200을 반환합니다."""
        with patch(
            "lambdas.ws_disconnect.handler._delete_connection", side_effect=Exception("DB error")
        ):
            response = lambda_handler(_make_event("conn-gone"), None)

        assert response["statusCode"] == 200

    def test_handles_missing_connection_id(self):
        event = {"requestContext": {}}

        with patch("lambdas.ws_disconnect.handler._delete_connection"):
            response = lambda_handler(event, None)

        assert response["statusCode"] == 200
