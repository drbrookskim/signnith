"""
Step 1 — 체력 필터
Step 5 — R:R 검증
Step 6 — 청산 조건 (시간 손절 포함)
"""

# ─────────────────────────────────────────
# Step 1: 체력 필터
# ─────────────────────────────────────────

def check_health_filter_manual(
    total_debt: float,
    equity: float,
    operating_income: float,
    interest_expense: float,
    operating_cash_flow: float,
) -> dict:
    """
    수동 입력 버전 (DART 공시 또는 네이버 증권 기준)

    Parameters
    ----------
    total_debt          : 총부채 (억원)
    equity              : 자기자본 (억원)
    operating_income    : 영업이익 (억원)
    interest_expense    : 이자비용 (억원, 양수)
    operating_cash_flow : 영업활동현금흐름 (억원)
    """
    debt_ratio = total_debt / equity * 100 if equity > 0 else float('inf')
    icr        = operating_income / interest_expense if interest_expense > 0 else float('inf')
    ocf        = operating_cash_flow

    return {
        'debt_ratio':  round(debt_ratio, 1),
        'debt_pass':   debt_ratio <= 200,
        'icr':         round(icr, 1),
        'icr_pass':    icr >= 1.5,
        'ocf':         ocf,
        'ocf_pass':    ocf > 0,
        'step1_pass':  debt_ratio <= 200 and icr >= 1.5 and ocf > 0,
    }


def check_health_filter_yf(ticker_ks: str) -> dict:
    """
    yfinance 자동 조회 버전

    Parameters
    ----------
    ticker_ks : Yahoo Finance 심볼 (예: '042700.KS')
    """
    try:
        import yfinance as yf
        t   = yf.Ticker(ticker_ks)
        bs  = t.balance_sheet
        cf  = t.cashflow
        inc = t.financials

        total_debt   = float(bs.loc['Total Debt'].iloc[0])
        equity       = float(bs.loc['Stockholders Equity'].iloc[0])
        op_income    = float(inc.loc['Operating Income'].iloc[0])
        interest_exp = abs(float(inc.loc['Interest Expense'].iloc[0]))
        ocf          = float(cf.loc['Operating Cash Flow'].iloc[0])

        return check_health_filter_manual(
            total_debt, equity, op_income, interest_exp, ocf
        )
    except Exception as e:
        return {'error': str(e), 'step1_pass': False}


# ─────────────────────────────────────────
# Step 5: R:R 검증
# ─────────────────────────────────────────

def check_rr(
    entry: float,
    stop: float,
    target: float,
    min_rr: float = 2.0,
) -> dict:
    """
    Parameters
    ----------
    entry   : 진입가 (원)
    stop    : 손절선 (원)
    target  : 목표가 (원)
    min_rr  : 최소 R:R 기준 (기본 2.0)

    Returns
    -------
    dict
      rr, loss_pct, gain_pct, breakeven_winrate
      verdict: 'PASS' | 'CAUTION' | 'BLOCK'
    """
    if stop >= entry or target <= entry:
        return {
            'valid':   False,
            'reason':  '손절 < 진입 < 목표 조건 불충족',
            'verdict': 'BLOCK',
            'step5_pass': False,
        }

    risk       = entry - stop
    reward     = target - entry
    rr         = reward / risk
    loss_pct   = (stop - entry) / entry * 100
    gain_pct   = (target - entry) / entry * 100
    breakeven  = 1 / (1 + rr) * 100

    if rr >= min_rr:
        verdict = 'PASS'
    elif rr >= 1.5:
        verdict = 'CAUTION'
    else:
        verdict = 'BLOCK'

    return {
        'valid':              True,
        'entry':              entry,
        'stop':               stop,
        'target':             target,
        'risk_amount':        round(risk, 0),
        'reward_amount':      round(reward, 0),
        'loss_pct':           round(loss_pct, 1),
        'gain_pct':           round(gain_pct, 1),
        'rr':                 round(rr, 2),
        'breakeven_winrate':  round(breakeven, 1),
        'verdict':            verdict,
        'step5_pass':         rr >= min_rr,
    }


# ─────────────────────────────────────────
# Step 6: 시간 손절
# ─────────────────────────────────────────

from datetime import date, timedelta

TRADING_DAYS_BY_TYPE = {
    'high_beta':  10,   # 고베타·이벤트 주도형
    'value':      15,   # 저베타·가치형 / 수출·매크로형
    'small_cap':  10,   # 소형·성장형 (연장 없음)
}

def get_time_stop(
    entry_date: date,
    stock_type: str = 'value',
    extension: bool = False,
) -> dict:
    """
    Parameters
    ----------
    entry_date : 진입일 (date 객체)
    stock_type : 'high_beta' | 'value' | 'small_cap'
    extension  : True이면 +5거래일 연장 (연장 조건 충족 시만)

    Returns
    -------
    dict
      deadline, elapsed, remaining
      status: 'HOLDING' | 'PREPARE_EXIT' | 'TIME_STOP'
    """
    base_days = TRADING_DAYS_BY_TYPE.get(stock_type, 15)
    total_days = base_days + (5 if extension and stock_type != 'small_cap' else 0)

    deadline  = _add_trading_days(entry_date, total_days)
    today     = date.today()
    elapsed   = _trading_days_between(entry_date, today)
    remaining = total_days - elapsed

    if remaining > 5:
        status = 'HOLDING'
    elif remaining > 0:
        status = 'PREPARE_EXIT'
    else:
        status = 'TIME_STOP'

    return {
        'entry_date':  entry_date.isoformat(),
        'deadline':    deadline.isoformat(),
        'total_days':  total_days,
        'elapsed':     max(0, elapsed),
        'remaining':   max(0, remaining),
        'status':      status,
        'action':      {
            'HOLDING':      f'보유 유지 — {max(0,remaining)}거래일 남음',
            'PREPARE_EXIT': f'청산 준비 시작 — {max(0,remaining)}거래일 남음',
            'TIME_STOP':    '시간 손절 실행 — 익일 시초가 청산',
        }[status],
    }


def _add_trading_days(d: date, n: int) -> date:
    added = 0
    while added < n:
        d = d + timedelta(days=1)
        if d.weekday() < 5:
            added += 1
    return d


def _trading_days_between(a: date, b: date) -> int:
    if a > b:
        return -_trading_days_between(b, a)
    count, cur = 0, a
    while cur < b:
        cur += timedelta(days=1)
        if cur.weekday() < 5:
            count += 1
    return count


# ─────────────────────────────────────────
# 청산 트리거 종합 판정
# ─────────────────────────────────────────

def check_exit_triggers(
    current_price: float,
    entry: float,
    stop: float,
    target: float,
    entry_date: date,
    stock_type: str = 'value',
    op_margin_qoq: str = 'stable',  # 'up' | 'down' | 'stable'
    icr_ok: bool = True,
    extension: bool = False,
) -> dict:
    """
    4가지 청산 트리거 종합 판정

    Returns
    -------
    dict
      triggers: 발동된 트리거 목록
      action:   'HOLD' | 'EXIT'
      reason:   청산 이유
    """
    triggers = []

    if current_price >= target:
        triggers.append('TAKE_PROFIT')
    if current_price <= stop:
        triggers.append('STOP_LOSS')
    if op_margin_qoq == 'down' or not icr_ok:
        triggers.append('FUNDAMENTAL_DETERIORATION')

    ts = get_time_stop(entry_date, stock_type, extension)
    if ts['status'] == 'TIME_STOP':
        triggers.append('TIME_STOP')

    action = 'EXIT' if triggers else 'HOLD'
    pnl_pct = (current_price - entry) / entry * 100

    return {
        'current_price':  current_price,
        'pnl_pct':        round(pnl_pct, 1),
        'triggers':       triggers,
        'action':         action,
        'reason':         ', '.join(triggers) if triggers else '청산 조건 미해당',
        'time_stop_info': ts,
    }


# ─────────────────────────────────────────
# 실행 예시
# ─────────────────────────────────────────

if __name__ == '__main__':
    import json

    print("=== Step 1: 체력 필터 (한미반도체 예시) ===")
    s1 = check_health_filter_manual(
        total_debt=3200, equity=7800,
        operating_income=3100, interest_expense=80,
        operating_cash_flow=2600,
    )
    print(json.dumps(s1, ensure_ascii=False, indent=2))

    print("\n=== Step 5: R:R 검증 ===")
    s5 = check_rr(entry=68000, stop=65960, target=82000)
    print(json.dumps(s5, ensure_ascii=False, indent=2))

    print("\n=== Step 6: 시간 손절 ===")
    s6 = get_time_stop(date.today(), stock_type='high_beta')
    print(json.dumps(s6, ensure_ascii=False, indent=2))

    print("\n=== 청산 트리거 종합 ===")
    ex = check_exit_triggers(
        current_price=71000, entry=68000,
        stop=65960, target=82000,
        entry_date=date.today(), stock_type='high_beta',
    )
    print(json.dumps(ex, ensure_ascii=False, indent=2))
