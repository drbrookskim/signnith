"""Neon DB — analysis_jobs / qualitative_results 레포지토리."""

from __future__ import annotations

import json
from typing import Optional

from core.db import get_connection
from core.qualitative.models import AnalysisJob, JobStatus, QualitativeResult

# ---------------------------------------------------------------------------
# analysis_jobs
# ---------------------------------------------------------------------------

_INSERT_JOB = """
    INSERT INTO analysis_jobs
        (ticker, market, doc_type, fiscal_year, status)
    VALUES (%s, %s, %s, %s, 'PENDING')
    RETURNING id, created_at, updated_at
"""

_SELECT_JOB = """
    SELECT id, ticker, market, doc_type, fiscal_year, status,
           retry_count, error_message, created_at, updated_at
    FROM analysis_jobs
    WHERE id = %s
"""

_UPDATE_JOB_STATUS = """
    UPDATE analysis_jobs
    SET status = %s, error_message = %s, updated_at = NOW()
    WHERE id = %s
"""

_COUNT_JOBS_TODAY = """
    SELECT COUNT(*)
    FROM analysis_jobs
    WHERE ticker = %s
      AND created_at >= NOW() - INTERVAL '24 hours'
"""

# ---------------------------------------------------------------------------
# qualitative_results
# ---------------------------------------------------------------------------

_SELECT_RESULT = """
    SELECT id, job_id, ticker, fiscal_period, integrity_score, summary_ko,
           risk_factors, growth_drivers, noise_filter, created_at
    FROM qualitative_results
    WHERE job_id = %s
    ORDER BY created_at DESC
    LIMIT 1
"""

_INSERT_RESULT = """
    INSERT INTO qualitative_results
        (job_id, ticker, fiscal_period, integrity_score, summary_ko,
         risk_factors, growth_drivers, noise_filter)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
    RETURNING id, created_at
"""


def create_job(ticker: str, market: str, doc_type: str, fiscal_year: int) -> str:
    """analysis_jobs에 새 작업을 INSERT하고 job_id(UUID)를 반환합니다.

    Raises:
        psycopg2.Error: DB 오류 시
    """
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(_INSERT_JOB, (ticker, market, doc_type, fiscal_year))
        row = cur.fetchone()
    conn.commit()
    return str(row[0])


def count_jobs_today(ticker: str) -> int:
    """최근 24시간 동안 해당 ticker에 대한 분석 요청 수를 반환합니다.

    Raises:
        psycopg2.Error: DB 오류 시
    """
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(_COUNT_JOBS_TODAY, (ticker,))
        row = cur.fetchone()
    return int(row[0]) if row else 0


def get_job(
    job_id: str,
) -> Optional[tuple[AnalysisJob, Optional[QualitativeResult]]]:
    """job_id로 작업 상태와 결과를 조회합니다.

    Returns:
        (AnalysisJob, QualitativeResult | None) 또는 작업 없으면 None

    Raises:
        psycopg2.Error: DB 오류 시
    """
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(_SELECT_JOB, (job_id,))
        job_row = cur.fetchone()

        if job_row is None:
            return None

        job = _row_to_job(job_row)

        qual_result: Optional[QualitativeResult] = None
        if job.status == JobStatus.COMPLETED:
            cur.execute(_SELECT_RESULT, (job_id,))
            result_row = cur.fetchone()
            if result_row:
                qual_result = _row_to_result(result_row)

    return job, qual_result


def update_job_status(job_id: str, status: str, error_message: Optional[str] = None) -> None:
    """작업 상태를 업데이트합니다.

    Raises:
        psycopg2.Error: DB 오류 시
    """
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(_UPDATE_JOB_STATUS, (status, error_message, job_id))
    conn.commit()


def save_qualitative_result(
    job_id: str,
    ticker: str,
    fiscal_period: str,
    integrity_score: Optional[int],
    summary_ko: Optional[str],
    risk_factors: Optional[list],
    growth_drivers: Optional[list],
    noise_filter: Optional[list],
) -> str:
    """qualitative_results에 분석 결과를 저장하고 result id를 반환합니다.

    Raises:
        psycopg2.Error: DB 오류 시
    """
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            _INSERT_RESULT,
            (
                job_id,
                ticker,
                fiscal_period,
                integrity_score,
                summary_ko,
                json.dumps(risk_factors) if risk_factors else None,
                json.dumps(growth_drivers) if growth_drivers else None,
                json.dumps(noise_filter) if noise_filter else None,
            ),
        )
        row = cur.fetchone()
    conn.commit()
    return str(row[0])


# ---------------------------------------------------------------------------
# 내부 헬퍼
# ---------------------------------------------------------------------------


def _row_to_job(row: tuple) -> AnalysisJob:
    (
        job_id,
        ticker,
        market,
        doc_type,
        fiscal_year,
        status,
        retry_count,
        error_message,
        created_at,
        updated_at,
    ) = row
    return AnalysisJob(
        id=str(job_id),
        ticker=ticker,
        market=market,
        doc_type=doc_type,
        fiscal_year=int(fiscal_year),
        status=JobStatus(status),
        retry_count=int(retry_count),
        error_message=error_message,
        created_at=created_at.isoformat(),
        updated_at=updated_at.isoformat(),
    )


def _parse_json_field(value: Optional[str]) -> Optional[list]:
    if value is None:
        return None
    if isinstance(value, str):
        return json.loads(value)
    return value


def _row_to_result(row: tuple) -> QualitativeResult:
    (
        result_id,
        job_id,
        ticker,
        fiscal_period,
        integrity_score,
        summary_ko,
        risk_factors,
        growth_drivers,
        noise_filter,
        created_at,
    ) = row
    return QualitativeResult(
        id=str(result_id),
        job_id=str(job_id),
        ticker=ticker,
        fiscal_period=fiscal_period,
        integrity_score=integrity_score,
        summary_ko=summary_ko,
        risk_factors=_parse_json_field(risk_factors),
        growth_drivers=_parse_json_field(growth_drivers),
        noise_filter=_parse_json_field(noise_filter),
        created_at=created_at.isoformat(),
    )
