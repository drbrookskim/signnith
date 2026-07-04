"""lambdas/ws_connect/handler 단위 테스트."""

from __future__ import annotations

from unittest.mock import patch

from lambdas.ws_connect.handler import lambda_handler


def _make_event(connection_id: str, user_id: str = "user-123") -> dict:
    return {
        "requestContext": {
            "connectionId": connection_id,
            "authorizer": {"sub": user_id},
        }
    }


class TestSuccess:
    def test_returns_200_on_successful_connect(self):
        event = _make_event("conn-abc123")

        with patch("lambdas.ws_connect.handler._save_connection") as mock_save:
            response = lambda_handler(event, None)

        assert response["statusCode"] == 200
        mock_save.assert_called_once_with("conn-abc123", "user-123")

    def test_saves_connection_id_and_user_id(self):
        event = _make_event("conn-xyz789", "cognito-user-456")
        saved_args = []

        def capture(*args):
            saved_args.extend(args)

        with patch("lambdas.ws_connect.handler._save_connection", side_effect=capture):
            lambda_handler(event, None)

        assert saved_args[0] == "conn-xyz789"
        assert saved_args[1] == "cognito-user-456"


class TestFailure:
    def test_returns_500_on_db_error(self):
        event = _make_event("conn-fail")

        with patch(
            "lambdas.ws_connect.handler._save_connection", side_effect=Exception("DB error")
        ):
            response = lambda_handler(event, None)

        assert response["statusCode"] == 500

    def test_handles_missing_authorizer(self):
        event = {"requestContext": {"connectionId": "conn-noauth"}}

        with patch("lambdas.ws_connect.handler._save_connection"):
            response = lambda_handler(event, None)

        assert response["statusCode"] == 200
