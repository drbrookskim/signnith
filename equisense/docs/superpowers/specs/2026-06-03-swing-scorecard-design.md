# 스윙 적합도 스코어카드 설계 스펙

**날짜:** 2026-06-03  
**범위:** EquiSense 펀더멘털 탭 — swing-trading-framework Step 1 체력 필터 통합  
**레이아웃:** C-lite (드로어 패턴)  
**테마:** 라이트/다크 모두 지원 (기존 `dark:` Tailwind 패턴 유지)

---

## 1. 목표

`swing-trading-framework` 스킬의 Step 1 체력 필터와 이익 모멘텀·밸류에이션 지표를 펀더멘털 탭에 통합하여, 사용자가 종목의 스윙 트레이딩 진입 적합성을 펀더멘털 관점에서 즉시 판단할 수 있게 한다.

---

## 2. 아키텍처 변경 범위

### 변경 파일 (4개)

| 파일 | 변경 내용 |
|------|----------|
| `frontend/types/index.ts` | `FundamentalMetrics`에 `icr`, `peg_ratio`, `week52_high`, `week52_low`, `current_price` 필드 추가 |
| `frontend/lib/adapters/yahoo.ts` | `interestExpense`, `pegRatio`, `summaryDetail` 파싱 추가 |
| `frontend/lib/adapters/dart.ts` | KR 종목 이자비용(`INT_EXP`) 파싱 추가 → ICR 계산 |
| `frontend/components/charts/FundamentalsCharts.tsx` | `SwingScoreDrawer` 컴포넌트 추가 |

### 변경 없는 파일

- `api-client.ts` — `SUMMARY_MODULES`에 `summaryDetail` 추가 (1줄)
- Cloudflare Worker — 변경 없음
- 기타 탭 (해자·정성·기술적) — 변경 없음

---

## 3. 데이터 모델

### 3-1. `FundamentalMetrics` 확장

```typescript
export interface FundamentalMetrics {
  fiscal_year: number
  roe: number | null
  roa: number | null
  debt_ratio: number | null
  operating_margin: number | null
  fcf: number | null
  per: number | null
  pbr: number | null
  // 신규 필드
  icr: number | null            // 이자보상배율 = 영업이익 / 이자비용
  peg_ratio: number | null      // PEG = PER / EPS성장률 (US만, KR null)
  week52_high: number | null    // 52주 고가 (최신 연도만)
  week52_low: number | null     // 52주 저가 (최신 연도만)
  current_price: number | null  // 현재가 (최신 연도만)
}
```

### 3-2. 데이터 소스

| 필드 | US (Yahoo Finance) | KR (DART + Yahoo) |
|------|-------------------|-------------------|
| `icr` | `incomeStatementHistory.interestExpense` | DART `INT_EXP` 항목 |
| `peg_ratio` | `defaultKeyStatistics.pegRatio` | null (미제공) |
| `week52_high` | `summaryDetail.fiftyTwoWeekHigh` | `summaryDetail.fiftyTwoWeekHigh` |
| `week52_low` | `summaryDetail.fiftyTwoWeekLow` | `summaryDetail.fiftyTwoWeekLow` |
| `current_price` | `financialData.currentPrice` | `financialData.currentPrice` |

`api-client.ts`의 `SUMMARY_MODULES`에 `summaryDetail` 추가 필요.

---

## 4. 점수 산정 로직

### 4-1. 항목별 배점

| # | 항목 | 판정 기준 | PASS | WARN | FAIL | 비고 |
|---|------|----------|------|------|------|------|
| 1 | 부채비율 | ≤ 200% / ≤ 300% / 초과 | 25 | 12 | 0 | `debt_ratio` |
| 2 | 이자보상배율 | ≥ 3x / ≥ 1.5x / 미만 | 15 | 7 | 0 | `icr`, 없으면 배점 제외 |
| 3 | FCF | > 0 / ≥ -10% 매출 / 미만 | 10 | 5 | 0 | `fcf` |
| 4 | 이익 모멘텀 | QoQ 2분기↑ / 1분기↑ / 정체·하락 | 25 | 12 | 0 | `quarterlyInsights` 재활용 |
| 5 | PEG Ratio | < 1.0 / < 2.0 / ≥ 2.0 | 15 | 7 | 0 | `peg_ratio`, 없으면 배점 제외 |
| 6 | 52주 위치 | 고점 -25% 이내 / -40% 이내 / 초과 | 10 | 5 | 0 | `week52_high` + `current_price`, 없으면 배점 제외 |

### 4-2. 점수 환산

```
유효 배점 합계 = 데이터가 있는 항목들의 만점 합산
최종 점수 = (실제 취득 점수 / 유효 배점 합계) × 100  (반올림 정수)
```

데이터 없는 항목은 0점 처리하지 않고 분모에서 제외하여 공정 비교.

### 4-3. 종합 등급

| 점수 | 등급 | 색상 |
|------|------|------|
| 80~100 | 우수 (Strong) | emerald |
| 60~79 | 양호 (Good) | indigo |
| 40~59 | 주의 (Caution) | amber |
| 0~39 | 부적합 (Weak) | red |

### 4-4. 종합 코멘트 생성 규칙

항목 조합에 따라 1줄 자동 생성:

- 체력 PASS + 모멘텀 PASS + 위치 PASS → `"재무·모멘텀·기술적 조건 모두 양호. 진입 검토 가능."`
- 체력 PASS + 모멘텀 PASS + 위치 FAIL → `"재무 체력 우수, 이익 모멘텀 양호 — 고점 대비 조정 중. 50MA 회복 후 진입 재검토 권장."`
- 체력 FAIL → `"재무 체력 기준 미달. 스윙 트레이딩 진입 부적합."`
- 모멘텀 FAIL → `"이익 모멘텀 정체·하락. 촉발 이벤트 발생 시까지 관망 권장."`
- 기타 조합 → `"일부 지표 주의 필요. 세부 항목을 확인하세요."`

---

## 5. UI 컴포넌트 설계

### 5-1. `SwingScoreDrawer`

위치: `FundamentalsCharts.tsx` 내 핵심지표 섹션 아래

```
<section> 추이 분석
<section> 핵심지표
<SwingScoreDrawer>   ← 신규 (기본 접힘)
```

**Props:**
```typescript
interface SwingScoreDrawerProps {
  metrics: FundamentalMetrics | null       // 최신 연도 지표
  quarterlyInsights: QuarterlyInsightMap | null
  quarterlyLoading: boolean
  market: Market
}
```

### 5-2. 드로어 헤더 (항상 표시)

- 왼쪽: `📊 스윙 적합도` 라벨
- 중앙: 점수 프로그레스 바 + 점수 숫자
- 오른쪽: `▼ / ▲` 토글 버튼
- 클릭 시 본문 펼침/접힘 (애니메이션 없음, 즉시 토글)

### 5-3. 드로어 본문 (펼침 시)

2×2 그리드 카드 (모바일은 1×4):

```
┌──────────────────┬──────────────────┐
│ 🟢 체력 필터     │ 🟢 이익 모멘텀   │
│ PASS / WARN/FAIL │ 분기 추이 요약   │
│ 부채·ICR·FCF 값  │ QoQ 방향         │
├──────────────────┼──────────────────┤
│ 🟡 PEG Ratio     │ 🔴 52주 위치     │
│ n.nx / 데이터없음│ 고점 대비 -xx%   │
│ 기준 < 1.0       │ 고점·저점 표시   │
└──────────────────┴──────────────────┘
종합 코멘트 1줄
```

### 5-4. 색상 매핑

| 상태 | 라이트 모드 | 다크 모드 |
|------|------------|----------|
| PASS/GO | `text-emerald-600 bg-emerald-50` | `text-emerald-400 bg-emerald-950/20` |
| WARN | `text-amber-600 bg-amber-50` | `text-amber-400 bg-amber-950/20` |
| FAIL | `text-red-600 bg-red-50` | `text-red-400 bg-red-950/20` |
| N/A | `text-zinc-400 bg-zinc-100` | `text-zinc-500 bg-zinc-800/40` |

---

## 6. 점수 계산 함수 위치

`FundamentalsCharts.tsx` 내 순수 함수로 인라인 구현 (별도 파일 불필요):

```typescript
function computeSwingScore(
  metrics: FundamentalMetrics,
  quarterlyInsights: QuarterlyInsightMap | null,
): SwingScore { ... }
```

`SwingScore` 타입:
```typescript
interface SwingScore {
  total: number            // 0~100
  grade: 'strong' | 'good' | 'caution' | 'weak'
  items: SwingScoreItem[]
  comment: string
}

interface SwingScoreItem {
  key: string
  label: string
  status: 'pass' | 'warn' | 'fail' | 'na'
  value: string            // 표시용 문자열 ("41%" / "38.8x" / "데이터 없음")
  detail: string           // 서브텍스트
  score: number
  maxScore: number
}
```

---

## 7. 구현 순서

1. `types/index.ts` — `FundamentalMetrics` 필드 추가
2. `api-client.ts` — `SUMMARY_MODULES`에 `summaryDetail` 추가
3. `yahoo.ts` — `icr`, `peg_ratio`, `week52_high/low`, `current_price` 파싱
4. `dart.ts` — KR 이자비용 파싱 → `icr` 계산
5. `FundamentalsCharts.tsx` — `computeSwingScore` + `SwingScoreDrawer` 구현
6. 빌드 확인 + GitHub Pages 배포

---

## 8. 수용 기준 (Acceptance Criteria)

- [ ] 한미반도체(042700) 조회 시 스윙 스코어카드 드로어가 표시된다
- [ ] 드로어 기본 상태는 접힘이며, 클릭 시 펼쳐진다
- [ ] 체력 필터(부채비율·ICR·FCF) 항목이 PASS/WARN/FAIL로 표시된다
- [ ] 이익 모멘텀은 기존 `quarterlyInsights`를 재활용한다
- [ ] 데이터가 없는 항목(KR의 PEG 등)은 "데이터 없음"으로 표시되며 점수 분모에서 제외된다
- [ ] 라이트/다크 모드 모두 정상 표시된다
- [ ] TypeScript 빌드 오류 없음
- [ ] 기존 SparklineCard·확장 패널 동작에 영향 없음
