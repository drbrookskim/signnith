# 스윙 판정 탭 설계 스펙

**날짜:** 2026-06-03  
**범위:** EquiSense — 스윙 판정 전용 탭 신규 추가  
**레이아웃:** 세로 스텝 흐름 (Gate A → Gate B → Step 1 → R:R → 시간손절 → 최종 판정)  
**테마:** 라이트/다크 (기존 `dark:` Tailwind 패턴 유지)

---

## 1. 목표

`swing-trading-framework` 스킬의 전체 7단계 파이프라인(Gate A 거시환경, Gate B 수급, Step 1 체력 필터, Step 5 R:R 검증, Step 6 시간 손절, 최종 판정)을 EquiSense의 새 탭으로 구현한다.

Gate A는 Yahoo Finance 자동 조회, Gate B는 사용자 수동 입력(HTS 확인값), 나머지는 기존 데이터 재활용 + 프론트엔드 계산으로 **완전 무료**로 동작한다.

---

## 2. 아키텍처 변경 범위

### 신규 파일 (5개)

| 파일 | 역할 |
|------|------|
| `frontend/app/companies/[ticker]/swing/page.tsx` | Next.js 라우트 (generateStaticParams 포함) |
| `frontend/app/companies/[ticker]/swing/SwingPage.tsx` | 메인 컴포넌트 — 데이터 오케스트레이션 |
| `frontend/components/swing/GateAPanel.tsx` | Gate A 자동 fetch + 5개 지표 표시 |
| `frontend/components/swing/GateBPanel.tsx` | Gate B 수동 입력 7개 + 판정 로직 |
| `frontend/lib/adapters/swingPipeline.ts` | 순수 판정 함수 (gate_a/b, rr, timeStop) |

### 수정 파일 (2개)

| 파일 | 변경 내용 |
|------|----------|
| `frontend/components/layout/TabNav.tsx` | TABS 배열에 `{ label: '스윙 판정', href: 'swing' }` 추가 |
| `frontend/lib/api-client.ts` | `fetchGateAData(ticker, market)` 함수 추가 |

### 변경 없는 파일

- Cloudflare Worker — 기존 `/yahoo/summary` 경로 재사용
- 기존 4개 탭 컴포넌트 — 변경 없음

---

## 3. 데이터 모델

### 3-1. Gate A 데이터 타입

```typescript
// frontend/lib/adapters/swingPipeline.ts

export type GateStatus = 'GO' | 'WARN' | 'STOP'
export type GateVerdict = 'PASS' | 'BLOCK'

export interface GateAData {
  vix: number | null
  kospi_price: number | null
  kospi_ma200: number | null
  usdkrw: number | null
  rate_bp: number           // BOK 기준금리 변동 bp. 하드코딩 상수.
  pmi: number               // Korea Mfg PMI. 하드코딩 상수.
  pmi_direction: 'up' | 'down'  // 하드코딩 상수.
}

export interface GateAResult {
  data: GateAData
  axes: Record<string, GateStatus>  // vix, rate, pmi, index, usdkrw
  verdict: GateVerdict
}
```

### 3-2. Gate B 입력 타입

```typescript
export interface GateBInput {
  market_foreign_days: number        // -10~10, 외국인 순매수 연속 일수
  market_institution: 'buy' | 'neutral' | 'sell'
  sector_etf_days: number            // -10~10, 섹터 ETF 순유입 연속 일수
  stock_foreign_days: number         // 0~10, 종목 외국인 순매수 연속 일수
  stock_institution_weeks: number    // -5~5, 기관 누적 순매수 주수
  short_ratio: number                // 0~0.20, 대차잔고/시총 비율
  short_trend: 'decrease' | 'stable' | 'increase'
}

export interface GateBResult {
  input: GateBInput
  layer1: GateStatus
  layer2: GateStatus
  layer3: GateStatus
  matrix: 'STRONG_BUY' | 'FIND_ALTERNATIVE' | 'HEADWIND_SHORT_ONLY' | 'NO_ENTRY'
  verdict: GateVerdict
}
```

### 3-3. R:R 타입

```typescript
export interface RRInput {
  entry: number     // current_price (자동)
  stop: number      // entry × 0.95 (기본, 수정 가능)
  target: number    // week52_high × 1.05 (기본, 수정 가능)
}

export interface RRResult {
  rr: number
  loss_pct: number
  gain_pct: number
  breakeven_winrate: number
  verdict: 'PASS' | 'CAUTION' | 'BLOCK'  // ≥2.0 / ≥1.5 / <1.5
}
```

### 3-4. 시간 손절 타입

```typescript
export type StockType = 'high_beta' | 'value' | 'small_cap'

export interface TimeStopResult {
  entry_date: string    // today ISO
  deadline: string      // ISO
  total_days: number    // 10 or 15
  elapsed: number
  remaining: number
  status: 'HOLDING' | 'PREPARE_EXIT' | 'TIME_STOP'
  action: string        // 한국어 설명
}
```

### 3-5. 최종 판정 타입

```typescript
export type FinalVerdict = 'PASS' | 'CONDITIONAL' | 'BLOCK'

export interface SwingFinalResult {
  verdict: FinalVerdict
  gate_a: GateVerdict
  gate_b: GateVerdict
  step1_pass: boolean
  rr: RRResult
  time_stop: TimeStopResult
  summary_line: string  // 1줄 요약
}
```

---

## 4. 판정 로직 (swingPipeline.ts)

swing-trading-framework 스킬의 Python 로직을 TypeScript로 포팅.

### check_gate_a()

```typescript
export function checkGateA(data: GateAData): GateAResult {
  const axes: Record<string, GateStatus> = {}

  // VIX
  axes.vix = data.vix == null ? 'GO'
    : data.vix <= 20 ? 'GO' : data.vix <= 30 ? 'WARN' : 'STOP'

  // 금리 (하드코딩 bp 기준)
  axes.rate = data.rate_bp <= 25 ? 'GO' : data.rate_bp <= 50 ? 'WARN' : 'STOP'

  // PMI
  axes.pmi = data.pmi >= 50 ? 'GO'
    : data.pmi >= 45 ? (data.pmi_direction === 'down' ? 'WARN' : 'GO') : 'STOP'

  // KOSPI vs 200MA
  if (data.kospi_price != null && data.kospi_ma200 != null) {
    axes.index = data.kospi_price > data.kospi_ma200 ? 'GO' : 'WARN'
  } else {
    axes.index = 'GO'
  }

  // USD/KRW
  if (data.usdkrw != null) {
    axes.usdkrw = data.usdkrw >= 1400 ? 'WARN' : 'GO'
  }

  const verdict: GateVerdict = Object.values(axes).some(v => v === 'STOP') ? 'BLOCK' : 'PASS'
  return { data, axes, verdict }
}
```

### check_gate_b()

스킬 `gate_b.py`의 TypeScript 포팅. Layer 1/2/3 개별 판정 후 최종 verdict 및 matrix 산출.

```typescript
export function checkGateB(input: GateBInput): GateBResult {
  // Layer 1
  const layer1: GateStatus =
    input.market_foreign_days >= 3 && input.market_institution === 'buy' ? 'GO' :
    input.market_foreign_days <= -3 && input.market_institution === 'sell' ? 'STOP' : 'WARN'

  // Layer 2
  const layer2: GateStatus =
    input.sector_etf_days >= 5 ? 'GO' :
    input.sector_etf_days <= -3 ? 'STOP' : 'WARN'

  // Layer 3
  const short_ok = input.short_ratio < 0.03 && input.short_trend === 'decrease'
  const stock_ok = input.stock_foreign_days >= 5 && input.stock_institution_weeks >= 3
  const layer3: GateStatus =
    (stock_ok && short_ok) ? 'GO' :
    (input.stock_foreign_days <= -3 || input.stock_institution_weeks <= -2) ? 'STOP' : 'WARN'

  const verdict: GateVerdict =
    [layer1, layer2, layer3].some(l => l === 'STOP') ? 'BLOCK' : 'PASS'

  const matrix =
    layer2 === 'GO' && layer3 === 'GO' ? 'STRONG_BUY' :
    layer2 === 'GO' && layer3 !== 'GO' ? 'FIND_ALTERNATIVE' :
    layer2 !== 'GO' && layer3 === 'GO' ? 'HEADWIND_SHORT_ONLY' : 'NO_ENTRY'

  return { input, layer1, layer2, layer3, matrix, verdict }
}
```

### checkRR(), getTimeStop()

스킬 `steps.py`의 TypeScript 포팅. 순수 함수, 외부 의존 없음.

---

## 5. Gate A 데이터 소스

### fetchGateAData() — api-client.ts에 추가

| 지표 | Yahoo Finance 심볼 | 사용 필드 |
|------|-------------------|----------|
| VIX | `^VIX` | `price.regularMarketPrice` |
| KOSPI 현재가 | `^KS11` | `price.regularMarketPrice` |
| KOSPI 200MA | `^KS11` | `summaryDetail.twoHundredDayAverage` |
| USD/KRW | `KRW=X` | `price.regularMarketPrice` |

기존 `/yahoo/summary?symbol=X&modules=price,summaryDetail` 경로 재사용.

### 하드코딩 상수 (swingPipeline.ts에 정의)

```typescript
export const MACRO_CONSTANTS = {
  rate_bp: 0,             // BOK 기준금리 동결 (기준: 2025-01)
  pmi: 51.2,              // Korea Mfg PMI (기준: 2026-05)
  pmi_direction: 'up' as const,
  last_updated: '2026-05',
}
```

---

## 6. UI 컴포넌트 상세

### GateAPanel

- 자동 fetch (SwingPage 마운트 시 1회)
- 새로고침 버튼 (수동 재조회)
- 로딩 스켈레톤
- 5개 지표 카드 (VIX, KOSPI 200MA, USD/KRW, 금리, PMI)
- 각 카드: 수치 + GO/WARN/STOP 색상 배지
- 전체 verdict (PASS/BLOCK) 헤더 표시

### GateBPanel

- 7개 입력 요소:
  1. `market_foreign_days`: range 슬라이더 (-10~10)
  2. `market_institution`: 3-way 버튼 토글 (매수/중립/매도)
  3. `sector_etf_days`: range 슬라이더 (-10~10)
  4. `stock_foreign_days`: range 슬라이더 (0~10)
  5. `stock_institution_weeks`: range 슬라이더 (-5~5)
  6. `short_ratio`: range 슬라이더 (0~20, 표시는 0.0%~20.0%)
  7. `short_trend`: 3-way 버튼 토글 (감소/안정/증가)
- 입력값 변경 시 즉시 `checkGateB()` 재실행 → verdict 실시간 갱신
- 2×2 매트릭스 결과 표시
- 기본값: 모두 중립/0 (WARN 유도)

### SwingPage (오케스트레이터)

Props 없음. URL의 `ticker`, `market` searchParams 사용.

내부 state:
- `gateAData` (fetch 결과)
- `gateBInput` (사용자 입력, 기본값은 모두 중립)
- `rrInput` (entry 자동, stop/target 수정 가능)
- `stockType` (시간 손절 종목 유형)
- `fundamentals` (getFundamentals 재호출 or 캐시)

파이프라인은 게이트 순서대로 조건부 렌더링:
- Gate A BLOCK → Gate B 이하 그레이아웃 + "Gate A 통과 후 활성화" 안내
- Gate B BLOCK → Step 1 이하 그레이아웃

---

## 7. 최종 판정 로직

```
Gate A BLOCK → 최종 BLOCK
Gate B BLOCK → 최종 BLOCK
Step 1 FAIL  → 최종 BLOCK
R:R BLOCK    → 최종 BLOCK
위 모두 통과 + Gate B WARN → 최종 CONDITIONAL (조건부)
위 모두 통과 + Gate B PASS → 최종 PASS
```

### summary_line 생성 규칙

| 상황 | 문구 |
|------|------|
| BLOCK (Gate A) | "거시환경 진입 불가 — 전면 대기" |
| BLOCK (Gate B) | "수급 진입 불가 — 외국인·기관 동반 이탈 확인" |
| BLOCK (Step 1) | "재무 체력 미달 — 스윙 진입 부적합" |
| BLOCK (R:R) | `"R:R ${rr} : 1 — 기준 2:1 미달"` |
| CONDITIONAL | `"조건부 진입 — Gate B 수급 재확인 후 결정"` |
| PASS | `"진입 가능 — ${entry}원 / 손절 ${stop}원 / 목표 ${target}원 / R:R ${rr}:1"` |

---

## 8. 수용 기준 (Acceptance Criteria)

- [ ] 탭 바에 "스윙 판정" 5번째 탭이 표시된다
- [ ] Gate A: VIX·KOSPI·USD/KRW 실시간 조회, 금리·PMI 하드코딩 상수 표시
- [ ] Gate A BLOCK 시 이하 단계 비활성화(그레이아웃) 표시
- [ ] Gate B: 슬라이더 7개 + 토글 2개, 입력 즉시 verdict 갱신
- [ ] Step 1: 펀더멘털 탭 스코어 재사용 (중복 API 호출 없음)
- [ ] R:R: 목표가·손절가 인라인 수정 가능, 실시간 R:R 갱신
- [ ] 시간 손절: 종목유형 토글, 마감일·잔여 거래일 표시
- [ ] 최종 판정: PASS / CONDITIONAL / BLOCK + summary_line
- [ ] Gate A BLOCK 시 Gate B 이하 비활성화
- [ ] 라이트/다크 모드 정상 표시
- [ ] TypeScript 빌드 오류 없음
- [ ] 기존 4개 탭 동작 영향 없음
