"""Cognito JWT 검증 Lambda Authorizer — API Gateway WebSocket $connect.

WebSocket $connect 요청의 query string에서 JWT 토큰을 추출하여
Cognito User Pool 공개키(JWKS)로 서명을 검증하고 IAM 정책을 반환합니다.

JWKS 클라이언트는 모듈 레벨에 캐싱하여 Lambda warm start 성능을 최적화합니다.
identitySource: route.request.querystring.token
"""

from __future__ import annotations

import logging
import os
from typing import Any, Optional

import jwt
from jwt import PyJWKClient

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

_AWS_REGION = os.environ.get("AWS_REGION", "ap-northeast-2")
_USER_POOL_ID = os.environ.get("COGNITO_USER_POOL_ID", "")
_APP_CLIENT_ID = os.environ.get("COGNITO_APP_CLIENT_ID", "")
_JWKS_URI = f"https://cognito-idp.{_AWS_REGION}.amazonaws.com/{_USER_POOL_ID}/.well-known/jwks.json"

# Lambda warm start에서 재사용 — 배포 후 최초 호출 시 1회만 초기화
_jwks_client: Optional[PyJWKClient] = None


def _get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = PyJWKClient(_JWKS_URI, cache_jwk_set=True, lifespan=3600)
    return _jwks_client


def lambda_handler(event: dict, context: Any) -> dict:
    """API Gateway WebSocket $connect Authorizer.

    Args:
        event: API Gateway Lambda Authorizer 이벤트
            event["queryStringParameters"]["token"]: Cognito ID Token
            event["methodArn"]: 검증 대상 리소스 ARN

    Returns:
        IAM 정책 문서 (Allow 또는 Deny)
    """
    method_arn: str = event.get("methodArn", "")
    query_params: dict = event.get("queryStringParameters") or {}
    token: str = query_params.get("token", "")

    logger.info("WsAuthorizer: validating token, arn=%s", method_arn)

    if not token:
        logger.warning("WsAuthorizer: no token in request")
        return _deny_policy("anonymous", method_arn)

    try:
        claims = _validate_jwt(token)
        user_id: str = claims.get("sub", "unknown")
        logger.info("WsAuthorizer: ALLOW user=%s", user_id)
        return _allow_policy(user_id, method_arn, claims)
    except jwt.ExpiredSignatureError:
        logger.warning("WsAuthorizer: token expired")
        return _deny_policy("anonymous", method_arn)
    except jwt.InvalidTokenError as e:
        logger.warning("WsAuthorizer: invalid token — %s", e)
        return _deny_policy("anonymous", method_arn)
    except Exception as e:  # noqa: BLE001
        logger.error("WsAuthorizer: unexpected error — %s", e)
        return _deny_policy("anonymous", method_arn)


def _validate_jwt(token: str) -> dict[str, Any]:
    """Cognito JWKS로 JWT 서명을 검증하고 클레임을 반환합니다.

    Cognito ID Token의 발급자(iss)와 대상(aud)을 추가 검증합니다.
    """
    client = _get_jwks_client()
    signing_key = client.get_signing_key_from_jwt(token)
    expected_iss = f"https://cognito-idp.{_AWS_REGION}.amazonaws.com/{_USER_POOL_ID}"

    decode_options: dict = {"verify_exp": True}
    # APP_CLIENT_ID 미설정 시 audience 검증 생략 (개발 환경 대응)
    audience = _APP_CLIENT_ID if _APP_CLIENT_ID else None

    claims: dict = jwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256"],
        options=decode_options,
        audience=audience,
        issuer=expected_iss,
    )
    return claims


def _allow_policy(principal_id: str, method_arn: str, claims: dict) -> dict:
    """Allow IAM 정책을 반환합니다.

    WebSocket 세션 동안 모든 라우트를 허용하도록 ARN 와일드카드를 사용합니다.
    ($connect 이후 $default, $disconnect 등에서 재인증 불필요)
    """
    # arn:aws:execute-api:region:account:api-id/stage/$connect
    #   → arn:aws:execute-api:region:account:api-id/stage/*
    parts = method_arn.split("/")
    resource_arn = "/".join(parts[:2]) + "/*"

    return {
        "principalId": principal_id,
        "policyDocument": {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Action": "execute-api:Invoke",
                    "Effect": "Allow",
                    "Resource": resource_arn,
                }
            ],
        },
        "context": {
            "sub": claims.get("sub", ""),
            "email": claims.get("email", ""),
        },
    }


def _deny_policy(principal_id: str, method_arn: str) -> dict:
    """Deny IAM 정책을 반환합니다."""
    return {
        "principalId": principal_id,
        "policyDocument": {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Action": "execute-api:Invoke",
                    "Effect": "Deny",
                    "Resource": method_arn,
                }
            ],
        },
    }
