"""
backtest.py — SIGNNITH 분석 엔진 워크포워드 백테스트
====================================================
과거 각 시점까지의 데이터만으로 결정을 내리고, 이후 N일 수익률을 측정한다.

측정 항목
  1) 결정 분포 (BUY/SELL/HOLD 비율)
  2) 액션별 미래수익 vs 무조건 보유(baseline) — 적중률 포함
  3) 각 신호의 IC (Information Coefficient: 신호값↔미래수익 상관, Pearson/Spearman)
  4) 신호 간 상관행렬 ("가짜 다양성" 진단)

사용법
  python3 backtest.py                       # 기본 바스켓 · 3년 · step 5
  python3 backtest.py --tickers AAPL TSLA 005930.KS --years 3 --step 5
  python3 backtest.py --style balanced --horizons 5 20 60
"""
import argparse
import sys
import warnings

import numpy as np
import pandas as pd
import yfinance as yf

import signnith_engine as eng

warnings.simplefilter('ignore')

DEFAULT_TICKERS = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'GOOGL',
                   '005930.KS', '000660.KS', '005380.KS']
SIGNAL_COLS = ['cs', 'ew', 'ichi', 'smc', 'quant', 'wacc', 'ipp',
               'tech_score', 'fund_score', 'factor_score', 'ipp_score',
               'composite', 'combined']


def fetch(ticker, years):
    df = yf.download(ticker, period=f'{years}y', interval='1d',
                     auto_adjust=True, progress=False)
    if df is None or df.empty:
        return None, None
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
    df = df.dropna(subset=['Open', 'High', 'Low', 'Close'])
    bars = [{'open': float(r.Open), 'high': float(r.High), 'low': float(r.Low),
             'close': float(r.Close), 'volume': float(r.Volume) if not np.isnan(r.Volume) else 0.0,
             'date': idx.strftime('%Y-%m-%d')}
            for idx, r in zip(df.index, df.itertuples())]
    info = {}
    try:
        info = yf.Ticker(ticker).info or {}
    except Exception:
        info = {}
    return bars, info


def run_ticker(ticker, years, step, style, horizons, warmup):
    bars, info = fetch(ticker, years)
    if not bars or len(bars) < warmup + max(horizons) + 5:
        print(f'  ! {ticker}: 데이터 부족 (len={0 if not bars else len(bars)})', file=sys.stderr)
        return []
    is_kr = ticker.endswith('.KS') or ticker.endswith('.KQ')
    closes = [b['close'] for b in bars]
    rows = []
    last_t = len(bars) - max(horizons) - 1
    for t in range(warmup, last_t + 1, step):
        sub = bars[:t + 1]
        try:
            res = eng.analyze(sub, info, is_kr, style)
        except Exception as e:
            continue
        row = {'ticker': ticker, 'date': bars[t]['date'], 'action': res['action'],
               'confidence': res['confidence']}
        for c in SIGNAL_COLS:
            row[c] = res[c]
        p0 = closes[t]
        for h in horizons:
            row[f'fwd_{h}'] = (closes[t + h] - p0) / p0 if p0 else np.nan
        rows.append(row)
    print(f'  ✓ {ticker}: {len(rows)} 결정  (bars={len(bars)}, KR={is_kr})')
    return rows


def pct(x):
    return f'{x * 100:+.2f}%'


def report(df, horizons):
    print('\n' + '=' * 72)
    print('  SIGNNITH 백테스트 결과')
    print('=' * 72)
    print(f'  총 결정 수: {len(df)}   종목: {df.ticker.nunique()}개   '
          f'기간: {df.date.min()} ~ {df.date.max()}')

    # 1) 결정 분포
    print('\n[1] 결정 분포')
    dist = df.action.value_counts()
    for a in ['BUY', 'SELL', 'HOLD']:
        c = int(dist.get(a, 0))
        print(f'    {a:5s}: {c:5d}  ({c / len(df) * 100:5.1f}%)')

    # 2) 액션별 미래수익 vs baseline
    print('\n[2] 액션별 미래수익 (vs 무조건 보유 baseline)')
    for h in horizons:
        col = f'fwd_{h}'
        base = df[col].mean()
        print(f'\n  ── {h}일 후 수익 ── (baseline 전체평균 {pct(base)})')
        print(f'    {"액션":4s} {"건수":>5s} {"평균수익":>10s} {"초과(α)":>10s} {"적중률":>8s} {"중앙값":>9s}')
        for a in ['BUY', 'SELL', 'HOLD']:
            sub = df[df.action == a][col].dropna()
            if len(sub) == 0:
                continue
            mean = sub.mean()
            alpha = mean - base
            if a == 'BUY':
                hit = (sub > 0).mean()
            elif a == 'SELL':
                hit = (sub < 0).mean()
            else:
                hit = (sub.abs() < df[col].abs().median()).mean()
            print(f'    {a:5s} {len(sub):5d} {pct(mean):>10s} {pct(alpha):>10s} '
                  f'{hit * 100:7.1f}% {pct(sub.median()):>9s}')

    # 3) IC (신호 ↔ 미래수익)
    print('\n[3] 신호별 IC (미래수익과의 상관 · 절대값 클수록 예측력↑)')
    h_ic = horizons[len(horizons) // 2] if horizons else 20
    col = f'fwd_{h_ic}'
    print(f'    (기준: {h_ic}일 후 수익)')
    print(f'    {"신호":12s} {"Pearson":>9s} {"Spearman":>9s}')
    ic_rows = []
    for s in SIGNAL_COLS:
        d2 = df[[s, col]].dropna()
        if d2[s].nunique() < 2 or len(d2) < 10:
            continue
        pe = d2[s].corr(d2[col], method='pearson')
        sp = d2[s].corr(d2[col], method='spearman')
        ic_rows.append((s, pe, sp))
    for s, pe, sp in sorted(ic_rows, key=lambda r: -abs(r[2] if not np.isnan(r[2]) else 0)):
        print(f'    {s:12s} {pe:>+9.3f} {sp:>+9.3f}')

    # 4) 신호 간 상관행렬 (가짜 다양성 진단)
    print('\n[4] 신호 간 상관행렬 (높을수록 "독립 확증"이 아닌 중복 정보)')
    fuse_cols = ['cs', 'ew', 'ichi', 'smc', 'quant', 'wacc', 'ipp']
    corr = df[fuse_cols].corr(method='spearman')
    hdr = '        ' + ' '.join(f'{c:>6s}' for c in fuse_cols)
    print(hdr)
    for c in fuse_cols:
        line = f'    {c:5s} ' + ' '.join(
            f'{corr.loc[c, c2]:>+6.2f}' if not np.isnan(corr.loc[c, c2]) else '   nan'
            for c2 in fuse_cols)
        print(line)

    # 가격기반 신호 군집 평균상관 (펀더멘털 wacc 제외)
    price_based = ['cs', 'ew', 'ichi', 'smc', 'quant', 'ipp']
    vals = [corr.loc[a, b] for i, a in enumerate(price_based)
            for b in price_based[i + 1:] if not np.isnan(corr.loc[a, b])]
    if vals:
        print(f'\n    · 가격기반 6신호 평균 상호상관: {np.mean(vals):+.3f}  '
              f'(높으면 사실상 같은 정보를 여러 번 셈)')
    print('=' * 72)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--tickers', nargs='+', default=DEFAULT_TICKERS)
    ap.add_argument('--years', type=int, default=3)
    ap.add_argument('--step', type=int, default=5, help='결정 샘플링 간격(거래일). 중첩 표본 완화')
    ap.add_argument('--style', default='balanced', choices=['short_term', 'balanced', 'long_term'])
    ap.add_argument('--horizons', nargs='+', type=int, default=[5, 20, 60])
    ap.add_argument('--warmup', type=int, default=150, help='지표 워밍업 최소 봉 수')
    ap.add_argument('--csv', default='backtest_results.csv')
    args = ap.parse_args()

    print(f'설정: {len(args.tickers)}종목 · {args.years}년 · step={args.step} · '
          f'style={args.style} · horizons={args.horizons}')
    all_rows = []
    for tk in args.tickers:
        all_rows += run_ticker(tk, args.years, args.step, args.style, args.horizons, args.warmup)

    if not all_rows:
        print('결정 데이터가 없습니다.', file=sys.stderr)
        sys.exit(1)

    df = pd.DataFrame(all_rows)
    df.to_csv(args.csv, index=False)
    report(df, args.horizons)
    print(f'\n원본 결정 데이터 저장: {args.csv}  ({len(df)}행)')


if __name__ == '__main__':
    main()
