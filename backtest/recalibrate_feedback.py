"""
recalibrate_feedback.py — 오케스트레이터 피드백 가중치 검증 및 재보정
====================================================================
signnith 의 1차 정량 결정(combined, confidence)에 연결 서비스 피드백
(fb_newsfinder, fb_equisense, fb_chartdeepdive, fb_buythedip)을 결합했을 때
out-of-sample(앞 70% train / 뒤 30% test) 알파와 적중률이 개선되는지 평가한다.

사용법:
  python3 recalibrate_feedback.py --csv backtest_full.csv --horizon 20
"""
import argparse
import numpy as np
import pandas as pd

SERVICES = ['newsfinder', 'equisense', 'chartdeepdive', 'buythedip']
SHARE_GRID = [0.0, 0.15, 0.25, 0.35]


def compute_adjusted(df, weights, max_share):
    fb_cols = [f'fb_{s}' for s in SERVICES if f'fb_{s}' in df.columns]
    if not fb_cols or max_share <= 0:
        return df['combined'].copy(), df['confidence'].copy()

    w_sum = np.zeros(len(df), dtype=float)
    w_tot = np.zeros(len(df), dtype=float)
    for s in SERVICES:
        col = f'fb_{s}'
        if col not in df.columns:
            continue
        vals = df[col].clip(-1.0, 1.0)
        valid = vals.notna()
        w = weights.get(s, 0.20)
        w_sum[valid] += vals[valid].to_numpy() * w
        w_tot[valid] += w

    fb_avg = np.where(w_tot > 0, w_sum / np.maximum(w_tot, 1e-9), 0.0)
    share = np.minimum(max_share, w_tot)
    adj_comb = df['combined'].to_numpy() * (1.0 - share) + fb_avg * share

    base_c = df['combined'].to_numpy()
    aligned = ((base_c > 0) & (fb_avg > 0)) | ((base_c < 0) & (fb_avg < 0))
    opposed = ((base_c > 0) & (fb_avg < -0.1)) | ((base_c < 0) & (fb_avg > 0.1))
    mult = np.where(aligned, 1.08, np.where(opposed, 0.85, 1.0))
    adj_conf = np.clip(df['confidence'].to_numpy() * mult, 0.0, 1.0)
    return pd.Series(adj_comb, index=df.index), pd.Series(adj_conf, index=df.index)


def eval_decisions(comb, conf, fwd, ct=0.25, cf=0.50):
    base = fwd.mean()
    buy = (comb > ct) & (conf > cf)
    sell = (comb < -ct) & (conf > cf)
    b = fwd[buy].dropna()
    s = fwd[sell].dropna()
    return {
        'n_buy': int(len(b)),
        'buy_alpha': float(b.mean() - base) if len(b) else np.nan,
        'buy_hit': float((b > 0).mean()) if len(b) else np.nan,
        'n_sell': int(len(s)),
        'sell_alpha': float(base - s.mean()) if len(s) else np.nan,
        'sell_hit': float((s < 0).mean()) if len(s) else np.nan,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--csv', default='backtest_full.csv')
    ap.add_argument('--horizon', type=int, default=20)
    args = ap.parse_args()

    df = pd.read_csv(args.csv).sort_values('date').reset_index(drop=True)
    hcol = f'fwd_{args.horizon}' if f'fwd_{args.horizon}' in df.columns else f'fwd_{args.horizon}d'
    if hcol not in df.columns:
        raise SystemExit(f'Missing horizon column: {hcol}')

    fb_cols = [f'fb_{s}' for s in SERVICES if f'fb_{s}' in df.columns]
    if not fb_cols:
        print('⚠️ 피드백 컬럼(fb_newsfinder 등)이 CSV에 없습니다. 기본(share=0) 기준만 출력합니다.')

    split = int(len(df) * 0.70)
    train, test = df.iloc[:split], df.iloc[split:]
    weights = {'newsfinder': 0.15, 'equisense': 0.25, 'chartdeepdive': 0.20, 'buythedip': 0.20}

    print(f'=== {args.csv} | horizon={args.horizon}d | train={len(train)}, test={len(test)} ===')
    for share in SHARE_GRID:
        tr_c, tr_f = compute_adjusted(train, weights, share)
        te_c, te_f = compute_adjusted(test, weights, share)
        tr_m = eval_decisions(tr_c, tr_f, train[hcol])
        te_m = eval_decisions(te_c, te_f, test[hcol])
        print(f'maxShare={share:.2f} | train BUY alpha={tr_m["buy_alpha"]:+.4f} (n={tr_m["n_buy"]}) '
              f'| test BUY alpha={te_m["buy_alpha"]:+.4f} (hit={te_m["buy_hit"]:.1%}, n={te_m["n_buy"]})')


if __name__ == '__main__':
    main()
