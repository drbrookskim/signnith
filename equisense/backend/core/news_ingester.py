"""뉴스·공시 수집 및 캐싱 — NewsIngestionWorker 핵심 로직.

- US 종목: Alpha Vantage NEWS_SENTIMENT API → Redis TTL 1h + Neon DB
- KR 종목: DART 공시 목록 API → Redis TTL 1h + Neon DB

KR 판별: 6자리 숫자 ticker (예: 005930)
US 판별: 1~5자리 대문자 알파벳 ticker (예: AAPL)
"""

from __future__ import annotations

import json
import logging
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import UTC, datetime, timedelta
from typing import Any, Optional

logger = logging.getLogger(__name__)

AV_BASE = "https://www.alphavantage.co/query"
DART_BASE = "https://opendart.fss.or.kr/api"

NEWS_TTL = 3_600  # 1시간 — CLAUDE.md 뉴스/공시 캐시 TTL
NEWS_LIMIT = 10  # 종목당 최대 수집 뉴스 건수
MAX_RETRIES = 3
RETRY_DELAYS = (1, 2, 4)
REQUEST_TIMEOUT = 10
AV_RATE_DELAY = 13  # Alpha Vantage 무료 티어: 5 calls/min → 12초 + 여유


class NewsIngestionError(Exception):
    """뉴스 수집 실패 시 발생합니다."""


def ingest_all_news(tickers: list[str]) -> dict[str, Any]:
    """watchlist 종목의 최신 뉴스·공시를 수집하고 Redis와 DB에 저장합니다.

    Args:
        tickers: 수집 대상 종목 코드 목록 (예: ["AAPL", "MSFT", "005930"])

    Returns:
        {"ingested": {ticker: count}, "errors": [...]}
    """
    av_key = os.environ.get("ALPHA_VANTAGE_API_KEY", "")
    dart_key = os.environ.get("DART_API_KEY", "")

    if not av_key and not dart_key:
        raise NewsIngestionError(
            "API 키가 설정되지 않았습니다 (ALPHA_VANTAGE_API_KEY 또는 DART_API_KEY)"
        )

    ingested: dict[str, int] = {}
    errors: list[str] = []

    for i, ticker in enumerate(tickers):
        try:
            if _is_kr_ticker(ticker):
                articles = _fetch_dart_disclosures(ticker, dart_key)
            else:
                articles = _fetch_av_news(ticker, av_key)
                # Alpha Vantage rate limit 준수 (마지막 요청 후엔 대기 불필요)
                if i < len(tickers) - 1 and not _is_kr_ticker(ticker):
                    time.sleep(AV_RATE_DELAY)

            _cache_news(ticker, articles)
            _save_to_db(ticker, "KR" if _is_kr_ticker(ticker) else "US", articles)
            ingested[ticker] = len(articles)
            logger.info("Ingested %d articles for %s", len(articles), ticker)
        except Exception as e:  # noqa: BLE001
            logger.error("Failed to ingest news for %s: %s", ticker, e)
            errors.append(f"{ticker}: {e}")

    return {"ingested": ingested, "errors": errors}


# ---------------------------------------------------------------------------
# US 뉴스 — Alpha Vantage NEWS_SENTIMENT
# ---------------------------------------------------------------------------


def _fetch_av_news(ticker: str, api_key: str) -> list[dict[str, Any]]:
    """Alpha Vantage NEWS_SENTIMENT API로 최근 24시간 뉴스를 조회합니다."""
    if not api_key:
        raise NewsIngestionError("ALPHA_VANTAGE_API_KEY가 설정되지 않았습니다")

    since = (datetime.now(UTC) - timedelta(hours=24)).strftime("%Y%m%dT%H%M")
    params = urllib.parse.urlencode(
        {
            "function": "NEWS_SENTIMENT",
            "tickers": ticker,
            "time_from": since,
            "limit": NEWS_LIMIT,
            "apikey": api_key,
        }
    )
    data = _fetch_json(f"{AV_BASE}?{params}")

    articles = []
    for item in data.get("feed", []):
        articles.append(
            {
                "title": item.get("title", ""),
                "url": item.get("url", ""),
                "published_at": item.get("time_published", ""),
                "source": item.get("source", ""),
                "summary": item.get("summary", ""),
                "sentiment_score": float(item.get("overall_sentiment_score", 0)),
            }
        )
    return articles


# ---------------------------------------------------------------------------
# KR 공시 — DART OpenAPI
# ---------------------------------------------------------------------------


def _fetch_dart_disclosures(ticker: str, dart_key: str) -> list[dict[str, Any]]:
    """DART API로 오늘 날짜의 공시 목록을 조회합니다."""
    if not dart_key:
        raise NewsIngestionError("DART_API_KEY가 설정되지 않았습니다")

    corp_code = _get_dart_corp_code(ticker, dart_key)
    today = datetime.now(UTC).strftime("%Y%m%d")

    params = urllib.parse.urlencode(
        {
            "crtfc_key": dart_key,
            "corp_code": corp_code,
            "bgn_de": today,
            "end_de": today,
            "pblntf_ty": "A",  # 정기공시 (사업보고서·분기보고서)
            "page_count": NEWS_LIMIT,
        }
    )
    data = _fetch_json(f"{DART_BASE}/list.json?{params}")

    articles = []
    for item in data.get("list", []):
        articles.append(
            {
                "title": item.get("report_nm", ""),
                "url": f"https://dart.fss.or.kr/dsaf001/main.do?rcpNo={item.get('rcept_no', '')}",
                "published_at": item.get("rcept_dt", ""),
                "source": "DART",
                "summary": "",
                "sentiment_score": None,
            }
        )
    return articles


def _get_dart_corp_code(ticker: str, dart_key: str) -> str:
    """DART company API로 종목코드에 대응하는 기업 고유 코드를 반환합니다."""
    params = urllib.parse.urlencode({"crtfc_key": dart_key, "stock_code": ticker})
    data = _fetch_json(f"{DART_BASE}/company.json?{params}")
    corp_code = data.get("corp_code", "")
    if not corp_code:
        raise NewsIngestionError(f"DART corp_code 조회 실패: ticker={ticker}")
    return corp_code


# ---------------------------------------------------------------------------
# 저장 — Redis + Neon DB
# ---------------------------------------------------------------------------


def _cache_news(ticker: str, articles: list[dict[str, Any]]) -> None:
    """Upstash Redis에 뉴스 데이터를 TTL 1h로 캐싱합니다."""
    from core.cache import _get_client  # noqa: PLC0415

    payload = json.dumps({"articles": articles, "fetched_at": datetime.utcnow().isoformat()})
    _get_client().setex(f"news:{ticker}", NEWS_TTL, payload)


def _save_to_db(ticker: str, market: str, articles: list[dict[str, Any]]) -> None:
    """Neon DB news_articles 테이블에 뉴스를 upsert합니다."""
    if not articles:
        return

    from core.db import get_connection  # noqa: PLC0415

    conn = get_connection()
    with conn.cursor() as cur:
        for article in articles:
            cur.execute(
                """
                INSERT INTO news_articles
                    (ticker, market, title, url, source, published_at, summary, sentiment_score)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (ticker, url) DO NOTHING
                """,
                (
                    ticker,
                    market,
                    article["title"],
                    article["url"],
                    article["source"],
                    article["published_at"] or None,
                    article["summary"] or None,
                    article["sentiment_score"],
                ),
            )
    conn.commit()


# ---------------------------------------------------------------------------
# 공통 유틸리티
# ---------------------------------------------------------------------------


def _is_kr_ticker(ticker: str) -> bool:
    """6자리 숫자면 한국 종목으로 판별합니다."""
    return ticker.isdigit() and len(ticker) == 6


def _fetch_json(url: str) -> dict:
    """지수 백오프 재시도로 URL에서 JSON을 가져옵니다."""
    last_err: Optional[Exception] = None
    for attempt, delay in enumerate(RETRY_DELAYS[:MAX_RETRIES], start=1):
        try:
            with urllib.request.urlopen(url, timeout=REQUEST_TIMEOUT) as resp:  # nosec B310
                return json.loads(resp.read())
        except (urllib.error.URLError, OSError) as e:
            last_err = e
            if attempt < MAX_RETRIES:
                time.sleep(delay)
    raise NewsIngestionError(f"HTTP fetch failed after {MAX_RETRIES} retries: {last_err}")
