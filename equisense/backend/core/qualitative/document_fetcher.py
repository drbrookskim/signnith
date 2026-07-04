"""Step Functions State 1 — 외부 문서 수집 및 S3 업로드.

지원 소스:
  KR: DART OpenAPI v2 (opendart.fss.or.kr)
  US: SEC EDGAR (data.sec.gov)
"""

from __future__ import annotations

import json
import logging
import os
import time
import urllib.error
import urllib.request
from typing import Any, Optional

logger = logging.getLogger(__name__)

# 모듈 레벨 S3 클라이언트 캐싱 — 웜 컨테이너 재사용 시 재생성 방지
_s3_client: Optional[Any] = None

DART_BASE = "https://opendart.fss.or.kr/api"
SEC_BASE = "https://data.sec.gov"
SEC_HEADERS = {"User-Agent": "EquiSense dev@equisense.io"}  # EDGAR 정책 요구사항

# DART 보고서 코드 매핑
_DART_REPRT_CODE = {
    "annual_report": "11011",  # 사업보고서
    "earnings_call": "11014",  # 반기보고서 (어닝콜 대체)
}

MAX_RETRIES = 3
RETRY_DELAYS = (1, 2, 4)
REQUEST_TIMEOUT = 30


class DocumentFetchError(Exception):
    """문서 수집 실패 시 발생합니다."""


# ---------------------------------------------------------------------------
# 공개 인터페이스
# ---------------------------------------------------------------------------


def fetch_and_upload(
    ticker: str,
    market: str,
    doc_type: str,
    fiscal_year: int,
    job_id: str,
) -> str:
    """문서를 다운로드하고 S3에 업로드한 뒤 S3 키를 반환합니다.

    Args:
        ticker: 종목코드
        market: 'KR' | 'US'
        doc_type: 'annual_report' | 'earnings_call'
        fiscal_year: 대상 회계연도
        job_id: 분석 작업 ID (S3 경로에 사용)

    Returns:
        S3 객체 키 (예: "raw/{job_id}/AAPL_2024.pdf")

    Raises:
        DocumentFetchError: 문서 수집 실패
    """
    if market == "KR":
        pdf_bytes = _fetch_dart(ticker, doc_type, fiscal_year)
    else:
        pdf_bytes = _fetch_sec(ticker, doc_type, fiscal_year)

    s3_key = _upload_to_s3(pdf_bytes, ticker, fiscal_year, job_id)
    logger.info("Uploaded document to S3: %s (%d bytes)", s3_key, len(pdf_bytes))
    return s3_key


# ---------------------------------------------------------------------------
# DART (KR)
# ---------------------------------------------------------------------------


def _fetch_dart(ticker: str, doc_type: str, fiscal_year: int) -> bytes:
    """DART OpenAPI에서 사업보고서 ZIP을 다운로드하고 첫 번째 PDF 바이트를 반환합니다."""
    api_key = os.environ.get("DART_API_KEY", "")
    if not api_key:
        raise DocumentFetchError("DART_API_KEY 환경변수가 설정되지 않았습니다")

    corp_code = _get_dart_corp_code(ticker, api_key)
    reprt_code = _DART_REPRT_CODE.get(doc_type, "11011")
    pdf_url = _get_dart_document_url(corp_code, fiscal_year, reprt_code, api_key)
    return _download_bytes(pdf_url)


def _get_dart_corp_code(ticker: str, api_key: str) -> str:
    """DART 종목코드 → corp_code 조회."""
    url = f"{DART_BASE}/company.json?crtfc_key={api_key}&stock_code={ticker}"
    data = _fetch_json_with_retry(url)
    corp_code = data.get("corp_code")
    if not corp_code:
        raise DocumentFetchError(f"DART corp_code not found for ticker {ticker}")
    return corp_code


def _get_dart_document_url(corp_code: str, fiscal_year: int, reprt_code: str, api_key: str) -> str:
    """DART 문서 목록에서 가장 최근 PDF URL을 조회합니다."""
    url = (
        f"{DART_BASE}/fnlttXbrlFiles.json"
        f"?crtfc_key={api_key}&corp_code={corp_code}"
        f"&bsns_year={fiscal_year}&reprt_code={reprt_code}"
    )
    data = _fetch_json_with_retry(url)
    files = data.get("list", [])
    if not files:
        raise DocumentFetchError(
            f"DART: no documents found for corp={corp_code} year={fiscal_year}"
        )
    # 첫 번째 파일 URL 사용
    file_url = files[0].get("url") or files[0].get("down_url")
    if not file_url:
        raise DocumentFetchError("DART document URL not found in response")
    return file_url


# ---------------------------------------------------------------------------
# SEC EDGAR (US)
# ---------------------------------------------------------------------------


def _fetch_sec(ticker: str, doc_type: str, fiscal_year: int) -> bytes:
    """SEC EDGAR에서 10-K 보고서를 다운로드합니다."""
    cik = _get_sec_cik(ticker)
    filing_url = _get_sec_filing_url(cik, fiscal_year, doc_type)
    return _download_bytes(filing_url, headers=SEC_HEADERS)


def _get_sec_cik(ticker: str) -> str:
    """SEC EDGAR ticker → CIK 조회."""
    url = "https://www.sec.gov/files/company_tickers.json"
    data = _fetch_json_with_retry(url, headers=SEC_HEADERS)
    ticker_upper = ticker.upper()
    for entry in data.values():
        if entry.get("ticker", "").upper() == ticker_upper:
            return str(entry["cik_str"]).zfill(10)
    raise DocumentFetchError(f"SEC CIK not found for ticker {ticker}")


def _get_sec_filing_url(cik: str, fiscal_year: int, doc_type: str) -> str:
    """SEC EDGAR submissions API에서 가장 최근 10-K URL을 조회합니다."""
    url = f"{SEC_BASE}/submissions/CIK{cik}.json"
    data = _fetch_json_with_retry(url, headers=SEC_HEADERS)
    filings = data.get("filings", {}).get("recent", {})

    form_type = "10-K" if doc_type == "annual_report" else "10-Q"
    forms = filings.get("form", [])
    dates = filings.get("filingDate", [])
    accession_numbers = filings.get("accessionNumber", [])

    for i, form in enumerate(forms):
        if form == form_type and str(fiscal_year) in dates[i]:
            accession = accession_numbers[i].replace("-", "")
            index_url = f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{accession}/{accession}-index.htm"
            return index_url

    raise DocumentFetchError(f"SEC: no {form_type} filing found for CIK={cik} year={fiscal_year}")


# ---------------------------------------------------------------------------
# S3 업로드
# ---------------------------------------------------------------------------


def _get_s3():
    global _s3_client
    if _s3_client is None:
        import boto3

        _s3_client = boto3.client("s3")
    return _s3_client


def _upload_to_s3(pdf_bytes: bytes, ticker: str, fiscal_year: int, job_id: str) -> str:
    """PDF 바이트를 S3에 업로드하고 S3 키를 반환합니다."""
    bucket = os.environ["RAG_DOCS_BUCKET"]
    s3_key = f"raw/{job_id}/{ticker}_{fiscal_year}.pdf"
    _get_s3().put_object(
        Bucket=bucket,
        Key=s3_key,
        Body=pdf_bytes,
        ContentType="application/pdf",
    )
    return s3_key


# ---------------------------------------------------------------------------
# HTTP 유틸
# ---------------------------------------------------------------------------


def _fetch_json_with_retry(url: str, headers: Optional[dict] = None) -> dict:
    """지수 백오프 재시도로 URL에서 JSON을 가져옵니다."""
    last_err: Optional[Exception] = None
    for attempt, delay in enumerate(RETRY_DELAYS[:MAX_RETRIES], start=1):
        try:
            req = urllib.request.Request(url, headers=headers or {})
            with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:  # nosec B310
                return json.loads(resp.read())
        except (urllib.error.URLError, OSError) as e:
            last_err = e
            if attempt < MAX_RETRIES:
                time.sleep(delay)
    raise DocumentFetchError(f"HTTP JSON fetch failed after {MAX_RETRIES} retries: {last_err}")


def _download_bytes(url: str, headers: Optional[dict] = None) -> bytes:
    """지수 백오프 재시도로 URL에서 바이트를 다운로드합니다."""
    last_err: Optional[Exception] = None
    for attempt, delay in enumerate(RETRY_DELAYS[:MAX_RETRIES], start=1):
        try:
            req = urllib.request.Request(url, headers=headers or {})
            with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:  # nosec B310
                return resp.read()
        except (urllib.error.URLError, OSError) as e:
            last_err = e
            if attempt < MAX_RETRIES:
                time.sleep(delay)
    raise DocumentFetchError(f"Download failed after {MAX_RETRIES} retries: {last_err}")
