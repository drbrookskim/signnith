"""
swing_pipeline.py — 스윙 투자 7단계 완결형 파이프라인

사용법 (한미반도체 예시):
    python swing_pipeline.py \
        --ticker 042700 \
        --vix 18.5 --rate_bp 0 --pmi 52.3 --pmi_dir up \
        --idx_200ma above_up --usdkrw 1380 \
        --mkt_foreign_days 4 --mkt_institution buy \
        --sector_etf_days 6 \
        --stk_foreign_days 5 --stk_inst_weeks 3 \
        --short_ratio 0.02 --short_trend decrease \
        --total_debt 3200 --equity 7800 \
        --op_income 3100 --interest_exp 80 --ocf 2600 \
        --entry 68000 --stop 65960 --target 82000 \
        --stock_type high_beta
"""

import argparse
import json
from datetime import date

from gate_a import check_gate_a
from gate_b import check_gate_b
from steps  import (
    check_health_filter_manual,
    check_rr,
    get_time_stop,
)

SEPARATOR = "─" * 52


def fmt_status(s: str) -> str:
    icons = {'PASS': '✅', 'BLOCK': '🚫', 'GO': '✅',
             'WARN': '⚠️', 'STOP': '🚫'}
    return f"{icons.get(s, '')} {s}"


def run_pipeline(args) -> dict:
    report = {'ticker': args.ticker, 'run_date': date.today().isoformat()}

    print(f"\n{SEPARATOR}")
    print(f"  스윙 투자 진입 판정 — {args.ticker}")
    print(SEPARATOR)

    # ── Gate A ──────────────────────────────
    print("\n[Gate A] 거시환경")
    gate_a = check_gate_a(
        vix=args.vix,
        rate_change_bp=args.rate_bp,
        pmi=args.pmi,
        pmi_direction=args.pmi_dir,
        idx_vs_200ma=args.idx_200ma,
        usdkrw=args.usdkrw,
    )
    report['gate_a'] = gate_a
    for k in ('vix', 'rate', 'pmi', 'index'):
        if k in gate_a:
            print(f"  {k:10s}: {fmt_status(gate_a[k])}")
    print(f"  → {fmt_status(gate_a['gate_a'])}")

    if gate_a['gate_a'] == 'BLOCK':
        report['final'] = 'BLOCK'
        report['reason'] = f"Gate A 차단 — 대기 축: {gate_a['stop_axes']}"
        _print_final(report)
        return report

    # ── Gate B ──────────────────────────────
    print("\n[Gate B] 수급")
    gate_b = check_gate_b(
        market_foreign_days=args.mkt_foreign_days,
        market_institution=args.mkt_institution,
        sector_etf_days=args.sector_etf_days,
        stock_foreign_days=args.stk_foreign_days,
        stock_institution_weeks=args.stk_inst_weeks,
        short_ratio=args.short_ratio,
        short_trend=args.short_trend,
    )
    report['gate_b'] = gate_b
    for k in ('layer1', 'layer2', 'layer3'):
        print(f"  {k:10s}: {fmt_status(gate_b[k])}")
    print(f"  매트릭스 : {gate_b['matrix']} — {gate_b['matrix_action']}")
    print(f"  → {fmt_status(gate_b['gate_b'])}")

    if gate_b['gate_b'] == 'BLOCK':
        report['final'] = 'BLOCK'
        report['reason'] = f"Gate B 차단 — 차단 레이어: {gate_b['stop_layers']}"
        _print_final(report)
        return report

    # ── Step 1: 체력 필터 ───────────────────
    print("\n[Step 1] 체력 필터")
    step1 = check_health_filter_manual(
        total_debt=args.total_debt,
        equity=args.equity,
        operating_income=args.op_income,
        interest_expense=args.interest_exp,
        operating_cash_flow=args.ocf,
    )
    report['step1'] = step1
    print(f"  부채비율   : {step1['debt_ratio']}% → {fmt_status('GO' if step1['debt_pass'] else 'STOP')}")
    print(f"  이자보상배율: {step1['icr']}× → {fmt_status('GO' if step1['icr_pass'] else 'STOP')}")
    print(f"  OCF       : {step1['ocf']:,.0f}억 → {fmt_status('GO' if step1['ocf_pass'] else 'STOP')}")

    if not step1['step1_pass']:
        report['final'] = 'BLOCK'
        report['reason'] = 'Step 1 체력 필터 미통과'
        _print_final(report)
        return report

    # ── Step 2~4: 수동 확인 안내 ────────────
    print("\n[Step 2] 촉발 이벤트  → HTS·DART 수동 확인")
    print("  어닝 서프라이즈 +5%↑ / QoQ 이익률 2분기 개선 / 가이던스 상향")
    print("\n[Step 3] 섹터·종목 수급  → Gate B 결과 재확인")
    print(f"  {gate_b['matrix']} — {gate_b['matrix_action']}")
    print("\n[Step 4] 기술적 진입  → 차트 직접 확인")
    print("  눌림목: 20MA 근처 + 거래량 수렴 + RSI 40~60")
    print("  돌  파: 거래량 2배↑ + 종가 기준 저항선 돌파")

    # ── Step 5: R:R 검증 ────────────────────
    print("\n[Step 5] R:R 검증")
    step5 = check_rr(entry=args.entry, stop=args.stop, target=args.target)
    report['step5'] = step5
    print(f"  진입가  : {args.entry:,.0f}원")
    print(f"  손절선  : {args.stop:,.0f}원  ({step5['loss_pct']}%)")
    print(f"  목표가  : {args.target:,.0f}원  (+{step5['gain_pct']}%)")
    print(f"  R:R     : {step5['rr']} : 1")
    print(f"  손익분기 승률: {step5['breakeven_winrate']}%")
    print(f"  → {fmt_status(step5['verdict'])}")

    if step5['verdict'] == 'BLOCK':
        report['final'] = 'BLOCK'
        report['reason'] = f"R:R {step5['rr']} : 1 — 기준 미달 (최소 2.0 필요)"
        _print_final(report)
        return report

    # ── Step 6: 시간 손절 기한 ──────────────
    print("\n[Step 6] 시간 손절 기한")
    step6 = get_time_stop(date.today(), args.stock_type)
    report['step6'] = step6
    print(f"  종목 유형 : {args.stock_type}")
    print(f"  보유 기한 : {step6['deadline']} ({step6['total_days']}거래일)")
    print(f"  상태      : {step6['action']}")

    # ── 최종 판정 ───────────────────────────
    report['final'] = 'PASS'
    report['summary'] = {
        'entry':    args.entry,
        'stop':     args.stop,
        'target':   args.target,
        'rr':       step5['rr'],
        'deadline': step6['deadline'],
    }
    _print_final(report)
    return report


def _print_final(report: dict):
    print(f"\n{SEPARATOR}")
    if report['final'] == 'PASS':
        s = report['summary']
        print(f"  최종 판정: ✅ PASS — 전 단계 통과")
        print(f"  진입가 {s['entry']:,.0f}원 / 손절 {s['stop']:,.0f}원 / "
              f"목표 {s['target']:,.0f}원")
        print(f"  R:R {s['rr']} : 1  |  시간 손절 {s['deadline']}")
    else:
        print(f"  최종 판정: 🚫 BLOCK — {report.get('reason', '')}")
    print(SEPARATOR)


def main():
    p = argparse.ArgumentParser(description='스윙 투자 7단계 진입 판정')

    # 종목
    p.add_argument('--ticker',         required=True, help='종목코드 (예: 042700)')
    p.add_argument('--stock_type',     default='value',
                   choices=['high_beta', 'value', 'small_cap'])

    # Gate A
    p.add_argument('--vix',            type=float, default=18.0)
    p.add_argument('--rate_bp',        type=float, default=0)
    p.add_argument('--pmi',            type=float, default=51.0)
    p.add_argument('--pmi_dir',        default='up', choices=['up', 'down'])
    p.add_argument('--idx_200ma',      default='above_up',
                   choices=['above_up','above_down','below_up','below_down'])
    p.add_argument('--usdkrw',         type=float, default=0)

    # Gate B
    p.add_argument('--mkt_foreign_days',   type=int,   default=3)
    p.add_argument('--mkt_institution',    default='buy',
                   choices=['buy','sell','neutral'])
    p.add_argument('--sector_etf_days',    type=int,   default=5)
    p.add_argument('--stk_foreign_days',   type=int,   default=5)
    p.add_argument('--stk_inst_weeks',     type=int,   default=3)
    p.add_argument('--short_ratio',        type=float, default=0.02)
    p.add_argument('--short_trend',        default='decrease',
                   choices=['decrease','increase','stable'])

    # Step 1
    p.add_argument('--total_debt',     type=float, required=True, help='총부채(억원)')
    p.add_argument('--equity',         type=float, required=True, help='자기자본(억원)')
    p.add_argument('--op_income',      type=float, required=True, help='영업이익(억원)')
    p.add_argument('--interest_exp',   type=float, required=True, help='이자비용(억원)')
    p.add_argument('--ocf',            type=float, required=True, help='영업현금흐름(억원)')

    # Step 5
    p.add_argument('--entry',          type=float, required=True, help='진입가(원)')
    p.add_argument('--stop',           type=float, required=True, help='손절선(원)')
    p.add_argument('--target',         type=float, required=True, help='목표가(원)')

    args = p.parse_args()
    result = run_pipeline(args)

    with open(f"swing_{args.ticker}_{date.today().isoformat()}.json", 'w',
              encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"\n결과 저장: swing_{args.ticker}_{date.today().isoformat()}.json")


if __name__ == '__main__':
    main()
