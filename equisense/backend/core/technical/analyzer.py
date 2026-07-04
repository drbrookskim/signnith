"""Module 4 기술적 분석 — FMP 원시 데이터 → TechnicalAnalysis 변환."""

from __future__ import annotations

from core.technical.models import TechnicalAnalysis, TechnicalDataPoint, TechnicalSummary


def build_technical_analysis(
    raw_history: list[dict],
    ticker: str,
    market: str,
    period: str,
) -> TechnicalAnalysis:
    """FMP historical 배열을 정규화하고 요약 통계를 계산합니다.

    Args:
        raw_history: FMP ``historical`` 배열 (최신 날짜 순 또는 혼합 순서 허용)
        ticker: 종목코드
        market: 'KR' | 'US'
        period: '1m' | '3m' | '6m' | '1y' | '3y'

    Returns:
        정렬된 data_points(날짜 오름차순)와 summary가 포함된 TechnicalAnalysis
    """
    sorted_raw = sorted(raw_history, key=lambda x: x.get("date", ""))

    data_points: list[TechnicalDataPoint] = []
    for d in sorted_raw:
        if not d.get("date") or d.get("close") is None:
            continue
        vol_raw = d.get("volume")
        data_points.append(
            TechnicalDataPoint(
                date=d["date"],
                open=d.get("open"),
                high=d.get("high"),
                low=d.get("low"),
                close=float(d["close"]),
                volume=int(vol_raw) if vol_raw is not None else None,
                change_pct=d.get("changePercent"),
            )
        )

    summary = _compute_summary(data_points)
    return TechnicalAnalysis(
        ticker=ticker,
        market=market,
        period=period,
        data_points=data_points,
        summary=summary,
    )


def _compute_summary(data_points: list[TechnicalDataPoint]) -> TechnicalSummary:
    """data_points 목록에서 요약 통계를 계산합니다."""
    if not data_points:
        return TechnicalSummary()

    closes = [p.close for p in data_points if p.close is not None]
    highs = [p.high for p in data_points if p.high is not None]
    lows = [p.low for p in data_points if p.low is not None]
    volumes = [p.volume for p in data_points if p.volume is not None]

    start_price = closes[0] if closes else None
    end_price = closes[-1] if closes else None

    period_return_pct: float | None = None
    if start_price is not None and end_price is not None and start_price != 0:
        period_return_pct = round((end_price - start_price) / start_price * 100, 2)

    return TechnicalSummary(
        start_price=start_price,
        end_price=end_price,
        period_return_pct=period_return_pct,
        high_period=max(highs) if highs else None,
        low_period=min(lows) if lows else None,
        avg_volume=int(sum(volumes) / len(volumes)) if volumes else None,
    )
