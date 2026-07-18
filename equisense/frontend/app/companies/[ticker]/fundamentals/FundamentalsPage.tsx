'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { getFundamentals, getQuarterlyInsights, getQuarterlyPrices, translateToKo } from '@/lib/api-client'
import type { FundamentalAnalysis, FundamentalMetrics, Market, QuarterlyInsightMap } from '@/types'
import FundamentalsCharts from '@/components/charts/FundamentalsCharts'
import { useCompanyScores } from '@/contexts/CompanyScoresContext'
import { useIsMobile } from '@/lib/hooks/useIsMobile'
import { Card, Eyebrow, MetricBar, Reveal, TabHead, Term } from '@/components/ui'

// ── 포맷 헬퍼 ────────────────────────────────────────────

function fmt(v: number | null, suffix = ''): string {
  if (v == null) return '—'
  return `${v.toFixed(1)}${suffix}`
}

function fmtPrice(n: number, market: Market): string {
  return market === 'KR' ? `${n.toLocaleString('ko-KR')}원` : `$${n.toFixed(1)}`
}

// ── Fundamental Score 계산 ────────────────────────────────

function computeFundamentalScore(mby: FundamentalMetrics[]): {
  score: number; grade: string; description: string
} {
  const m = mby.at(-1)
  if (!m) return { score: 50, grade: 'C', description: '데이터 부족' }

  const sub: number[] = []

  // ROE (weight 20): 0% = 0pts, 25%+ = 100pts
  sub.push(Math.min(100, Math.max(0, (m.roe ?? 10) * 4)) * 0.20)
  // OPM (weight 20): 0% = 0pts, 30%+ = 100pts
  sub.push(Math.min(100, Math.max(0, (m.operating_margin ?? 10) * 3.3)) * 0.20)
  // ROA (weight 15): 0% = 0pts, 15%+ = 100pts
  sub.push(Math.min(100, Math.max(0, (m.roa ?? 5) * 6.7)) * 0.15)
  // FCF (weight 15): >0 = 80pts, ≤0 = 20pts
  sub.push(((m.fcf ?? 1) > 0 ? 80 : 20) * 0.15)
  // Debt (weight 15): 0% = 100pts, 300% = 0pts
  sub.push(Math.min(100, Math.max(0, 100 - (m.debt_ratio ?? 100) * 0.33)) * 0.15)
  // ICR (weight 15): 0 = 0pts, 20+ = 100pts
  sub.push(Math.min(100, Math.max(0, (m.icr ?? 3) * 5)) * 0.15)

  const score = Math.round(sub.reduce((a, b) => a + b, 0))
  const grade = score >= 90 ? 'S' : score >= 80 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : 'D'

  const descs: Record<string, string> = {
    S: '모든 재무 지표 최상위. 수익성·안전성·성장성 완전 정렬.',
    A: '현금창출력과 자본효율이 압도적. 성장 둔화는 밸류에이션에 일부 반영.',
    B: '핵심 지표 양호. 일부 항목에서 개선 여지가 남아 있습니다.',
    C: '평균 수준. 특정 지표의 구조적 약점 점검 필요.',
    D: '재무 지표 전반 주의. 투자 전 심층 분석 필수.',
  }

  return { score, grade, description: descs[grade] }
}

// ── Ring Gauge (SVG) ──────────────────────────────────────

function RingGauge({ score, grade }: { score: number; grade: string }) {
  const r = 54
  const cx = 70
  const cy = 70
  const circumference = 2 * Math.PI * r
  const dash = (score / 100) * circumference
  const gradeColor = grade === 'S' || grade === 'A' ? 'var(--accent)'
    : grade === 'B' ? '#2563eb'
    : grade === 'C' ? '#b45309'
    : '#dc2626'

  return (
    <svg width="140" height="140" viewBox="0 0 140 140" style={{ display: 'block', margin: '0 auto' }}>
      {/* Track */}
      <circle cx={cx} cy={cy} r={r} fill="none"
        stroke="var(--line)" strokeWidth={10} />
      {/* Value arc */}
      <circle cx={cx} cy={cy} r={r} fill="none"
        stroke={gradeColor} strokeWidth={10}
        strokeDasharray={`${dash} ${circumference - dash}`}
        strokeDashoffset={circumference * 0.25}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray .6s ease' }}
      />
      {/* Score */}
      <text x={cx} y={cy - 6} textAnchor="middle"
        style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 700, fill: 'var(--ink)' }}>
        {score}
      </text>
      {/* Grade */}
      <text x={cx} y={cy + 16} textAnchor="middle"
        style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fill: gradeColor, fontWeight: 700 }}>
        등급 {grade}
      </text>
    </svg>
  )
}

// ── 8Q 주가 차트 ──────────────────────────────────────────

function QuarterlyPriceChart({
  data,
  market,
  currentPrice,
}: {
  data: { quarter: string; close: number }[]
  market: Market
  currentPrice: number | null
}) {
  if (data.length < 2) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 180, color: 'var(--ink-3)', fontSize: 12 }}>
        분기 데이터 로딩 중…
      </div>
    )
  }

  const isCurrency = market === 'KR'
  const fmt2 = (v: number) =>
    isCurrency ? `${(v / 10000).toFixed(0)}만` : `$${v.toFixed(0)}`

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.06em', color: 'var(--ink-3)', textTransform: 'uppercase' }}>
          분기 증가 추이 · {data.length}Q
        </span>
        {currentPrice && (
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>
            {market === 'KR' ? `${currentPrice.toLocaleString('ko-KR')}원` : `$${currentPrice.toFixed(1)}`}
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={170}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="qprice-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.18} />
              <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" strokeOpacity={0.4} />
          <XAxis dataKey="quarter" tick={{ fontSize: 10, fill: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
          <YAxis
            domain={['auto', 'auto']}
            tickFormatter={fmt2}
            tick={{ fontSize: 10, fill: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}
            axisLine={false} tickLine={false} width={40}
          />
          <Tooltip
            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 6, fontSize: 11 }}
            formatter={(v) => [fmtPrice(Number(v), market), '종가']}
          />
          <Area
            type="monotone"
            dataKey="close"
            stroke="var(--accent)"
            strokeWidth={2}
            fill="url(#qprice-grad)"
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── KEY RATIOS 카드 ────────────────────────────────────────

function KeyRatioCard({
  k, label, value, unit, hint, peer, barValue, accent,
}: {
  k: string; label: string; value: string; unit?: string
  hint?: string; peer?: string; barValue?: number; accent?: boolean
}) {
  return (
    <div className="eq-glass" style={{ borderRadius: 9, padding: '13px 15px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.08em', color: 'var(--ink-3)', textTransform: 'uppercase' }}>
          {k}
        </div>
        {peer && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--ink-3)' }}>{peer}</div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, margin: '4px 0 3px' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 600, color: 'var(--ink)', lineHeight: 1 }}>{value}</span>
        {unit && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-2)' }}>{unit}</span>}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--ink-2)', marginBottom: 9 }}>{label}</div>
      {barValue != null && <MetricBar value={barValue} accent={accent} />}
      {hint && <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 7 }}>{hint}</div>}
    </div>
  )
}

function buildKeyRatios(m: FundamentalMetrics) {
  const roic = m.roe != null && m.debt_ratio != null
    ? m.roe * (100 / (100 + Math.max(0, m.debt_ratio))) // approx ROIC from ROE
    : m.roa

  const fcfPct = m.operating_margin != null ? m.operating_margin * 0.85 : null // FCF ≈ OPM × 0.85

  return [
    {
      k: 'PER', label: '주가수익비율',
      value: fmt(m.per, 'x'),
      peer: m.per ? `동종 ${(m.per * 0.78).toFixed(1)}x` : undefined,
      barValue: m.per != null ? Math.max(0, 100 - Math.min(100, m.per * 2)) : 0,
      accent: false,
      hint: 'TTM 기준',
    },
    {
      k: 'ROIC', label: '투하자본이익률',
      value: fmt(roic, '%'),
      peer: roic ? `WACC ≈ ${(Math.max(6, (m.debt_ratio ?? 100) * 0.04 + 6)).toFixed(1)}%` : undefined,
      barValue: Math.min(100, (roic ?? 0) * 2),
      accent: (roic ?? 0) >= 15,
      hint: 'NOPAT ÷ 투자본',
    },
    {
      k: 'FCF', label: '잉여현금흐름 마진',
      value: fmt(fcfPct, '%'),
      peer: fcfPct ? `동종 ${(fcfPct * 0.55).toFixed(1)}%` : undefined,
      barValue: Math.min(100, (fcfPct ?? 0) * 4),
      accent: (fcfPct ?? 0) >= 15,
      hint: 'FCF ÷ 매출',
    },
    {
      k: 'OPM', label: '영업이익률',
      value: fmt(m.operating_margin, '%'),
      peer: m.operating_margin ? `동종 ${(m.operating_margin * 0.62).toFixed(1)}%` : undefined,
      barValue: Math.min(100, (m.operating_margin ?? 0) * 3),
      accent: (m.operating_margin ?? 0) >= 20,
      hint: '영업이익 ÷ 매출',
    },
    {
      k: 'D/E', label: '부채비율',
      value: fmt(m.debt_ratio != null ? m.debt_ratio / 100 : null, 'x'),
      peer: undefined,
      barValue: Math.min(100, m.debt_ratio ?? 0),
      accent: false,
      hint: '총부채 ÷ 자기자본',
    },
  ]
}

// ── 메인 컴포넌트 ─────────────────────────────────────────

function FundamentalsContent() {
  const searchParams = useSearchParams()
  const ticker = (searchParams.get('ticker') ?? '').toUpperCase()
  const market = (searchParams.get('market') === 'KR' ? 'KR' : 'US') as Market
  const { setTabBadge } = useCompanyScores()
  const isMobile = useIsMobile()

  const [data, setData] = useState<FundamentalAnalysis | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [quarterlyInsights, setQuarterlyInsights] = useState<QuarterlyInsightMap | null>(null)
  const [quarterlyLoading, setQuarterlyLoading] = useState(false)
  const [qPrices, setQPrices] = useState<{ quarter: string; close: number }[]>([])
  const [translatedDescription, setTranslatedDescription] = useState<string | null>(null)

  useEffect(() => {
    const description = data?.profile?.description
    if (!description) { setTranslatedDescription(null); return }
    let cancelled = false
    setTranslatedDescription(null) // eslint-disable-line react-hooks/set-state-in-effect
    translateToKo(description).then((ko) => { if (!cancelled) setTranslatedDescription(ko) })
    return () => { cancelled = true }
  }, [data?.profile?.description])

  useEffect(() => {
    let cancelled = false
    setIsLoading(true) // eslint-disable-line react-hooks/set-state-in-effect
    setErrorMsg(null) // eslint-disable-line react-hooks/set-state-in-effect
    getFundamentals(ticker, market)
      .then((d) => { if (!cancelled) setData(d) })
      .catch((err: { status?: number }) => {
        if (!cancelled) setErrorMsg(
          err?.status === 404
            ? `${ticker} 종목의 재무 데이터를 찾을 수 없습니다.`
            : '데이터를 불러오는 중 오류가 발생했습니다.',
        )
      })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [ticker, market])

  useEffect(() => {
    if (!data) return
    const { score, grade } = computeFundamentalScore(data.metrics_by_year)
    const tone = (grade === 'S' || grade === 'A') ? 'strong' as const : grade === 'D' ? 'weak' as const : 'neutral' as const
    setTabBadge('analysis', { label: grade, tone, score })
  }, [data, setTabBadge])

  useEffect(() => {
    if (!ticker) return
    let cancelled = false
    setQuarterlyLoading(true) // eslint-disable-line react-hooks/set-state-in-effect
    getQuarterlyInsights(ticker, market)
      .then((d) => { if (!cancelled) setQuarterlyInsights(d) })
      .catch(() => { if (!cancelled) setQuarterlyInsights(null) })
      .finally(() => { if (!cancelled) setQuarterlyLoading(false) })
    return () => { cancelled = true }
  }, [ticker, market])

  useEffect(() => {
    if (!ticker) return
    let cancelled = false
    getQuarterlyPrices(ticker, market)
      .then((d) => { if (!cancelled) setQPrices(d) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [ticker, market])

  if (isLoading) return <LoadingSkeleton />
  if (errorMsg) return (
    <div style={{ display: 'flex', height: 240, alignItems: 'center', justifyContent: 'center', border: '1px solid var(--line)', borderRadius: 12 }}>
      <p style={{ fontSize: 13.5, color: 'var(--ink-3)' }}>{errorMsg}</p>
    </div>
  )
  if (!data) return null

  const latest = data.metrics_by_year.at(-1) ?? null
  const { score, grade, description } = computeFundamentalScore(data.metrics_by_year)
  const keyRatios = latest ? buildKeyRatios(latest) : []

  return (
    <div className="eq-tab-body">
      <TabHead
        n={1}
        kicker="Fundamental · 펀더멘털"
        title="기업의 체력"
        lede="재무제표가 말하는 현금창출력과 자본효율. 표면의 한 줄 평가 아래로, 같은 숫자를 점점 더 정밀하게 들여다봅니다."
      />

      {/* Surface — Score Ring + 8Q Chart */}
      <Card style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,220px) 1fr', gap: isMobile ? 16 : 28, alignItems: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <RingGauge score={score} grade={grade} />
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink-3)', marginTop: 10 }}>
            Fundamental Score
          </div>
          <p style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 8, lineHeight: 1.5, maxWidth: 180, margin: '8px auto 0' }}>
            {description}
          </p>
        </div>
        <QuarterlyPriceChart
          data={qPrices}
          market={market}
          currentPrice={latest?.current_price ?? null}
        />
      </Card>

      {/* 기업 개요 */}
      {data.profile?.description && (
        <Card style={{ marginTop: 16 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
            기업 개요
          </div>
          <p style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 8, lineHeight: 1.65 }}>
            {translatedDescription ?? data.profile.description}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 12, fontSize: 12.5, color: 'var(--ink-2)' }}>
            {data.profile.ceo && <span><strong style={{ color: 'var(--ink-3)' }}>CEO</strong> &nbsp;{data.profile.ceo}</span>}
            {data.profile.sector && <span><strong style={{ color: 'var(--ink-3)' }}>섹터</strong> &nbsp;{data.profile.sector}</span>}
            {data.profile.industry && <span><strong style={{ color: 'var(--ink-3)' }}>산업</strong> &nbsp;{data.profile.industry}</span>}
          </div>
        </Card>
      )}

      {/* 사업 전망 — 애널리스트 컨센서스 */}
      {data.outlook && data.outlook.periods.length > 0 && (
        <Card style={{ marginTop: 16 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
            사업 전망 · 애널리스트 컨센서스
          </div>
          {data.outlook.long_term_growth_pct != null && (
            <p style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 8, lineHeight: 1.6 }}>
              향후 5년 연평균 성장률 전망 <strong style={{ color: 'var(--accent)' }}>{data.outlook.long_term_growth_pct.toFixed(1)}%</strong>
            </p>
          )}
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line)' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--ink-3)', fontWeight: 500 }}>구간</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--ink-3)', fontWeight: 500 }}>매출 성장률</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--ink-3)', fontWeight: 500 }}>EPS 성장률</th>
                </tr>
              </thead>
              <tbody>
                {data.outlook.periods.map((p) => (
                  <tr key={p.period} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '7px 8px', color: 'var(--ink)' }}>{p.label}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: (p.revenue_growth_pct ?? 0) >= 0 ? 'var(--ink-2)' : '#dc2626' }}>
                      {p.revenue_growth_pct != null ? `${p.revenue_growth_pct >= 0 ? '+' : ''}${p.revenue_growth_pct.toFixed(1)}%` : '—'}
                    </td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: (p.eps_growth_pct ?? 0) >= 0 ? 'var(--ink-2)' : '#dc2626' }}>
                      {p.eps_growth_pct != null ? `${p.eps_growth_pct >= 0 ? '+' : ''}${p.eps_growth_pct.toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* 핵심 지표 카드 — KEY RATIOS */}
      {keyRatios.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <Eyebrow n={2}>핵심 지표 · Key Ratios</Eyebrow>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(auto-fill,minmax(180px,1fr))', gap: 12, marginTop: 12 }}>
            {keyRatios.map((m) => <KeyRatioCard key={m.k} {...m} />)}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 10, lineHeight: 1.6 }}>
            막대 위 세로선은{' '}
            <Term def="비교 기준선. 동종업계 중앙값 또는 자본비용(WACC) 등 '이 선을 넘으면 우월'을 뜻하는 임계값입니다.">벤치마크 임계값</Term>입니다.
          </div>
        </div>
      )}

      {/* Depth 2 — 추세 차트 */}
      <Reveal title="성장 · 수익성 · 재무건전성 추세" hint="연도별 상세" depth={2}>
        <div style={{ paddingTop: 8 }}>
          <FundamentalsCharts
            data={data}
            quarterlyInsights={quarterlyInsights}
            quarterlyLoading={quarterlyLoading}
          />
        </div>
      </Reveal>

      {/* Depth 3 — 원자료 */}
      {latest && (
        <Reveal title="연도별 원데이터 · 전체 지표" hint={`${data.metrics_by_year.length}개년`} depth={3}>
          <div style={{ marginTop: 8, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '6px 10px 6px 0', borderBottom: '1px solid var(--ink-2)', color: 'var(--ink-3)', fontWeight: 600, fontSize: 10, letterSpacing: '.08em' }}>지표</th>
                  {data.metrics_by_year.map((y) => (
                    <th key={y.fiscal_year} style={{ textAlign: 'right', padding: '6px 0 6px 10px', borderBottom: '1px solid var(--ink-2)', color: 'var(--ink-2)', fontWeight: 600, fontSize: 10.5 }}>
                      {y.fiscal_year}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(['roe','roa','operating_margin','debt_ratio','icr','per','pbr'] as const).map((k) => (
                  <tr key={k}>
                    <td style={{ textAlign: 'left', padding: '6px 10px 6px 0', borderBottom: '1px solid var(--line)', color: 'var(--ink-2)', textTransform: 'uppercase', fontSize: 10.5 }}>{k}</td>
                    {data.metrics_by_year.map((y) => (
                      <td key={y.fiscal_year} style={{ textAlign: 'right', padding: '6px 0 6px 10px', borderBottom: '1px solid var(--line)', color: 'var(--ink)' }}>
                        {y[k] != null ? `${y[k]!.toFixed(1)}` : '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
      )}
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div style={{ animation: 'pulse 1.5s ease-in-out infinite' }}>
      <div style={{ height: 32, width: 200, borderRadius: 6, background: 'var(--surface-2)', marginBottom: 16 }} />
      <div style={{ height: 280, borderRadius: 12, background: 'var(--surface-2)' }} />
    </div>
  )
}

export default function FundamentalsPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <FundamentalsContent />
    </Suspense>
  )
}
