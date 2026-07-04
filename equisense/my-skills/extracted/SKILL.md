---
name: swing-trading-framework
description: >
  스윙 투자 완결형 의사결정 프레임워크. 거시환경(Gate A) → 수급(Gate B) →
  체력 필터 → 촉발 이벤트 → 섹터·종목 수급 → 기술적 진입 → R:R 검증 →
  청산 조건(시간 손절 포함)까지 7단계 순차 검증 파이프라인.
  한국 주식(KOSPI/KOSDAQ) 기준으로 설계됐으며 Claude Code 환경에서
  단일 명령으로 종목 진입 가능 여부와 목표가·손절선을 산출한다.
category: swing-strategy
version: 1.0.0
---

# Swing Trading Framework Skill

## 아키텍처 개요

```
[Gate A] 거시환경       VIX · 금리 · PMI · 지수 200MA
         ↓ 통과 시만
[Gate B] 수급           시장 전체 → 섹터 → 종목 수급 3레이어
         ↓ 통과 시만
[Step 1] 체력 필터      부채비율 · 이자보상배율 · OCF
         ↓
[Step 2] 촉발 이벤트    어닝 서프라이즈 · 이익률 개선 · 가이던스 상향
         ↓
[Step 3] 섹터·종목 수급 ETF 자금 · 외국인 지분 · 대차잔고
         ↓
[Step 4] 기술적 진입    눌림목 / 돌파 · 거래량 · RSI
         ↓
[Step 5] R:R 검증       목표가 · 손절선 · R:R ≥ 2:1
         ↓
[Step 6] 청산 조건      익절 · 손절 · 이익률 훼손 · 시간 손절
         ↓
[OUTPUT] 진입 판정 리포트
```

---

## Gate A — 거시환경 진입 허가 조건

### 판정 기준 (4개 축, 하나라도 STOP이면 전면 대기)

| 축 | 진입 허가 | 주의(규모 50%↓) | 대기(전면 금지) |
|---|---|---|---|
| VIX | 20 이하 | 20~30 | 30 초과 |
| 금리 | 동결·인하 / 완만한 인상(25bp) | 인상 가속(50bp↑) | 긴급 인상·급등 |
| PMI | 50 이상 or 반등 | 45~50 or 하락 | 45 이하 + 하락 |
| 지수 200MA | 위 + 상승/조정 | 아래 + 반등 | 아래 + 하락 |

한국 추가 지표: 원달러 환율 1,400원↑ → 추가 주의 신호

```python
# gate_a.py
def check_gate_a(vix: float, rate_change_bp: float,
                 pmi: float, pmi_direction: str,
                 idx_vs_200ma: str, usdkrw: float = 0) -> dict:
    """
    Parameters
    ----------
    vix            : 현재 VIX 수치
    rate_change_bp : 최근 인상 폭 (bp). 동결=0, 인하=음수
    pmi            : 최근 PMI 수치
    pmi_direction  : 'up' | 'down'
    idx_vs_200ma   : 'above_up' | 'above_down' | 'below_up' | 'below_down'
    usdkrw         : 원달러 환율 (선택)

    Returns
    -------
    dict: {axis: status}  status ∈ {'GO', 'WARN', 'STOP'}
    결과에 하나라도 'STOP' 있으면 Gate A 차단
    """
    result = {}

    # VIX
    if vix <= 20:
        result['vix'] = 'GO'
    elif vix <= 30:
        result['vix'] = 'WARN'
    else:
        result['vix'] = 'STOP'

    # 금리
    if rate_change_bp <= 25:
        result['rate'] = 'GO'
    elif rate_change_bp <= 50:
        result['rate'] = 'WARN'
    else:
        result['rate'] = 'STOP'

    # PMI
    if pmi >= 50:
        result['pmi'] = 'GO'
    elif pmi >= 45:
        result['pmi'] = 'WARN' if pmi_direction == 'down' else 'GO'
    else:
        result['pmi'] = 'STOP'

    # 지수 vs 200MA
    if idx_vs_200ma in ('above_up', 'above_down'):
        result['index'] = 'GO'
    elif idx_vs_200ma == 'below_up':
        result['index'] = 'WARN'
    else:
        result['index'] = 'STOP'

    # 원달러 환율 (선택)
    if usdkrw >= 1400:
        result['usdkrw'] = 'WARN'
    elif usdkrw > 0:
        result['usdkrw'] = 'GO'

    gate_pass = all(v != 'STOP' for v in result.values())
    result['gate_a'] = 'PASS' if gate_pass else 'BLOCK'
    return result
```

---

## Gate B — 수급 진입 허가 (3레이어)

### Layer 1 — 시장 전체 수급

| 지표 | 진입 허가 | 대기 신호 |
|---|---|---|
| 외국인 순매수 | 3거래일 연속 순매수 or 주간 +3,000억↑ | 3거래일 연속 순매도 |
| 기관 순매수 | 외국인과 동반 순매수 | 외국인·기관 동반 순매도 → 즉시 차단 |
| 프로그램 | 차익 순매수 전환 | 차익잔고 급증 |

### Layer 2 — 섹터 수급

| 지표 | 진입 허가 | 대기 신호 |
|---|---|---|
| 섹터 ETF 자금 | 5거래일 순유입 | 연속 순유출 → 섹터 제외 |
| 업종 외국인 | 주간 순매수 유지 | 업종 내 외국인 이탈 |
| 섹터 로테이션 | 경기 사이클과 방향 일치 | 디펜시브로 자금 이동 |

### Layer 3 — 종목 수급

| 지표 | 진입 허가 | 대기 신호 |
|---|---|---|
| 종목 외국인 | 5거래일 연속 순매수 + 지분율↑ | 지분율 급감 |
| 기관 누적 | 3주 누적 순매수 전환 | 기관 연속 순매도 |
| 대차잔고 | 감소 추세 + 시총 3% 이하 | 급증 + 시총 5%↑ |

### 2×2 매트릭스 판정

```
섹터 양호 + 종목 양호 → 최강 진입 신호 → Step 1 진행
섹터 양호 + 종목 불량 → 동종 섹터 대안 종목 탐색
섹터 불량 + 종목 양호 → 헤드윈드 진입 (보유 2주 이내 제한)
섹터 불량 + 종목 불량 → 진입 금지
```

```python
# gate_b.py
def check_gate_b(
    market_foreign_days: int,       # 외국인 순매수 연속 일수 (음수=순매도)
    market_institution: str,        # 'buy' | 'sell' | 'neutral'
    sector_etf_days: int,           # 섹터 ETF 순유입 연속 일수
    stock_foreign_days: int,        # 종목 외국인 순매수 연속 일수
    stock_institution_weeks: int,   # 기관 누적 순매수 주수 (음수=순매도)
    short_ratio: float,             # 대차잔고 / 시총 (0~1)
    short_trend: str,               # 'decrease' | 'increase' | 'stable'
) -> dict:

    result = {}

    # Layer 1
    if market_foreign_days >= 3 and market_institution == 'buy':
        result['layer1'] = 'GO'
    elif market_foreign_days <= -3 and market_institution == 'sell':
        result['layer1'] = 'STOP'
    else:
        result['layer1'] = 'WARN'

    # Layer 2
    result['layer2'] = 'GO' if sector_etf_days >= 5 else \
                       'STOP' if sector_etf_days <= -3 else 'WARN'

    # Layer 3
    short_ok = short_ratio < 0.03 and short_trend == 'decrease'
    stock_ok = stock_foreign_days >= 5 and stock_institution_weeks >= 3
    if stock_ok and short_ok:
        result['layer3'] = 'GO'
    elif stock_foreign_days <= -3 or stock_institution_weeks <= -2:
        result['layer3'] = 'STOP'
    else:
        result['layer3'] = 'WARN'

    # 최종 판정
    stops = sum(1 for v in result.values() if v == 'STOP')
    result['gate_b'] = 'BLOCK' if stops > 0 or result['layer1'] == 'STOP' \
                       else 'PASS'

    # 2×2 매트릭스
    sector_good = result['layer2'] == 'GO'
    stock_good  = result['layer3'] == 'GO'
    if sector_good and stock_good:
        result['matrix'] = 'STRONG_BUY'
    elif sector_good and not stock_good:
        result['matrix'] = 'FIND_ALTERNATIVE'
    elif not sector_good and stock_good:
        result['matrix'] = 'HEADWIND_SHORT_ONLY'
    else:
        result['matrix'] = 'NO_ENTRY'

    return result
```

---

## Step 1 — 체력 필터

### 기준

| 지표 | 공식 | 통과 기준 | 탈락 기준 |
|---|---|---|---|
| 부채비율 | 총부채 ÷ 자기자본 × 100 | 200% 이하 | 200% 초과 |
| 이자보상배율 | 영업이익 ÷ 이자비용 | 1.5배 이상 | 1.5배 미만 |
| OCF | 영업활동현금흐름 | 플러스 | 마이너스 |

### 데이터 소스
- DART 사업보고서(분기) / 네이버 증권 / 에프앤가이드
- yfinance: `ticker.financials`, `ticker.balance_sheet`, `ticker.cashflow`

```python
# step1_health_filter.py
import yfinance as yf

def check_health_filter(ticker_ks: str) -> dict:
    """
    ticker_ks: Yahoo Finance 심볼 (예: '042700.KS')
    """
    t = yf.Ticker(ticker_ks)
    bs = t.balance_sheet
    cf = t.cashflow
    inc = t.financials

    try:
        total_debt   = bs.loc['Total Debt'].iloc[0]
        equity       = bs.loc['Stockholders Equity'].iloc[0]
        op_income    = inc.loc['Operating Income'].iloc[0]
        interest_exp = abs(inc.loc['Interest Expense'].iloc[0])
        ocf          = cf.loc['Operating Cash Flow'].iloc[0]

        debt_ratio   = total_debt / equity * 100
        icr          = op_income / interest_exp if interest_exp > 0 else float('inf')

        return {
            'debt_ratio':  round(debt_ratio, 1),
            'debt_pass':   debt_ratio <= 200,
            'icr':         round(icr, 1),
            'icr_pass':    icr >= 1.5,
            'ocf':         ocf,
            'ocf_pass':    ocf > 0,
            'step1_pass':  debt_ratio <= 200 and icr >= 1.5 and ocf > 0,
        }
    except Exception as e:
        return {'error': str(e), 'step1_pass': False}
```

---

## Step 2 — 촉발 이벤트

### 판정 기준

| 이벤트 | 진입 가능 기준 | 없으면 |
|---|---|---|
| 어닝 서프라이즈 | 컨센서스 대비 +5% 이상 초과 | 대기 |
| QoQ 이익률 개선 | 2분기 연속 영업이익률 상승 | 대기 |
| 가이던스 상향 | 경영진 컨센서스 대비 상향 조정 | 대기 |

### 이벤트 없는 상승 판단 기준
- 외국인·기관 동반 수급 + 거래량 20일 평균 2배↑ → 선행 매집 가능성 → 조건부 진입
- 섹터 온기(동종 선도주 이벤트 발생) → 후발 종목 진입 가능
- 개인 단독 급등 / 루머 상승 → 진입 금지

---

## Step 3 — 섹터·종목 수급 (Gate B Layer 2·3 재확인)

Gate B에서 이미 확인했으나, 진입 직전 재확인 루틴:

```
① 섹터 ETF 5일 자금 흐름  (HTS 업종별 탭)
② 업종 외국인 순매수 방향
③ 종목 외국인 5일 누적
④ 기관 3주 누적
⑤ 대차잔고 추세 (시총 3% 이하 + 감소)
```

최강 진입 조합: 외국인·기관 동반 + 대차잔고 감소 동시 충족

---

## Step 4 — 기술적 진입

### 눌림목 vs 돌파 선택 매트릭스

| 시장 국면 | 종목 추세 | 선택 |
|---|---|---|
| 상승 추세 | 추세 있음 | 눌림목 최적 |
| 상승 추세 | 횡보·압축 | 돌파 유효 |
| 횡보·불확실 | 추세 있음 | 눌림목 가능 (규모 70%) |
| 횡보·불확실 | 횡보 | 관망 |
| 하락 추세 | 무관 | 진입 금지 |

### 눌림목 진입 조건
- 20MA 또는 지지선 ±2% 이내
- 거래량 20일 평균 이하로 수렴
- RSI 40~60 구간
- 직전 고점 대비 -5~-15% 조정

### 돌파 진입 조건 (모두 충족 필요)
- 거래량 20일 평균 2배 이상 폭증
- 종가 기준 저항선 돌파 (장중 돌파는 무시)
- 돌파선에서 +1~2% 이내 진입 (추격 금지)

### 실패 신호 (즉시 청산)
- 눌림목: 지지선 종가 -2% 이탈 / 3일 연속 음봉 / 이동평균 역배열
- 돌파: 돌파선 재이탈 / 진입 후 3일 내 신고가 갱신 실패

---

## Step 5 — R:R 검증

### 공식

```
R:R = (목표가 - 진입가) ÷ (진입가 - 손절선)
손익분기 승률 = 1 ÷ (1 + R:R) × 100
```

### 판정 기준

| R:R | 판정 |
|---|---|
| 2.0 이상 | 진입 허가 |
| 1.5~2.0 | 진입 재고 (승률 60%↑ 확신 필요) |
| 1.5 미만 | 진입 금지 |

### 목표가 산출 근거
- PBR 밴드 상단 (역대 PBR 범위 상단)
- 52주 고가 / 전고점 저항선
- PEG: PER ÷ EPS성장률 < 1.0 → 저평가

### 손절선 설정 원칙
- 눌림목: 지지선 -2~3%
- 돌파: 돌파선 직하단
- R:R 맞추려고 손절선 확대 금지

```python
# step5_rr_check.py
def check_rr(entry: float, stop: float, target: float,
             min_rr: float = 2.0) -> dict:
    if stop >= entry or target <= entry:
        return {'valid': False, 'reason': '손절 < 진입 < 목표 조건 불충족'}

    risk   = entry - stop
    reward = target - entry
    rr     = reward / risk
    loss_pct   = (stop - entry) / entry * 100
    gain_pct   = (target - entry) / entry * 100
    breakeven  = 1 / (1 + rr) * 100

    return {
        'entry':       entry,
        'stop':        stop,
        'target':      target,
        'loss_pct':    round(loss_pct, 1),
        'gain_pct':    round(gain_pct, 1),
        'rr':          round(rr, 2),
        'breakeven':   round(breakeven, 1),
        'step5_pass':  rr >= min_rr,
        'verdict':     'PASS' if rr >= min_rr else
                       'CAUTION' if rr >= 1.5 else 'BLOCK',
    }
```

---

## Step 6 — 청산 조건

### 4가지 청산 트리거

| 트리거 | 조건 | 실행 |
|---|---|---|
| 익절 | 목표가 도달 | 즉시 또는 분할 청산 |
| 가격 손절 | 손절선 종가 이탈 | 즉시 청산 |
| 펀더멘탈 훼손 | 이익률 QoQ 악화 / 이자보상배율 기준 이탈 | 조기 청산 |
| 시간 손절 | 기한 내 무반응 | 익일 시초가 청산 |

### 시간 손절 기준 (거래일 기준)

| 종목 유형 | 기준 | 연장 조건 |
|---|---|---|
| 고베타·이벤트 주도형 (한미반도체 등) | 10거래일 (2주) | +5%↑ 진행 중 + 수급 유지 |
| 저베타·가치형 / 수출·매크로형 | 15거래일 (3주) | 기관 누적 매수 지속 + 이벤트 미소화 |
| 소형·성장형 (코스닥 중소형) | 10거래일 (2주) | 연장 없음 |

연장 허용 최대 1회, +5거래일(1주)

```python
# step6_time_stop.py
from datetime import date, timedelta

def get_time_stop_date(entry_date: date, stock_type: str) -> dict:
    """
    stock_type: 'high_beta' | 'value' | 'small_cap'
    """
    trading_days = {'high_beta': 10, 'value': 15, 'small_cap': 10}
    days = trading_days.get(stock_type, 15)

    deadline = _add_trading_days(entry_date, days)
    today    = date.today()
    elapsed  = _trading_days_between(entry_date, today)
    remaining = days - elapsed

    if remaining > 5:
        status = 'HOLDING'
    elif remaining > 0:
        status = 'PREPARE_EXIT'
    else:
        status = 'TIME_STOP'

    return {
        'entry_date':  entry_date.isoformat(),
        'deadline':    deadline.isoformat(),
        'elapsed':     max(0, elapsed),
        'remaining':   max(0, remaining),
        'status':      status,
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
```

---

## 통합 파이프라인 실행

```python
# swing_pipeline.py
"""
사용법:
    python swing_pipeline.py --ticker 042700 \
        --vix 18.5 --rate_bp 0 --pmi 52.3 --pmi_dir up \
        --idx_200ma above_up --usdkrw 1380 \
        --entry 68000 --stop 65960 --target 82000 \
        --stock_type high_beta

전체 7단계 판정 결과를 콘솔에 출력하고 JSON으로 저장한다.
"""

import argparse, json
from datetime import date

from gate_a      import check_gate_a
from gate_b      import check_gate_b
from step1_health_filter import check_health_filter
from step5_rr_check      import check_rr
from step6_time_stop     import get_time_stop_date

def run_pipeline(args):
    report = {}

    # Gate A
    gate_a = check_gate_a(
        vix=args.vix, rate_change_bp=args.rate_bp,
        pmi=args.pmi, pmi_direction=args.pmi_dir,
        idx_vs_200ma=args.idx_200ma, usdkrw=args.usdkrw,
    )
    report['gate_a'] = gate_a
    if gate_a['gate_a'] == 'BLOCK':
        report['final'] = 'BLOCK — Gate A 미통과. 전면 대기.'
        return report

    # Gate B (수동 입력 또는 API 연동)
    # 실제 운용 시 HTS API 또는 KRX 데이터로 대체
    print("[Gate B] 수급 데이터를 수동으로 확인하세요 (HTS 투자자별 매매동향)")

    # Step 1
    ticker_ks = args.ticker + '.KS'
    step1 = check_health_filter(ticker_ks)
    report['step1'] = step1
    if not step1.get('step1_pass'):
        report['final'] = 'BLOCK — Step 1 체력 필터 미통과.'
        return report

    # Step 5 — R:R
    step5 = check_rr(args.entry, args.stop, args.target)
    report['step5'] = step5
    if step5['verdict'] == 'BLOCK':
        report['final'] = f"BLOCK — R:R {step5['rr']} : 1. 기준 미달."
        return report

    # Step 6 — 시간 손절 기한
    step6 = get_time_stop_date(date.today(), args.stock_type)
    report['step6'] = step6

    report['final'] = (
        f"PASS — 전 단계 통과. "
        f"진입가 {args.entry:,}원 / 손절 {args.stop:,}원 / 목표 {args.target:,}원 / "
        f"R:R {step5['rr']} : 1 / 시간손절 {step6['deadline']}"
    )
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--ticker',     required=True)
    parser.add_argument('--vix',        type=float, default=18.0)
    parser.add_argument('--rate_bp',    type=float, default=0)
    parser.add_argument('--pmi',        type=float, default=51.0)
    parser.add_argument('--pmi_dir',    default='up')
    parser.add_argument('--idx_200ma',  default='above_up')
    parser.add_argument('--usdkrw',     type=float, default=0)
    parser.add_argument('--entry',      type=float, required=True)
    parser.add_argument('--stop',       type=float, required=True)
    parser.add_argument('--target',     type=float, required=True)
    parser.add_argument('--stock_type', default='value',
                        choices=['high_beta', 'value', 'small_cap'])
    args = parser.parse_args()

    result = run_pipeline(args)
    print(json.dumps(result, ensure_ascii=False, indent=2))
```

---

## 핵심 원칙 요약

```
1. Gate A / Gate B 중 하나라도 BLOCK → 이후 단계 없음
2. Step 1~6 모두 통과한 종목만 실제 진입
3. R:R 2:1 미달 → 진입가를 낮추거나 목표가 근거를 재검토
4. 손절선은 기술적 기준 — R:R 맞추려고 확대 금지
5. 시간 손절 기한 타협 금지 — "조금만 더"는 규칙 없음과 같다
6. 청산 후 새 이벤트 발생 시 새 포지션으로 재진입 가능
7. 거시환경(Gate A) 악화 시 보유 중 포지션도 조기 청산 검토
```

---

## 의존 패키지

```bash
pip install yfinance pandas numpy requests --break-system-packages
```

## 데이터 소스

| 데이터 | 소스 |
|---|---|
| OHLCV · 재무제표 | yfinance / pykrx |
| VIX | yfinance (`^VIX`) |
| PMI | FRED API / investing.com |
| 외국인·기관 수급 | KRX 정보데이터시스템 / HTS |
| 대차잔고 | KRX 정보데이터시스템 |
| 섹터 ETF 자금 | 네이버 증권 ETF |
