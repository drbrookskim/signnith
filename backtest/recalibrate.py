"""
recalibrate.py — 임계값 재보정 + 시간분할(out-of-sample) 검증
==============================================================
backtest.py 가 저장한 결정 CSV(combined, confidence, fwd_*)를 읽어,
결정 임계값 (combined_thr, conf_thr) 그리드를 스윕한다.

⚠️ 과적합 방지 핵심:
  - 날짜 기준 앞 70%(train)에서만 최적 임계값을 고른다.
  - 그 임계값을 뒤 30%(test)에 그대로 적용해 **out-of-sample** 성과를 본다.
  - train 에서 좋아 보여도 test 에서 무너지면 = 곡선맞추기(curve-fitting)일 뿐,
    실제 엣지가 아니라는 결론.

사용법:  python3 recalibrate.py --csv backtest_full.csv --horizon 20
"""
import argparse
import numpy as np
import pandas as pd

COMBINED_GRID = [0.10, 0.15, 0.20, 0.25]
CONF_GRID = [0.25, 0.30, 0.35, 0.40, 0.45, 0.50]
MIN_SIGNALS = 20  # train 에서 이 미만이면 통계 의미 없다고 보고 후보 제외


def actions(df, ct, cf):
    buy = (df['combined'] > ct) & (df['confidence'] > cf)
    sell = (df['combined'] < -ct) & (df['confidence'] > cf)
    return buy, sell


def eval_set(df, ct, cf, hcol):
    base = df[hcol].mean()
    buy, sell = actions(df, ct, cf)
    b = df.loc[buy, hcol].dropna()
    s = df.loc[sell, hcol].dropna()
    return {
        'n_buy': len(b), 'n_sell': len(s),
        'buy_mean': b.mean() if len(b) else np.nan,
        'buy_alpha': (b.mean() - base) if len(b) else np.nan,
        'buy_hit': (b > 0).mean() if len(b) else np.nan,
        'sell_mean': s.mean() if len(s) else np.nan,
        'sell_alpha': (base - s.mean()) if len(s) else np.nan,  # 매도는 baseline보다 낮아야 +
        'sell_hit': (s < 0).mean() if len(s) else np.nan,
        'baseline': base,
    }


def pct(x):
    return 'n/a' if (x is None or (isinstance(x, float) and np.isnan(x))) else f'{x * 100:+.2f}%'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--csv', default='backtest_full.csv')
    ap.add_argument('--horizon', type=int, default=20)
    ap.add_argument('--train-frac', type=float, default=0.70)
    args = ap.parse_args()
    hcol = f'fwd_{args.horizon}'

    df = pd.read_csv(args.csv).sort_values('date').reset_index(drop=True)
    if hcol not in df.columns:
        raise SystemExit(f'{hcol} 컬럼 없음. backtest.py horizons 확인.')

    # 시간 분할
    cut = df['date'].quantile(args.train_frac) if df['date'].dtype != object else \
        df['date'].sort_values().iloc[int(len(df) * args.train_frac)]
    train = df[df['date'] <= cut]
    test = df[df['date'] > cut]
    print(f'데이터: {len(df)}건  ({df.date.min()} ~ {df.date.max()})')
    print(f'분할: train {len(train)}건 (~{cut}) / test {len(test)}건')
    print(f'성과 기준: {args.horizon}일 후 수익\n')

    print(f'현 운영 임계값 (combined>0.25 & conf>0.5):')
    cur_tr = eval_set(train, 0.25, 0.50, hcol)
    cur_te = eval_set(test, 0.25, 0.50, hcol)
    print(f'  train: BUY {cur_tr["n_buy"]}건 / SELL {cur_tr["n_sell"]}건')
    print(f'  test : BUY {cur_te["n_buy"]}건 / SELL {cur_te["n_sell"]}건')
    print('  → 신호가 거의 안 나와 검증 자체가 불가능. 재보정 필요.\n')

    # ── train 그리드 스윕 ──
    print('=' * 78)
    print(f'[TRAIN] 임계값 그리드 — BUY 기준 (baseline {pct(cur_tr["baseline"])})')
    print('=' * 78)
    print(f'  {"comb":>5s} {"conf":>5s} {"nBUY":>5s} {"BUY평균":>9s} {"BUYα":>9s} {"BUY적중":>8s} '
          f'{"nSELL":>5s} {"SELLα":>9s}')
    candidates = []
    for ct in COMBINED_GRID:
        for cf in CONF_GRID:
            r = eval_set(train, ct, cf, hcol)
            flag = ''
            if r['n_buy'] >= MIN_SIGNALS and not np.isnan(r['buy_alpha']):
                candidates.append((ct, cf, r))
                flag = ' *'
            print(f'  {ct:>5.2f} {cf:>5.2f} {r["n_buy"]:>5d} {pct(r["buy_mean"]):>9s} '
                  f'{pct(r["buy_alpha"]):>9s} {pct(r["buy_hit"]):>8s} '
                  f'{r["n_sell"]:>5d} {pct(r["sell_alpha"]):>9s}{flag}')

    if not candidates:
        print('\n⚠️ train 에서 신호 충분(≥%d)한 설정이 없음. 임계값을 더 낮춰야 함.' % MIN_SIGNALS)
        return

    # train BUY 알파 최대 설정 선택
    best = max(candidates, key=lambda c: c[2]['buy_alpha'])
    bct, bcf, btr = best
    print(f'\n★ train 최적(BUY α 최대): combined>{bct} & conf>{bcf}')
    print(f'   train BUY {btr["n_buy"]}건 · 평균 {pct(btr["buy_mean"])} · α {pct(btr["buy_alpha"])} · '
          f'적중 {pct(btr["buy_hit"])}')

    # ── test 적용 (out-of-sample) ──
    print('\n' + '=' * 78)
    print('[TEST] 위 임계값을 그대로 미래 구간에 적용 (out-of-sample 진실의 순간)')
    print('=' * 78)
    bte = eval_set(test, bct, bcf, hcol)
    print(f'  baseline(test 전체평균): {pct(bte["baseline"])}')
    print(f'  BUY  {bte["n_buy"]:>4d}건 · 평균 {pct(bte["buy_mean"])} · '
          f'α {pct(bte["buy_alpha"])} · 적중 {pct(bte["buy_hit"])}')
    print(f'  SELL {bte["n_sell"]:>4d}건 · 평균 {pct(bte["sell_mean"])} · '
          f'α {pct(bte["sell_alpha"])} · 적중 {pct(bte["sell_hit"])}')

    print('\n  판정:')
    a = bte['buy_alpha']
    if bte['n_buy'] < 10:
        print('   △ test 표본 부족 — 결론 보류.')
    elif a is None or np.isnan(a):
        print('   △ 측정 불가.')
    elif a > 0.005:
        print(f'   ✓ out-of-sample BUY 초과수익 {pct(a)} — 약하지만 엣지 가능성. 추가 검증 가치 있음.')
    else:
        print(f'   ✗ out-of-sample BUY 초과수익 {pct(a)} — baseline 대비 우위 없음.')
        print('     → 임계값 재보정으로도 알파가 살아나지 않음. "신호 생성기"가 아니라')
        print('       투명한 분석 대시보드로 포지셔닝하는 것이 정직함.')


if __name__ == '__main__':
    main()
