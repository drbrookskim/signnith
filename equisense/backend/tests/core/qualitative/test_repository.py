"""core.qualitative.repository 단위 테스트 (psycopg2 모킹)."""

from __future__ import annotations

import json
from datetime import datetime
from unittest.mock import MagicMock, patch

from core.qualitative.models import JobStatus
from core.qualitative.repository import (
    count_jobs_today,
    create_job,
    get_job,
    save_qualitative_result,
    update_job_status,
)

# ---------------------------------------------------------------------------
# 공유 픽스처
# ---------------------------------------------------------------------------

_NOW = datetime(2024, 6, 15, 12, 0, 0)
_JOB_UUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
_RESULT_UUID = "b2c3d4e5-f6a7-8901-bcde-f01234567891"

_JOB_ROW = (
    _JOB_UUID,  # id
    "AAPL",  # ticker
    "US",  # market
    "annual_report",  # doc_type
    2024,  # fiscal_year
    "PENDING",  # status
    0,  # retry_count
    None,  # error_message
    _NOW,  # created_at
    _NOW,  # updated_at
)

_RESULT_ROW = (
    _RESULT_UUID,
    _JOB_UUID,
    "AAPL",
    "2024",
    85,
    "요약 텍스트",
    '[{"title": "리스크"}]',
    '[{"title": "성장동력"}]',
    '[{"claim": "주장"}]',
    _NOW,
)


_SENTINEL = object()


def _mock_conn(cursor_rows=None, fetchone_return=_SENTINEL):
    """psycopg2 connection + cursor 모킹 헬퍼."""
    conn = MagicMock()
    cursor = MagicMock()
    cursor.__enter__ = MagicMock(return_value=cursor)
    cursor.__exit__ = MagicMock(return_value=False)
    conn.cursor.return_value = cursor
    if fetchone_return is not _SENTINEL:
        cursor.fetchone.return_value = fetchone_return
    return conn, cursor


# ---------------------------------------------------------------------------
# create_job
# ---------------------------------------------------------------------------


class TestCreateJob:
    @patch("core.qualitative.repository.get_connection")
    def test_returns_job_id_string(self, mock_get_conn):
        conn, cur = _mock_conn(fetchone_return=(_JOB_UUID, _NOW, _NOW))
        mock_get_conn.return_value = conn

        result = create_job("AAPL", "US", "annual_report", 2024)
        assert result == str(_JOB_UUID)

    @patch("core.qualitative.repository.get_connection")
    def test_executes_insert_with_correct_params(self, mock_get_conn):
        conn, cur = _mock_conn(fetchone_return=(_JOB_UUID, _NOW, _NOW))
        mock_get_conn.return_value = conn

        create_job("TSLA", "US", "earnings_call", 2023)
        cur.execute.assert_called_once()
        args = cur.execute.call_args[0][1]
        assert args == ("TSLA", "US", "earnings_call", 2023)

    @patch("core.qualitative.repository.get_connection")
    def test_commits_transaction(self, mock_get_conn):
        conn, cur = _mock_conn(fetchone_return=(_JOB_UUID, _NOW, _NOW))
        mock_get_conn.return_value = conn

        create_job("AAPL", "US", "annual_report", 2024)
        conn.commit.assert_called_once()


# ---------------------------------------------------------------------------
# count_jobs_today
# ---------------------------------------------------------------------------


class TestCountJobsToday:
    @patch("core.qualitative.repository.get_connection")
    def test_returns_count(self, mock_get_conn):
        conn, cur = _mock_conn(fetchone_return=(3,))
        mock_get_conn.return_value = conn

        count = count_jobs_today("AAPL")
        assert count == 3

    @patch("core.qualitative.repository.get_connection")
    def test_returns_zero_on_none_row(self, mock_get_conn):
        conn = MagicMock()
        cursor = MagicMock()
        cursor.__enter__ = MagicMock(return_value=cursor)
        cursor.__exit__ = MagicMock(return_value=False)
        conn.cursor.return_value = cursor
        cursor.fetchone.return_value = None
        mock_get_conn.return_value = conn

        count = count_jobs_today("AAPL")
        assert count == 0

    @patch("core.qualitative.repository.get_connection")
    def test_queries_with_ticker(self, mock_get_conn):
        conn, cur = _mock_conn(fetchone_return=(0,))
        mock_get_conn.return_value = conn

        count_jobs_today("005930")
        args = cur.execute.call_args[0][1]
        assert args == ("005930",)


# ---------------------------------------------------------------------------
# get_job
# ---------------------------------------------------------------------------


class TestGetJob:
    @patch("core.qualitative.repository.get_connection")
    def test_returns_none_for_missing_job(self, mock_get_conn):
        conn, cur = _mock_conn()
        cur.fetchone.return_value = None
        mock_get_conn.return_value = conn

        result = get_job("nonexistent-uuid")
        assert result is None

    @patch("core.qualitative.repository.get_connection")
    def test_returns_job_with_no_result_for_pending(self, mock_get_conn):
        conn, cur = _mock_conn()
        cur.fetchone.return_value = _JOB_ROW
        mock_get_conn.return_value = conn

        result = get_job(_JOB_UUID)
        assert result is not None
        job, qual_result = result
        assert job.ticker == "AAPL"
        assert job.status == JobStatus.PENDING
        assert qual_result is None

    @patch("core.qualitative.repository.get_connection")
    def test_returns_result_for_completed_job(self, mock_get_conn):
        conn, cur = _mock_conn()
        completed_row = (*_JOB_ROW[:5], "COMPLETED", *_JOB_ROW[6:])
        cur.fetchone.side_effect = [completed_row, _RESULT_ROW]
        mock_get_conn.return_value = conn

        result = get_job(_JOB_UUID)
        assert result is not None
        job, qual_result = result
        assert job.status == JobStatus.COMPLETED
        assert qual_result is not None
        assert qual_result.integrity_score == 85

    @patch("core.qualitative.repository.get_connection")
    def test_no_result_query_for_non_completed(self, mock_get_conn):
        """PENDING/PROCESSING/FAILED 상태에서는 qualitative_results를 조회하지 않습니다."""
        conn, cur = _mock_conn()
        cur.fetchone.return_value = _JOB_ROW  # PENDING
        mock_get_conn.return_value = conn

        get_job(_JOB_UUID)
        assert cur.execute.call_count == 1  # SELECT_JOB만 실행


# ---------------------------------------------------------------------------
# update_job_status
# ---------------------------------------------------------------------------


class TestUpdateJobStatus:
    @patch("core.qualitative.repository.get_connection")
    def test_updates_status_without_error(self, mock_get_conn):
        conn, cur = _mock_conn()
        mock_get_conn.return_value = conn

        update_job_status(_JOB_UUID, "PROCESSING")
        args = cur.execute.call_args[0][1]
        assert args[0] == "PROCESSING"
        assert args[1] is None
        assert args[2] == _JOB_UUID

    @patch("core.qualitative.repository.get_connection")
    def test_updates_status_with_error_message(self, mock_get_conn):
        conn, cur = _mock_conn()
        mock_get_conn.return_value = conn

        update_job_status(_JOB_UUID, "FAILED", "fetch timeout")
        args = cur.execute.call_args[0][1]
        assert args[0] == "FAILED"
        assert args[1] == "fetch timeout"

    @patch("core.qualitative.repository.get_connection")
    def test_commits_transaction(self, mock_get_conn):
        conn, cur = _mock_conn()
        mock_get_conn.return_value = conn

        update_job_status(_JOB_UUID, "COMPLETED")
        conn.commit.assert_called_once()


# ---------------------------------------------------------------------------
# save_qualitative_result
# ---------------------------------------------------------------------------


class TestSaveQualitativeResult:
    @patch("core.qualitative.repository.get_connection")
    def test_returns_result_id_string(self, mock_get_conn):
        conn, cur = _mock_conn(fetchone_return=(_RESULT_UUID, _NOW))
        mock_get_conn.return_value = conn

        result_id = save_qualitative_result(
            job_id=_JOB_UUID,
            ticker="AAPL",
            fiscal_period="2024",
            integrity_score=85,
            summary_ko="요약",
            risk_factors=[{"title": "리스크"}],
            growth_drivers=[{"title": "성장"}],
            noise_filter=[{"claim": "주장"}],
        )
        assert result_id == str(_RESULT_UUID)

    @patch("core.qualitative.repository.get_connection")
    def test_list_fields_serialized_to_json(self, mock_get_conn):
        conn, cur = _mock_conn(fetchone_return=(_RESULT_UUID, _NOW))
        mock_get_conn.return_value = conn

        risk = [{"title": "리스크", "severity": "high"}]
        save_qualitative_result(_JOB_UUID, "AAPL", "2024", 80, "요약", risk, None, None)
        args = cur.execute.call_args[0][1]
        assert args[5] == json.dumps(risk)  # risk_factors
        assert args[6] is None  # growth_drivers (None → None)

    @patch("core.qualitative.repository.get_connection")
    def test_commits_transaction(self, mock_get_conn):
        conn, cur = _mock_conn(fetchone_return=(_RESULT_UUID, _NOW))
        mock_get_conn.return_value = conn

        save_qualitative_result(_JOB_UUID, "AAPL", "2024", None, None, None, None, None)
        conn.commit.assert_called_once()

    @patch("core.qualitative.repository.get_connection")
    def test_null_optional_fields_passed_as_none(self, mock_get_conn):
        conn, cur = _mock_conn(fetchone_return=(_RESULT_UUID, _NOW))
        mock_get_conn.return_value = conn

        save_qualitative_result(_JOB_UUID, "AAPL", "2024", None, None, None, None, None)
        args = cur.execute.call_args[0][1]
        assert args[3] is None  # integrity_score
        assert args[4] is None  # summary_ko
        assert args[5] is None  # risk_factors
