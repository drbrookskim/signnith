'use client'

import { useMemo, useState } from 'react'
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
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
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

function BuyDot(props: Record<string, unknown>) {
  const { cx, cy, payload } = props as { cx: number; cy: number; payload: { buySignal: number | null; signalLabel: string | null } }
  if (payload.buySignal === null || cx == null || cy == null) return null
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
  if (payload.sellSignal === null || cx == null || cy == null) return null
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
  ticker: _ticker,
  period: currentPeriod,
  onPeriodChange,
}: {
  data: TechnicalAnalysis
  ticker: string
  period: TechnicalPeriod
  onPeriodChange: (p: TechnicalPeriod) => void
}) {
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
  }

  const indicators = useMemo(() => computeIndicators(data.data_points), [data.data_points])
  const signalSummary = useMemo(() => getCurrentSignalSummary(indicators), [indicators])

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

      {/* 가격 차트 */}
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
              tickFormatter={(v: unknown) => typeof v === 'number' ? formatPrice(v) : ''}
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
            {showBB && (
              <>
                <Line type="monotone" dataKey="bbUpper" stroke="#6366f1" strokeWidth={1} strokeDasharray="4 3" strokeOpacity={0.35} dot={false} />
                <Line type="monotone" dataKey="bbLower" stroke="#6366f1" strokeWidth={1} strokeDasharray="4 3" strokeOpacity={0.35} dot={false} />
              </>
            )}
            {showMA && (
              <>
                <Line type="monotone" dataKey="ma200" stroke="#ef4444" strokeWidth={1.2} strokeDasharray="6 3" strokeOpacity={0.7} dot={false} />
                <Line type="monotone" dataKey="ma50" stroke="#22c55e" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
                <Line type="monotone" dataKey="ma20" stroke="#f59e0b" strokeWidth={1.5} dot={false} />
              </>
            )}
            <Area
              type="monotone"
              dataKey="종가"
              stroke="#6366f1"
              strokeWidth={2}
              fill="url(#priceGradient)"
              dot={false}
            />
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
              <Bar dataKey="macdHistogram" radius={[1, 1, 0, 0]} isAnimationActive={false}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={`macd-bar-${index}`}
                    fill={(entry.macdHistogram ?? 0) >= 0 ? '#dc2626' : '#2563eb'}
                    opacity={0.55}
                  />
                ))}
              </Bar>
              <Line type="monotone" dataKey="macd" stroke="#dc2626" strokeWidth={1.8} dot={false} />
              <Line type="monotone" dataKey="macdSignal" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="mt-1 flex gap-3 text-xs text-zinc-400">
            <span><span style={{ color: '#dc2626' }}>—</span> MACD</span>
            <span><span style={{ color: '#f59e0b' }}>--</span> Signal</span>
            <span><span style={{ color: '#dc2626', opacity: 0.6 }}>■</span> 양봉</span>
            <span><span style={{ color: '#2563eb', opacity: 0.6 }}>■</span> 음봉</span>
          </div>
        </section>
      )}

      {/* 시그널 요약 박스 */}
      <section style={{ padding: '4px 0' }}>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.14em',
          textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 12,
        }}>현재 시그널 요약</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {([
            {
              label: 'MA 크로스',
              state: signalSummary.maCross.state,
              text: signalSummary.maCross.label,
              detail: signalSummary.maCross.detail,
              positiveState: 'golden',
              negativeState: 'dead',
            },
            {
              label: 'RSI',
              state: signalSummary.rsiState.state,
              text: signalSummary.rsiState.label,
              detail: signalSummary.rsiState.detail,
              positiveState: 'oversold',
              negativeState: 'overbought',
            },
            {
              label: 'MACD',
              state: signalSummary.macdState.state,
              text: signalSummary.macdState.label,
              detail: signalSummary.macdState.detail,
              positiveState: 'bullish',
              negativeState: 'bearish',
            },
          ] as const).map((item) => {
            const stateColor =
              item.state === item.positiveState ? 'var(--accent)' :
              item.state === item.negativeState ? '#dc2626' : '#b45309'
            return (
              <div key={item.label} className="eq-glass" style={{
                borderRadius: 9,
                padding: '13px 15px',
              }}>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '.08em',
                  textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 5,
                }}>
                  {item.label}
                </div>
                <div style={{
                  fontSize: 13, fontWeight: 600, color: stateColor,
                  fontFamily: 'var(--font-ui)', lineHeight: 1.2, marginBottom: 4,
                }}>
                  {item.text}
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', lineHeight: 1.4 }}>
                  {item.detail}
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
