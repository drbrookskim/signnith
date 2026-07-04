"""
Gate B — 수급 진입 허가 모듈
Layer 1(시장 전체) · Layer 2(섹터) · Layer 3(종목) 3레이어 순차 판정
하나라도 STOP → 전면 대기
"""

def check_gate_b(
    market_foreign_days: int,
    market_institution: str,
    sector_etf_days: int,
    stock_foreign_days: int,
    stock_institution_weeks: int,
    short_ratio: float,
    short_trend: str,
) -> dict:
    """
    Parameters
    ----------
    market_foreign_days     : 외국인 순매수 연속 거래일 (음수=순매도)
    market_institution      : 'buy' | 'sell' | 'neutral'
    sector_etf_days         : 섹터 ETF 순유입 연속 거래일 (음수=순유출)
    stock_foreign_days      : 종목 외국인 순매수 연속 거래일
    stock_institution_weeks : 기관 누적 순매수 주수 (음수=순매도)
    short_ratio             : 대차잔고 / 시총 (예: 0.03 = 3%)
    short_trend             : 'decrease' | 'increase' | 'stable'

    Returns
    -------
    dict
      layer1, layer2, layer3: 'GO' | 'WARN' | 'STOP'
      gate_b: 'PASS' | 'BLOCK'
      matrix: 'STRONG_BUY' | 'FIND_ALTERNATIVE' | 'HEADWIND_SHORT_ONLY' | 'NO_ENTRY'
    """
    result = {}

    # --- Layer 1: 시장 전체 수급 ---
    if market_foreign_days >= 3 and market_institution == 'buy':
        result['layer1'] = 'GO'
    elif market_foreign_days <= -3 and market_institution == 'sell':
        result['layer1'] = 'STOP'
    else:
        result['layer1'] = 'WARN'

    # --- Layer 2: 섹터 수급 ---
    if sector_etf_days >= 5:
        result['layer2'] = 'GO'
    elif sector_etf_days <= -3:
        result['layer2'] = 'STOP'
    else:
        result['layer2'] = 'WARN'

    # --- Layer 3: 종목 수급 ---
    short_ok = short_ratio < 0.03 and short_trend == 'decrease'
    stock_ok = stock_foreign_days >= 5 and stock_institution_weeks >= 3

    if stock_ok and short_ok:
        result['layer3'] = 'GO'
    elif stock_foreign_days <= -3 or stock_institution_weeks <= -2:
        result['layer3'] = 'STOP'
    else:
        result['layer3'] = 'WARN'

    # --- 최종 Gate B 판정 ---
    stops = [k for k, v in result.items() if v == 'STOP']
    result['stop_layers'] = stops
    result['gate_b'] = 'BLOCK' if stops else 'PASS'

    # --- 2×2 매트릭스 ---
    sector_good = result['layer2'] == 'GO'
    stock_good  = result['layer3'] == 'GO'

    if sector_good and stock_good:
        result['matrix'] = 'STRONG_BUY'
        result['matrix_action'] = 'Step 1 체력 필터로 진행'
    elif sector_good and not stock_good:
        result['matrix'] = 'FIND_ALTERNATIVE'
        result['matrix_action'] = '동종 섹터 내 대안 종목 탐색'
    elif not sector_good and stock_good:
        result['matrix'] = 'HEADWIND_SHORT_ONLY'
        result['matrix_action'] = '헤드윈드 진입 — 보유 2주 이내 제한'
    else:
        result['matrix'] = 'NO_ENTRY'
        result['matrix_action'] = '진입 금지 — 관망'

    return result


if __name__ == '__main__':
    sample = check_gate_b(
        market_foreign_days=4,
        market_institution='buy',
        sector_etf_days=6,
        stock_foreign_days=5,
        stock_institution_weeks=3,
        short_ratio=0.02,
        short_trend='decrease',
    )
    import json; print(json.dumps(sample, ensure_ascii=False, indent=2))
