'use client'

import { useState, useId } from 'react'
import { useIsMobile } from '@/lib/hooks/useIsMobile'
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
import type { FundamentalAnalysis, QuarterlyInsight, QuarterlyInsightMap } from '@/types'
import { computeAnnualInsight } from '@/lib/adapters/quarterly'

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

// ── 테마 컬러 팔레트 ──────────────────────────
const C1 = '#1c6e4a'  // accent (forest green)
const C2 = '#b45309'  // warm amber
const C3 = '#2563eb'  // calm blue

function statusStyle(s: 'pass' | 'warn' | 'fail' | 'na'): React.CSSProperties {
  if (s === 'pass') return { background: 'rgba(28,110,74,0.025)', color: C1 }
  if (s === 'warn') return { background: 'rgba(180,83,9,0.10)',  color: C2 }
  if (s === 'fail') return { background: 'rgba(220,38,38,0.10)', color: '#dc2626' }
  return { background: 'color-mix(in srgb, var(--ink-3) 4%, transparent)', color: 'var(--ink-3)' }
}

// ── 차트 공통 스타일 ───────────────────────────
const GRID_STROKE  = 'rgba(30,26,15,0.14)'
const TICK_FILL    = '#968f7d'  // --ink-3
const TOOLTIP_STYLE = {
  background: 'var(--surface)',
  border: '1px solid rgba(30,26,15,0.18)',
  borderRadius: 6,
  fontSize: 11,
  color: '#1b1a15',
}

// ── 타입 ────────────────────────────────────────

type ExpandedKey = 'roe' | 'roa' | 'debt_ratio' | 'operating_margin' | 'per' | 'pbr' | 'fcf' | 'income' | 'margin'

// ── 섹션 헬퍼 ───────────────────────────────────

function calcCagr(data: { year: number; value: number | null }[]): number | null {
  const valid = data.filter((d): d is { year: number; value: number } => d.value != null)
  if (valid.length < 2) return null
  const first = valid[0].value
  const last  = valid.at(-1)!.value
  const years = valid.at(-1)!.year - valid[0].year
  if (years <= 0 || first <= 0) return null
  return (Math.pow(last / first, 1 / years) - 1) * 100
}

function healthSignal(
  latest: import('@/types').FundamentalMetrics | null,
): 'good' | 'warn' | 'danger' {
  if (!latest) return 'warn'
  const dr  = latest.debt_ratio ?? Infinity
  const fcf = latest.fcf        ?? -1
  const icr = latest.icr        ?? 0
  if (dr > 300 || fcf < 0 || icr < 1.5) return 'danger'
  if (dr > 200 || icr < 3)               return 'warn'
  return 'good'
}

// ── 지표 설정 ───────────────────────────────────

const METRIC_CONFIGS: Record<string, { label: string; format: MetricFormat; color: string; description: string }> = {
  roe:              { label: 'ROE',        format: 'percent', color: C1, description: '주주 자본으로 얼마나 수익을 냈는지' },
  roa:              { label: 'ROA',        format: 'percent', color: C3, description: '보유 자산 대비 수익 창출 효율' },
  debt_ratio:       { label: '부채비율',   format: 'percent', color: C2, description: '낮을수록 재무 안정성 높음' },
  operating_margin: { label: '영업이익률', format: 'percent', color: C1, description: '매출 중 영업이익이 차지하는 비율' },
  per:              { label: 'PER',        format: 'ratio',   color: C2, description: '현재 주가가 이익의 몇 배인지' },
  pbr:              { label: 'PBR',        format: 'ratio',   color: C3, description: '주가가 순자산 대비 몇 배인지' },
  fcf:              { label: 'FCF',        format: 'large',   color: C1, description: '실제 손에 쥔 잉여현금흐름' },
}

// ── QuarterlyOverlay ────────────────────────────

function QuarterlyOverlay({
  insight, loading, isAnnual,
}: {
  insight: QuarterlyInsight | null | undefined
  loading: boolean
  isAnnual: boolean
}) {
  return (
    <div style={{ marginTop: 10, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
      {loading ? (
        <div className="animate-pulse space-y-1.5">
          <div className="h-2.5 w-full rounded bg-zinc-200" />
          <div className="h-2.5 w-3/4 rounded bg-zinc-200" />
        </div>
      ) : insight && !insight.insufficient ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {isAnnual && (
              <span style={{
                borderRadius: 4, padding: '1px 6px',
                fontSize: 10, fontWeight: 500,
                background: 'var(--surface-2)', color: 'var(--ink-3)',
              }}>
                연간
              </span>
            )}
            <p style={{ fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.55 }}>
              {insight.trend_line}
            </p>
          </div>
          <span style={{
            display: 'inline-block', marginTop: 8,
            borderRadius: 999, padding: '2px 10px',
            fontSize: 11, fontWeight: 700, letterSpacing: '.04em',
            ...(insight.direction === 'up'
              ? { background: 'rgba(28,110,74,0.12)', color: C1, outline: `1px solid rgba(28,110,74,0.3)` }
              : insight.direction === 'down'
              ? { background: 'rgba(220,38,38,0.10)', color: '#dc2626', outline: '1px solid rgba(220,38,38,0.25)' }
              : insight.direction === 'mixed'
              ? { background: 'rgba(180,83,9,0.10)', color: C2, outline: `1px solid rgba(180,83,9,0.3)` }
              : { background: 'var(--surface-2)', color: 'var(--ink-3)', outline: '1px solid var(--line)' }
            ),
          }}>
            {insight.momentum_label}
          </span>
        </>
      ) : (
        <p style={{ fontSize: 11, color: 'var(--ink-3)' }}>추이 데이터 없음</p>
      )}
    </div>
  )
}

// ── ExpandedPanel ────────────────────────────────

type IncomeRow  = { year: string; revenue: number | null; operating_income: number | null; net_income: number | null }
type MarginRow  = { year: string; ROE: number | null; ROA: number | null; 영업이익률: number | null }

function ExpandedPanel({
  expandedKey, sparkDataByKey, incomeData, marginData, uid, onClose, showClose = true,
}: {
  expandedKey: ExpandedKey
  sparkDataByKey: Record<string, { year: number; value: number | null }[]>
  incomeData: IncomeRow[]
  marginData: MarginRow[]
  uid: string
  onClose: () => void
  showClose?: boolean
}) {
  const header =
    expandedKey === 'income' ? '손익 추이 — 연도별' :
    expandedKey === 'margin' ? '수익성 지표 — 연도별' :
    `${METRIC_CONFIGS[expandedKey].label} — 연도별 추이`

  return (
    <div className="eq-glass" style={{
      borderRadius: 8,
      padding: '14px 16px',
    }}>
      <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h4 style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>{header}</h4>
        {showClose && (
          <button
            onClick={onClose}
            style={{ fontSize: 11, color: 'var(--ink-3)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            ✕ 닫기
          </button>
        )}
      </div>

      {expandedKey === 'income' && (
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={incomeData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
            <defs>
              <linearGradient id={`${uid}-ep-income-revenue`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={C1} stopOpacity={0.22} />
                <stop offset="95%" stopColor={C1} stopOpacity={0}    />
              </linearGradient>
              <linearGradient id={`${uid}-ep-income-op`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={C2} stopOpacity={0.18} />
                <stop offset="95%" stopColor={C2} stopOpacity={0}   />
              </linearGradient>
              <linearGradient id={`${uid}-ep-income-net`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={C3} stopOpacity={0.18} />
                <stop offset="95%" stopColor={C3} stopOpacity={0}   />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis dataKey="year" tick={{ fontSize: 11, fill: TICK_FILL }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={(v: unknown) => typeof v === 'number' ? formatLargeNumber(v) : ''} tick={{ fontSize: 10, fill: TICK_FILL }} width={60} domain={['auto', 'auto']} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => (typeof v === 'number' ? formatLargeNumber(v) : v)} />
            <Legend wrapperStyle={{ fontSize: 11, color: TICK_FILL }} />
            <Area type="monotone" dataKey="revenue"          name="매출액"   stroke={C1} strokeWidth={2} fill={`url(#${uid}-ep-income-revenue)`} dot={false} connectNulls />
            <Area type="monotone" dataKey="operating_income" name="영업이익" stroke={C2} strokeWidth={2} fill={`url(#${uid}-ep-income-op)`}      dot={false} connectNulls />
            <Area type="monotone" dataKey="net_income"       name="순이익"   stroke={C3} strokeWidth={2} fill={`url(#${uid}-ep-income-net)`}     dot={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      )}

      {expandedKey === 'margin' && (
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={marginData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
            <defs>
              <linearGradient id={`${uid}-ep-margin-roe`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={C1} stopOpacity={0.22} />
                <stop offset="95%" stopColor={C1} stopOpacity={0}    />
              </linearGradient>
              <linearGradient id={`${uid}-ep-margin-roa`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={C2} stopOpacity={0.18} />
                <stop offset="95%" stopColor={C2} stopOpacity={0}   />
              </linearGradient>
              <linearGradient id={`${uid}-ep-margin-op`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={C3} stopOpacity={0.18} />
                <stop offset="95%" stopColor={C3} stopOpacity={0}   />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis dataKey="year" tick={{ fontSize: 11, fill: TICK_FILL }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={(v: unknown) => typeof v === 'number' ? formatPercent(v) : ''} tick={{ fontSize: 10, fill: TICK_FILL }} width={52} domain={['auto', 'auto']} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => (typeof v === 'number' ? formatPercent(v) : v)} />
            <Legend wrapperStyle={{ fontSize: 11, color: TICK_FILL }} />
            <Area type="monotone" dataKey="ROE"        name="ROE"       stroke={C1} strokeWidth={2} fill={`url(#${uid}-ep-margin-roe)`} dot={false} connectNulls />
            <Area type="monotone" dataKey="ROA"        name="ROA"       stroke={C2} strokeWidth={2} fill={`url(#${uid}-ep-margin-roa)`} dot={false} connectNulls />
            <Area type="monotone" dataKey="영업이익률" name="영업이익률" stroke={C3} strokeWidth={2} fill={`url(#${uid}-ep-margin-op)`}  dot={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      )}

      {expandedKey !== 'income' && expandedKey !== 'margin' && (() => {
        const cfg = METRIC_CONFIGS[expandedKey]
        const sparkData = sparkDataByKey[expandedKey]
        return (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={sparkData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
              <defs>
                <linearGradient id={`${uid}-ep-metric-${expandedKey}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={cfg.color} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={cfg.color} stopOpacity={0}    />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis dataKey="year" tick={{ fontSize: 11, fill: TICK_FILL }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={yAxisFormatter(cfg.format)} tick={{ fontSize: 10, fill: TICK_FILL }} width={cfg.format === 'large' ? 64 : 52} domain={['auto', 'auto']} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v) => [typeof v === 'number' ? formatValue(v, cfg.format) : v, cfg.label]}
                labelFormatter={(label) => `${label}년`}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={cfg.color}
                strokeWidth={2}
                fill={`url(#${uid}-ep-metric-${expandedKey})`}
                dot={{ fill: cfg.color, r: 3 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )
      })()}
    </div>
  )
}

// ── 메인 컴포넌트 ───────────────────────────────

export default function FundamentalsCharts({
  data, quarterlyInsights, quarterlyLoading,
}: {
  data: FundamentalAnalysis
  quarterlyInsights: QuarterlyInsightMap | null
  quarterlyLoading: boolean
}) {
  const uid = useId()
  const isMobile = useIsMobile()
  const [openSection, setOpenSection] = useState<'growth' | 'profit' | 'health' | null>(null)

  function toggleSection(key: 'growth' | 'profit' | 'health') {
    setOpenSection(prev => prev === key ? null : key)
  }

  const incomeData: IncomeRow[] = data.metrics_by_year.map(m => ({
    year: String(m.fiscal_year),
    revenue:          data.trends['revenue']?.values.find(([y]) => y === m.fiscal_year)?.[1]          ?? null,
    operating_income: data.trends['operating_income']?.values.find(([y]) => y === m.fiscal_year)?.[1] ?? null,
    net_income:       data.trends['net_income']?.values.find(([y]) => y === m.fiscal_year)?.[1]       ?? null,
  }))

  const marginData: MarginRow[] = data.metrics_by_year.map(m => ({
    year: String(m.fiscal_year),
    ROE: m.roe, ROA: m.roa, 영업이익률: m.operating_margin,
  }))

  const sparkDataByKey: Record<string, { year: number; value: number | null }[]> = {
    roe:              data.metrics_by_year.map(m => ({ year: m.fiscal_year, value: m.roe })),
    roa:              data.metrics_by_year.map(m => ({ year: m.fiscal_year, value: m.roa })),
    debt_ratio:       data.metrics_by_year.map(m => ({ year: m.fiscal_year, value: m.debt_ratio })),
    operating_margin: data.metrics_by_year.map(m => ({ year: m.fiscal_year, value: m.operating_margin })),
    per:              data.metrics_by_year.map(m => ({ year: m.fiscal_year, value: m.per })),
    pbr:              data.metrics_by_year.map(m => ({ year: m.fiscal_year, value: m.pbr })),
    fcf:              data.metrics_by_year.map(m => ({ year: m.fiscal_year, value: m.fcf })),
  }

  const incomeSpark = data.metrics_by_year.map(m => ({
    year: m.fiscal_year,
    value: data.trends['revenue']?.values.find(([y]) => y === m.fiscal_year)?.[1] ?? null,
  }))
  const latestROE    = data.metrics_by_year.at(-1)?.roe ?? null
  const latestMetrics = data.metrics_by_year.at(-1) ?? null

  function effectiveInsight(
    key: string,
    annualSpark: { year: number; value: number | null }[],
  ): { insight: QuarterlyInsight | null; isAnnual: boolean } {
    if (quarterlyLoading) return { insight: null, isAnnual: false }
    const qi = quarterlyInsights?.[key]
    if (qi && !qi.insufficient) return { insight: qi, isAnnual: false }
    const annual = computeAnnualInsight(key, annualSpark)
    return { insight: annual, isAnnual: true }
  }

  const cagr = calcCagr(incomeSpark)
  const validIncomeSpark = incomeSpark.filter(
    (d): d is { year: number; value: number } => d.value != null,
  )
  const maxRevenue = validIncomeSpark.reduce((m, d) => Math.max(m, d.value), 0)

  const signal = healthSignal(latestMetrics)
  const healthBorderColor = signal === 'good' ? 'rgba(28,110,74,0.45)'
    : signal === 'warn' ? 'rgba(180,83,9,0.45)'
    : 'rgba(220,38,38,0.45)'
  const healthBadgeStyle = signal === 'good'
    ? { background: 'rgba(28,110,74,0.10)', color: C1 }
    : signal === 'warn'
    ? { background: 'rgba(180,83,9,0.10)', color: C2 }
    : { background: 'rgba(220,38,38,0.10)', color: '#dc2626' }

  type PillStatus = 'pass' | 'warn' | 'fail' | 'na'
  const debtStatus: PillStatus = latestMetrics?.debt_ratio == null ? 'na'
    : latestMetrics.debt_ratio <= 200 ? 'pass'
    : latestMetrics.debt_ratio <= 300 ? 'warn' : 'fail'
  const fcfStatus: PillStatus = latestMetrics?.fcf == null ? 'na'
    : latestMetrics.fcf > 0 ? 'pass' : 'fail'
  const icrStatus: PillStatus = latestMetrics?.icr == null ? 'na'
    : latestMetrics.icr >= 3 ? 'pass' : latestMetrics.icr >= 1.5 ? 'warn' : 'fail'
  const perStatus: PillStatus = latestMetrics?.per == null ? 'na'
    : latestMetrics.per < 15 ? 'pass' : latestMetrics.per < 30 ? 'warn' : 'fail'
  const pbrStatus: PillStatus = latestMetrics?.pbr == null ? 'na'
    : latestMetrics.pbr < 1 ? 'pass' : latestMetrics.pbr < 3 ? 'warn' : 'fail'

  const growthInsight = effectiveInsight('income', incomeSpark)

  // ── 공통 카드 스타일 ──────────────────────────
  const cardBase: React.CSSProperties = {
    borderRadius: 10,
    border: '1px solid var(--line-2)',
    transition: 'border-color 0.15s',
    overflow: 'hidden',
  }
  const divider: React.CSSProperties = { borderTop: '1px solid var(--line)' }
  const pillBase: React.CSSProperties = {
    borderRadius: 999, padding: '2px 10px',
    fontSize: 11, fontWeight: 700, display: 'inline-block',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* ── 1. 성장성 ── */}
      <section className="eq-glass" style={{
        ...cardBase,
        borderColor: openSection === 'growth' ? C1 : 'var(--line-2)',
      }}>
        <div
          style={{ display: 'flex', cursor: 'pointer', userSelect: 'none', alignItems: 'flex-start', justifyContent: 'space-between', padding: '12px 16px' }}
          onClick={() => toggleSection('growth')}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>🚀</span>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>성장성</p>
              <p style={{ fontSize: 11, color: 'var(--ink-3)', margin: '2px 0 0' }}>매출 · 영업이익 · 순이익</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 2 }}>
            {cagr != null && (
              <span style={{
                ...pillBase,
                ...(cagr >= 0
                  ? { background: 'rgba(28,110,74,0.10)', color: C1 }
                  : { background: 'rgba(220,38,38,0.10)', color: '#dc2626' }),
              }}>
                CAGR {cagr >= 0 ? '+' : ''}{cagr.toFixed(1)}%
              </span>
            )}
            <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>{openSection === 'growth' ? '▲' : '▼'}</span>
          </div>
        </div>

        {validIncomeSpark.length >= 2 && (
          <div style={{ display: 'flex', height: 20, alignItems: 'flex-end', gap: 2, padding: '0 16px 8px' }}>
            {validIncomeSpark.map((d, i) => {
              const h = maxRevenue > 0 ? Math.max(3, Math.round((d.value / maxRevenue) * 18)) : 3
              return (
                <div
                  key={i}
                  style={{ height: h, flex: 1, borderRadius: 2, background: C1, opacity: 0.55 }}
                />
              )
            })}
          </div>
        )}

        {openSection === 'growth' && (
          <div style={{ ...divider, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <ExpandedPanel
              expandedKey="income"
              sparkDataByKey={sparkDataByKey}
              incomeData={incomeData}
              marginData={marginData}
              uid={uid}
              onClose={() => {}}
              showClose={false}
            />
            <QuarterlyOverlay
              insight={growthInsight.insight}
              loading={quarterlyLoading}
              isAnnual={growthInsight.isAnnual}
            />
          </div>
        )}
      </section>

      {/* ── 2. 수익성 ── */}
      <section className="eq-glass" style={{
        ...cardBase,
        borderColor: openSection === 'profit' ? C1 : 'var(--line-2)',
      }}>
        <div
          style={{ display: 'flex', cursor: 'pointer', userSelect: 'none', alignItems: 'flex-start', justifyContent: 'space-between', padding: '12px 16px' }}
          onClick={() => toggleSection('profit')}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>💎</span>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>수익성</p>
              <p style={{ fontSize: 11, color: 'var(--ink-3)', margin: '2px 0 0' }}>ROE · ROA · 영업이익률</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 2 }}>
            {latestROE != null && (
              <span style={{ ...pillBase, background: 'rgba(28,110,74,0.10)', color: C1 }}>
                ROE {formatPercent(latestROE)}
              </span>
            )}
            <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>{openSection === 'profit' ? '▲' : '▼'}</span>
          </div>
        </div>

        {latestMetrics && (
          <div style={{ ...divider, display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3,1fr)', gap: 1 }}>
            {(
              [
                { label: 'ROE',       value: latestMetrics.roe,              format: 'percent' },
                { label: '영업이익률', value: latestMetrics.operating_margin, format: 'percent' },
                { label: 'ROA',       value: latestMetrics.roa,              format: 'percent' },
              ] as { label: string; value: number | null; format: MetricFormat }[]
            ).map(({ label, value, format }) => (
              <div key={label} style={{ padding: '10px 16px', textAlign: 'center' }}>
                <p style={{ fontSize: 10.5, color: 'var(--ink-3)', margin: 0 }}>{label}</p>
                <p style={{ marginTop: 3, fontSize: 15, fontWeight: 700, color: 'var(--ink)', fontFamily: 'var(--font-mono)' }}>
                  {formatValue(value, format)}
                </p>
              </div>
            ))}
          </div>
        )}

        {openSection === 'profit' && (
          <div style={{ ...divider, padding: '14px 16px' }}>
            <ExpandedPanel
              expandedKey="margin"
              sparkDataByKey={sparkDataByKey}
              incomeData={incomeData}
              marginData={marginData}
              uid={uid}
              onClose={() => {}}
              showClose={false}
            />
          </div>
        )}
      </section>

      {/* ── 3. 재무 건전성 ── */}
      <section className="eq-glass" style={{
        ...cardBase,
        borderColor: openSection === 'health' ? healthBorderColor : 'var(--line-2)',
      }}>
        <div
          style={{ display: 'flex', cursor: 'pointer', userSelect: 'none', alignItems: 'flex-start', justifyContent: 'space-between', padding: '12px 16px' }}
          onClick={() => toggleSection('health')}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>🛡️</span>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>재무 건전성</p>
              <p style={{ fontSize: 11, color: 'var(--ink-3)', margin: '2px 0 0' }}>부채비율 · FCF · 이자보상 · PER · PBR</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 2 }}>
            <span style={{ ...pillBase, ...healthBadgeStyle }}>
              {signal === 'good' ? '✓ 양호' : signal === 'warn' ? '⚠ 주의' : '✗ 위험'}
            </span>
            <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>{openSection === 'health' ? '▲' : '▼'}</span>
          </div>
        </div>

        {latestMetrics && (
          <div style={{ ...divider, display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 16px' }}>
            {[
              { label: `부채 ${formatValue(latestMetrics.debt_ratio, 'percent')}`, s: debtStatus },
              { label: `FCF ${latestMetrics.fcf != null ? formatLargeNumber(latestMetrics.fcf) : '—'}`, s: fcfStatus },
              { label: `이자보상 ${latestMetrics.icr != null ? `${latestMetrics.icr.toFixed(1)}x` : '—'}`, s: icrStatus },
              { label: `PER ${formatValue(latestMetrics.per, 'ratio')}`, s: perStatus },
              { label: `PBR ${formatValue(latestMetrics.pbr, 'ratio')}`, s: pbrStatus },
            ].map(({ label, s }) => (
              <span key={label} style={{
                borderRadius: 6, padding: '3px 9px',
                fontSize: 11, fontWeight: 500,
                ...statusStyle(s),
              }}>
                {label}
              </span>
            ))}
          </div>
        )}

        {openSection === 'health' && latestMetrics && (
          <div style={{ ...divider, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
              <ExpandedPanel expandedKey="debt_ratio" sparkDataByKey={sparkDataByKey} incomeData={incomeData} marginData={marginData} uid={uid} onClose={() => {}} showClose={false} />
              <ExpandedPanel expandedKey="fcf"        sparkDataByKey={sparkDataByKey} incomeData={incomeData} marginData={marginData} uid={uid} onClose={() => {}} showClose={false} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3,1fr)', gap: 10 }}>
              {(
                [
                  { label: '이자보상배율', value: latestMetrics.icr, format: 'ratio' },
                  { label: 'PER',         value: latestMetrics.per, format: 'ratio' },
                  { label: 'PBR',         value: latestMetrics.pbr, format: 'ratio' },
                ] as { label: string; value: number | null; format: MetricFormat }[]
              ).map(({ label, value, format }) => (
                <div key={label} className="eq-glass" style={{
                  borderRadius: 8,
                  padding: '10px 12px',
                }}>
                  <p style={{ fontSize: 10.5, color: 'var(--ink-3)', margin: 0 }}>{label}</p>
                  <p style={{ marginTop: 4, fontSize: 17, fontWeight: 700, color: 'var(--ink)', fontFamily: 'var(--font-mono)' }}>
                    {formatValue(value, format)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

    </div>
  )
}
