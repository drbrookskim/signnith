"""EventBridge → WsNotifyHandler Lambda.

RAG 분석 완료 이벤트를 수신하여, 해당 사용자의 활성 WebSocket 연결로
분석 결과를 푸시합니다. API Gateway Management API를 사용합니다.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Optional

import boto3

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# 모듈 레벨 클라이언트 캐싱
_apigw_client: Optional[Any] = None


def _get_apigw_client():
    global _apigw_client
    if _apigw_client is None:
        endpoint = os.environ.get("WS_ENDPOINT_URL", "")
        _apigw_client = boto3.client(
            "apigatewaymanagementapi",
            endpoint_url=endpoint,
            region_name=os.environ.get("AWS_REGION", "ap-northeast-2"),
        )
    return _apigw_client


def lambda_handler(event: dict, context: Any) -> dict:
    """EventBridge 이벤트에서 job_id를 추출하여 WebSocket 클라이언트에 결과를 푸시합니다.

    EventBridge 이벤트 detail 구조:
        {"job_id": "...", "ticker": "...", "status": "COMPLETED"}
    """
    detail = event.get("detail", event)  # EventBridge는 detail 필드에 페이로드를 담음
    job_id = detail.get("job_id", "")
    ticker = detail.get("ticker", "")

    logger.info("WsNotify: job_id=%s ticker=%s", job_id, ticker)

    if not job_id:
        logger.error("WsNotify: missing job_id in event")
        return {"statusCode": 400}

    try:
        job_result = _get_job_result(job_id)
        if not job_result:
            logger.warning("WsNotify: job %s not found", job_id)
            return {"statusCode": 404}

        connections = _get_connections_for_job(job_id)
        if not connections:
            logger.info("WsNotify: no active connections for job %s", job_id)
            return {"statusCode": 200, "body": "no_connections"}

        message = json.dumps({"type": "ANALYSIS_COMPLETE", "job_id": job_id, "result": job_result})
        _push_to_connections(connections, message)
        return {"statusCode": 200}
    except Exception as e:
        logger.error("WsNotify error for job %s: %s", job_id, e)
        return {"statusCode": 500}


def _get_job_result(job_id: str) -> Optional[dict[str, Any]]:
    """Neon DB에서 완료된 분석 작업 결과를 조회합니다."""
    from core.db import get_connection  # noqa: PLC0415

    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT aj.status, qr.integrity_score, qr.summary_ko, qr.risk_factors,
                   qr.growth_drivers, qr.noise_filter
            FROM analysis_jobs aj
            LEFT JOIN qualitative_results qr ON qr.job_id = aj.id
            WHERE aj.id = %s AND aj.status = 'COMPLETED'
            """,
            (job_id,),
        )
        row = cur.fetchone()
    if not row:
        return None
    return {
        "status": row[0],
        "integrity_score": row[1],
        "summary_ko": row[2],
        "risk_factors": row[3],
        "growth_drivers": row[4],
        "noise_filter": row[5],
    }


def _get_connections_for_job(job_id: str) -> list[str]:
    """job_id에 연결된 사용자의 활성 WebSocket 연결 ID 목록을 조회합니다."""
    from core.db import get_connection  # noqa: PLC0415

    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT wc.connection_id
            FROM ws_connections wc
            JOIN analysis_jobs aj ON aj.user_id::text = wc.user_id
            WHERE aj.id = %s
              AND wc.connected_at > NOW() - INTERVAL '2 hours'
            """,
            (job_id,),
        )
        return [row[0] for row in cur.fetchall()]


def _push_to_connections(connection_ids: list[str], message: str) -> None:
    """활성 연결에 메시지를 전송하고, 만료된 연결은 DB에서 삭제합니다."""
    from core.db import get_connection  # noqa: PLC0415

    client = _get_apigw_client()
    stale_ids: list[str] = []

    for connection_id in connection_ids:
        try:
            client.post_to_connection(
                ConnectionId=connection_id,
                Data=message.encode("utf-8"),
            )
            logger.info("WsNotify: pushed to %s", connection_id)
        except client.exceptions.GoneException:
            # 클라이언트가 이미 연결을 종료한 경우
            stale_ids.append(connection_id)
        except Exception as e:  # noqa: BLE001
            logger.error("WsNotify: push failed for %s: %s", connection_id, e)

    if stale_ids:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM ws_connections WHERE connection_id = ANY(%s)",
                (stale_ids,),
            )
        conn.commit()
        logger.info("WsNotify: cleaned up %d stale connections", len(stale_ids))
