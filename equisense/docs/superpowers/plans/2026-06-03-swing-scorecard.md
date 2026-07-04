# 스윙 적합도 스코어카드 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 펀더멘털 탭에 swing-trading-framework Step 1 체력 필터 기반 스윙 적합도 스코어카드 드로어를 추가한다.

**Architecture:** 기존 Yahoo Finance / DART 어댑터에 신규 필드(ICR, PEG, 52주 고저, 현재가)를 파싱 추가하고, `FundamentalsCharts.tsx`에 `computeSwingScore` 순수 함수와 `SwingScoreDrawer` 컴포넌트를 인라인으로 구현한다. Cloudflare Worker 및 기타 탭은 변경하지 않는다.

**Tech Stack:** TypeScript, Next.js 14 App Router (static export), Tailwind CSS, Yahoo Finance quoteSummary API, DART OpenAPI

---

## 파일 변경 맵

| 파일 | 역할 |
|------|------|
| `frontend/types/index.ts` | `FundamentalMetrics`에 5개 신규 필드 추가 |
| `frontend/lib/api-client.ts` | `SUMMARY_MODULES` + KR 모듈 목록에 `summaryDetail` 추가 |
| `frontend/lib/adapters/yahoo.ts` | ICR·PEG·52주 고저·현재가 파싱 추가 |
| `frontend/lib/adapters/dart.ts` | KR 이자비용 파싱 → ICR 계산 추가 |
| `frontend/components/charts/FundamentalsCharts.tsx` | `SwingScore` 타입·`computeSwingScore`·`SwingScoreDrawer` 추가 |

---

## Task 1: FundamentalMetrics 타입 확장

**Files:**
- Modify: `frontend/types/index.ts:9-18`

- [ ] **Step 1: `FundamentalMetrics` 인터페이스에 5개 필드 추가**

`frontend/types/index.ts`의 `FundamentalMetrics` 인터페이스를 다음으로 교체:

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
  icr: number | null           // 이자보상배율 = 영업이익 / 이자비용
  peg_ratio: number | null     // PEG = PER / EPS성장률 (US만, KR null)
  week52_high: number | null   // 52주 고가 (최신 연도만, 나머지 null)
  week52_low: number | null    // 52주 저가 (최신 연도만, 나머지 null)
  current_price: number | null // 현재가 (최신 연도만, 나머지 null)
}
```

- [ ] **Step 2: TypeScript 빌드로 타입 오류 확인**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -40
```

기존 코드가 신규 필드를 반환하지 않으므로 `dart.ts`·`yahoo.ts`에서 타입 오류 발생 예상 — 이후 태스크에서 해결.

- [ ] **Step 3: 커밋**

```bash
git add frontend/types/index.ts
git commit -m "feat(types): FundamentalMetrics에 ICR·PEG·52주 필드 추가"
```

---

## Task 2: api-client.ts — summaryDetail 모듈 추가

**Files:**
- Modify: `frontend/lib/api-client.ts:27-34` (SUMMARY_MODULES), `:79` (KR modules)

- [ ] **Step 1: US `SUMMARY_MODULES`에 `summaryDetail` 추가**

```typescript
const SUMMARY_MODULES = [
  'incomeStatementHistory',
  'balanceSheetHistory',
  'cashflowStatementHistory',
  'defaultKeyStatistics',
  'financialData',
  'quoteType',
  'summaryDetail',
].join(',')
```

- [ ] **Step 2: KR Yahoo 호출 모듈에도 `summaryDetail` 추가**

`frontend/lib/api-client.ts:79`의 KR Yahoo 호출 URL을 수정:

```typescript
proxyFetch<unknown>(
  `/yahoo/summary?symbol=${ticker}&market=KR&modules=defaultKeyStatistics,financialData,summaryDetail`,
).catch(() => null),
```

- [ ] **Step 3: KR `yahooResult` 에서 `summaryDetail` 병합**

`api-client.ts:87-90`의 `keyStats` 객체에 `summaryDetail` 추가:

```typescript
const keyStats = {
  ...((yahooResult.defaultKeyStatistics as Record<string, unknown>) ?? {}),
  ...((yahooResult.financialData        as Record<string, unknown>) ?? {}),
  ...((yahooResult.summaryDetail        as Record<string, unknown>) ?? {}),
}
```

- [ ] **Step 4: 커밋**

```bash
git add frontend/lib/api-client.ts
git commit -m "feat(api): summaryDetail 모듈 추가 (52주 고저 데이터)"
```

---

## Task 3: yahoo.ts — 신규 필드 파싱

**Files:**
- Modify: `frontend/lib/adapters/yahoo.ts`

- [ ] **Step 1: income statement 루프에 이자비용 파싱 추가**

`yahoo.ts` income statement 루프(현재 76~85줄)에서 각 연도 `YearEntry`에 `_interestExpense` 저장:

```typescript
type YearEntry = Partial<FundamentalMetrics> & {
  _revenue?: number | null
  _opIncome?: number | null
  _netIncome?: number | null
  _interestExpense?: number | null   // 신규
}

// Income Statement 루프 내부에 추가
e._interestExpense = r(s.interestExpense)
```

- [ ] **Step 2: ICR 계산 — operating_margin 계산 직후에 추가**

`yahoo.ts`의 `for (const yr of sortedYears)` 루프(약 129줄)에서 `e.operating_margin` 계산 바로 다음:

```typescript
// ICR = 영업이익 / |이자비용|
if (e._opIncome != null && e._interestExpense != null && e._interestExpense !== 0) {
  e.icr = e._opIncome / Math.abs(e._interestExpense)
} else {
  e.icr = null
}
```

- [ ] **Step 3: 최신 연도에 PEG·52주 고저·현재가 추가**

같은 루프의 `if (yr === latestYear)` 블록 안에 추가:

```typescript
// PEG Ratio (Yahoo Finance 직접 제공)
e.peg_ratio = r(keyStats.pegRatio)

// 52주 고저 + 현재가 (summaryDetail 모듈)
const summary = result.summaryDetail ?? {}
e.week52_high    = r(summary.fiftyTwoWeekHigh)
e.week52_low     = r(summary.fiftyTwoWeekLow)
e.current_price  = r(fd.currentPrice) ?? r(fd.regularMarketPrice)
```

- [ ] **Step 4: `metrics_by_year` 반환 객체에 신규 필드 포함**

`yahoo.ts`의 `metrics_by_year` 매핑(약 153줄)을 다음으로 교체:

```typescript
const metrics_by_year: FundamentalMetrics[] = sortedYears.map((yr) => {
  const e = map.get(yr)!
  return {
    fiscal_year:      yr,
    roe:              e.roe ?? null,
    roa:              e.roa ?? null,
    debt_ratio:       e.debt_ratio ?? null,
    operating_margin: e.operating_margin ?? null,
    fcf:              e.fcf ?? null,
    per:              e.per ?? null,
    pbr:              e.pbr ?? null,
    icr:              e.icr ?? null,
    peg_ratio:        e.peg_ratio ?? null,
    week52_high:      e.week52_high ?? null,
    week52_low:       e.week52_low ?? null,
    current_price:    e.current_price ?? null,
  }
})
```

- [ ] **Step 5: 빌드 확인**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -i "yahoo\|types"
```

Expected: yahoo.ts 관련 오류 없음.

- [ ] **Step 6: 커밋**

```bash
git add frontend/lib/adapters/yahoo.ts
git commit -m "feat(yahoo): ICR·PEG·52주 고저·현재가 파싱 추가"
```

---

## Task 4: dart.ts — KR 이자비용 파싱 및 ICR 계산

**Files:**
- Modify: `frontend/lib/adapters/dart.ts`

- [ ] **Step 1: 이자비용 계정과목명 상수 추가**

`dart.ts`의 기존 `CAPEX_NAMES` 상수 바로 다음에 추가:

```typescript
const INT_EXP_NAMES = ['이자비용', '금융원가', '이자비용 등']
```

- [ ] **Step 2: `metrics_by_year` 매핑에서 ICR 계산 추가**

`dart.ts`의 `metrics_by_year` 매핑(약 128줄) 내부에서 `ocf` 계산 바로 다음:

```typescript
const intExp = findAmt(list, 'IS', INT_EXP_NAMES, field)

// ICR = 영업이익 / |이자비용|
// DART 이자비용은 양수로 기재되는 경우와 음수(비용 방향)로 기재되는 경우가 혼재
const icrVal =
  opInc != null && intExp != null && intExp !== 0
    ? opInc / Math.abs(intExp)
    : null
```

- [ ] **Step 3: return 객체에 신규 필드 포함**

`dart.ts`의 `metrics_by_year` 매핑 내 return 객체를 다음으로 교체:

```typescript
return {
  fiscal_year:      yr,
  roe:              netInc != null && equity ? (netInc / equity) * 100 : null,
  roa:              netInc != null && assets ? (netInc / assets) * 100 : null,
  debt_ratio:       liab   != null && assets ? (liab   / assets) * 100 : null,
  operating_margin: opInc  != null && rev    ? (opInc  / rev)   * 100 : null,
  fcf:              ocf    != null ? (capex != null ? ocf + capex : ocf) : null,
  per:              yr === bsnsYear ? perLatest : null,
  pbr,
  icr:              icrVal,
  peg_ratio:        null,   // KR: Yahoo Finance 미제공
  week52_high:      yr === bsnsYear ? (rYahoo(ks?.fiftyTwoWeekHigh) ?? null) : null,
  week52_low:       yr === bsnsYear ? (rYahoo(ks?.fiftyTwoWeekLow)  ?? null) : null,
  current_price:    yr === bsnsYear ? (yahooPrice ?? null) : null,
}
```

- [ ] **Step 4: 빌드 확인**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -i "dart\|types"
```

Expected: dart.ts 관련 오류 없음.

- [ ] **Step 5: 커밋**

```bash
git add frontend/lib/adapters/dart.ts
git commit -m "feat(dart): KR 이자비용 파싱 및 ICR 계산 추가"
```

---

## Task 5: FundamentalsCharts.tsx — 스코어 로직 및 드로어 컴포넌트

**Files:**
- Modify: `frontend/components/charts/FundamentalsCharts.tsx`

- [ ] **Step 1: SwingScore 타입 추가**

파일 상단 `// ── 타입 ───` 블록 바로 다음에 추가:

```typescript
// ── 스윙 스코어 타입 ──────────────────────────
interface SwingScoreItem {
  key: string
  label: string
  status: 'pass' | 'warn' | 'fail' | 'na'
  value: string
  detail: string
  score: number
  maxScore: number
}

interface SwingScore {
  total: number
  grade: 'strong' | 'good' | 'caution' | 'weak'
  items: SwingScoreItem[]
  comment: string
}
```

- [ ] **Step 2: computeSwingScore 순수 함수 추가**

`SwingScore` 타입 바로 다음에 추가:

```typescript
function computeSwingScore(
  metrics: FundamentalMetrics,
  quarterlyInsights: QuarterlyInsightMap | null,
): SwingScore {
  const items: SwingScoreItem[] = []

  // 1. 부채비율 (debt_ratio: %, 낮을수록 좋음)
  const dr = metrics.debt_ratio
  if (dr != null) {
    const s = dr <= 200 ? 'pass' : dr <= 300 ? 'warn' : 'fail'
    items.push({
      key: 'debt_ratio', label: '부채비율',
      status: s,
      value: `${dr.toFixed(1)}%`,
      detail: s === 'pass' ? '기준 ≤ 200% 충족' : s === 'warn' ? '200% 초과 주의' : '300% 초과 부적합',
      score: s === 'pass' ? 25 : s === 'warn' ? 12 : 0,
      maxScore: 25,
    })
  }

  // 2. 이자보상배율 (icr: 배, 높을수록 좋음)
  const icr = metrics.icr
  if (icr != null) {
    const s = icr >= 3 ? 'pass' : icr >= 1.5 ? 'warn' : 'fail'
    items.push({
      key: 'icr', label: '이자보상배율',
      status: s,
      value: `${icr.toFixed(1)}x`,
      detail: s === 'pass' ? '기준 ≥ 3배 충족' : s === 'warn' ? '1.5x~3x 주의' : '1.5배 미만 위험',
      score: s === 'pass' ? 15 : s === 'warn' ? 7 : 0,
      maxScore: 15,
    })
  }

  // 3. FCF (양수 = 좋음)
  const fcf = metrics.fcf
  if (fcf != null) {
    const s = fcf > 0 ? 'pass' : 'fail'
    items.push({
      key: 'fcf', label: 'FCF',
      status: s,
      value: formatLargeNumber(fcf),
      detail: s === 'pass' ? '잉여현금흐름 양호' : '잉여현금흐름 마이너스',
      score: s === 'pass' ? 10 : 0,
      maxScore: 10,
    })
  }

  // 4. 이익 모멘텀 (quarterlyInsights 재활용)
  const opInsight = quarterlyInsights?.['operating_margin']
    ?? quarterlyInsights?.['margin']
  if (opInsight && !opInsight.insufficient) {
    const s = opInsight.direction === 'up' ? 'pass'
      : opInsight.direction === 'mixed' ? 'warn' : 'fail'
    items.push({
      key: 'momentum', label: '이익 모멘텀',
      status: s,
      value: opInsight.momentum_label,
      detail: opInsight.trend_line,
      score: s === 'pass' ? 25 : s === 'warn' ? 12 : 0,
      maxScore: 25,
    })
  } else {
    // quarterly 없으면 연간 operating_margin 방향으로 대체
    const om = metrics.operating_margin
    if (om != null) {
      items.push({
        key: 'momentum', label: '이익 모멘텀',
        status: om > 0 ? 'pass' : 'fail',
        value: `영업이익률 ${om.toFixed(1)}%`,
        detail: '분기 데이터 없음 — 연간 기준',
        score: om > 0 ? 12 : 0,
        maxScore: 25,
      })
    }
  }

  // 5. PEG Ratio (낮을수록 저평가, US만)
  const peg = metrics.peg_ratio
  if (peg != null) {
    const s = peg < 1.0 ? 'pass' : peg < 2.0 ? 'warn' : 'fail'
    items.push({
      key: 'peg', label: 'PEG Ratio',
      status: s,
      value: `${peg.toFixed(1)}x`,
      detail: s === 'pass' ? '기준 < 1.0 저평가' : s === 'warn' ? '1.0~2.0 적정' : '2.0 이상 고평가',
      score: s === 'pass' ? 15 : s === 'warn' ? 7 : 0,
      maxScore: 15,
    })
  }

  // 6. 52주 위치 (고점 대비 -25% 이내 = 모멘텀 구간)
  const high52 = metrics.week52_high
  const cur    = metrics.current_price
  if (high52 != null && cur != null && high52 > 0) {
    const distPct = (1 - cur / high52) * 100
    const s = distPct <= 25 ? 'pass' : distPct <= 40 ? 'warn' : 'fail'
    items.push({
      key: 'position52', label: '52주 위치',
      status: s,
      value: `고점 대비 -${distPct.toFixed(1)}%`,
      detail: s === 'pass' ? '고점 근처 (모멘텀 구간)' : s === 'warn' ? '재집결 구간' : '고점 대비 과도한 조정',
      score: s === 'pass' ? 10 : s === 'warn' ? 5 : 0,
      maxScore: 10,
    })
  }

  // 점수 환산 (데이터 없는 항목 배점 제외)
  const totalMax = items.reduce((acc, i) => acc + i.maxScore, 0)
  const totalScore = items.reduce((acc, i) => acc + i.score, 0)
  const total = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0

  const grade: SwingScore['grade'] =
    total >= 80 ? 'strong' : total >= 60 ? 'good' : total >= 40 ? 'caution' : 'weak'

  // 종합 코멘트
  const healthPass  = items.find(i => i.key === 'debt_ratio')?.status === 'pass'
                   && (items.find(i => i.key === 'fcf')?.status ?? 'pass') !== 'fail'
  const momentumPass = items.find(i => i.key === 'momentum')?.status === 'pass'
  const positionPass = items.find(i => i.key === 'position52')?.status === 'pass'
  const healthFail  = items.find(i => i.key === 'debt_ratio')?.status === 'fail'
  const momentumFail = items.find(i => i.key === 'momentum')?.status === 'fail'

  let comment: string
  if (healthFail) {
    comment = '재무 체력 기준 미달. 스윙 트레이딩 진입 부적합.'
  } else if (momentumFail) {
    comment = '이익 모멘텀 정체·하락. 촉발 이벤트 발생 시까지 관망 권장.'
  } else if (healthPass && momentumPass && positionPass) {
    comment = '재무·모멘텀·기술적 조건 모두 양호. 진입 검토 가능.'
  } else if (healthPass && momentumPass && !positionPass) {
    comment = '재무 체력 우수, 이익 모멘텀 양호 — 고점 대비 조정 중. 50MA 회복 후 진입 재검토 권장.'
  } else {
    comment = '일부 지표 주의 필요. 세부 항목을 확인하세요.'
  }

  return { total, grade, items, comment }
}
```

- [ ] **Step 3: SwingScoreDrawer 컴포넌트 추가**

`ExpandedPanel` 컴포넌트 바로 위에 추가:

```typescript
// ── SwingScoreDrawer ─────────────────────────

const SCORE_STATUS_CLS: Record<string, string> = {
  pass: 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/20',
  warn: 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/20',
  fail: 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950/20',
  na:   'text-zinc-400 bg-zinc-100 dark:text-zinc-500 dark:bg-zinc-800/40',
}

const STATUS_ICON: Record<string, string> = {
  pass: '🟢', warn: '🟡', fail: '🔴', na: '⚪',
}

const GRADE_BAR_COLOR: Record<string, string> = {
  strong:  'bg-emerald-500',
  good:    'bg-indigo-500',
  caution: 'bg-amber-500',
  weak:    'bg-red-500',
}

function SwingScoreDrawer({
  metrics,
  quarterlyInsights,
  quarterlyLoading,
  market,
}: {
  metrics: FundamentalMetrics | null
  quarterlyInsights: QuarterlyInsightMap | null
  quarterlyLoading: boolean
  market: Market
}) {
  const [open, setOpen] = useState(false)

  if (!metrics) return null

  const score = quarterlyLoading
    ? null
    : computeSwingScore(metrics, quarterlyInsights)

  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
        스윙 적합도
      </h3>

      {/* 드로어 헤더 */}
      <div
        onClick={() => setOpen(o => !o)}
        className="cursor-pointer rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-indigo-400 dark:hover:border-indigo-600 transition-colors select-none"
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">📊 스윙 적합도</span>

          {/* 점수 바 */}
          {score ? (
            <div className="flex flex-1 items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${GRADE_BAR_COLOR[score.grade]}`}
                  style={{ width: `${score.total}%` }}
                />
              </div>
              <span className={`text-sm font-bold ${
                score.grade === 'strong' ? 'text-emerald-600 dark:text-emerald-400' :
                score.grade === 'good'   ? 'text-indigo-600 dark:text-indigo-400' :
                score.grade === 'caution'? 'text-amber-600 dark:text-amber-400' :
                'text-red-600 dark:text-red-400'
              }`}>
                {score.total}점
              </span>
            </div>
          ) : (
            <div className="flex-1 animate-pulse h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700" />
          )}

          <span className="text-xs text-zinc-400 dark:text-zinc-500">{open ? '▲' : '▼'}</span>
        </div>

        {/* 드로어 본문 */}
        {open && score && (
          <div className="border-t border-zinc-200 dark:border-zinc-800 p-3 space-y-3">
            {/* 4항목 그리드 */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {score.items.map(item => (
                <div
                  key={item.key}
                  className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3"
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span>{STATUS_ICON[item.status]}</span>
                    <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                      {item.label}
                    </span>
                  </div>
                  <div className={`inline-block rounded px-2 py-0.5 text-xs font-bold mb-1 ${SCORE_STATUS_CLS[item.status]}`}>
                    {item.value}
                  </div>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 leading-snug">{item.detail}</p>
                </div>
              ))}
              {/* 데이터 없는 항목 안내 */}
              {market === 'KR' && !score.items.find(i => i.key === 'peg') && (
                <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span>⚪</span>
                    <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">PEG Ratio</span>
                  </div>
                  <div className="inline-block rounded px-2 py-0.5 text-xs font-bold mb-1 text-zinc-400 bg-zinc-100 dark:text-zinc-500 dark:bg-zinc-800/40">
                    데이터 없음
                  </div>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 leading-snug">KR 종목 미제공</p>
                </div>
              )}
            </div>

            {/* 종합 코멘트 */}
            <p className="text-xs text-zinc-500 dark:text-zinc-400 border-t border-zinc-200 dark:border-zinc-800 pt-2 leading-relaxed">
              💡 {score.comment}
            </p>
          </div>
        )}

        {/* 로딩 상태 */}
        {open && !score && (
          <div className="border-t border-zinc-200 dark:border-zinc-800 p-3 animate-pulse space-y-2">
            <div className="h-16 rounded bg-zinc-100 dark:bg-zinc-800" />
          </div>
        )}
      </div>
    </section>
  )
}
```

- [ ] **Step 4: FundamentalsCharts 메인 컴포넌트에 SwingScoreDrawer 추가**

`FundamentalsCharts` 컴포넌트 props에 `market` 추가 및 반환 JSX 끝에 드로어 삽입.

`FundamentalsCharts.tsx:345-352`의 props 타입을 다음으로 교체:

```typescript
export default function FundamentalsCharts({
  data,
  quarterlyInsights,
  quarterlyLoading,
}: {
  data: FundamentalAnalysis
  quarterlyInsights: QuarterlyInsightMap | null
  quarterlyLoading: boolean
}) {
```

반환 JSX의 `</div>` 닫기 태그 바로 앞 (핵심지표 `</section>` 다음)에 추가:

```typescript
      {/* 스윙 적합도 드로어 */}
      <SwingScoreDrawer
        metrics={latestMetrics}
        quarterlyInsights={quarterlyInsights}
        quarterlyLoading={quarterlyLoading}
        market={data.market}
      />
```

- [ ] **Step 5: 빌드 전체 확인**

```bash
cd frontend && npx tsc --noEmit 2>&1
```

Expected: 오류 0건

- [ ] **Step 6: 커밋**

```bash
git add frontend/components/charts/FundamentalsCharts.tsx
git commit -m "feat(fundamentals): 스윙 적합도 스코어카드 드로어 추가"
```

---

## Task 6: 배포 및 검증

**Files:**
- 없음 (배포 스크립트 실행)

- [ ] **Step 1: Next.js 정적 빌드**

```bash
cd frontend && npm run build 2>&1 | tail -20
```

Expected: `Export successful` 메시지, 오류 없음.

- [ ] **Step 2: eq-deploy worktree 존재 확인 및 필요 시 재생성**

```bash
git worktree list | grep eq-deploy || (git worktree prune && git worktree add --detach /private/tmp/eq-deploy equisense-origin/main)
```

- [ ] **Step 3: 변경 파일 eq-deploy로 복사**

```bash
cp frontend/types/index.ts             /private/tmp/eq-deploy/frontend/types/index.ts
cp frontend/lib/api-client.ts          /private/tmp/eq-deploy/frontend/lib/api-client.ts
cp frontend/lib/adapters/yahoo.ts      /private/tmp/eq-deploy/frontend/lib/adapters/yahoo.ts
cp frontend/lib/adapters/dart.ts       /private/tmp/eq-deploy/frontend/lib/adapters/dart.ts
cp frontend/components/charts/FundamentalsCharts.tsx \
   /private/tmp/eq-deploy/frontend/components/charts/FundamentalsCharts.tsx
```

- [ ] **Step 4: eq-deploy에서 커밋 후 push**

```bash
cd /private/tmp/eq-deploy && \
git add frontend/types/index.ts \
        frontend/lib/api-client.ts \
        frontend/lib/adapters/yahoo.ts \
        frontend/lib/adapters/dart.ts \
        frontend/components/charts/FundamentalsCharts.tsx && \
git commit -m "feat(fundamentals): 스윙 적합도 스코어카드 드로어 추가" && \
git push equisense-origin HEAD:main
```

- [ ] **Step 5: GitHub Actions 빌드 확인**

```bash
gh run list --repo drbrookskim/equisense --limit 3
```

"Deploy to GitHub Pages" 워크플로우 status: `completed` / `success` 확인.

- [ ] **Step 6: 라이브 사이트에서 수용 기준 검증**

`https://drbrookskim.github.io/equisense/` 접속 후:
- [ ] 한미반도체(042700, KR) 검색 → 스윙 적합도 섹션 표시 확인
- [ ] 드로어 클릭 → 4개 항목 카드 펼침 확인
- [ ] 부채비율·ICR·FCF PASS/WARN/FAIL 표시 확인
- [ ] KR 종목에서 PEG "데이터 없음" 표시 확인
- [ ] US 종목(AAPL) 검색 → PEG 값 표시 확인
- [ ] 다크모드 전환 시 색상 정상 확인
- [ ] 기존 SparklineCard 클릭 동작 정상 확인

---

## 자체 검토 결과

**스펙 커버리지:**
- [x] `FundamentalMetrics` 5개 필드 추가 → Task 1
- [x] `summaryDetail` 모듈 추가 → Task 2
- [x] Yahoo 파싱 → Task 3
- [x] DART KR 이자비용 파싱 → Task 4
- [x] `computeSwingScore` + `SwingScoreDrawer` → Task 5
- [x] 라이트/다크 색상 매핑 → Task 5 Step 3 (`SCORE_STATUS_CLS`)
- [x] 데이터 없는 항목 배점 제외 → Task 5 Step 2 (`computeSwingScore`)
- [x] KR PEG null 표시 → Task 5 Step 3 (PEG 없음 안내 카드)
- [x] 수용 기준 8개 → Task 6 Step 6

**타입 일관성:**
- `SwingScore`, `SwingScoreItem` → Task 5 Step 1 정의, Task 5 Step 2·3에서 사용 ✅
- `FundamentalMetrics.icr` → Task 1 정의, Task 3·4에서 반환, Task 5 Step 2에서 읽기 ✅
- `SwingScoreDrawer` props `market: Market` → `data.market` 전달 ✅
