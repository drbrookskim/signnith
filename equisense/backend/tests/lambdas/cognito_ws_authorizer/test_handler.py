"""lambdas/cognito_ws_authorizer/handler 단위 테스트."""

from __future__ import annotations

from unittest.mock import patch

import jwt

from lambdas.cognito_ws_authorizer.handler import (
    _allow_policy,
    _deny_policy,
    lambda_handler,
)

_FAKE_ARN = "arn:aws:execute-api:ap-northeast-2:123456789:abc123def/prod/$connect"
_FAKE_TOKEN = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.fake.sig"

_VALID_CLAIMS = {
    "sub": "user-uuid-123",
    "email": "test@example.com",
    "iss": "https://cognito-idp.ap-northeast-2.amazonaws.com/ap-northeast-2_test",
    "aud": "test-client-id",
    "exp": 9999999999,
}


def _make_event(token: str | None = _FAKE_TOKEN, method_arn: str = _FAKE_ARN) -> dict:
    return {
        "methodArn": method_arn,
        "queryStringParameters": {"token": token} if token else {},
    }


# ---------------------------------------------------------------------------
# 정상 경로
# ---------------------------------------------------------------------------


class TestAllowPath:
    def test_returns_allow_policy_for_valid_token(self):
        with patch(
            "lambdas.cognito_ws_authorizer.handler._validate_jwt",
            return_value=_VALID_CLAIMS,
        ):
            result = lambda_handler(_make_event(), None)

        assert result["policyDocument"]["Statement"][0]["Effect"] == "Allow"
        assert result["principalId"] == "user-uuid-123"

    def test_context_contains_sub_and_email(self):
        with patch(
            "lambdas.cognito_ws_authorizer.handler._validate_jwt",
            return_value=_VALID_CLAIMS,
        ):
            result = lambda_handler(_make_event(), None)

        assert result["context"]["sub"] == "user-uuid-123"
        assert result["context"]["email"] == "test@example.com"

    def test_resource_arn_uses_wildcard(self):
        with patch(
            "lambdas.cognito_ws_authorizer.handler._validate_jwt",
            return_value=_VALID_CLAIMS,
        ):
            result = lambda_handler(_make_event(), None)

        resource = result["policyDocument"]["Statement"][0]["Resource"]
        assert resource.endswith("/*"), f"Expected wildcard ARN, got: {resource}"
        assert "$connect" not in resource


# ---------------------------------------------------------------------------
# 거부 경로
# ---------------------------------------------------------------------------


class TestDenyPath:
    def test_denies_when_no_token(self):
        result = lambda_handler(_make_event(token=None), None)
        assert result["policyDocument"]["Statement"][0]["Effect"] == "Deny"

    def test_denies_on_expired_token(self):
        with patch(
            "lambdas.cognito_ws_authorizer.handler._validate_jwt",
            side_effect=jwt.ExpiredSignatureError("expired"),
        ):
            result = lambda_handler(_make_event(), None)

        assert result["policyDocument"]["Statement"][0]["Effect"] == "Deny"

    def test_denies_on_invalid_token(self):
        with patch(
            "lambdas.cognito_ws_authorizer.handler._validate_jwt",
            side_effect=jwt.InvalidTokenError("bad token"),
        ):
            result = lambda_handler(_make_event(), None)

        assert result["policyDocument"]["Statement"][0]["Effect"] == "Deny"

    def test_denies_on_unexpected_exception(self):
        with patch(
            "lambdas.cognito_ws_authorizer.handler._validate_jwt",
            side_effect=RuntimeError("network error"),
        ):
            result = lambda_handler(_make_event(), None)

        assert result["policyDocument"]["Statement"][0]["Effect"] == "Deny"


# ---------------------------------------------------------------------------
# 헬퍼 함수
# ---------------------------------------------------------------------------


class TestAllowPolicy:
    def test_wildcard_resource_derived_from_method_arn(self):
        policy = _allow_policy("uid", _FAKE_ARN, _VALID_CLAIMS)
        stmt = policy["policyDocument"]["Statement"][0]
        assert stmt["Resource"] == ("arn:aws:execute-api:ap-northeast-2:123456789:abc123def/prod/*")

    def test_action_is_invoke(self):
        policy = _allow_policy("uid", _FAKE_ARN, _VALID_CLAIMS)
        assert policy["policyDocument"]["Statement"][0]["Action"] == "execute-api:Invoke"


class TestDenyPolicy:
    def test_deny_effect(self):
        policy = _deny_policy("anon", _FAKE_ARN)
        assert policy["policyDocument"]["Statement"][0]["Effect"] == "Deny"

    def test_principal_id_preserved(self):
        policy = _deny_policy("custom-principal", _FAKE_ARN)
        assert policy["principalId"] == "custom-principal"
