"""Health Check Lambda 핸들러 테스트.

Redis와 DB 의존성은 unittest.mock으로 격리합니다.
"""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

from lambdas.health.handler import STATUS_DEGRADED, STATUS_OK, lambda_handler

_REDIS_DEGRADED = (STATUS_DEGRADED, "redis unreachable")
_DB_DEGRADED = (STATUS_DEGRADED, "database unreachable")
_OK = (STATUS_OK, None)


class MockContext:
    aws_request_id = "health-test-request-id"


# ---------------------------------------------------------------------------
# 정상 흐름: 모든 의존성 정상
# ---------------------------------------------------------------------------


class TestAllHealthy:
    @patch("lambdas.health.handler._check_db", return_value=_OK)
    @patch("lambdas.health.handler._check_redis", return_value=_OK)
    def test_returns_200_when_all_healthy(self, mock_redis, mock_db):
        response = lambda_handler({}, MockContext())
        assert response["statusCode"] == 200

    @patch("lambdas.health.handler._check_db", return_value=_OK)
    @patch("lambdas.health.handler._check_redis", return_value=_OK)
    def test_body_status_is_ok(self, mock_redis, mock_db):
        response = lambda_handler({}, MockContext())
        body = json.loads(response["body"])
        assert body["status"] == STATUS_OK

    @patch("lambdas.health.handler._check_db", return_value=_OK)
    @patch("lambdas.health.handler._check_redis", return_value=_OK)
    def test_checks_contain_redis_and_db(self, mock_redis, mock_db):
        response = lambda_handler({}, MockContext())
        body = json.loads(response["body"])
        assert "redis" in body["checks"]
        assert "database" in body["checks"]

    @patch("lambdas.health.handler._check_db", return_value=_OK)
    @patch("lambdas.health.handler._check_redis", return_value=_OK)
    def test_request_id_in_body(self, mock_redis, mock_db):
        response = lambda_handler({}, MockContext())
        body = json.loads(response["body"])
        assert body["request_id"] == MockContext.aws_request_id

    @patch("lambdas.health.handler._check_db", return_value=_OK)
    @patch("lambdas.health.handler._check_redis", return_value=_OK)
    def test_content_type_header(self, mock_redis, mock_db):
        response = lambda_handler({}, MockContext())
        assert response["headers"]["Content-Type"] == "application/json"


# ---------------------------------------------------------------------------
# Redis 장애
# ---------------------------------------------------------------------------


class TestRedisDegraded:
    @patch("lambdas.health.handler._check_db", return_value=_OK)
    @patch("lambdas.health.handler._check_redis", return_value=_REDIS_DEGRADED)
    def test_returns_503_when_redis_down(self, mock_redis, mock_db):
        response = lambda_handler({}, MockContext())
        assert response["statusCode"] == 503

    @patch("lambdas.health.handler._check_db", return_value=_OK)
    @patch("lambdas.health.handler._check_redis", return_value=_REDIS_DEGRADED)
    def test_overall_status_is_degraded(self, mock_redis, mock_db):
        response = lambda_handler({}, MockContext())
        body = json.loads(response["body"])
        assert body["status"] == STATUS_DEGRADED

    @patch("lambdas.health.handler._check_db", return_value=_OK)
    @patch("lambdas.health.handler._check_redis", return_value=_REDIS_DEGRADED)
    def test_redis_check_shows_error(self, mock_redis, mock_db):
        response = lambda_handler({}, MockContext())
        body = json.loads(response["body"])
        assert body["checks"]["redis"]["status"] == STATUS_DEGRADED
        assert "error" in body["checks"]["redis"]

    @patch("lambdas.health.handler._check_db", return_value=_OK)
    @patch("lambdas.health.handler._check_redis", return_value=_REDIS_DEGRADED)
    def test_db_check_still_ok(self, mock_redis, mock_db):
        response = lambda_handler({}, MockContext())
        body = json.loads(response["body"])
        assert body["checks"]["database"]["status"] == STATUS_OK


# ---------------------------------------------------------------------------
# DB 장애
# ---------------------------------------------------------------------------


class TestDbDegraded:
    @patch("lambdas.health.handler._check_db", return_value=_DB_DEGRADED)
    @patch("lambdas.health.handler._check_redis", return_value=_OK)
    def test_returns_503_when_db_down(self, mock_redis, mock_db):
        response = lambda_handler({}, MockContext())
        assert response["statusCode"] == 503

    @patch("lambdas.health.handler._check_db", return_value=_DB_DEGRADED)
    @patch("lambdas.health.handler._check_redis", return_value=_OK)
    def test_db_check_shows_error(self, mock_redis, mock_db):
        response = lambda_handler({}, MockContext())
        body = json.loads(response["body"])
        assert body["checks"]["database"]["status"] == STATUS_DEGRADED
        assert "error" in body["checks"]["database"]


# ---------------------------------------------------------------------------
# 양쪽 모두 장애
# ---------------------------------------------------------------------------


class TestBothDegraded:
    @patch("lambdas.health.handler._check_db", return_value=_DB_DEGRADED)
    @patch("lambdas.health.handler._check_redis", return_value=_REDIS_DEGRADED)
    def test_returns_503_when_both_down(self, mock_redis, mock_db):
        response = lambda_handler({}, MockContext())
        assert response["statusCode"] == 503

    @patch("lambdas.health.handler._check_db", return_value=_DB_DEGRADED)
    @patch("lambdas.health.handler._check_redis", return_value=_REDIS_DEGRADED)
    def test_both_checks_show_errors(self, mock_redis, mock_db):
        response = lambda_handler({}, MockContext())
        body = json.loads(response["body"])
        assert body["checks"]["redis"]["status"] == STATUS_DEGRADED
        assert body["checks"]["database"]["status"] == STATUS_DEGRADED


# ---------------------------------------------------------------------------
# _check_redis 단위 테스트
# ---------------------------------------------------------------------------


class TestCheckRedis:
    def test_returns_ok_on_successful_ping(self):
        mock_client = MagicMock()
        mock_client.ping.return_value = True
        # _get_client는 함수 내부에서 from core.cache import 로 가져오므로
        # core.cache 모듈 속성을 직접 패치합니다.
        with patch("core.cache._get_client", return_value=mock_client):
            from lambdas.health.handler import _check_redis

            status, error = _check_redis()
        assert status == STATUS_OK
        assert error is None

    def test_returns_degraded_on_exception(self):
        with patch("core.cache._get_client", side_effect=Exception("conn refused")):
            from lambdas.health.handler import _check_redis

            status, error = _check_redis()
        assert status == STATUS_DEGRADED
        assert error is not None


# ---------------------------------------------------------------------------
# _check_db 단위 테스트
# ---------------------------------------------------------------------------


class TestCheckDb:
    def test_returns_ok_on_successful_query(self):
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
        # get_connection은 함수 내부에서 from core.db import 로 가져오므로
        # core.db 모듈 속성을 직접 패치합니다.
        with patch("core.db.get_connection", return_value=mock_conn):
            from lambdas.health.handler import _check_db

            status, error = _check_db()
        assert status == STATUS_OK
        assert error is None

    def test_returns_degraded_on_exception(self):
        with patch("core.db.get_connection", side_effect=Exception("timeout")):
            from lambdas.health.handler import _check_db

            status, error = _check_db()
        assert status == STATUS_DEGRADED
        assert error is not None
