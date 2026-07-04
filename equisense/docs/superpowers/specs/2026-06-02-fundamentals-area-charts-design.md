# Fundamentals Area Charts & Sparkline Grid Design

## Goal

펀더멘털 탭의 BarChart를 AreaChart로 전환하고, 핵심지표 섹션을 스파크라인 그리드 + 인라인 확장 패널로 교체한다. KR 종목은 DART 2회 호출로 5년 데이터를 확보한다.

## Scope

변경 파일 3개:
1. `frontend/lib/api-client.ts` — KR DART 2회 병렬 호출
2. `frontend/lib/adapters/dart.ts` — 5년 병합 처리 로직
3. `frontend/components/charts/FundamentalsCharts.tsx` — 전면 교체

타입 변경 없음 (`types/index.ts` 수정 불필요). Yahoo 어댑터 변경 없음.

---

## 1. 데이터 레이어 — 5년 확장 (KR only)

### 현재 상태
`api-client.ts`의 KR 분기:
```typescript
proxyFetch<unknown>(`/dart/fs?corp_code=${corpCode}&year=${year}`)
```
`dart.ts`의 `transformDartToFundamentals`:
- `years = [bsnsYear - 2, bsnsYear - 1, bsnsYear]` (3개)
- `AMOUNT_FIELDS = ['bfefrmtrm_amount', 'frmtrm_amount', 'thstrm_amount']` (각각 2년 전, 1년 전, 당기)

### 변경 후

**`api-client.ts` KR 분기:**
```typescript
const [dartDataRecent, dartDataOld] = await Promise.all([
  proxyFetch<unknown>(`/dart/fs?corp_code=${corpCode}&year=${year}`),
  proxyFetch<unknown>(`/dart/fs?corp_code=${corpCode}&year=${year - 2}`).catch(() => null),
])
```
- `year` 호출: 당기(N), 전기(N-1), 전전기(N-2) 3개 연도
- `year-2` 호출: N-2, N-3, N-4 3개 연도
- 합쳐서 최대 5개 연도 (N-4 ~ N)
- 두 번째 호출 실패 시 `.catch(() => null)` — 3년 graceful fallback

**`dart.ts` `transformDartToFundamentals` 시그니처 확장:**
```typescript
export function transformDartToFundamentals(
  dartDataRecent: unknown,
  dartDataOld: unknown | null,  // 두 번째 DART 응답 (없으면 null)
  yahooKeyStats: unknown,
  ticker: string,
  corpName?: string,
): FundamentalAnalysis
```

내부 로직:
1. `dartDataRecent.list`에서 `bsnsYear` 추출
2. `dartDataOld?.list`에서 `bsnsYear - 2`의 데이터 추출 (있으면)
3. 5개 연도 `[bsnsYear-4, bsnsYear-3, bsnsYear-2, bsnsYear-1, bsnsYear]`에 대해 각 재무 지표 계산
4. 중복 연도(N-2)는 recent 데이터 우선 사용
5. 데이터 없는 연도는 `null` 값으로 유지 (필터링하지 않음 — 차트에서 null gap으로 처리)

### US (Yahoo) 변경 없음
`incomeStatementHistory`는 Yahoo 무료 API에서 최대 4년 반환. 그대로 사용.

---

## 2. 차트 레이어 — FundamentalsCharts.tsx

### 2-1. 손익 추이 섹션 — BarChart → AreaChart

`ComposedChart` + `Area` 3개 (매출액·영업이익·순이익).

- 매출액, 영업이익, 순이익은 스케일 차이가 크므로 단일 Y축 + `domain={['auto', 'auto']}`
- 각 Area: `strokeWidth={2}`, `fillOpacity={0.15}`, `dot={false}`, `connectNulls={true}`
- 색상: 매출액 `#6366f1`, 영업이익 `#22c55e`, 순이익 `#f59e0b`

### 2-2. 수익성 지표 섹션 — BarChart → AreaChart

`ComposedChart` + `Area` 3개 (ROE·ROA·영업이익률). 모두 `%` 단위로 동일 스케일.

- 색상: ROE `#6366f1`, ROA `#22c55e`, 영업이익률 `#f59e0b`

### 2-3. 핵심지표 섹션 — SparklineCard 그리드 + 인라인 확장 패널

**구조:**
```
[SparklineCard × 7] ← 4열 그리드
[ExpandedPanel]     ← expandedMetric !== null 일 때만 렌더링
```

**SparklineCard props:**
```typescript
interface SparklineCardProps {
  metricKey: string          // 'roe' | 'roa' | 'debt_ratio' | 'operating_margin' | 'per' | 'pbr' | 'fcf'
  label: string              // 'ROE', 'ROA', ...
  latestValue: number | null
  format: 'percent' | 'ratio' | 'large'
  sparkData: { year: number; value: number | null }[]
  color: string              // 스파크라인 색상
  isExpanded: boolean
  onToggle: () => void
}
```

SparklineCard 내부:
- 상단: 지표명 + 최신값 텍스트
- 하단: Recharts `AreaChart` (높이 52px, 모든 축/grid/tooltip 숨김, `isAnimationActive={false}`)
- 테두리: 기본 `border-zinc-200 dark:border-zinc-800`, 확장 시 `border-indigo-500`
- 클릭: `onToggle()` 호출

**ExpandedPanel:**
- `expandedMetric` state: `string | null` (metricKey)
- 패널: `mt-3` 마진, `border border-zinc-200 dark:border-zinc-800 rounded-lg p-4`
- 내부: 풀사이즈 Recharts `AreaChart` (높이 200px)
  - X축: 연도 (`fiscal_year`)
  - Y축: 지표 단위에 맞는 formatter (percent/ratio/large)
  - Tooltip: 연도 + 값
  - 데이터 없는 연도 도트 표시 안 함 (`connectNulls={false}`)
- 우상단 ✕ 닫기 버튼 (`onClick={() => setExpandedMetric(null)}`)

**metricKey별 color:**
| metricKey | color |
|-----------|-------|
| roe | #6366f1 |
| roa | #22c55e |
| debt_ratio | #f59e0b |
| operating_margin | #a78bfa |
| per | #34d399 |
| pbr | #f87171 |
| fcf | #fb923c |

---

## 3. 상태 관리

`FundamentalsCharts.tsx`에 `useState<string | null>(null)` 하나만 추가. 다른 상태 없음.

---

## 4. 데이터 없는 경우 처리

- `sparkData`가 모두 null이거나 1개 이하인 경우: 스파크라인 미표시, 최신값 카드만 표시
- DART 두 번째 호출 실패: 3년 데이터로 graceful fallback (차트는 3년치만 표시)
- PER/PBR: 최신 연도만 데이터 있음 → 스파크라인은 점 1개 (차트 렌더링은 되지만 트렌드 없음)

---

## 5. 변경되지 않는 것

- `FundamentalsPage.tsx` — 변경 없음
- `types/index.ts` — 변경 없음
- `yahoo.ts` 어댑터 — 변경 없음
- `api-client.ts`의 US 분기 — 변경 없음
- Cloudflare Worker — 변경 없음 (기존 `/dart/fs?corp_code=&year=` 엔드포인트 재사용)
