"""
signnith_engine.py
==================
index.html 의 분석/결정 로직을 파이썬으로 그대로(numerically faithful) 포팅한 엔진.

목적: 백테스트에서 "과거 각 시점까지의 데이터만으로" 동일한 결정을 재현하기 위함.
각 함수는 index.html 의 동명 함수와 1:1 대응한다. (라인 주석으로 원본 위치 표기)

⚠️ 알려진 한계 (백테스트 해석 시 반드시 고려):
- 펀더멘털/WACC 는 야후의 "현재 스냅샷" 1개만 사용한다(과거 시점 재무 미반영).
  → 기술/캔들/엘리어트/일목/SMC/퀀트/IPP 신호는 시점-정합(point-in-time)이지만
    fund_score / wacc 축은 look-ahead 편향이 있다. IC 해석 시 분리해서 봐야 한다.
"""
import math


# ──────────────────────────────────────────────
# 유틸
# ──────────────────────────────────────────────
def js_round(x):
    """JS Math.round (반올림은 +무한대 방향). Math.round(-0.5)=0, Math.round(0.5)=1."""
    return math.floor(x + 0.5)


def last(arr):
    """index.html last(): 뒤에서부터 첫 non-None 반환."""
    for i in range(len(arr) - 1, -1, -1):
        if arr[i] is not None:
            return arr[i]
    return None


def calc_ema(arr, span):  # index.html:2408
    k = 2.0 / (span + 1)
    out = [None] * len(arr)
    start = next((i for i, v in enumerate(arr) if v is not None), -1)
    if start < 0 or start + span > len(arr):
        return out
    val = sum(arr[start:start + span]) / span
    out[start + span - 1] = val
    for i in range(start + span, len(arr)):
        if arr[i] is not None:
            val = arr[i] * k + val * (1 - k)
            out[i] = val
    return out


def clip(v, lo, hi):
    return max(lo, min(hi, v))


# ──────────────────────────────────────────────
# Layer 1: 지표  (index.html:2421 computeIndicators)
# ──────────────────────────────────────────────
def compute_indicators(bars):
    n = len(bars)
    C = [b['close'] for b in bars]
    H = [b['high'] for b in bars]
    L = [b['low'] for b in bars]
    V = [b['volume'] for b in bars]

    # MACD
    ema12 = calc_ema(C, 12)
    ema26 = calc_ema(C, 26)
    macd_line = [(ema12[i] - ema26[i]) if (ema12[i] is not None and ema26[i] is not None) else None
                 for i in range(n)]
    macd_valid = [v for v in macd_line if v is not None]
    sig_short = calc_ema(macd_valid, 9)
    sig_line = []
    si = 0
    for v in macd_line:
        if v is not None:
            sig_line.append(sig_short[si] if si < len(sig_short) else None)
            si += 1
        else:
            sig_line.append(None)
    hist = [(macd_line[i] - sig_line[i]) if (macd_line[i] is not None and sig_line[i] is not None) else None
            for i in range(n)]

    # RSI (Wilder)
    rsi = [None] * n
    if n > 14:
        ag = al = 0.0
        for i in range(1, 15):
            d = C[i] - C[i - 1]
            if d > 0:
                ag += d
            else:
                al -= d
        ag /= 14
        al /= 14
        rsi[14] = 100 if al == 0 else 100 - 100 / (1 + ag / al)
        for i in range(15, n):
            d = C[i] - C[i - 1]
            g = max(d, 0)
            l = max(-d, 0)
            ag = (ag * 13 + g) / 14
            al = (al * 13 + l) / 14
            rsi[i] = 100 if al == 0 else 100 - 100 / (1 + ag / al)

    # Stochastic K/D
    stoch_k = [None] * n
    stoch_d = [None] * n
    for i in range(13, n):
        lo = min(L[i - 13:i + 1])
        hi = max(H[i - 13:i + 1])
        stoch_k[i] = 50 if hi == lo else 100 * (C[i] - lo) / (hi - lo)
    for i in range(15, n):
        if stoch_k[i] is not None and stoch_k[i - 1] is not None and stoch_k[i - 2] is not None:
            stoch_d[i] = (stoch_k[i] + stoch_k[i - 1] + stoch_k[i - 2]) / 3

    # SMA5 / SMA50
    sma5 = [None] * n
    sma50 = [None] * n
    for i in range(4, n):
        sma5[i] = sum(C[i - 4:i + 1]) / 5
    for i in range(49, n):
        sma50[i] = sum(C[i - 49:i + 1]) / 50

    # Bollinger (population std, /20)
    sma20 = [None] * n
    bbU = [None] * n
    bbL = [None] * n
    bbPct = [None] * n
    for i in range(19, n):
        sl = C[i - 19:i + 1]
        m = sum(sl) / 20
        std = math.sqrt(sum((b - m) ** 2 for b in sl) / 20)
        sma20[i] = m
        bbU[i] = m + 2 * std
        bbL[i] = m - 2 * std
        bbPct[i] = (C[i] - bbL[i]) / (bbU[i] - bbL[i]) if (bbU[i] - bbL[i]) > 0 else 0.5

    # ATR (Wilder)
    atr = [None] * n
    tr = [None] * n
    for i in range(1, n):
        tr[i] = max(H[i] - L[i], abs(H[i] - C[i - 1]), abs(L[i] - C[i - 1]))
    if n > 14:
        a = sum(tr[1:15]) / 14
        atr[14] = a
        for i in range(15, n):
            a = (a * 13 + tr[i]) / 14
            atr[i] = a

    # Volume ratio (20)
    vol_ratio = [None] * n
    for i in range(19, n):
        avg = sum((V[j] or 0) for j in range(i - 19, i + 1)) / 20
        vol_ratio[i] = (V[i] or 0) / avg if avg > 0 else 1

    # OBV
    obv = [None] * n
    obv[0] = V[0] or 0
    for i in range(1, n):
        if C[i] is None or V[i] is None:
            obv[i] = obv[i - 1]
            continue
        obv[i] = obv[i - 1] + (V[i] if C[i] > C[i - 1] else (-V[i] if C[i] < C[i - 1] else 0))

    # Stochastic slow
    stoch_slow_k = [None] * n
    stoch_slow_d = [None] * n
    for i in range(2, n):
        if stoch_k[i] is not None and stoch_k[i - 1] is not None and stoch_k[i - 2] is not None:
            stoch_slow_k[i] = (stoch_k[i] + stoch_k[i - 1] + stoch_k[i - 2]) / 3
    for i in range(2, n):
        if stoch_slow_k[i] is not None and stoch_slow_k[i - 1] is not None and stoch_slow_k[i - 2] is not None:
            stoch_slow_d[i] = (stoch_slow_k[i] + stoch_slow_k[i - 1] + stoch_slow_k[i - 2]) / 3

    return dict(C=C, H=H, L=L, V=V, macdLine=macd_line, sigLine=sig_line, hist=hist,
                rsi=rsi, stochK=stoch_k, stochD=stoch_d, stochSlowK=stoch_slow_k, stochSlowD=stoch_slow_d,
                sma5=sma5, sma20=sma20, sma50=sma50, bbU=bbU, bbL=bbL, bbPct=bbPct,
                atr=atr, volRatio=vol_ratio, obv=obv)


# ──────────────────────────────────────────────
# Layer 2: 캔들스틱  (index.html:2516 computeCandlestick)
# ──────────────────────────────────────────────
def compute_candlestick(bars):
    n = len(bars)
    if n < 3:
        return {'cs_signal': 0, 'cs_score': 0}
    O = [b['open'] for b in bars]
    H = [b['high'] for b in bars]
    L = [b['low'] for b in bars]
    C = [b['close'] for b in bars]
    body_pct, shadow_ratio = 0.1, 2.0
    i = n - 1
    body = lambda j: abs(C[j] - O[j])
    rng = lambda j: (H[j] - L[j]) or 1e-9
    upper = lambda j: H[j] - max(O[j], C[j])
    lower = lambda j: min(O[j], C[j]) - L[j]
    is_bull = lambda j: C[j] > O[j]

    bull = bear = 0
    if body(i) / rng(i) < body_pct:
        pass  # Doji
    if lower(i) > body(i) * shadow_ratio and upper(i) < body(i) * 0.3 and is_bull(i):
        bull += 1
    if upper(i) > body(i) * shadow_ratio and lower(i) < body(i) * 0.3 and is_bull(i):
        bull += 1
    if upper(i) > body(i) * shadow_ratio and lower(i) < body(i) * 0.3 and not is_bull(i):
        bear += 1
    if i >= 1:
        prev_bull = is_bull(i - 1)
        if not prev_bull and is_bull(i) and O[i] < C[i - 1] and C[i] > O[i - 1]:
            bull += 2
        if prev_bull and not is_bull(i) and O[i] > C[i - 1] and C[i] < O[i - 1]:
            bear += 2
        if not prev_bull and is_bull(i) and O[i] > C[i - 1] and C[i] < O[i - 1]:
            bull += 1
        if prev_bull and not is_bull(i) and O[i] < C[i - 1] and C[i] > O[i - 1]:
            bear += 1
        if not prev_bull and is_bull(i) and O[i] < L[i - 1] and C[i] > (O[i - 1] + C[i - 1]) / 2:
            bull += 2
        if prev_bull and not is_bull(i) and O[i] > H[i - 1] and C[i] < (O[i - 1] + C[i - 1]) / 2:
            bear += 2
    if i >= 2:
        pp_bull = is_bull(i - 2)
        p_doji = body(i - 1) / rng(i - 1) < body_pct
        if pp_bull and p_doji and is_bull(i) and C[i] > (O[i - 2] + C[i - 2]) / 2:
            bull += 2
        if not pp_bull and p_doji and not is_bull(i) and C[i] < (O[i - 2] + C[i - 2]) / 2:
            bear += 2
        if is_bull(i) and is_bull(i - 1) and is_bull(i - 2) and C[i] > C[i - 1] and C[i - 1] > C[i - 2]:
            bull += 2
        if not is_bull(i) and not is_bull(i - 1) and not is_bull(i - 2) and C[i] < C[i - 1] and C[i - 1] < C[i - 2]:
            bear += 2
    cs_score = bull - bear
    cs_signal = 1 if cs_score > 0 else (-1 if cs_score < 0 else 0)
    return {'cs_signal': cs_signal, 'cs_score': cs_score}


# ──────────────────────────────────────────────
# Layer 2: 엘리어트  (index.html:2568 computeElliottWave)
# ──────────────────────────────────────────────
def compute_elliott(bars):
    closes = [b['close'] for b in bars]
    n = len(closes)
    sw = max(5, n // 20)
    highs, lows = [], []
    for i in range(sw, n - sw):
        w = closes[i - sw:i + sw + 1]
        if closes[i] == max(w):
            highs.append((i, closes[i]))
        if closes[i] == min(w):
            lows.append((i, closes[i]))
    swings = sorted([(i, v) for i, v in highs] + [(i, v) for i, v in lows], key=lambda s: s[0])[-10:]
    ew_signal = 0
    if len(swings) >= 5:
        pts = [s[1] for s in swings[-5:]]
        w1 = pts[1] - pts[0]
        w3 = pts[3] - pts[2]
        w2r = (pts[1] - pts[2]) / (pts[1] - pts[0]) if w1 != 0 else 0
        w4r = (pts[3] - pts[4]) / (pts[3] - pts[2]) if w3 != 0 else 0
        impulse_up = (pts[1] > pts[0] and pts[3] > pts[2] and pts[4] < pts[3]
                      and 0.382 <= w2r <= 0.786 and 0.236 <= w4r <= 0.5)
        if impulse_up:
            ew_signal = -1
        elif w2r >= 0.382:
            ew_signal = 1
        else:
            ew_signal = 0
    return {'ew_signal': ew_signal}


# ──────────────────────────────────────────────
# Layer 2: 이치모쿠  (index.html:2621 computeIchimoku)
# ──────────────────────────────────────────────
def compute_ichimoku(bars):
    n = len(bars)
    C = [b['close'] for b in bars]

    def mid_n(length):
        if n < length:
            return None
        sl = bars[n - length:]
        return (max(b['high'] for b in sl) + min(b['low'] for b in sl)) / 2

    def mid_slice(a, b):
        sl = bars[a:b]
        if not sl:
            return None
        return (max(x['high'] for x in sl) + min(x['low'] for x in sl)) / 2

    tk = mid_n(9)
    kj = mid_n(26)
    skb = mid_n(52)
    ska = (tk + kj) / 2 if (tk is not None and kj is not None) else None
    last_close = C[n - 1]
    prev_tk = mid_slice(max(0, n - 10), n - 1) if n > 1 else None
    prev_kj = mid_slice(max(0, n - 27), n - 1) if n > 1 else None

    above = ska is not None and skb is not None and last_close > ska and last_close > skb
    below = ska is not None and skb is not None and last_close < ska and last_close < skb
    cross_up = (tk is not None and kj is not None and prev_tk is not None and prev_kj is not None
                and tk > kj and prev_tk <= prev_kj)
    cross_dn = (tk is not None and kj is not None and prev_tk is not None and prev_kj is not None
                and tk < kj and prev_tk >= prev_kj)

    sig = 0.0
    if above and cross_up:
        sig = 1
    elif (not above) and cross_dn:
        sig = -1
    elif above:
        sig = 0.5
    elif below:
        sig = -0.5
    return {'ichi_signal': js_round(sig)}  # 주의: -0.5 → 0 (JS Math.round 비대칭) 그대로 보존


# ──────────────────────────────────────────────
# Layer 2: SMC  (index.html:2662 computeSMC)
# ──────────────────────────────────────────────
def compute_smc(bars):
    n = len(bars)
    if n < 20:
        return {'smc_signal': 0}
    H = [b['high'] for b in bars]
    L = [b['low'] for b in bars]
    C = [b['close'] for b in bars]
    O = [b['open'] for b in bars]
    sw = 10
    i = n - 1
    prev_hi = max(H[max(0, i - sw):i])
    prev_lo = min(L[max(0, i - sw):i])
    bos_bull = C[i] > prev_hi and C[i - 1] <= prev_hi
    bos_bear = C[i] < prev_lo and C[i - 1] >= prev_lo
    fvg_bull = i >= 2 and L[i] > H[i - 2]
    fvg_bear = i >= 2 and H[i] < L[i - 2]
    bearish = lambda idx: C[idx] < O[idx]
    ob_demand = i >= 2 and bearish(i - 1) and C[i] > H[i - 1]
    ob_supply = i >= 2 and (not bearish(i - 1)) and C[i] < L[i - 1]
    sig = 0
    if bos_bull or fvg_bull or ob_demand:
        sig = 1
    if bos_bear or fvg_bear or ob_supply:
        sig = -1
    return {'smc_signal': sig}


# ──────────────────────────────────────────────
# Layer 3: 퀀트 팩터  (index.html:2733 computeQuantFactors)
# ──────────────────────────────────────────────
def compute_quant(bars, ind):
    n = len(bars)
    C = [b['close'] for b in bars]
    mom1m = (C[n - 1] - C[n - 22]) / C[n - 22] if n > 21 else None
    mom3m = (C[n - 1] - C[n - 64]) / C[n - 64] if n > 63 else None
    mom6m = (C[n - 1] - C[n - 127]) / C[n - 127] if n > 126 else None
    ma20 = ind['sma20'][n - 1]
    ma60 = sum(C[n - 60:]) / 60 if n >= 60 else None
    above_ma20 = (1 if C[n - 1] > ma20 else -1) if ma20 is not None else 0
    above_ma60 = (1 if C[n - 1] > ma60 else -1) if ma60 is not None else 0
    vol20 = None
    if n >= 21:
        seg = C[n - 21:]
        rets = [(seg[i] - seg[i - 1]) / seg[i - 1] for i in range(1, len(seg))]
        mean = sum(rets) / len(rets)
        vol20 = math.sqrt(sum((r - mean) ** 2 for r in rets) / len(rets)) * math.sqrt(252)
    rsiV = last(ind['rsi'])
    macdH = last(ind['hist'])
    bbP = last(ind['bbPct'])
    momZ = math.tanh(mom1m * 5) if mom1m is not None else 0
    mom3Z = math.tanh(mom3m * 3) if mom3m is not None else 0
    mom6Z = math.tanh(mom6m * 2) if mom6m is not None else 0
    trendZ = (above_ma20 + above_ma60) / 2
    rsiZ = (0.8 if rsiV < 30 else (-0.8 if rsiV > 70 else (50 - rsiV) / 50 * 0.4)) if rsiV is not None else 0
    macdZ = math.tanh(macdH / ((last(ind['atr']) or 1)) * 3) if macdH is not None else 0
    bbZ = (1 - 2 * bbP) * 0.5 if bbP is not None else 0
    volZ = -math.tanh(vol20 * 2) * 0.5 if vol20 is not None else 0
    factor_score = (momZ * 0.2 + mom3Z * 0.15 + mom6Z * 0.1 + trendZ * 0.15
                    + rsiZ * 0.1 + macdZ * 0.15 + bbZ * 0.1 + volZ * 0.05)
    quant_signal = 1 if factor_score > 0.3 else (-1 if factor_score < -0.3 else 0)
    return {'quant_signal': quant_signal, 'factor_score': factor_score}


# ──────────────────────────────────────────────
# Layer IPP: 변곡점  (index.html:2786 computeIPP)
# ──────────────────────────────────────────────
def compute_ipp(bars, ind):
    n = len(bars)
    if n < 30:
        return {'ipp_score': 0}
    C = [b['close'] for b in bars]
    H = [b['high'] for b in bars]
    L = [b['low'] for b in bars]
    V = [b['volume'] or 0 for b in bars]
    li = n - 1
    rule = 0
    rsi = last(ind['rsi'])
    if rsi is not None and rsi < 30:
        rule += 20
    if rsi is not None and rsi > 70:
        rule -= 20
    consec_down = 0
    for i in range(li, max(1, li - 5) - 1, -1):
        if i >= 1 and C[i] < C[i - 1]:
            consec_down += 1
        else:
            break
    body = abs(C[li] - bars[li]['open'])
    lower_shadow = min(C[li], bars[li]['open']) - L[li]
    if consec_down >= 4 and lower_shadow > body * 1.5:
        rule += 25
    consec_up = 0
    for i in range(li, max(1, li - 5) - 1, -1):
        if i >= 1 and C[i] > C[i - 1]:
            consec_up += 1
        else:
            break
    upper_shadow = H[li] - max(C[li], bars[li]['open'])
    if consec_up >= 4 and upper_shadow > body * 1.5:
        rule -= 25
    obv = 0
    obv_arr = []
    for i in range(n):
        obv += (0 if i == 0 else (V[i] if C[i] > C[i - 1] else (-V[i] if C[i] < C[i - 1] else 0)))
        obv_arr.append(obv)
    obv_slope = obv_arr[li] - obv_arr[li - 10] if n >= 10 else 0
    price_slope = C[li] - C[li - 10] if n >= 10 else 0
    if obv_slope > 0 and price_slope < 0:
        rule += 20
    if obv_slope < 0 and price_slope > 0:
        rule -= 20
    if n >= 21:
        vol20avg = sum(V[li - 19:li + 1]) / 20
        vol5avg = sum(V[li - 4:li + 1]) / 5
        vr = vol5avg / vol20avg if vol20avg > 0 else 1
        if vr < 0.5:
            rule += 10
        if vr > 2.0 and n >= 10 and abs(price_slope) / (C[li - 10] or 1) < 0.01:
            rule -= 15
    bbUv, bbLv, sma20v = last(ind['bbU']), last(ind['bbL']), last(ind['sma20'])
    bbW = (bbUv - bbLv) / sma20v if (bbUv is not None and bbLv is not None and sma20v and sma20v > 0) else None
    if bbW is not None and bbW < 0.05:
        rule += 12
    atr = last(ind['atr'])
    atr_vals = [v for v in ind['atr'][li - 29:li + 1] if v is not None] if n >= 30 else []
    atr_ma = sum(atr_vals) / 30 if atr_vals else None
    if atr is not None and atr_ma is not None and atr < atr_ma * 0.7:
        rule += 10
    ipp_score = max(-100, min(100, rule))
    return {'ipp_score': ipp_score}


# ──────────────────────────────────────────────
# WACC  (index.html:2222 computeWACC)
# ──────────────────────────────────────────────
SECTOR_ADJ = {
    'Technology': dict(erpAdj=0.010, sizeAdj=0.005),
    'Healthcare': dict(erpAdj=0.008, sizeAdj=0.005),
    'Financial Services': dict(erpAdj=0.000, sizeAdj=0.000),
    'Consumer Cyclical': dict(erpAdj=0.005, sizeAdj=0.005),
    'Consumer Defensive': dict(erpAdj=-0.005, sizeAdj=0.000),
    'Industrials': dict(erpAdj=0.003, sizeAdj=0.005),
    'Energy': dict(erpAdj=0.010, sizeAdj=0.005),
    'Utilities': dict(erpAdj=-0.010, sizeAdj=0.000),
    'Real Estate': dict(erpAdj=-0.005, sizeAdj=0.003),
    'Basic Materials': dict(erpAdj=0.008, sizeAdj=0.005),
    'Communication Services': dict(erpAdj=0.005, sizeAdj=0.003),
}


def compute_wacc(info, is_kr):
    rf = 0.035 if is_kr else 0.043
    erp = 0.065 if is_kr else 0.055
    sector = info.get('sector') or '-'
    adj = SECTOR_ADJ.get(sector, dict(erpAdj=0.005, sizeAdj=0.003))
    adj_erp = erp + adj['erpAdj']
    beta_raw = info.get('beta')
    beta = beta_raw if (beta_raw is not None and beta_raw > 0) else 1.0
    beta_adj = 1.1 if (is_kr and beta_raw is None) else beta
    re = rf + beta_adj * adj_erp + adj['sizeAdj']
    E = info.get('marketCap') or 0
    D = info.get('totalDebt') or 0
    V = E + D
    e_ratio = E / V if V > 0 else 1
    de_ratio = D / V if V > 0 else 0
    ebitda = info.get('ebitda') or 0
    interest_cov = ebitda / (D * 0.05) if (ebitda > 0 and D > 0) else None
    rd = 0.05
    if interest_cov is not None:
        if interest_cov > 8:
            rd = 0.030
        elif interest_cov > 4:
            rd = 0.040
        elif interest_cov > 2:
            rd = 0.055
        else:
            rd = 0.075
    rd = rd + 0.005 if is_kr else rd
    tax = info.get('taxRate')
    tc = min(max(tax, 0), 0.45) if tax is not None else (0.22 if is_kr else 0.21)
    wacc = e_ratio * re + de_ratio * rd * (1 - tc)
    return {'wacc': wacc}


# ──────────────────────────────────────────────
# 채점  (index.html:2898~2973)
# ──────────────────────────────────────────────
def score_to_signal(s):
    if s > 0.6:
        return 'STRONG_BUY'
    if s > 0.2:
        return 'BUY'
    if s < -0.6:
        return 'STRONG_SELL'
    if s < -0.2:
        return 'SELL'
    return 'NEUTRAL'


def norm(v, lo, mid, hi):
    if v <= lo:
        return -1
    if v >= hi:
        return 1
    return (v - lo) / (mid - lo) - 1 if v < mid else (v - mid) / (hi - mid)


def norm_inv(v, lo, mid, hi):
    return -norm(v, lo, mid, hi)


def score_technical(ind):
    mh = last(ind['hist'])
    atrV = last(ind['atr'])
    rsiV = last(ind['rsi'])
    bbP = last(ind['bbPct'])
    k = last(ind['stochK'])
    d = last(ind['stochD'])
    vr = last(ind['volRatio'])
    C = ind['C']
    last_diff = C[-1] - C[-2]
    macd_score = math.tanh((mh if mh is not None else 0) / ((atrV or 0) + 1e-9))
    if rsiV is None:
        rsiV = 50
    rsi_score = (30 - rsiV) / 30 if rsiV < 30 else ((70 - rsiV) / 30 if rsiV > 70 else (50 - rsiV) / 50 * 0.3)
    rsi_score = clip(rsi_score, -1, 1)
    bb_score = clip(1 - 2 * (bbP if bbP is not None else 0.5), -1, 1)
    if k is None:
        k = 50
    if d is None:
        d = 50
    stoch_score = 0.8 if (k < 20 and k > d) else (-0.8 if (k > 80 and k < d) else (50 - k) / 50 * 0.3)
    vol_score = math.tanh((vr if vr is not None else 1) - 1) * (1 if last_diff > 0 else (-1 if last_diff < 0 else 0))
    score = macd_score * 0.25 + rsi_score * 0.20 + bb_score * 0.20 + stoch_score * 0.15 + vol_score * 0.20
    return {'score': score, 'confidence': min(abs(score) * 1.5, 1.0), 'atr': atrV}


def score_fundamental(info, price):
    def pct2num(v):
        if v is None:
            return None
        try:
            v = float(v)
        except (TypeError, ValueError):
            return None
        return v * 100 if abs(v) < 2 else v

    def g(k, default):
        v = info.get(k)
        if v is None:
            return default
        try:
            return float(v)
        except (TypeError, ValueError):
            return default

    per = g('trailingPE', 25)
    pbr = g('priceToBook', 2)
    roe = pct2num(g('returnOnEquity', 0.10))
    roe = roe if roe is not None else 10
    net_margin = pct2num(g('profitMargins', 0.05))
    net_margin = net_margin if net_margin is not None else 5
    rev_growth = pct2num(g('revenueGrowth', 0.05))
    rev_growth = rev_growth if rev_growth is not None else 5
    earn_growth = pct2num(g('earningsGrowth', 0.05))
    earn_growth = earn_growth if earn_growth is not None else 5
    debt_eq = g('debtToEquity', 100)
    curr_ratio = g('currentRatio', 1.5)

    val = (norm_inv(per, 10, 20, 35) + norm_inv(pbr, 0.8, 2.0, 4.0)) / 2
    prof = (norm(roe, 5, 15, 25) + norm(net_margin, 2, 10, 20)) / 2
    growth = (norm(rev_growth, 0, 10, 30) + norm(earn_growth, 0, 15, 40)) / 2
    health = (norm_inv(debt_eq, 50, 100, 200) + norm(curr_ratio, 1.0, 1.5, 3.0)) / 2
    score = val * 0.30 + prof * 0.25 + growth * 0.25 + health * 0.20
    return {'score': score, 'confidence': min(abs(score) * 1.2, 1.0),
            'intrinsic': price * (score * 0.3 + 1.0), 'roe': roe}


# ──────────────────────────────────────────────
# 융합 + 결정  (index.html:2849~3034)
# ──────────────────────────────────────────────
MASTER_WEIGHTS = {'cs': 1.5, 'ew': 2.0, 'ichi': 1.5, 'smc': 1.5, 'quant': 2.0, 'wacc': 1.5, 'ipp': 2.0}


def compute_wacc_signal(wacc, roe_pct):
    if wacc is None or roe_pct is None:
        return 0
    roe_dec = roe_pct / 100 if roe_pct > 1 else roe_pct
    if roe_dec > wacc * 1.2:
        return 1
    if roe_dec < wacc * 0.8:
        return -1
    return 0


def fuse(cs, ew, ichi, smc, quant, wacc_sig, ipp):
    ipp_sig = 1 if ipp['ipp_score'] >= 20 else (-1 if ipp['ipp_score'] <= -20 else 0)
    signals = {'cs': cs['cs_signal'], 'ew': ew['ew_signal'], 'ichi': ichi['ichi_signal'],
               'smc': smc['smc_signal'], 'quant': quant['quant_signal'], 'wacc': wacc_sig, 'ipp': ipp_sig}
    wsum = wtotal = 0.0
    for key, w in MASTER_WEIGHTS.items():
        wsum += (signals[key] or 0) * w
        wtotal += w
    composite = wsum / wtotal if wtotal > 0 else 0
    return composite, signals


STYLE_W = {'short_term': (0.75, 0.25), 'balanced': (0.60, 0.40), 'long_term': (0.35, 0.65)}


def make_decision(tech, fund, style, price, composite):
    tw, fw = STYLE_W.get(style, STYLE_W['balanced'])
    base = tech['score'] * tw + fund['score'] * fw
    advW = 0.40
    combined = base * (1 - advW) + composite * advW
    conf = tech['confidence'] * tw + fund['confidence'] * fw
    same_dir = (tech['score'] > 0 and fund['score'] > 0) or (tech['score'] < 0 and fund['score'] < 0)
    conf = min(conf * 1.2, 1.0) if same_dir else conf * 0.8
    if composite > 0.3 and combined > 0:
        conf = min(conf * 1.1, 1.0)
    if composite < -0.3 and combined < 0:
        conf = min(conf * 1.1, 1.0)
    if combined > 0.25 and conf > 0.5:
        action = 'BUY'
    elif combined < -0.25 and conf > 0.5:
        action = 'SELL'
    else:
        action = 'HOLD'
    return {'action': action, 'combined': combined, 'confidence': conf}


# ──────────────────────────────────────────────
# 전체 파이프라인 (한 시점 t 에 대한 결정)
# ──────────────────────────────────────────────
def analyze(bars, info, is_kr, style='balanced'):
    """bars: 시점 t 까지의 OHLCV 리스트. info: 펀더멘털 스냅샷(상수)."""
    price = bars[-1]['close']
    ind = compute_indicators(bars)
    cs = compute_candlestick(bars)
    ew = compute_elliott(bars)
    ichi = compute_ichimoku(bars)
    smc = compute_smc(bars)
    quant = compute_quant(bars, ind)
    ipp = compute_ipp(bars, ind)
    wacc = compute_wacc(info, is_kr)
    tech = score_technical(ind)
    fund = score_fundamental(info, price)
    wacc_sig = compute_wacc_signal(wacc['wacc'], fund['roe'])
    composite, signals = fuse(cs, ew, ichi, smc, quant, wacc_sig, ipp)
    decision = make_decision(tech, fund, style, price, composite)
    return {
        'action': decision['action'],
        'combined': decision['combined'],
        'confidence': decision['confidence'],
        'composite': composite,
        'tech_score': tech['score'],
        'fund_score': fund['score'],
        'cs': signals['cs'], 'ew': signals['ew'], 'ichi': signals['ichi'],
        'smc': signals['smc'], 'quant': signals['quant'],
        'wacc': signals['wacc'], 'ipp': signals['ipp'],
        'factor_score': quant['factor_score'], 'ipp_score': ipp['ipp_score'],
    }
