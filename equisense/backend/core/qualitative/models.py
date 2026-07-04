"""Module 3 정성적 분석 Pydantic 모델."""

from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel


class DocType(str, Enum):
    ANNUAL_REPORT = "annual_report"
    EARNINGS_CALL = "earnings_call"


class JobStatus(str, Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class AnalysisJob(BaseModel):
    """analysis_jobs 테이블 레코드."""

    id: str
    ticker: str
    market: str
    doc_type: str
    fiscal_year: int
    status: JobStatus
    retry_count: int = 0
    error_message: Optional[str] = None
    created_at: str
    updated_at: str


class RiskFactor(BaseModel):
    title: str
    description: str
    severity: str  # 'high' | 'medium' | 'low'


class GrowthDriver(BaseModel):
    title: str
    description: str


class NoiseFilterItem(BaseModel):
    claim: str
    is_substantiated: bool
    evidence: str


class QualitativeResult(BaseModel):
    """qualitative_results 테이블 레코드."""

    id: str
    job_id: str
    ticker: str
    fiscal_period: str
    integrity_score: Optional[int] = None
    summary_ko: Optional[str] = None
    risk_factors: Optional[list[dict]] = None
    growth_drivers: Optional[list[dict]] = None
    noise_filter: Optional[list[dict]] = None
    created_at: str


class JobStatusResponse(BaseModel):
    """GET /jobs/{job_id} 응답 모델."""

    job_id: str
    status: JobStatus
    result: Optional[QualitativeResult] = None
    error: Optional[str] = None
