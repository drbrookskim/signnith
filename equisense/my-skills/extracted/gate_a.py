"""
Gate A — 거시환경 진입 허가 모듈
VIX · 금리 · PMI · 지수 200MA 4개 축 판정
하나라도 STOP → 전면 대기
"""

def check_gate_a(
    vix: float,
    rate_change_bp: float,
    pmi: float,
    pmi_direction: str,
    idx_vs_200ma: str,
    usdkrw: float = 0,
) -> dict:
    """
    Parameters
    ----------
    vix            : 현재 VIX 수치
    rate_change_bp : 최근 금리 인상 폭(bp). 동결=0, 인하=음수
    pmi            : 최근 PMI 수치
    pmi_direction  : 'up' | 'down'
    idx_vs_200ma   : 'above_up' | 'above_down' | 'below_up' | 'below_down'
    usdkrw         : 원달러 환율 (0이면 미사용)

    Returns
    -------
    dict
      각 축: 'GO' | 'WARN' | 'STOP'
      gate_a: 'PASS' | 'BLOCK'
    """
    result = {}

    # --- VIX ---
    if vix <= 20:
        result['vix'] = 'GO'
    elif vix <= 30:
        result['vix'] = 'WARN'
    else:
        result['vix'] = 'STOP'

    # --- 금리 ---
    if rate_change_bp <= 25:
        result['rate'] = 'GO'
    elif rate_change_bp <= 50:
        result['rate'] = 'WARN'
    else:
        result['rate'] = 'STOP'

    # --- PMI ---
    if pmi >= 50:
        result['pmi'] = 'GO'
    elif pmi >= 45:
        result['pmi'] = 'WARN' if pmi_direction == 'down' else 'GO'
    else:
        result['pmi'] = 'STOP'

    # --- 지수 vs 200MA ---
    if idx_vs_200ma in ('above_up', 'above_down'):
        result['index'] = 'GO'
    elif idx_vs_200ma == 'below_up':
        result['index'] = 'WARN'
    else:
        result['index'] = 'STOP'

    # --- 원달러 환율 (선택) ---
    if usdkrw >= 1400:
        result['usdkrw'] = 'WARN'
    elif usdkrw > 0:
        result['usdkrw'] = 'GO'

    gate_pass = all(v != 'STOP' for v in result.values())
    result['gate_a'] = 'PASS' if gate_pass else 'BLOCK'

    stops = [k for k, v in result.items() if v == 'STOP']
    warns = [k for k, v in result.items() if v == 'WARN']
    result['stop_axes'] = stops
    result['warn_axes'] = warns

    return result


if __name__ == '__main__':
    sample = check_gate_a(
        vix=18.5, rate_change_bp=0,
        pmi=52.3, pmi_direction='up',
        idx_vs_200ma='above_up', usdkrw=1380,
    )
    import json; print(json.dumps(sample, ensure_ascii=False, indent=2))
