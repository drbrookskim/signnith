'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { Market, SentimentData } from '@/types'
import { fetchSentimentData, fetchGateAData } from '@/lib/api-client'
import { Card, Eyebrow, Reveal, TabHead } from '@/components/ui'
import QualitativeAnalysisView from '@/components/qualitative/QualitativeAnalysisView'
import { useCompanyScores } from '@/contexts/CompanyScoresContext'
import { useIsMobile } from '@/lib/hooks/useIsMobile'

// ── Fear-Greed 계산 ───────────────────────────────────────

function computeFearGreed(
  vix: number | null,
  bullishPct: number,
  shortPctOfFloat?: number | null,
  positionPct?: number | null,
): { score: number; label: string; description: string } {
  // VIX → 공포지수 기여 (inverse: 낮을수록 탐욕)
  const vixScore = vix == null ? 55
    : vix <= 12 ? 85 : vix <= 17 ? 70 : vix <= 22 ? 50 : vix <= 30 ? 30 : 15

  // 애널리스트 컨센서스 기여
  const consScore = Math.min(100, Math.max(0, bullishPct))

  // 공매도 비율 기여 (낮을수록 탐욕)
  const shortScore = shortPctOfFloat == null ? 55
    : shortPctOfFloat < 0.03 ? 78
    : shortPctOfFloat < 0.08 ? 60
    : shortPctOfFloat < 0.15 ? 40
    : shortPctOfFloat < 0.25 ? 24
    : 10

  // 52주 위치 기여 (높을수록 탐욕)
  const posScore = positionPct == null ? 55 : Math.min(100, Math.max(0, positionPct))

  const score = Math.round(
    vixScore * 0.30 + consScore * 0.30 + shortScore * 0.20 + posScore * 0.20,
  )
  const label = score >= 75 ? '극단적 탐욕' : score >= 55 ? '탐욕 Greed'
    : score >= 45 ? '중립 Neutral' : score >= 25 ? '공포 Fear' : '극단적 공포'
  const description = score >= 55
    ? '기관 심리 우호적 · 공매도 포지션 낮음 · 과열 구간 주의'
    : score >= 45
      ? '기관 심리 중립 · 방향성 탐색 구간'
      : '기관 심리 위축 · 공매도 포지션 높음 · 역발상 진입 고려'

  return { score, label, description }
}

// ── 경영진 신뢰도 계산 ────────────────────────────────────

function computeManagementGrade(
  sentiment: SentimentData | null,
  bullishPct: number,
): { grade: string; color: string } {
  if (!sentiment) return { grade: 'N/A', color: 'var(--ink-3)' }

  let score = 60

  // 내부자 거래 신호
  const insider = sentiment.insider_transactions ?? []
  const buyCount  = insider.filter((t) => t.transaction === 'buy').length
  const sellCount = insider.filter((t) => t.transaction === 'sell').length
  if (buyCount > sellCount) score += 15
  else if (sellCount > buyCount * 2) score -= 10

  // 컨센서스 기여
  score += (bullishPct - 50) * 0.4

  // 목표주가 괴리
  const consensus = sentiment.consensus
  if (consensus?.target_mean != null && consensus?.current_price != null) {
    const upside = (consensus.target_mean / consensus.current_price - 1) * 100
    if (upside > 20) score += 10
    else if (upside < -5) score -= 8
  }

  score = Math.max(0, Math.min(100, score))

  const grade = score >= 85 ? 'A+'
    : score >= 78 ? 'A'
    : score >= 70 ? 'A-'
    : score >= 62 ? 'B+'
    : score >= 54 ? 'B'
    : score >= 46 ? 'B-'
    : 'C+'
  const color = score >= 70 ? 'var(--accent)' : score >= 55 ? '#b45309' : '#dc2626'

  return { grade, color }
}

// ── Fear-Greed 반원 게이지 (SVG) ──────────────────────────

function FearGreedGauge({
  score,
  label,
}: {
  score: number
  label: string
}) {
  const cx = 140, cy = 130
  const r = 100
  // 반원: 180° → 0° (left → right), value at 180° - score*(180/100)
  const angleDeg = 180 - (score / 100) * 180
  const angleRad = (angleDeg * Math.PI) / 180
  const nx = cx + r * Math.cos(angleRad)
  const ny = cy - r * Math.sin(angleRad)

  // Arc segments (5 colors: extreme fear → extreme greed)
  const segments = [
    { start: 180, end: 144, color: '#dc2626' },  // extreme fear
    { start: 144, end: 108, color: '#f59e0b' },  // fear
    { start: 108, end:  72, color: '#6b7280' },  // neutral
    { start:  72, end:  36, color: '#10b981' },  // greed
    { start:  36, end:   0, color: '#059669' },  // extreme greed
  ]

  function arcPath(startDeg: number, endDeg: number, radius: number) {
    const s = (startDeg * Math.PI) / 180
    const e = (endDeg   * Math.PI) / 180
    const x1 = cx + radius * Math.cos(s)
    const y1 = cy - radius * Math.sin(s)
    const x2 = cx + radius * Math.cos(e)
    const y2 = cy - radius * Math.sin(e)
    return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${radius} ${radius} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`
  }

  return (
    <svg width="280" height="190" viewBox="0 0 280 190" style={{ display: 'block', margin: '0 auto' }}>
      {/* Background arcs */}
      {segments.map((seg) => (
        <path key={seg.start}
          d={arcPath(seg.start, seg.end, r)}
          fill="none" stroke={seg.color} strokeWidth={14}
          strokeLinecap="butt" opacity={0.25}
        />
      ))}
      {/* Active arc (0 → score) */}
      <path
        d={arcPath(180, 180 - (score / 100) * 180, r)}
        fill="none"
        stroke={
          score >= 75 ? '#059669' : score >= 55 ? '#10b981'
          : score >= 45 ? '#6b7280' : score >= 25 ? '#f59e0b' : '#dc2626'
        }
        strokeWidth={14}
        strokeLinecap="round"
      />
      {/* Needle */}
      <line
        x1={cx} y1={cy}
        x2={nx.toFixed(1)} y2={ny.toFixed(1)}
        stroke="var(--ink)" strokeWidth={2.5} strokeLinecap="round"
      />
      <circle cx={cx} cy={cy} r={6} fill="var(--ink)" />
      {/* Axis labels */}
      <text x={14} y={cy + 18} textAnchor="start"
        style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--ink-3)' }}>0 공포</text>
      <text x={266} y={cy + 18} textAnchor="end"
        style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--ink-3)' }}>탐욕 100</text>
      {/* Score — placed below the pivot so the needle (which only sweeps y ≤ cy) never crosses it */}
      <text x={cx} y={cy + 34} textAnchor="middle"
        style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 700, fill: 'var(--ink)' }}>
        {score}
      </text>
      {/* Label */}
      <text x={cx} y={cy + 52} textAnchor="middle"
        style={{ fontFamily: 'var(--font-ui)', fontSize: 12, fill: 'var(--ink-2)' }}>
        {label}
      </text>
    </svg>
  )
}

// ── 컨센서스 바 ────────────────────────────────────────────

function ConsensusBar({ data, market }: {
  data: SentimentData['consensus']
  market: Market
}) {
  if (!data) return <p style={{ fontSize: 12, color: 'var(--ink-3)' }}>데이터 없음</p>
  const { strong_buy, buy, hold, sell, strong_sell, total } = data
  const bullish = strong_buy + buy
  const bearish = sell + strong_sell

  function fmtPrice(n: number | null) {
    if (n == null) return '—'
    return market === 'KR' ? `${n.toLocaleString('ko-KR')}원` : `$${n.toFixed(0)}`
  }

  return (
    <div>
      {/* Main bar */}
      <div style={{ display: 'flex', height: 28, borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
        {bullish > 0 && (
          <div style={{ flex: bullish, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--bg)' }}>{bullish}</span>
          </div>
        )}
        {hold > 0 && (
          <div style={{ flex: hold, background: 'var(--ink-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--bg)' }}>{hold}</span>
          </div>
        )}
        {bearish > 0 && (
          <div style={{ flex: bearish, background: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--bg)' }}>{bearish}</span>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 16, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-2)', marginBottom: 12 }}>
        <span style={{ color: 'var(--accent)' }}>■ 매수 {total > 0 ? ((bullish/total)*100).toFixed(1) : '—'}%</span>
        <span style={{ color: 'var(--ink-3)' }}>■ 보유 {total > 0 ? ((hold/total)*100).toFixed(1) : '—'}%</span>
        <span style={{ color: '#dc2626' }}>■ 매도 {total > 0 ? ((bearish/total)*100).toFixed(1) : '—'}%</span>
      </div>

      {/* Target price range */}
      {data.target_mean != null && (
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-3)', marginBottom: 6 }}>
            목표주가 분포 · {total > 0 ? `${total}개 기관` : ''}
          </div>
          <div style={{ position: 'relative', height: 6, borderRadius: 3, background: 'var(--surface-2)', marginBottom: 6 }}>
            {data.target_low != null && data.target_high != null && data.target_mean != null && (
              <>
                {/* Filled range */}
                <div style={{
                  position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
                  background: 'var(--line-2)', borderRadius: 3,
                }} />
                {/* Mean tick */}
                <div style={{
                  position: 'absolute', top: -4, left: '50%',
                  width: 2, height: 14, background: 'var(--accent)', borderRadius: 1,
                }} />
              </>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
            <span style={{ color: 'var(--ink-3)' }}>{fmtPrice(data.target_low)}</span>
            <span style={{ color: 'var(--accent)', fontWeight: 700 }}>중앙값 {fmtPrice(data.target_mean)}</span>
            <span style={{ color: 'var(--ink-3)' }}>{fmtPrice(data.target_high)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 메인 컴포넌트 ─────────────────────────────────────────

function QualitativeContent() {
  const searchParams = useSearchParams()
  const ticker = (searchParams.get('ticker') ?? '').toUpperCase()
  const market = (searchParams.get('market') === 'KR' ? 'KR' : 'US') as Market
  const name = searchParams.get('name')
  const { setTabBadge } = useCompanyScores()
  const isMobile = useIsMobile()

  const [sentiment, setSentiment] = useState<SentimentData | null>(null)
  const [sentimentLoading, setSentimentLoading] = useState(true)
  const [vix, setVix] = useState<number | null>(null)

  useEffect(() => {
    if (!ticker) return
    let cancelled = false
    setSentimentLoading(true) // eslint-disable-line react-hooks/set-state-in-effect
    fetchSentimentData(ticker, market)
      .then((d) => { if (!cancelled) setSentiment(d) })
      .catch(() => { if (!cancelled) setSentiment(null) })
      .finally(() => { if (!cancelled) setSentimentLoading(false) })
    return () => { cancelled = true }
  }, [ticker, market])

  useEffect(() => {
    fetchGateAData()
      .then((d) => setVix(d.vix))
      .catch(() => {})
  }, [])

  const consensus = sentiment?.consensus
  const bullishPct = consensus && consensus.total > 0
    ? ((consensus.strong_buy + consensus.buy) / consensus.total) * 100
    : null

  useEffect(() => {
    if (bullishPct === null) return
    const tone = bullishPct >= 60 ? 'strong' as const : bullishPct < 40 ? 'weak' as const : 'neutral' as const
    const label = bullishPct >= 60 ? '매수' : bullishPct < 40 ? '매도' : '중립'
    setTabBadge('qualitative', { label, tone, score: Math.round(bullishPct) })
  }, [bullishPct, setTabBadge])

  const shortPct = sentiment?.short_data?.short_pct_of_float ?? null
  const positionPct = sentiment?.fifty_two_week?.position_pct ?? null

  const { score: fgScore, label: fgLabel, description: fgDesc } = computeFearGreed(
    vix, bullishPct ?? 55, shortPct, positionPct,
  )
  const { grade: mgmtGrade, color: mgmtColor } = computeManagementGrade(sentiment, bullishPct ?? 55)

  // 매수 컨센서스 추이 — 실제 3개월 데이터 (가짜 시뮬레이션 제거)
  const fgHistory = sentiment?.rec_trend?.length
    ? [...sentiment.rec_trend].reverse().map((t) => {
        const total = t.strong_buy + t.buy + t.hold + t.sell + t.strong_sell
        const bullPct = total > 0 ? Math.round(((t.strong_buy + t.buy) / total) * 100) : 0
        const label = t.period === '0m' ? '현재' : t.period === '-1m' ? '1개월전'
          : t.period === '-2m' ? '2개월전' : '3개월전'
        return { week: label, score: bullPct }
      })
    : []

  // 업/다운그레이드 집계 (90일)
  const udHistory = sentiment?.upgrade_downgrade ?? []
  const upgradeCount = udHistory.filter(u => u.action === 'up').length
  const downgradeCount = udHistory.filter(u => u.action === 'down').length

  const fmtDate = (dt: string) =>
    !dt || dt.length !== 8 ? dt
    : `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}`

  return (
    <div className="eq-tab-body">
      <TabHead
        n={3}
        kicker="Qualitative · 정성·심리"
        title="시장의 믿음이 향하는 방향"
        lede="숫자가 닿지 못하는 영역 — 경영진의 언어, 뉴스의 결, 군중의 정서. AI가 정성 신호를 읽어 한 편의 메모로 압축하고, 그 근거를 단계적으로 펼칩니다."
      />

      {/* Surface — Fear-Greed 게이지 + AI 메모 */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,300px) 1fr', gap: isMobile ? 16 : 28 }}>
        {/* Left: Fear-Greed */}
        <Card style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Eyebrow>시장 심리 지수 · Fear-Greed</Eyebrow>
          <div style={{ marginTop: 12, width: '100%' }}>
            {sentimentLoading ? (
              <div style={{ height: 190, borderRadius: 6, background: 'var(--surface-2)', animation: 'pulse 1.5s ease-in-out infinite' }} />
            ) : (
              <FearGreedGauge score={fgScore} label={fgLabel} />
            )}
          </div>
          {!sentimentLoading && (
            <>
              <p style={{ fontSize: 11.5, color: 'var(--ink-3)', textAlign: 'center', marginTop: 8, lineHeight: 1.5, maxWidth: 220 }}>
                {fgDesc}
              </p>
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)', width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)' }}>경영진 신뢰도</span>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: mgmtColor }}>{mgmtGrade}</span>
              </div>
            </>
          )}
        </Card>

        {/* Right: AI memo */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <span style={{
              width: 26, height: 26, borderRadius: 6, background: 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--bg)',
            }}>AI</span>
            <Eyebrow>정성 종합 분석 · Generated</Eyebrow>
          </div>
          <QualitativeAnalysisView ticker={ticker} market={market} name={name} />
        </Card>
      </div>

      {/* Depth 2 — 컨센서스 추이 + 컨센서스 현황 */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr minmax(0,340px)', gap: isMobile ? 16 : 28, marginTop: 22 }}>
        {/* 매수 컨센서스 추이 3개월 */}
        <Card>
          <Eyebrow n={2}>매수 컨센서스 추이 · 3개월</Eyebrow>
          <div style={{ marginTop: 12 }}>
            {fgHistory.length > 0 ? (
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={fgHistory} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fg-hist-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" strokeOpacity={0.4} />
                  <XAxis dataKey="week" tick={{ fontSize: 9, fill: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: 'var(--ink-3)' }} axisLine={false} tickLine={false} width={28}
                    tickFormatter={(v: number) => `${v}%`} />
                  <Tooltip
                    contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 6, fontSize: 10 }}
                    formatter={(v) => [`${v}%`, '매수 비중']}
                  />
                  <Area type="monotone" dataKey="score" stroke="var(--accent)" strokeWidth={2} fill="url(#fg-hist-grad)" dot={{ fill: 'var(--accent)', r: 3 }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <p style={{ fontSize: 12, color: 'var(--ink-3)' }}>데이터 없음</p>
              </div>
            )}
          </div>
        </Card>

        {/* 애널리스트 컨센서스 */}
        <Card>
          <Eyebrow n={2}>애널리스트 컨센서스</Eyebrow>
          <div style={{ marginTop: 12 }}>
            {sentimentLoading ? (
              <div style={{ height: 80, borderRadius: 6, background: 'var(--surface-2)', animation: 'pulse 1.5s ease-in-out infinite' }} />
            ) : (
              <ConsensusBar data={consensus ?? null} market={market} />
            )}
          </div>
        </Card>
      </div>

      {/* Depth 2 — 포지셔닝 신호 */}
      <Card style={{ marginTop: 22 }}>
        <Eyebrow n={2}>포지셔닝 신호 · Positioning</Eyebrow>
        {sentimentLoading ? (
          <div style={{ height: 60, borderRadius: 6, background: 'var(--surface-2)', marginTop: 12, animation: 'pulse 1.5s ease-in-out infinite' }} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: isMobile ? 20 : 28, marginTop: 14 }}>

            {/* 공매도 비율 */}
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-3)', marginBottom: 6, letterSpacing: '.04em' }}>공매도 비율 · Short Float</div>
              {shortPct != null ? (() => {
                const pct = shortPct * 100
                const color = pct < 3 ? 'var(--accent)' : pct < 8 ? '#b45309' : '#dc2626'
                const signal = pct < 3 ? '낮음 — 베어 포지션 경미'
                  : pct < 8 ? '보통 — 일부 헤지 포지션'
                  : pct < 15 ? '높음 — 강한 베어 포지셔닝'
                  : '매우 높음 — 숏 스퀴즈 가능성'
                return (
                  <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color, lineHeight: 1 }}>
                      {pct.toFixed(1)}<span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink-3)', marginLeft: 2 }}>%</span>
                    </div>
                    <div style={{ fontSize: 11, color, marginTop: 4 }}>{signal}</div>
                    {sentiment?.short_data?.short_ratio != null && (
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-3)', marginTop: 4 }}>
                        커버일수 {sentiment.short_data.short_ratio.toFixed(1)}일
                      </div>
                    )}
                  </div>
                )
              })() : (
                <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>데이터 없음</div>
              )}
            </div>

            {/* 52주 위치 */}
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-3)', marginBottom: 6, letterSpacing: '.04em' }}>52주 위치 · 52W Range</div>
              {positionPct != null && sentiment?.fifty_two_week ? (() => {
                const { low, high, current } = sentiment.fifty_two_week
                const color = positionPct >= 70 ? 'var(--accent)' : positionPct >= 40 ? '#b45309' : '#dc2626'
                const signal = positionPct >= 80 ? '신고점 근방 — 강한 모멘텀'
                  : positionPct >= 60 ? '상단 구간 — 강세'
                  : positionPct >= 40 ? '중간 구간 — 중립'
                  : positionPct >= 20 ? '하단 구간 — 약세'
                  : '신저점 근방 — 역발상 검토'
                return (
                  <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color, lineHeight: 1 }}>
                      {positionPct.toFixed(0)}<span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink-3)', marginLeft: 2 }}>%</span>
                    </div>
                    <div style={{ margin: '8px 0 4px', position: 'relative', height: 5, borderRadius: 3, background: 'var(--surface-2)' }}>
                      <div style={{
                        position: 'absolute', top: 0, bottom: 0, left: 0,
                        width: `${positionPct}%`, background: color, borderRadius: 3,
                      }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-3)' }}>
                      <span>{low?.toFixed(0) ?? '—'}</span>
                      <span style={{ fontSize: 11, color }}>{signal}</span>
                      <span>{high?.toFixed(0) ?? '—'}</span>
                    </div>
                    {current != null && (
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-3)', marginTop: 4 }}>현재가 {current.toFixed(2)}</div>
                    )}
                  </div>
                )
              })() : (
                <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>데이터 없음</div>
              )}
            </div>

            {/* 업/다운그레이드 90일 */}
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-3)', marginBottom: 6, letterSpacing: '.04em' }}>등급 변경 90일 · Upgrade/Downgrade</div>
              {upgradeCount + downgradeCount > 0 ? (
                <div>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'baseline' }}>
                    <div>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color: 'var(--accent)', lineHeight: 1 }}>{upgradeCount}</div>
                      <div style={{ fontSize: 10, color: 'var(--accent)', marginTop: 3 }}>↑ 업그레이드</div>
                    </div>
                    <div>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color: '#dc2626', lineHeight: 1 }}>{downgradeCount}</div>
                      <div style={{ fontSize: 10, color: '#dc2626', marginTop: 3 }}>↓ 다운그레이드</div>
                    </div>
                  </div>
                  {upgradeCount !== downgradeCount && (
                    <div style={{ fontSize: 11, color: upgradeCount > downgradeCount ? 'var(--accent)' : '#dc2626', marginTop: 8 }}>
                      {upgradeCount > downgradeCount
                        ? `업그레이드 우세 — 모멘텀 상승`
                        : `다운그레이드 우세 — 목표가 하향 압력`}
                    </div>
                  )}
                  {udHistory.slice(0, 3).map((u, i) => (
                    <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8, fontSize: 10.5, color: 'var(--ink-2)' }}>
                      <span style={{ color: u.action === 'up' ? 'var(--accent)' : '#dc2626', fontWeight: 700 }}>
                        {u.action === 'up' ? '↑' : '↓'}
                      </span>
                      <span style={{ color: 'var(--ink-3)', flexShrink: 0 }}>{u.date}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.firm}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>데이터 없음</div>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* Depth 3 — 어닝 서프라이즈 */}
      <Reveal title="어닝 서프라이즈" hint="컨센서스 대비 실제 EPS" depth={2}>
        {sentimentLoading ? (
          <div style={{ height: 60, borderRadius: 6, background: 'var(--surface-2)', marginTop: 8, animation: 'pulse 1.5s ease-in-out infinite' }} />
        ) : sentiment?.earnings_surprises && sentiment.earnings_surprises.length > 0 ? (
          <div style={{ marginTop: 8 }}>
            {sentiment.earnings_surprises.map((s, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                padding: '10px 0', borderBottom: i < sentiment.earnings_surprises.length - 1 ? '1px solid var(--line)' : 'none',
              }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)', flexShrink: 0 }}>{s.quarter}</span>
                {!isMobile && (
                  <div style={{ display: 'flex', gap: 16, flex: 1 }}>
                    <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>예상 {s.eps_estimate != null ? s.eps_estimate.toFixed(2) : '—'}</span>
                    <span style={{ fontSize: 12, color: 'var(--ink)' }}>실제 {s.eps_actual != null ? s.eps_actual.toFixed(2) : '—'}</span>
                  </div>
                )}
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700,
                  color: (s.surprise_pct ?? 0) >= 0 ? 'var(--accent)' : 'var(--ink-2)',
                  flexShrink: 0,
                }}>
                  {s.surprise_pct != null ? `${s.surprise_pct > 0 ? '+' : ''}${s.surprise_pct.toFixed(1)}%` : '—'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-3)' }}>어닝 서프라이즈 데이터가 없습니다.</p>
        )}
      </Reveal>

      {/* Depth 3 — 내부자 거래 + 기관 보유 */}
      <Reveal title="내부자 거래 · 기관 보유" hint="원신호 · 90일" depth={3}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 16 : 28, marginTop: 8 }}>
          <div>
            <Eyebrow>내부자 거래 · Insider</Eyebrow>
            <div style={{ marginTop: 10 }}>
              {sentimentLoading ? (
                <div style={{ height: 80, borderRadius: 6, background: 'var(--surface-2)', animation: 'pulse 1.5s ease-in-out infinite' }} />
              ) : sentiment?.insider_transactions && sentiment.insider_transactions.length > 0 ? (
                sentiment.insider_transactions.slice(0, 6).map((it, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 0', borderBottom: i < 5 ? '1px solid var(--line)' : 'none',
                  }}>
                    <div>
                      <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 600 }}>{it.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>{it.relation} · {it.date}</div>
                    </div>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700,
                      color: it.transaction === 'buy' ? 'var(--accent)' : 'var(--ink-2)',
                    }}>
                      {it.transaction === 'buy' ? '매수' : it.transaction === 'sell' ? '매도' : '기타'}
                      {it.shares != null && ` ${it.shares.toLocaleString()}`}
                    </span>
                  </div>
                ))
              ) : (
                <p style={{ fontSize: 12, color: 'var(--ink-3)' }}>데이터 없음</p>
              )}
            </div>
          </div>

          <div>
            <Eyebrow>기관 보유 · Institution</Eyebrow>
            <div style={{ marginTop: 10 }}>
              {sentimentLoading ? (
                <div style={{ height: 80, borderRadius: 6, background: 'var(--surface-2)', animation: 'pulse 1.5s ease-in-out infinite' }} />
              ) : sentiment?.institution_holders && sentiment.institution_holders.length > 0 ? (
                sentiment.institution_holders.slice(0, 6).map((ih, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 0', borderBottom: i < 5 ? '1px solid var(--line)' : 'none',
                  }}>
                    <div>
                      <div style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: 500 }}>{ih.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>{ih.report_date}</div>
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--ink)', fontWeight: 700 }}>
                      {ih.pct_held != null ? `${ih.pct_held.toFixed(2)}%` : '—'}
                    </span>
                  </div>
                ))
              ) : (
                <p style={{ fontSize: 12, color: 'var(--ink-3)' }}>데이터 없음</p>
              )}
            </div>
          </div>
        </div>

        {market === 'KR' && sentiment?.disclosures && sentiment.disclosures.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <Eyebrow>DART 주요 공시</Eyebrow>
            <div style={{ marginTop: 10 }}>
              {sentiment.disclosures.slice(0, 5).map((d, i) => (
                <div key={d.rcept_no} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '9px 0', borderBottom: i < 4 ? '1px solid var(--line)' : 'none', gap: 12,
                }}>
                  <span style={{ fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.4, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.report_nm}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)', flexShrink: 0 }}>
                    {fmtDate(d.rcept_dt)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Reveal>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div style={{ animation: 'pulse 1.5s ease-in-out infinite' }}>
      <div style={{ height: 32, width: 200, borderRadius: 6, background: 'var(--surface-2)', marginBottom: 16 }} />
      <div style={{ height: 200, borderRadius: 12, background: 'var(--surface-2)' }} />
    </div>
  )
}

export default function QualitativePage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <QualitativeContent />
    </Suspense>
  )
}
