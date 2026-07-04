"""SQS Event Source Mapping Lambda 핸들러.

SQS 메시지를 수신하고 Step Functions StartExecution을 호출합니다.
analysis_jobs 상태를 PENDING → PROCESSING으로 업데이트합니다.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Optional

import boto3

from core.qualitative.repository import update_job_status

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# 모듈 레벨 boto3 클라이언트 캐싱 — 웜 컨테이너 재사용 시 재생성 방지
_sfn_client: Optional[Any] = None


def _get_sfn():
    global _sfn_client
    if _sfn_client is None:
        _sfn_client = boto3.client(
            "stepfunctions", region_name=os.environ.get("AWS_REGION", "ap-northeast-2")
        )
    return _sfn_client


def _start_step_functions(payload: dict) -> str:
    """Step Functions Workflow를 시작하고 실행 ARN을 반환합니다."""
    job_id = payload["job_id"]
    response = _get_sfn().start_execution(
        stateMachineArn=os.environ["STATE_MACHINE_ARN"],
        name=f"rag-{job_id}",
        input=json.dumps(payload),
    )
    return response["executionArn"]


def lambda_handler(event: dict, context: Any) -> None:
    """SQS 배치 레코드를 처리합니다.

    batchSize=1이므로 항상 레코드 1개가 들어옵니다.
    예외 발생 시 SQS가 재처리(최대 3회) 후 DLQ로 이동합니다.
    """
    for record in event.get("Records", []):
        body = json.loads(record["body"])
        job_id = body.get("job_id", "unknown")

        logger.info("Processing SQS message: job_id=%s", job_id)

        try:
            update_job_status(job_id, "PROCESSING")
        except Exception as e:
            logger.error("DB update failed for job %s: %s", job_id, e)
            raise  # SQS 재처리 유도

        try:
            arn = _start_step_functions(body)
            logger.info("Started Step Functions: job_id=%s arn=%s", job_id, arn)
        except Exception as e:
            logger.error("Step Functions start failed for job %s: %s", job_id, e)
            try:
                update_job_status(job_id, "FAILED", f"Step Functions start error: {e}")
            except Exception:
                pass
            raise  # SQS 재처리 유도
