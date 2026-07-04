"""기술적 스크리닝 로직 — TechnicalScreener 핵심 로직.

Redis 캐싱된 주가와 52주 고저가를 이용해 저평가·단기 과열 여부를 판단하고,
결과를 Neon DB `screener_results` 테이블에 저장합니다.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)

# 스크리닝 기준 상수
UNDERVALUED_THRESHOLD = 1.2  # 현재가 < 52주 저가 × 1.2
OVERBOUGHT_THRESHOLD = 0.9  # 현재가 > 52주 고가 × 0.9


class ScreenerError(Exception):
    """스크리닝 실패 시 발생합니다."""


def screen_all_companies() -> dict[str, Any]:
    """등록된 모든 종목에 대해 스크리닝을 실행하고 결과를 DB에 저장합니다.

    Returns:
        {"screened": int, "undervalued": [...], "overbought": [...], "errors": [...]}
    """
    tickers = _get_all_tickers()
    undervalued: list[str] = []
    overbought: list[str] = []
    errors: list[str] = []

    for ticker, market in tickers:
        try:
            quote = _get_cached_price(ticker)
            if quote is None:
                logger.debug("No cached price for %s, skipping", ticker)
                continue
            result = _classify(ticker, market, quote)
            _save_result(result)
            if result["is_undervalued"]:
                undervalued.append(ticker)
            if result["is_overbought"]:
                overbought.append(ticker)
        except Exception as e:  # noqa: BLE001
            logger.error("Screener error for %s: %s", ticker, e)
            errors.append(f"{ticker}: {e}")

    logger.info(
        "Screening complete: %d tickers, %d undervalued, %d overbought",
        len(tickers),
        len(undervalued),
        len(overbought),
    )
    return {
        "screened": len(tickers),
        "undervalued": undervalued,
        "overbought": overbought,
        "errors": errors,
    }


def _get_all_tickers() -> list[tuple[str, str]]:
    """Neon DB에서 모든 종목의 (ticker, market) 목록을 조회합니다."""
    from core.db import get_connection  # noqa: PLC0415

    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT ticker, market FROM companies ORDER BY ticker")
        return cur.fetchall()


def _get_cached_price(ticker: str) -> Optional[dict[str, Any]]:
    """Upstash Redis에서 캐싱된 주가 데이터를 조회합니다."""
    from core.cache import _get_client  # noqa: PLC0415

    raw = _get_client().get(f"price:{ticker}")
    return json.loads(raw) if raw else None


def _classify(ticker: str, market: str, quote: dict[str, Any]) -> dict[str, Any]:
    """주가 데이터를 기반으로 저평가·과열 여부를 판단합니다."""
    price = float(quote.get("price", 0))
    week_52_high = float(quote.get("week_52_high", 0))
    week_52_low = float(quote.get("week_52_low", 0))

    is_undervalued = price > 0 and week_52_low > 0 and price < week_52_low * UNDERVALUED_THRESHOLD
    is_overbought = price > 0 and week_52_high > 0 and price > week_52_high * OVERBOUGHT_THRESHOLD

    return {
        "ticker": ticker,
        "market": market,
        "price": price,
        "week_52_high": week_52_high,
        "week_52_low": week_52_low,
        "is_undervalued": is_undervalued,
        "is_overbought": is_overbought,
        "signal": _signal_label(is_undervalued, is_overbought),
    }


def _signal_label(is_undervalued: bool, is_overbought: bool) -> str:
    if is_undervalued and not is_overbought:
        return "undervalued"
    if is_overbought and not is_undervalued:
        return "overbought"
    if is_undervalued and is_overbought:
        return "neutral"  # 논리적 불일치 — 데이터 이상
    return "neutral"


def _save_result(result: dict[str, Any]) -> None:
    """스크리닝 결과를 Neon DB screener_results 테이블에 upsert합니다."""
    from core.db import get_connection  # noqa: PLC0415

    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO screener_results
                (ticker, market, price, week_52_high, week_52_low,
                 signal, is_undervalued, is_overbought)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (ticker, market)
            DO UPDATE SET
                price          = EXCLUDED.price,
                week_52_high   = EXCLUDED.week_52_high,
                week_52_low    = EXCLUDED.week_52_low,
                signal         = EXCLUDED.signal,
                is_undervalued = EXCLUDED.is_undervalued,
                is_overbought  = EXCLUDED.is_overbought,
                screened_at    = NOW()
            """,
            (
                result["ticker"],
                result["market"],
                result["price"],
                result["week_52_high"],
                result["week_52_low"],
                result["signal"],
                result["is_undervalued"],
                result["is_overbought"],
            ),
        )
    conn.commit()
