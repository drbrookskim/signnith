# Technical Indicators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기술적 분석 탭에 MA/BB/RSI/MACD 인디케이터 + 매수/매도 시그널을 프론트엔드 전용 계산으로 추가한다.

**Architecture:** `technicalIndicators.ts` 어댑터가 raw OHLCV 배열을 받아 모든 지표를 계산하고, `TechnicalCharts.tsx`가 토글 상태에 따라 Recharts `ComposedChart`에 오버레이/서브차트를 렌더링한다. API 호출 없음 — 기존 `data_points`에서 계산 전부 처리.

**Tech Stack:** TypeScript, Recharts (ComposedChart / LineChart), React useState

---

## File Map

| 작업 | 파일 | 역할 |
|------|------|------|
| 생성 | `frontend/lib/adapters/technicalIndicators.ts` | 순수 계산 함수 (MA, EMA, BB, RSI, MACD, 시그널) |
| 수정 | `frontend/types/index.ts` | 인디케이터 타입 추가 |
| 수정 | `frontend/components/charts/TechnicalCharts.tsx` | 토글 칩 + 오버레이 차트 + 서브차트 + 시그널 요약 |

---

## Task 1: 인디케이터 계산 함수 작성

**Files:**
- Create: `frontend/lib/adapters/technicalIndicators.ts`

- [ ] **Step 1: 파일 생성**

```typescript
import type { TechnicalDataPoint } from '@/types'

// ── 기초 계산 ──────────────────────────────────

/** 단순 이동평균 (기간이 부족한 앞부분은 null 반환) */
export function calcSMA(closes: (number | null)[], period: number): (number | null)[] {
  return closes.map((_, i) => {
    if (i < period - 1) return null
    const slice = closes.slice(i - period + 1, i + 1)
    if (slice.some(v => v === null)) return null
    return (slice as number[]).reduce((a, b) => a + b, 0) / period
  })
}

/** 지수 이동평균 (기간이 부족한 앞부분은 null 반환) */
export function calcEMA(closes: (number | null)[], period: number): (number | null)[] {
  const k = 2 / (period + 1)
  const result: (number | null)[] = new Array(closes.length).fill(null)
  let started = false
  let prev = 0

  for (let i = 0; i < closes.length; i++) {
    const v = closes[i]
    if (v === null) continue
    if (!started) {
      // 첫 유효값부터 시작: period개가 모일 때까지 SMA로 시드
      const seed = calcSMA(closes, period)[i]
      if (seed === null) continue
      prev = seed
      result[i] = prev
      started = true
    } else {
      prev = v * k + prev * (1 - k)
      result[i] = prev
    }
  }
  return result
}

/** 볼린저 밴드 (MA20 ± 2σ) */
export function calcBollingerBands(
  closes: (number | null)[],
  period = 20,
  multiplier = 2,
): { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] } {
  const middle = calcSMA(closes, period)
  const upper: (number | null)[] = []
  const lower: (number | null)[] = []

  for (let i = 0; i < closes.length; i++) {
    const ma = middle[i]
    if (ma === null) {
      upper.push(null)
      lower.push(null)
      continue
    }
    const slice = closes.slice(i - period + 1, i + 1).filter(v => v !== null) as number[]
    const variance = slice.reduce((s, v) => s + (v - ma) ** 2, 0) / period
    const std = Math.sqrt(variance)
    upper.push(ma + multiplier * std)
    lower.push(ma - multiplier * std)
  }
  return { upper, middle, lower }
}

/** RSI (14일 기준) */
export function calcRSI(closes: (number | null)[], period = 14): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null)
  if (closes.length < period + 1) return result

  const gains: number[] = []
  const losses: number[] = []

  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1]
    const cur = closes[i]
    if (prev === null || cur === null) {
      gains.push(0)
      losses.push(0)
    } else {
      const diff = cur - prev
      gains.push(diff > 0 ? diff : 0)
      losses.push(diff < 0 ? -diff : 0)
    }
  }

  // 첫 번째 평균 (단순평균으로 시드)
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period

  for (let i = period; i < closes.length; i++) {
    if (avgLoss === 0) {
      result[i] = 100
    } else {
      const rs = avgGain / avgLoss
      result[i] = 100 - 100 / (1 + rs)
    }
    if (i < closes.length - 1) {
      avgGain = (avgGain * (period - 1) + gains[i]) / period
      avgLoss = (avgLoss * (period - 1) + losses[i]) / period
    }
  }
  return result
}

/** MACD: { macd, signal, histogram } */
export function calcMACD(
  closes: (number | null)[],
  fast = 12,
  slow = 26,
  signal = 9,
): {
  macd: (number | null)[]
  signal: (number | null)[]
  histogram: (number | null)[]
} {
  const emaFast = calcEMA(closes, fast)
  const emaSlow = calcEMA(closes, slow)

  const macdLine: (number | null)[] = emaFast.map((f, i) => {
    const s = emaSlow[i]
    return f !== null && s !== null ? f - s : null
  })
  const signalLine = calcEMA(macdLine, signal)
  const histogram = macdLine.map((m, i) => {
    const s = signalLine[i]
    return m !== null && s !== null ? m - s : null
  })

  return { macd: macdLine, signal: signalLine, histogram }
}

// ── 시그널 계산 ─────────────────────────────────

export type SignalType = 'golden_cross' | 'dead_cross' | 'rsi_oversold' | 'rsi_overbought' | 'macd_bullish' | 'macd_bearish'

export interface Signal {
  index: number
  type: SignalType
  direction: 'buy' | 'sell'
  label: string
}

/** MA20/50 크로스 + RSI 30/70 + MACD/Signal 교차 시그널 탐지 */
export function detectSignals(
  ma20: (number | null)[],
  ma50: (number | null)[],
  rsi: (number | null)[],
  macd: (number | null)[],
  signalLine: (number | null)[],
): Signal[] {
  const signals: Signal[] = []

  for (let i = 1; i < ma20.length; i++) {
    const m20Prev = ma20[i - 1], m20Cur = ma20[i]
    const m50Prev = ma50[i - 1], m50Cur = ma50[i]
    const rsiPrev = rsi[i - 1], rsiCur = rsi[i]
    const macdPrev = macd[i - 1], macdCur = macd[i]
    const sigPrev = signalLine[i - 1], sigCur = signalLine[i]

    // 골든크로스: MA20이 MA50을 상향 돌파
    if (m20Prev !== null && m50Prev !== null && m20Cur !== null && m50Cur !== null) {
      if (m20Prev <= m50Prev && m20Cur > m50Cur) {
        signals.push({ index: i, type: 'golden_cross', direction: 'buy', label: '골든X' })
      } else if (m20Prev >= m50Prev && m20Cur < m50Cur) {
        signals.push({ index: i, type: 'dead_cross', direction: 'sell', label: '데드X' })
      }
    }

    // RSI 30 이탈 (과매도 탈출 → 매수)
    if (rsiPrev !== null && rsiCur !== null) {
      if (rsiPrev <= 30 && rsiCur > 30) {
        signals.push({ index: i, type: 'rsi_oversold', direction: 'buy', label: 'RSI↑' })
      } else if (rsiPrev < 70 && rsiCur >= 70) {
        signals.push({ index: i, type: 'rsi_overbought', direction: 'sell', label: 'RSI↓' })
      }
    }

    // MACD/Signal 교차
    if (macdPrev !== null && sigPrev !== null && macdCur !== null && sigCur !== null) {
      if (macdPrev <= sigPrev && macdCur > sigCur) {
        signals.push({ index: i, type: 'macd_bullish', direction: 'buy', label: 'MACD↑' })
      } else if (macdPrev >= sigPrev && macdCur < sigCur) {
        signals.push({ index: i, type: 'macd_bearish', direction: 'sell', label: 'MACD↓' })
      }
    }
  }
  return signals
}

// ── 통합 계산 ──────────────────────────────────

export interface IndicatorRow {
  ma20: number | null
  ma50: number | null
  ma200: number | null
  bbUpper: number | null
  bbLower: number | null
  rsi: number | null
  macd: number | null
  macdSignal: number | null
  macdHistogram: number | null
  buySignal: number | null   // 매수 시그널 발생 시 해당 close 값 (차트 마커용)
  sellSignal: number | null  // 매도 시그널 발생 시 해당 close 값
  signalLabel: string | null
}

/** TechnicalDataPoint[] → IndicatorRow[] */
export function computeIndicators(dataPoints: TechnicalDataPoint[]): IndicatorRow[] {
  const closes = dataPoints.map(d => d.close)

  const ma20 = calcSMA(closes, 20)
  const ma50 = calcSMA(closes, 50)
  const ma200 = calcSMA(closes, 200)
  const bb = calcBollingerBands(closes)
  const rsi = calcRSI(closes)
  const { macd, signal: macdSignal, histogram } = calcMACD(closes)

  const signals = detectSignals(ma20, ma50, rsi, macd, macdSignal)
  const signalMap = new Map<number, Signal>()
  // 같은 인덱스에 여러 시그널 있을 경우 마지막 것 우선 (단순화)
  signals.forEach(s => signalMap.set(s.index, s))

  return dataPoints.map((dp, i) => {
    const sig = signalMap.get(i)
    return {
      ma20: ma20[i],
      ma50: ma50[i],
      ma200: ma200[i],
      bbUpper: bb.upper[i],
      bbLower: bb.lower[i],
      rsi: rsi[i],
      macd: macd[i],
      macdSignal: macdSignal[i],
      macdHistogram: histogram[i],
      buySignal: sig?.direction === 'buy' ? dp.close : null,
      sellSignal: sig?.direction === 'sell' ? dp.close : null,
      signalLabel: sig?.label ?? null,
    }
  })
}

/** 최신 시그널 요약 (현재 상태 기준) */
export interface CurrentSignalSummary {
  maCross: { state: 'golden' | 'dead' | 'neutral'; label: string; detail: string }
  rsiState: { value: number | null; state: 'overbought' | 'oversold' | 'neutral'; label: string; detail: string }
  macdState: { state: 'bullish' | 'bearish' | 'neutral'; label: string; detail: string }
}

export function getCurrentSignalSummary(
  indicators: IndicatorRow[],
): CurrentSignalSummary {
  const last = indicators[indicators.length - 1]

  // MA 크로스 상태
  let maCross: CurrentSignalSummary['maCross']
  if (last.ma20 !== null && last.ma50 !== null) {
    if (last.ma20 > last.ma50) {
      maCross = { state: 'golden', label: '▲ 골든크로스', detail: 'MA20 > MA50' }
    } else if (last.ma20 < last.ma50) {
      maCross = { state: 'dead', label: '▼ 데드크로스', detail: 'MA20 < MA50' }
    } else {
      maCross = { state: 'neutral', label: '— 중립', detail: 'MA20 ≈ MA50' }
    }
  } else {
    maCross = { state: 'neutral', label: '— 데이터 부족', detail: '계산 불가' }
  }

  // RSI 상태
  const rsiVal = last.rsi
  let rsiState: CurrentSignalSummary['rsiState']
  if (rsiVal !== null) {
    if (rsiVal >= 70) {
      rsiState = { value: rsiVal, state: 'overbought', label: `▼ 과매수 (${rsiVal.toFixed(1)})`, detail: 'RSI ≥ 70' }
    } else if (rsiVal <= 30) {
      rsiState = { value: rsiVal, state: 'oversold', label: `▲ 과매도 (${rsiVal.toFixed(1)})`, detail: 'RSI ≤ 30' }
    } else {
      rsiState = { value: rsiVal, state: 'neutral', label: `— 중립 (${rsiVal.toFixed(1)})`, detail: '30~70 범위' }
    }
  } else {
    rsiState = { value: null, state: 'neutral', label: '— 데이터 부족', detail: '계산 불가' }
  }

  // MACD 상태
  let macdState: CurrentSignalSummary['macdState']
  if (last.macd !== null && last.macdSignal !== null) {
    if (last.macd > last.macdSignal) {
      macdState = { state: 'bullish', label: '▲ 골든크로스', detail: 'MACD > Signal' }
    } else if (last.macd < last.macdSignal) {
      macdState = { state: 'bearish', label: '▼ 데드크로스', detail: 'MACD < Signal' }
    } else {
      macdState = { state: 'neutral', label: '— 중립', detail: 'MACD ≈ Signal' }
    }
  } else {
    macdState = { state: 'neutral', label: '— 데이터 부족', detail: '계산 불가' }
  }

  return { maCross, rsiState, macdState }
}
```

- [ ] **Step 2: 커밋**

```bash
git add frontend/lib/adapters/technicalIndicators.ts
git commit -m "feat(technical): 인디케이터 계산 함수 추가 (MA/BB/RSI/MACD/시그널)"
```

---

## Task 2: types/index.ts에 IndicatorRow 타입 re-export

기존 `types/index.ts`는 UI가 소비하는 인터페이스를 모아두는 파일이다. `IndicatorRow`와 `CurrentSignalSummary`는 `technicalIndicators.ts`에 이미 정의되어 있으므로 `types/index.ts`를 수정할 필요 없다 — 컴포넌트가 직접 `@/lib/adapters/technicalIndicators`에서 import한다.

> 이 Task는 실제 파일 수정이 없다. 다음 Task 진행.

---

## Task 3: TechnicalCharts.tsx 전면 교체

**Files:**
- Modify: `frontend/components/charts/TechnicalCharts.tsx`

기존 파일(종가 AreaChart + 거래량 BarChart)을 5개 섹션으로 확장한다:
1. 기간 버튼 + 인디케이터 토글 칩
2. 요약 통계 (기존 유지)
3. 가격 차트 (ComposedChart: 종가 Area + MA lines + BB lines + 시그널 마커)
4. RSI 서브차트 (기준선 포함)
5. MACD 서브차트 (히스토그램 + 두 라인)
6. 시그널 요약 박스

- [ ] **Step 1: TechnicalCharts.tsx 전체 교체**

아래 내용으로 `frontend/components/charts/TechnicalCharts.tsx`를 덮어쓴다:

```typescript
'use client'

import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { TechnicalAnalysis, TechnicalPeriod } from '@/types'
import {
  computeIndicators,
  getCurrentSignalSummary,
} from '@/lib/adapters/technicalIndicators'

// ── 상수 ────────────────────────────────────────

const PERIODS: { value: TechnicalPeriod; label: string }[] = [
  { value: '1m', label: '1M' },
  { value: '3m', label: '3M' },
  { value: '6m', label: '6M' },
  { value: '1y', label: '1Y' },
  { value: '3y', label: '3Y' },
]

type IndicatorKey = 'MA' | 'BB' | 'RSI' | 'MACD'

// ── 포맷 헬퍼 ───────────────────────────────────

function formatPrice(value: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatVolume(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`
  return String(value)
}

function formatDateTick(date: string, period: TechnicalPeriod): string {
  const d = new Date(date)
  if (period === '1m' || period === '3m') return `${d.getMonth() + 1}/${d.getDate()}`
  return `${d.getFullYear().toString().slice(2)}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ── 서브컴포넌트 ─────────────────────────────────

function SummaryCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`mt-1 text-base font-semibold ${highlight ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
        {value}
      </div>
    </div>
  )
}

function IndicatorChip({
  label,
  active,
  onToggle,
}: {
  label: IndicatorKey
  active: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className={[
        'rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
        active
          ? 'bg-indigo-950 text-indigo-300 dark:bg-indigo-950 dark:text-indigo-300'
          : 'border border-zinc-300 text-zinc-400 dark:border-zinc-700 dark:text-zinc-500',
      ].join(' ')}
    >
      {label} {active ? '✓' : ''}
    </button>
  )
}

// 시그널 마커 커스텀 닷 (매수▲ / 매도▼)
function BuyDot(props: Record<string, unknown>) {
  const { cx, cy, payload } = props as { cx: number; cy: number; payload: { buySignal: number | null; signalLabel: string | null } }
  if (payload.buySignal === null) return null
  return (
    <g>
      <text x={cx} y={(cy as number) + 4} textAnchor="middle" fill="#34d399" fontSize={12}>▲</text>
      {payload.signalLabel && (
        <text x={cx} y={(cy as number) - 4} textAnchor="middle" fill="#34d399" fontSize={8}>{payload.signalLabel}</text>
      )}
    </g>
  )
}

function SellDot(props: Record<string, unknown>) {
  const { cx, cy, payload } = props as { cx: number; cy: number; payload: { sellSignal: number | null; signalLabel: string | null } }
  if (payload.sellSignal === null) return null
  return (
    <g>
      <text x={cx} y={(cy as number) - 4} textAnchor="middle" fill="#f87171" fontSize={12}>▼</text>
      {payload.signalLabel && (
        <text x={cx} y={(cy as number) - 14} textAnchor="middle" fill="#f87171" fontSize={8}>{payload.signalLabel}</text>
      )}
    </g>
  )
}

// ── 메인 컴포넌트 ────────────────────────────────

export default function TechnicalCharts({
  data,
  ticker,
  period: currentPeriod,
  onPeriodChange,
}: {
  data: TechnicalAnalysis
  ticker: string
  period: TechnicalPeriod
  onPeriodChange: (p: TechnicalPeriod) => void
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const market = searchParams.get('market') ?? 'US'

  const [activeIndicators, setActiveIndicators] = useState<Set<IndicatorKey>>(
    () => new Set(['MA', 'BB', 'RSI', 'MACD']),
  )

  function toggleIndicator(key: IndicatorKey) {
    setActiveIndicators(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function handlePeriod(period: TechnicalPeriod) {
    onPeriodChange(period)
    router.push(`/companies/_/technical?ticker=${ticker}&market=${market}&period=${period}`)
  }

  // 인디케이터 계산 (데이터 변경 시에만)
  const indicators = useMemo(() => computeIndicators(data.data_points), [data.data_points])
  const signalSummary = useMemo(() => getCurrentSignalSummary(indicators), [indicators])

  // Recharts 데이터 병합
  const chartData = useMemo(
    () =>
      data.data_points.map((dp, i) => ({
        date: dp.date,
        종가: dp.close,
        거래량: dp.volume,
        ...indicators[i],
      })),
    [data.data_points, indicators],
  )

  const { summary } = data
  const returnPct = summary.period_return_pct
  const returnPositive = returnPct !== null && returnPct >= 0

  const showMA = activeIndicators.has('MA')
  const showBB = activeIndicators.has('BB')
  const showRSI = activeIndicators.has('RSI')
  const showMACD = activeIndicators.has('MACD')

  // MACD 히스토그램 색상 — 양수 파란색, 음수 빨간색
  const macdBarColor = (entry: { macdHistogram: number | null }) =>
    (entry.macdHistogram ?? 0) >= 0 ? '#6366f1' : '#ef4444'

  return (
    <div className="space-y-6">
      {/* 기간 버튼 + 인디케이터 토글 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => handlePeriod(p.value)}
              className={[
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                p.value === currentPeriod
                  ? 'bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900'
                  : 'border border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800',
              ].join(' ')}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="h-5 w-px bg-zinc-300 dark:bg-zinc-700" />
        {(['MA', 'BB', 'RSI', 'MACD'] as IndicatorKey[]).map((key) => (
          <IndicatorChip
            key={key}
            label={key}
            active={activeIndicators.has(key)}
            onToggle={() => toggleIndicator(key)}
          />
        ))}
      </div>

      {/* 요약 통계 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryCard label="시작가" value={summary.start_price != null ? formatPrice(summary.start_price) : '—'} />
        <SummaryCard label="현재가" value={summary.end_price != null ? formatPrice(summary.end_price) : '—'} />
        <SummaryCard
          label="기간 수익률"
          value={returnPct != null ? `${returnPositive ? '+' : ''}${returnPct.toFixed(2)}%` : '—'}
          highlight={returnPositive}
        />
        <SummaryCard label="구간 고가" value={summary.high_period != null ? formatPrice(summary.high_period) : '—'} />
        <SummaryCard label="구간 저가" value={summary.low_period != null ? formatPrice(summary.low_period) : '—'} />
        <SummaryCard label="평균 거래량" value={summary.avg_volume != null ? formatVolume(summary.avg_volume) : '—'} />
      </div>

      {/* 가격 차트 (MA / BB / 시그널 오버레이) */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">종가 추이</h3>
          <div className="flex flex-wrap gap-3 text-xs text-zinc-400">
            <span><span style={{ color: '#6366f1' }}>—</span> 종가</span>
            {showMA && (
              <>
                <span><span style={{ color: '#f59e0b' }}>—</span> MA20</span>
                <span><span style={{ color: '#22c55e' }}>--</span> MA50</span>
                <span><span style={{ color: '#ef4444' }}>··</span> MA200</span>
              </>
            )}
            {showBB && <span><span style={{ color: '#6366f1', opacity: 0.4 }}>····</span> BB</span>}
            <span style={{ color: '#34d399' }}>▲ 매수</span>
            <span style={{ color: '#f87171' }}>▼ 매도</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" strokeOpacity={0.3} />
            <XAxis
              dataKey="date"
              tickFormatter={(v) => formatDateTick(v, currentPeriod)}
              tick={{ fontSize: 11 }}
              interval="preserveStartEnd"
            />
            <YAxis
              tickFormatter={formatPrice}
              tick={{ fontSize: 11 }}
              width={70}
              domain={['auto', 'auto']}
            />
            <Tooltip
              formatter={(v, name) => {
                if (typeof v !== 'number') return [v, name]
                const labelMap: Record<string, string> = {
                  종가: '종가', ma20: 'MA20', ma50: 'MA50', ma200: 'MA200',
                  bbUpper: 'BB상단', bbLower: 'BB하단',
                }
                return [formatPrice(v), labelMap[name as string] ?? name]
              }}
              labelFormatter={(label) => label}
            />
            {/* 볼린저밴드 */}
            {showBB && (
              <>
                <Line type="monotone" dataKey="bbUpper" stroke="#6366f1" strokeWidth={1} strokeDasharray="4 3" strokeOpacity={0.35} dot={false} />
                <Line type="monotone" dataKey="bbLower" stroke="#6366f1" strokeWidth={1} strokeDasharray="4 3" strokeOpacity={0.35} dot={false} />
              </>
            )}
            {/* MA 라인 */}
            {showMA && (
              <>
                <Line type="monotone" dataKey="ma200" stroke="#ef4444" strokeWidth={1.2} strokeDasharray="6 3" strokeOpacity={0.7} dot={false} />
                <Line type="monotone" dataKey="ma50" stroke="#22c55e" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
                <Line type="monotone" dataKey="ma20" stroke="#f59e0b" strokeWidth={1.5} dot={false} />
              </>
            )}
            {/* 종가 에어리어 */}
            <Area
              type="monotone"
              dataKey="종가"
              stroke="#6366f1"
              strokeWidth={2}
              fill="url(#priceGradient)"
              dot={false}
            />
            {/* 매수/매도 시그널 마커 */}
            <Line
              type="monotone"
              dataKey="buySignal"
              stroke="transparent"
              dot={(props: unknown) => <BuyDot {...(props as Record<string, unknown>)} />}
              activeDot={false}
              legendType="none"
            />
            <Line
              type="monotone"
              dataKey="sellSignal"
              stroke="transparent"
              dot={(props: unknown) => <SellDot {...(props as Record<string, unknown>)} />}
              activeDot={false}
              legendType="none"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </section>

      {/* RSI 서브차트 */}
      {showRSI && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">RSI (14)</h3>
            {indicators.length > 0 && indicators[indicators.length - 1].rsi !== null && (
              <span className="text-xs text-violet-400">
                현재 {indicators[indicators.length - 1].rsi!.toFixed(1)}
              </span>
            )}
          </div>
          <ResponsiveContainer width="100%" height={120}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" strokeOpacity={0.2} />
              <XAxis dataKey="date" tickFormatter={(v) => formatDateTick(v, currentPeriod)} tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis domain={[0, 100]} ticks={[0, 30, 50, 70, 100]} tick={{ fontSize: 11 }} width={32} />
              <Tooltip formatter={(v) => [typeof v === 'number' ? v.toFixed(1) : v, 'RSI']} labelFormatter={(l) => l} />
              <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="4 3" strokeOpacity={0.6} />
              <ReferenceLine y={30} stroke="#22c55e" strokeDasharray="4 3" strokeOpacity={0.6} />
              <ReferenceLine y={50} stroke="#3f3f46" strokeOpacity={0.5} />
              <Line type="monotone" dataKey="rsi" stroke="#a78bfa" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </section>
      )}

      {/* MACD 서브차트 */}
      {showMACD && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">MACD (12, 26, 9)</h3>
            {indicators.length > 0 && (
              <span className="text-xs text-zinc-400">
                MACD{' '}
                <span className="text-indigo-400">
                  {indicators[indicators.length - 1].macd?.toFixed(2) ?? '—'}
                </span>
                {' · '}Signal{' '}
                <span className="text-amber-400">
                  {indicators[indicators.length - 1].macdSignal?.toFixed(2) ?? '—'}
                </span>
              </span>
            )}
          </div>
          <ResponsiveContainer width="100%" height={120}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" strokeOpacity={0.2} />
              <XAxis dataKey="date" tickFormatter={(v) => formatDateTick(v, currentPeriod)} tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} width={44} />
              <Tooltip
                formatter={(v, name) => {
                  if (typeof v !== 'number') return [v, name]
                  const m: Record<string, string> = { macdHistogram: '히스토그램', macd: 'MACD', macdSignal: 'Signal' }
                  return [v.toFixed(3), m[name as string] ?? name]
                }}
                labelFormatter={(l) => l}
              />
              <ReferenceLine y={0} stroke="#3f3f46" />
              <Bar
                dataKey="macdHistogram"
                fill="#6366f1"
                opacity={0.5}
                radius={[1, 1, 0, 0]}
                // 양수/음수 색상 분기
                label={false}
                isAnimationActive={false}
              />
              <Line type="monotone" dataKey="macd" stroke="#6366f1" strokeWidth={1.8} dot={false} />
              <Line type="monotone" dataKey="macdSignal" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="mt-1 flex gap-3 text-xs text-zinc-400">
            <span><span style={{ color: '#6366f1' }}>—</span> MACD</span>
            <span><span style={{ color: '#f59e0b' }}>--</span> Signal</span>
            <span><span style={{ color: '#6366f1', opacity: 0.6 }}>■</span> 양봉</span>
            <span><span style={{ color: '#ef4444', opacity: 0.6 }}>■</span> 음봉</span>
          </div>
        </section>
      )}

      {/* 시그널 요약 박스 */}
      <section className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="mb-3 text-xs font-semibold text-zinc-500 dark:text-zinc-400">📍 현재 시그널 요약</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {/* MA 크로스 */}
          <div className="rounded-md bg-white p-3 dark:bg-zinc-800">
            <div className="mb-1 text-xs text-zinc-400">MA 크로스</div>
            <div className={`text-sm font-semibold ${
              signalSummary.maCross.state === 'golden' ? 'text-emerald-500' :
              signalSummary.maCross.state === 'dead' ? 'text-red-400' : 'text-amber-400'
            }`}>
              {signalSummary.maCross.label}
            </div>
            <div className="mt-0.5 text-xs text-zinc-500">{signalSummary.maCross.detail}</div>
          </div>
          {/* RSI */}
          <div className="rounded-md bg-white p-3 dark:bg-zinc-800">
            <div className="mb-1 text-xs text-zinc-400">RSI</div>
            <div className={`text-sm font-semibold ${
              signalSummary.rsiState.state === 'overbought' ? 'text-red-400' :
              signalSummary.rsiState.state === 'oversold' ? 'text-emerald-500' : 'text-amber-400'
            }`}>
              {signalSummary.rsiState.label}
            </div>
            <div className="mt-0.5 text-xs text-zinc-500">{signalSummary.rsiState.detail}</div>
          </div>
          {/* MACD */}
          <div className="rounded-md bg-white p-3 dark:bg-zinc-800">
            <div className="mb-1 text-xs text-zinc-400">MACD</div>
            <div className={`text-sm font-semibold ${
              signalSummary.macdState.state === 'bullish' ? 'text-emerald-500' :
              signalSummary.macdState.state === 'bearish' ? 'text-red-400' : 'text-amber-400'
            }`}>
              {signalSummary.macdState.label}
            </div>
            <div className="mt-0.5 text-xs text-zinc-500">{signalSummary.macdState.detail}</div>
          </div>
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 2: 빌드 오류 확인**

```bash
cd /Users/nelcome/Codes/Claude_code_repository/equisense/frontend && npx tsc --noEmit 2>&1 | head -40
```
Expected: 에러 없음 (또는 기존에 있던 에러만)

- [ ] **Step 3: 커밋**

```bash
git add frontend/components/charts/TechnicalCharts.tsx
git commit -m "feat(technical): MA/BB/RSI/MACD 인디케이터 + 시그널 차트 추가"
```

---

## Task 4: MACD 히스토그램 색상 분기 처리

Recharts `Bar`는 `Cell`로 개별 색상을 지정할 수 있다. Task 3에서 단일 `fill`로 작성했으나 양/음 분기가 필요하다.

**Files:**
- Modify: `frontend/components/charts/TechnicalCharts.tsx`

- [ ] **Step 1: Cell import 추가 및 Bar 수정**

`TechnicalCharts.tsx` 상단 recharts import에 `Cell` 추가:

```typescript
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
```

MACD 섹션의 `<Bar>` 를 아래로 교체:

```typescript
<Bar dataKey="macdHistogram" radius={[1, 1, 0, 0]} isAnimationActive={false}>
  {chartData.map((entry, index) => (
    <Cell
      key={`macd-bar-${index}`}
      fill={(entry.macdHistogram ?? 0) >= 0 ? '#6366f1' : '#ef4444'}
      opacity={0.55}
    />
  ))}
</Bar>
```

또한 Task 3에서 사용하지 않게 된 `macdBarColor` 함수 선언을 삭제한다.

- [ ] **Step 2: 빌드 확인**

```bash
cd /Users/nelcome/Codes/Claude_code_repository/equisense/frontend && npx tsc --noEmit 2>&1 | head -40
```
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add frontend/components/charts/TechnicalCharts.tsx
git commit -m "fix(technical): MACD 히스토그램 양수/음수 색상 분기"
```

---

## Task 5: 로컬 빌드 & 배포

**Files:**
- 없음 (빌드/배포만)

- [ ] **Step 1: Next.js 정적 빌드**

```bash
cd /Users/nelcome/Codes/Claude_code_repository/equisense/frontend && npm run build 2>&1 | tail -20
```
Expected: `Export successful` 또는 `✓ Compiled successfully`

- [ ] **Step 2: eq-deploy worktree 존재 확인 및 없으면 생성**

```bash
git worktree list
```

없으면:
```bash
git worktree add --detach /private/tmp/eq-deploy equisense-origin/main
```

- [ ] **Step 3: 빌드 결과물 복사 (변경 파일만)**

```bash
cp -r /Users/nelcome/Codes/Claude_code_repository/equisense/frontend/out/* /private/tmp/eq-deploy/
```

- [ ] **Step 4: 배포 커밋 & 푸시**

```bash
cd /private/tmp/eq-deploy && git add -A && git commit -m "feat(technical): 인디케이터 차트 배포" && git push equisense-origin HEAD:main
```

---

## Self-Review

### Spec 커버리지 체크

| 요구사항 | 구현 Task |
|---------|---------|
| 인디케이터 토글 칩 (MA/BB/RSI/MACD on/off) | Task 3 — `activeIndicators` useState |
| 가격 차트 MA20/50/200 오버레이 | Task 3 — `showMA` 조건 Line 3개 |
| 볼린저밴드 오버레이 | Task 3 — `showBB` 조건 Line 2개 |
| 매수▲/매도▼ 시그널 마커 | Task 3 — BuyDot/SellDot custom dot |
| RSI(14) 서브차트 + 30/70 기준선 | Task 3 — `showRSI` ReferenceLine |
| MACD(12,26,9) 서브차트 + 히스토그램 | Task 3 + Task 4 — Bar Cell |
| 시그널 요약 박스 3카드 | Task 3 — signalSummary |
| 계산 프론트엔드 전용 | Task 1 — technicalIndicators.ts |
| 골든/데드크로스 시그널 | Task 1 — detectSignals |
| RSI 30/70 시그널 | Task 1 — detectSignals |
| MACD/Signal 교차 시그널 | Task 1 — detectSignals |

### 타입 일관성 체크
- `IndicatorRow.buySignal/sellSignal`: Task 1에서 `number | null` → Task 3 `BuyDot/SellDot`에서 동일 타입 소비 ✓
- `computeIndicators` 반환 타입 `IndicatorRow[]` → Task 3 `useMemo` 반환 타입 일치 ✓
- `getCurrentSignalSummary` 반환 `CurrentSignalSummary` → Task 3 `signalSummary` 구조 분해 사용 ✓
