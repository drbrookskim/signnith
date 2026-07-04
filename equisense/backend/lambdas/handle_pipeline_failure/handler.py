"""Step Functions HandleFailure State Lambda.

모든 State에서 발생한 예외를 캐치하여 analysis_jobs 상태를 FAILED로 업데이트합니다.
"""

from __future__ import annotations

import logging
from typing import Any

from core.qualitative.repository import update_job_status

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def lambda_handler(event: dict, context: Any) -> dict:
    """파이프라인 실패를 처리하고 DB 상태를 FAILED로 업데이트합니다.

    Args:
        event: Step Functions Catch 블록 전달 이벤트
                {"job_id": "...", "Error": "...", "Cause": "..."}

    Returns:
        {"job_id": "...", "status": "FAILED"}
    """
    job_id = event.get("job_id", "unknown")
    error = event.get("Error", "Unknown error")
    cause = event.get("Cause", "")

    error_message = f"{error}: {cause}" if cause else error
    logger.error("Pipeline failed for job %s: %s", job_id, error_message)

    try:
        update_job_status(job_id, "FAILED", error_message[:500])  # DB VARCHAR 길이 제한
    except Exception as e:
        logger.error("Failed to update job status to FAILED: %s", e)

    return {"job_id": job_id, "status": "FAILED"}
