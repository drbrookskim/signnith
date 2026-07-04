# Fundamentals Area Charts & Sparkline Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 펀더멘털 탭의 BarChart를 AreaChart로 전환하고, 핵심지표를 스파크라인 그리드(클릭 시 인라인 확장)로 교체하며 KR 종목을 5년 데이터로 확장한다.

**Architecture:** `dart.ts`가 2개 DART 응답을 병합해 최대 5년 처리, `api-client.ts`가 KR 2회 병렬 호출로 두 번째 응답을 제공, `FundamentalsCharts.tsx`가 AreaChart + SparklineCard 그리드 + 인라인 확장 패널을 렌더링한다.

**Tech Stack:** TypeScript, Recharts (ComposedChart, AreaChart, Area), React useState

---

## File Map

| 작업 | 파일 | 변경 내용 |
|------|------|-----------|
| 수정 | `frontend/lib/adapters/dart.ts` | 5년 병합 로직 + 시그니처 변경 |
| 수정 | `frontend/lib/api-client.ts` | KR 분기에 2회 병렬 DART 호출 추가 |
| 수정 | `frontend/components/charts/FundamentalsCharts.tsx` | AreaChart + SparklineCard 전면 교체 |

---

## Task 1: dart.ts — 5년 데이터 병합

**Files:**
- Modify: `frontend/lib/adapters/dart.ts`

현재 `transformDartToFundamentals(dartData, yahooKeyStats, ticker, corpName)` 는 단일 DART 응답으로 3년만 처리한다.

DART API 응답 구조: 각 열(row)이 계정과목이며, 3개 금액 필드를 포함한다.
- `thstrm_amount` = 당기(N년)
- `frmtrm_amount` = 전기(N-1년)
- `bfefrmtrm_amount` = 전전기(N-2년)
- `bsns_year` = 당기 사업연도(N)

2회 호출 전략:
- 호출1(`year=N`): bsnsYear=N → thstrm=N, frmtrm=N-1, bfefrmtrm=N-2
- 호출2(`year=N-2`): bsnsYear=N-2 → thstrm=N-2, frmtrm=N-3, bfefrmtrm=N-4
- N-2는 호출1 bfefrmtrm 우선 사용

- [ ] **Step 1: `transformDartToFundamentals` 전체를 아래 코드로 교체**

`frontend/lib/adapters/dart.ts` 파일에서 `export function transformDartToFundamentals` 부터 파일 끝까지를 아래로 교체한다:

```typescript
export function transformDartToFundamentals(
  dartDataRecent: unknown,
  dartDataOld: unknown | null,
  yahooKeyStats: unknown,
  ticker: string,
  corpName?: string,
): FundamentalAnalysis {
  const market: Market = 'KR'
  const recentList: DartAccount[] = (dartDataRecent as { list?: DartAccount[] })?.list ?? []
  if (recentList.length === 0) throw new Error(`DART: 재무제표 데이터 없음 (${ticker})`)

  const oldList: DartAccount[] = (dartDataOld as { list?: DartAccount[] } | null)?.list ?? []

  const bsnsYear = parseInt(recentList[0]?.bsns_year ?? String(new Date().getFullYear() - 1))

  const REV_NAMES = ['매출액', '수익(매출액)', '영업수익', '매출']
  const OP_NAMES = ['영업이익', '영업이익(손실)']
  const NET_NAMES = [
    '당기순이익',
    '당기순이익(손실)',
    '지배기업의 소유주에게 귀속되는 당기순이익',
    '지배기업 소유주 귀속 당기순이익',
  ]
  const ASSET_NAMES = ['자산총계']
  const LIAB_NAMES = ['부채총계']
  const EQUITY_NAMES = ['자본총계', '자본 합계']
  const OCF_NAMES = ['영업활동현금흐름', '영업활동으로 인한 현금흐름', '영업활동 현금흐름']
  const CAPEX_NAMES = ['유형자산의 취득', '유형자산취득', '유형자산 취득']

  function rYahoo(v: unknown): number | null {
    if (v == null) return null
    if (typeof v === 'number') return isFinite(v) ? v : null
    if (typeof v === 'object' && 'raw' in v) return rYahoo((v as { raw: unknown }).raw)
    return null
  }
  const ks = yahooKeyStats as Record<string, unknown> | null
  const perLatest = rYahoo(ks?.trailingPE) ?? rYahoo(ks?.forwardPE)
  const yahooPbr = rYahoo(ks?.priceToBook)
  const yahooPrice = rYahoo(ks?.currentPrice) ?? rYahoo(ks?.regularMarketPrice)
  const yahooShares = rYahoo(ks?.sharesOutstanding)

  // 5개 연도 × (list, field) 매핑
  // N-2는 recentList의 bfefrmtrm 우선 (더 최신 감사 기준)
  type YearEntry = { year: number; list: DartAccount[]; field: typeof AMOUNT_FIELDS[number] }
  const yearEntries: YearEntry[] = [
    { year: bsnsYear - 4, list: oldList,    field: 'bfefrmtrm_amount' },
    { year: bsnsYear - 3, list: oldList,    field: 'frmtrm_amount'    },
    { year: bsnsYear - 2, list: recentList, field: 'bfefrmtrm_amount' },
    { year: bsnsYear - 1, list: recentList, field: 'frmtrm_amount'    },
    { year: bsnsYear,     list: recentList, field: 'thstrm_amount'    },
  ].filter(e => e.list.length > 0)

  const revPairs: [number, number][] = []
  const opPairs: [number, number][] = []
  const netPairs: [number, number][] = []

  const metrics_by_year: FundamentalMetrics[] = yearEntries.map(({ year: yr, list, field }) => {
    const rev    = findAmt(list, 'IS', REV_NAMES,    field)
    const opInc  = findAmt(list, 'IS', OP_NAMES,     field)
    const netInc = findAmt(list, 'IS', NET_NAMES,    field)
    const assets = findAmt(list, 'BS', ASSET_NAMES,  field)
    const liab   = findAmt(list, 'BS', LIAB_NAMES,   field)
    const equity = findAmt(list, 'BS', EQUITY_NAMES, field)
    const ocf    = findAmt(list, 'CF', OCF_NAMES,    field)
    const capex  = findAmt(list, 'CF', CAPEX_NAMES,  field)

    if (rev    != null) revPairs.push([yr, rev])
    if (opInc  != null) opPairs.push([yr, opInc])
    if (netInc != null) netPairs.push([yr, netInc])

    let pbr: number | null = null
    if (yr === bsnsYear) {
      pbr = yahooPbr
      if (pbr == null && equity && equity > 0 && yahooPrice != null && yahooShares != null) {
        pbr = (yahooPrice * yahooShares) / equity
      }
    }

    return {
      fiscal_year: yr,
      roe:              netInc != null && equity ? (netInc / equity) * 100 : null,
      roa:              netInc != null && assets ? (netInc / assets) * 100 : null,
      debt_ratio:       liab   != null && assets ? (liab   / assets) * 100 : null,
      operating_margin: opInc  != null && rev    ? (opInc  / rev)   * 100 : null,
      fcf:              ocf    != null ? (capex != null ? ocf + capex : ocf) : null,
      per:              yr === bsnsYear ? perLatest : null,
      pbr,
    }
  })

  return {
    ticker,
    name: corpName ?? null,
    market,
    metrics_by_year: metrics_by_year.filter(
      m => m.roe != null || m.roa != null || m.operating_margin != null,
    ),
    trends: {
      revenue:          makeTrend('revenue',          revPairs),
      operating_income: makeTrend('operating_income', opPairs),
      net_income:       makeTrend('net_income',       netPairs),
    },
  }
}
```

- [ ] **Step 2: TypeScript 체크**

```bash
cd /Users/nelcome/Codes/Claude_code_repository/equisense/frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: `dart.ts`에서 에러 없음. `api-client.ts`에서 `transformDartToFundamentals` 인자 수 불일치 에러 1개 — 다음 Task에서 수정 예정이므로 무시.

- [ ] **Step 3: 커밋**

```bash
git -C /Users/nelcome/Codes/Claude_code_repository/equisense add frontend/lib/adapters/dart.ts
git -C /Users/nelcome/Codes/Claude_code_repository/equisense commit -m "feat(dart): 5년 데이터 병합 처리 (2회 DART 응답 병합)"
```

---

## Task 2: api-client.ts — KR 2회 병렬 DART 호출

**Files:**
- Modify: `frontend/lib/api-client.ts`

- [ ] **Step 1: KR 분기 전체를 아래로 교체**

`api-client.ts`의 `getFundamentals` 내 KR 분기(`if (market === 'KR') { ... }`)를 아래로 교체한다:

```typescript
if (market === 'KR') {
  const [corpCode, corpName] = await Promise.all([
    getCorpCode(ticker),
    getCorpName(ticker),
  ])

  const year = new Date().getFullYear() - 1
  const [dartDataRecent, dartDataOld, yahooData] = await Promise.all([
    proxyFetch<unknown>(`/dart/fs?corp_code=${corpCode}&year=${year}`),
    proxyFetch<unknown>(`/dart/fs?corp_code=${corpCode}&year=${year - 2}`).catch(() => null),
    proxyFetch<unknown>(
      `/yahoo/summary?symbol=${ticker}&market=KR&modules=defaultKeyStatistics,financialData`,
    ).catch(() => null),
  ])

  const yahooResult = (
    yahooData as { quoteSummary?: { result?: Record<string, unknown>[] } } | null
  )?.quoteSummary?.result?.[0] ?? {}

  const keyStats = {
    ...((yahooResult.defaultKeyStatistics as Record<string, unknown>) ?? {}),
    ...((yahooResult.financialData     as Record<string, unknown>) ?? {}),
  }

  return transformDartToFundamentals(dartDataRecent, dartDataOld, keyStats, ticker, corpName)
}
```

- [ ] **Step 2: TypeScript 체크**

```bash
cd /Users/nelcome/Codes/Claude_code_repository/equisense/frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git -C /Users/nelcome/Codes/Claude_code_repository/equisense add frontend/lib/api-client.ts
git -C /Users/nelcome/Codes/Claude_code_repository/equisense commit -m "feat(api): KR DART 2회 병렬 호출로 5년 데이터 확보"
```

---

## Task 3: FundamentalsCharts.tsx — AreaChart + SparklineCard 전면 교체

**Files:**
- Modify: `frontend/components/charts/FundamentalsCharts.tsx`

- [ ] **Step 1: 파일 전체를 아래 내용으로 교체**

```typescript
'use client'

import { useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { FundamentalAnalysis } from '@/types'

// ── 포맷 헬퍼 ──────────────────────────────────

function formatLargeNumber(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1e12) return `${(value / 1e12).toFixed(1)}T`
  if (abs >= 1e9)  return `${(value / 1e9).toFixed(1)}B`
  if (abs >= 1e6)  return `${(value / 1e6).toFixed(1)}M`
  return value.toFixed(0)
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`
}

function formatRatio(value: number): string {
  return `${value.toFixed(1)}x`
}

type MetricFormat = 'percent' | 'ratio' | 'large'

function formatValue(value: number | null, format: MetricFormat): string {
  if (value == null) return '—'
  if (format === 'percent') return formatPercent(value)
  if (format === 'ratio')   return formatRatio(value)
  return formatLargeNumber(value)
}

function yAxisFormatter(format: MetricFormat): (v: unknown) => string {
  return (v) => {
    if (typeof v !== 'number') return ''
    if (format === 'percent') return formatPercent(v)
    if (format === 'ratio')   return formatRatio(v)
    return formatLargeNumber(v)
  }
}

// ── 지표 설정 ───────────────────────────────────

const METRIC_CONFIGS: Record<string, { label: string; format: MetricFormat; color: string }> = {
  roe:              { label: 'ROE',        format: 'percent', color: '#6366f1' },
  roa:              { label: 'ROA',        format: 'percent', color: '#22c55e' },
  debt_ratio:       { label: '부채비율',   format: 'percent', color: '#f59e0b' },
  operating_margin: { label: '영업이익률', format: 'percent', color: '#a78bfa' },
  per:              { label: 'PER',        format: 'ratio',   color: '#34d399' },
  pbr:              { label: 'PBR',        format: 'ratio',   color: '#f87171' },
  fcf:              { label: 'FCF',        format: 'large',   color: '#fb923c' },
}

const METRIC_KEYS = ['roe', 'roa', 'debt_ratio', 'operating_margin', 'per', 'pbr', 'fcf'] as const
type MetricKey = typeof METRIC_KEYS[number]

// ── SparklineCard ───────────────────────────────

function SparklineCard({
  metricKey,
  label,
  latestValue,
  format,
  sparkData,
  color,
  isExpanded,
  onToggle,
}: {
  metricKey: string
  label: string
  latestValue: number | null
  format: MetricFormat
  sparkData: { year: number; value: number | null }[]
  color: string
  isExpanded: boolean
  onToggle: () => void
}) {
  const hasEnoughData = sparkData.filter(d => d.value !== null).length >= 2

  return (
    <div
      onClick={onToggle}
      className={[
        'rounded-lg border p-3 cursor-pointer transition-colors select-none',
        isExpanded
          ? 'border-indigo-500 bg-indigo-950/10 dark:bg-indigo-950/20'
          : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600',
      ].join(' ')}
    >
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-lg font-semibold">{formatValue(latestValue, format)}</div>
      {hasEnoughData && (
        <ResponsiveContainer width="100%" height={52}>
          <AreaChart data={sparkData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`spark-grad-${metricKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={color} stopOpacity={0.4} />
                <stop offset="100%" stopColor={color} stopOpacity={0}   />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={1.5}
              fill={`url(#spark-grad-${metricKey})`}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

// ── 확장 패널 ───────────────────────────────────

function ExpandedPanel({
  metricKey,
  sparkData,
  onClose,
}: {
  metricKey: MetricKey
  sparkData: { year: number; value: number | null }[]
  onClose: () => void
}) {
  const cfg = METRIC_CONFIGS[metricKey]

  return (
    <div className="mt-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          {cfg.label} — 연도별 추이
        </h4>
        <button
          onClick={onClose}
          className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          ✕ 닫기
        </button>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={sparkData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
          <defs>
            <linearGradient id={`expanded-grad-${metricKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"   stopColor={cfg.color} stopOpacity={0.3} />
              <stop offset="95%"  stopColor={cfg.color} stopOpacity={0}   />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" strokeOpacity={0.3} />
          <XAxis
            dataKey="year"
            tick={{ fontSize: 12 }}
          />
          <YAxis
            tickFormatter={yAxisFormatter(cfg.format)}
            tick={{ fontSize: 11 }}
            width={cfg.format === 'large' ? 64 : 52}
            domain={['auto', 'auto']}
          />
          <Tooltip
            formatter={(v) => [
              typeof v === 'number' ? formatValue(v, cfg.format) : v,
              cfg.label,
            ]}
            labelFormatter={(label) => `${label}년`}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={cfg.color}
            strokeWidth={2}
            fill={`url(#expanded-grad-${metricKey})`}
            dot={{ fill: cfg.color, r: 3 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── 메인 컴포넌트 ───────────────────────────────

export default function FundamentalsCharts({ data }: { data: FundamentalAnalysis }) {
  const [expandedMetric, setExpandedMetric] = useState<MetricKey | null>(null)

  function toggleMetric(key: MetricKey) {
    setExpandedMetric(prev => (prev === key ? null : key))
  }

  // 손익 추이 데이터
  const incomeData = data.metrics_by_year.map(m => ({
    year: String(m.fiscal_year),
    revenue:          data.trends['revenue']?.values.find(([y]) => y === m.fiscal_year)?.[1]          ?? null,
    operating_income: data.trends['operating_income']?.values.find(([y]) => y === m.fiscal_year)?.[1] ?? null,
    net_income:       data.trends['net_income']?.values.find(([y]) => y === m.fiscal_year)?.[1]       ?? null,
  }))

  // 수익성 지표 데이터
  const marginData = data.metrics_by_year.map(m => ({
    year: String(m.fiscal_year),
    ROE:    m.roe,
    ROA:    m.roa,
    영업이익률: m.operating_margin,
  }))

  // 핵심지표 스파크라인 데이터 (metricKey → [{year, value}])
  const sparkDataByKey: Record<MetricKey, { year: number; value: number | null }[]> = {
    roe:              data.metrics_by_year.map(m => ({ year: m.fiscal_year, value: m.roe })),
    roa:              data.metrics_by_year.map(m => ({ year: m.fiscal_year, value: m.roa })),
    debt_ratio:       data.metrics_by_year.map(m => ({ year: m.fiscal_year, value: m.debt_ratio })),
    operating_margin: data.metrics_by_year.map(m => ({ year: m.fiscal_year, value: m.operating_margin })),
    per:              data.metrics_by_year.map(m => ({ year: m.fiscal_year, value: m.per })),
    pbr:              data.metrics_by_year.map(m => ({ year: m.fiscal_year, value: m.pbr })),
    fcf:              data.metrics_by_year.map(m => ({ year: m.fiscal_year, value: m.fcf })),
  }

  const latestMetrics = data.metrics_by_year.at(-1) ?? null

  return (
    <div className="space-y-10">

      {/* ① 손익 추이 — AreaChart */}
      <section>
        <h3 className="mb-4 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          손익 추이
        </h3>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={incomeData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
            <defs>
              <linearGradient id="income-grad-revenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0}    />
              </linearGradient>
              <linearGradient id="income-grad-op" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0}   />
              </linearGradient>
              <linearGradient id="income-grad-net" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}   />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" strokeOpacity={0.3} />
            <XAxis dataKey="year" tick={{ fontSize: 12 }} />
            <YAxis
              tickFormatter={(v: unknown) => typeof v === 'number' ? formatLargeNumber(v) : ''}
              tick={{ fontSize: 11 }}
              width={60}
              domain={['auto', 'auto']}
            />
            <Tooltip formatter={(v) => (typeof v === 'number' ? formatLargeNumber(v) : v)} />
            <Legend />
            <Area type="monotone" dataKey="revenue"          name="매출액"   stroke="#6366f1" strokeWidth={2} fill="url(#income-grad-revenue)" dot={false} connectNulls />
            <Area type="monotone" dataKey="operating_income" name="영업이익" stroke="#22c55e" strokeWidth={2} fill="url(#income-grad-op)"      dot={false} connectNulls />
            <Area type="monotone" dataKey="net_income"       name="순이익"   stroke="#f59e0b" strokeWidth={2} fill="url(#income-grad-net)"     dot={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </section>

      {/* ② 수익성 지표 — AreaChart */}
      <section>
        <h3 className="mb-4 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          수익성 지표 (%)
        </h3>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={marginData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
            <defs>
              <linearGradient id="margin-grad-roe" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0}    />
              </linearGradient>
              <linearGradient id="margin-grad-roa" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0}   />
              </linearGradient>
              <linearGradient id="margin-grad-op" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}   />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" strokeOpacity={0.3} />
            <XAxis dataKey="year" tick={{ fontSize: 12 }} />
            <YAxis
              tickFormatter={(v: unknown) => typeof v === 'number' ? formatPercent(v) : ''}
              tick={{ fontSize: 11 }}
              width={52}
              domain={['auto', 'auto']}
            />
            <Tooltip formatter={(v) => (typeof v === 'number' ? formatPercent(v) : v)} />
            <Legend />
            <Area type="monotone" dataKey="ROE"      name="ROE"      stroke="#6366f1" strokeWidth={2} fill="url(#margin-grad-roe)" dot={false} connectNulls />
            <Area type="monotone" dataKey="ROA"      name="ROA"      stroke="#22c55e" strokeWidth={2} fill="url(#margin-grad-roa)" dot={false} connectNulls />
            <Area type="monotone" dataKey="영업이익률" name="영업이익률" stroke="#f59e0b" strokeWidth={2} fill="url(#margin-grad-op)"  dot={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </section>

      {/* ③ 핵심지표 — SparklineCard 그리드 + 인라인 확장 패널 */}
      {latestMetrics && (
        <section>
          <h3 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            핵심지표
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {METRIC_KEYS.map(key => {
              const cfg = METRIC_CONFIGS[key]
              const latestVal = latestMetrics[key as keyof typeof latestMetrics] as number | null
              return (
                <SparklineCard
                  key={key}
                  metricKey={key}
                  label={cfg.label}
                  latestValue={latestVal}
                  format={cfg.format}
                  sparkData={sparkDataByKey[key]}
                  color={cfg.color}
                  isExpanded={expandedMetric === key}
                  onToggle={() => toggleMetric(key)}
                />
              )
            })}
          </div>
          {expandedMetric && (
            <ExpandedPanel
              metricKey={expandedMetric}
              sparkData={sparkDataByKey[expandedMetric]}
              onClose={() => setExpandedMetric(null)}
            />
          )}
        </section>
      )}

    </div>
  )
}
```

- [ ] **Step 2: TypeScript 체크**

```bash
cd /Users/nelcome/Codes/Claude_code_repository/equisense/frontend && npx tsc --noEmit 2>&1 | head -40
```

Expected: 에러 없음.

- [ ] **Step 3: 빌드 확인**

```bash
cd /Users/nelcome/Codes/Claude_code_repository/equisense/frontend && npm run build 2>&1 | tail -20
```

Expected: `✓ Compiled successfully` 또는 `Export successful`.

- [ ] **Step 4: 커밋**

```bash
git -C /Users/nelcome/Codes/Claude_code_repository/equisense add frontend/components/charts/FundamentalsCharts.tsx
git -C /Users/nelcome/Codes/Claude_code_repository/equisense commit -m "feat(fundamentals): AreaChart 전환 + SparklineCard 그리드 + 인라인 확장 패널"
```

---

## Task 4: 배포

**Files:**
- 없음 (빌드 결과물 배포만)

- [ ] **Step 1: eq-deploy worktree 존재 확인 및 없으면 재생성**

```bash
git -C /Users/nelcome/Codes/Claude_code_repository/equisense worktree list
```

없으면:
```bash
git -C /Users/nelcome/Codes/Claude_code_repository/equisense worktree add --detach /private/tmp/eq-deploy equisense-origin/main
```

- [ ] **Step 2: 변경된 소스 파일 복사**

```bash
cp /Users/nelcome/Codes/Claude_code_repository/equisense/frontend/lib/adapters/dart.ts \
   /private/tmp/eq-deploy/frontend/lib/adapters/dart.ts

cp /Users/nelcome/Codes/Claude_code_repository/equisense/frontend/lib/api-client.ts \
   /private/tmp/eq-deploy/frontend/lib/api-client.ts

cp /Users/nelcome/Codes/Claude_code_repository/equisense/frontend/components/charts/FundamentalsCharts.tsx \
   /private/tmp/eq-deploy/frontend/components/charts/FundamentalsCharts.tsx
```

- [ ] **Step 3: 커밋 & 푸시**

```bash
cd /private/tmp/eq-deploy && \
  git add frontend/lib/adapters/dart.ts \
          frontend/lib/api-client.ts \
          frontend/components/charts/FundamentalsCharts.tsx && \
  git commit -m "feat(fundamentals): AreaChart + SparklineCard 그리드 배포" && \
  git push equisense-origin HEAD:main
```

---

## Self-Review

### 스펙 커버리지

| 요구사항 | Task |
|---------|------|
| KR 5년 데이터 확장 | Task 1 (dart.ts), Task 2 (api-client.ts) |
| US 4년 유지 | 변경 없음 ✓ |
| 손익 추이 BarChart → AreaChart | Task 3 `ComposedChart + Area` 3개 |
| 수익성 지표 BarChart → AreaChart | Task 3 `ComposedChart + Area` 3개 |
| 핵심지표 SparklineCard 그리드 (7개) | Task 3 `METRIC_KEYS.map(SparklineCard)` |
| 클릭 시 인라인 확장 패널 | Task 3 `expandedMetric` state + `ExpandedPanel` |
| 확장 패널 X 닫기 | Task 3 `ExpandedPanel.onClose` |
| 데이터 없는 경우 스파크라인 미표시 | Task 3 `hasEnoughData` 가드 |

### 타입 일관성

- `MetricKey` = `typeof METRIC_KEYS[number]` → `sparkDataByKey[expandedMetric]` 인덱스 타입 일치 ✓
- `METRIC_CONFIGS[metricKey]` 는 `MetricKey` string으로 인덱싱 — `METRIC_KEYS`에 있는 값만 사용하므로 런타임 안전 ✓
- `latestMetrics[key as keyof typeof latestMetrics]` — `FundamentalMetrics` 타입에 7개 필드 모두 존재 ✓
- `connectNulls` (boolean prop, Recharts) — 속성명 확인: Recharts `Area`의 `connectNulls` prop은 `boolean`이며 별칭 없음 ✓

### 플레이스홀더 스캔

없음 ✓
