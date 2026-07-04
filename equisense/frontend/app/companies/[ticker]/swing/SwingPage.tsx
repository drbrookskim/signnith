'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Bar, CartesianGrid, Cell, ComposedChart, Line,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import type {
  FundamentalAnalysis, GateAResult, GateBResult,
  Market, QuarterlyInsightMap, RRInput, StockType, SwingFinalResult,
  TechnicalAnalysis,
} from '@/types'
import { getFundamentals, getQuarterlyInsights, getTechnicalData } from '@/lib/api-client'
import { checkRR, getTimeStop, getFinalVerdict } from '@/lib/adapters/swingPipeline'
import { computeIndicators } from '@/lib/adapters/technicalIndicators'
import GateAPanel from '@/components/swing/GateAPanel'
import GateBPanel from '@/components/swing/GateBPanel'
import SwingScoreDrawer from '@/components/swing/SwingScoreDrawer'
import { Card, Eyebrow, Reveal, Stat, TabHead, Verdict } from '@/components/ui'
import type { VerdictTone } from '@/components/ui'
import { useCompanyScores } from '@/contexts/CompanyScoresContext'
import { useIsMobile } from '@/lib/hooks/useIsMobile'

function fmtKR(n: number) { return n.toLocaleString('ko-KR') }

function fmtPrice(n: number, market: Market) {
  return market === 'KR' ? `${fmtKR(n)}원` : `$${n.toFixed(2)}`
}

const STOCK_TYPE_LABEL: Record<StockType, string> = {
  high_beta: '고베타 (10거래일)',
  value: '가치형 (15거래일)',
  small_cap: '소형 (10거래일)',
}

const FINAL_VERDICT_LABEL: Record<SwingFinalResult['verdict'], string> = {
  PASS: 'PASS · 진입 가능',
  CONDITIONAL: 'CONDITIONAL · 조건부',
  BLOCK: 'BLOCK · 진입 불가',
}
const FINAL_VERDICT_TONE: Record<SwingFinalResult['verdict'], VerdictTone> = {
  PASS: 'strong', CONDITIONAL: 'neutral', BLOCK: 'weak',
}

// ── SEPA 조건 체크 ────────────────────────────────────────

interface SepaCheck {
  label: string
  pass: boolean | null
  detail: string
}

function buildSepaChecklist(tech: TechnicalAnalysis | null): { checks: SepaCheck[]; score: number } {
  if (!tech || tech.data_points.length < 200) {
    return { checks: [], score: 0 }
  }

  const pts = tech.data_points
  const indicators = computeIndicators(pts)
  const last = indicators.at(-1)
  const close = pts.at(-1)?.close ?? null

  if (!last || close == null) return { checks: [], score: 0 }

  // MA200 slope (비교 last vs ~20일 전)
  const ma200Now = last.ma200
  const ma200Past = indicators.at(-21)?.ma200 ?? null
  const ma200Rising = ma200Now != null && ma200Past != null && ma200Now > ma200Past

  // MA150 vs MA200
  const ma150GtMa200 = last.ma150 != null && last.ma200 != null && last.ma150 > last.ma200

  // MA150 slope
  const ma150Past = indicators.at(-21)?.ma150 ?? null
  const ma150Rising = last.ma150 != null && ma150Past != null && last.ma150 > ma150Past

  const checks: SepaCheck[] = [
    {
      label: '현재가 > 150·200일선',
      pass: last.ma150 != null && last.ma200 != null
        ? close > last.ma150 && close > last.ma200
        : null,
      detail: `현재가 ${close.toFixed(1)} / MA150 ${last.ma150?.toFixed(1) ?? '—'} / MA200 ${last.ma200?.toFixed(1) ?? '—'}`,
    },
    {
      label: '150일선 > 200일선',
      pass: ma150GtMa200,
      detail: `MA150 ${last.ma150?.toFixed(1) ?? '—'} > MA200 ${last.ma200?.toFixed(1) ?? '—'}`,
    },
    {
      label: '200일선 상승 추세',
      pass: ma200Rising,
      detail: `MA200 ${ma200Past?.toFixed(1) ?? '—'} → ${ma200Now?.toFixed(1) ?? '—'} (20일 변화)`,
    },
    {
      label: '현재가 > 50일선',
      pass: last.ma50 != null ? close > last.ma50 : null,
      detail: `현재가 ${close.toFixed(1)} / MA50 ${last.ma50?.toFixed(1) ?? '—'}`,
    },
    {
      label: '50일선 > 150·200일선',
      pass: last.ma50 != null && last.ma150 != null && last.ma200 != null
        ? last.ma50 > last.ma150 && last.ma50 > last.ma200
        : null,
      detail: `MA50 ${last.ma50?.toFixed(1) ?? '—'} / MA150 ${last.ma150?.toFixed(1) ?? '—'} / MA200 ${last.ma200?.toFixed(1) ?? '—'}`,
    },
    {
      label: '150일선 상승 추세',
      pass: ma150Rising,
      detail: `MA150 ${ma150Past?.toFixed(1) ?? '—'} → ${last.ma150?.toFixed(1) ?? '—'} (20일 변화)`,
    },
    {
      label: 'RSI > 50 (상승 모멘텀)',
      pass: last.rsi != null ? last.rsi > 50 : null,
      detail: `RSI(14) = ${last.rsi?.toFixed(1) ?? '—'}`,
    },
    {
      label: 'MACD > 시그널라인',
      pass: last.macd != null && last.macdSignal != null
        ? last.macd > last.macdSignal
        : null,
      detail: `MACD ${last.macd?.toFixed(2) ?? '—'} / Signal ${last.macdSignal?.toFixed(2) ?? '—'}`,
    },
  ]

  const validChecks = checks.filter((c) => c.pass !== null)
  const passCount = validChecks.filter((c) => c.pass === true).length
  const score = validChecks.length > 0 ? passCount : 0

  return { checks, score }
}

// ── 스윙 캔들차트 ─────────────────────────────────────────

function SwingChart({
  tech,
  entry,
  stop,
  target,
  market,
}: {
  tech: TechnicalAnalysis
  entry: number
  stop: number
  target: number
  market: Market
}) {
  const pts = tech.data_points.slice(-120) // 최근 120일
  const indicators = computeIndicators(tech.data_points)
  const slicedIndicators = indicators.slice(-120)

  const chartData = pts.map((p, i) => ({
    date: p.date.slice(5), // MM-DD
    open: p.open,
    close: p.close,
    high: p.high,
    low: p.low,
    volume: p.volume,
    // candlestick: use close for OHLC approximation with bar
    candle: p.close,
    isUp: (p.close ?? 0) >= (p.open ?? 0),
    ma50:  slicedIndicators[i]?.ma50  ?? null,
    ma150: slicedIndicators[i]?.ma150 ?? null,
    ma200: slicedIndicators[i]?.ma200 ?? null,
  }))

  const prices = pts.map((p) => p.close).filter((v): v is number => v != null)
  const minPrice = Math.min(...prices) * 0.97
  const maxPrice = Math.max(...prices) * 1.03

  function fmtTick(v: number) {
    return market === 'KR' ? `${(v / 10000).toFixed(0)}만` : `$${v.toFixed(0)}`
  }

  // Thin every-other label for readability
  const tickInterval = Math.floor(chartData.length / 6)

  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" strokeOpacity={0.35} />
        <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}
          axisLine={false} tickLine={false} interval={tickInterval} />
        <YAxis domain={[minPrice, maxPrice]} tickFormatter={fmtTick}
          tick={{ fontSize: 9, fill: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}
          axisLine={false} tickLine={false} width={42} />
        <Tooltip
          contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 6, fontSize: 10 }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(v: any, name: any) => [
            name === 'candle' ? (market === 'KR' ? `${Number(v).toLocaleString()}원` : `$${Number(v).toFixed(2)}`) : Number(v)?.toFixed(2) ?? '—',
            name === 'candle' ? '종가' : name,
          ]}
          labelFormatter={(l) => l}
        />

        {/* Reference lines */}
        <ReferenceLine y={entry} stroke="var(--accent)" strokeDasharray="5 3" strokeWidth={1.5} />
        <ReferenceLine y={stop} stroke="#dc2626" strokeDasharray="5 3" strokeWidth={1.5} />
        <ReferenceLine y={target} stroke="#2563eb" strokeDasharray="5 3" strokeWidth={1.5} />

        {/* Moving averages */}
        <Line type="monotone" dataKey="ma50" stroke="#f59e0b" strokeWidth={1.5} dot={false} name="MA50" connectNulls />
        <Line type="monotone" dataKey="ma150" stroke="#a78bfa" strokeWidth={1.5} dot={false} name="MA150" connectNulls />
        <Line type="monotone" dataKey="ma200" stroke="#60a5fa" strokeWidth={1.5} dot={false} name="MA200" connectNulls />

        {/* Price bars (candlestick proxy) */}
        <Bar dataKey="candle" name="종가" maxBarSize={4}>
          {chartData.map((d, i) => (
            <Cell key={i} fill={d.isUp ? '#dc2626' : '#2563eb'} opacity={0.85} />
          ))}
        </Bar>
      </ComposedChart>
    </ResponsiveContainer>
  )
}

// ── T/E/S 박스 ────────────────────────────────────────────

function TESBoxes({
  rrInput,
  setRRInput,
  market,
  isMobile = false,
}: {
  rrInput: RRInput
  setRRInput: React.Dispatch<React.SetStateAction<RRInput | null>>
  market: Market
  isMobile?: boolean
}) {
  const boxes = [
    {
      k: '목표', sub: 'TARGET (T)', value: fmtPrice(rrInput.target, market),
      color: '#2563eb', field: 'target' as const,
    },
    {
      k: '진입', sub: 'ENTRY (E)', value: fmtPrice(rrInput.entry, market),
      color: 'var(--accent)', field: null,
    },
    {
      k: '손절', sub: 'STOP (S)', value: fmtPrice(rrInput.stop, market),
      color: '#dc2626', field: 'stop' as const,
    },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 12 }}>
      {boxes.map((b) => (
        <div key={b.k} className="eq-glass" style={{
          borderLeft: `3px solid ${b.color}`,
          borderRadius: 8, padding: '14px 16px',
        }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.1em', color: 'var(--ink-3)', textTransform: 'uppercase', marginBottom: 6 }}>
            {b.sub}
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: isMobile ? 16 : 22, fontWeight: 700, color: b.color, lineHeight: 1 }}>
            {b.value}
          </div>
          {b.field && (
            <input
              type="number"
              step={market === 'KR' ? 1000 : 1}
              value={rrInput[b.field]}
              onChange={(e) => {
                const v = parseFloat(e.target.value)
                if (!isNaN(v)) setRRInput((p) => p ? { ...p, [b.field!]: v } : p)
              }}
              style={{
                marginTop: 6, width: '100%', background: 'transparent', fontSize: 10,
                color: 'var(--ink-3)', outline: 'none', border: 'none',
                borderBottom: '1px solid var(--line-2)', padding: '2px 0',
              }}
              placeholder="수정 가능"
            />
          )}
        </div>
      ))}
    </div>
  )
}

// ── 메인 ──────────────────────────────────────────────────

function SwingContent() {
  const searchParams = useSearchParams()
  const ticker = (searchParams.get('ticker') ?? '').toUpperCase()
  const market = (searchParams.get('market') === 'KR' ? 'KR' : 'US') as Market
  const { setTabBadge } = useCompanyScores()
  const isMobile = useIsMobile()

  const [fundamentals, setFundamentals] = useState<FundamentalAnalysis | null>(null)
  const [quarterlyInsights, setQuarterlyInsights] = useState<QuarterlyInsightMap | null>(null)
  const [quarterlyLoading, setQuarterlyLoading] = useState(false)
  const [tech, setTech] = useState<TechnicalAnalysis | null>(null)
  const [gateAResult, setGateAResult] = useState<GateAResult | null>(null)
  const [gateBResult, setGateBResult] = useState<GateBResult | null>(null)
  const [stockType, setStockType] = useState<StockType>('high_beta')
  const [rrInput, setRRInput] = useState<RRInput | null>(null)
  const [final, setFinal] = useState<SwingFinalResult | null>(null)

  useEffect(() => {
    if (!ticker) return
    getFundamentals(ticker, market).then(setFundamentals).catch(() => {})
  }, [ticker, market])

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
    getTechnicalData(ticker, market, '1y')
      .then(setTech)
      .catch(() => {})
  }, [ticker, market])

  useEffect(() => {
    const latest = fundamentals?.metrics_by_year.at(-1)
    if (!latest?.current_price) return
    const entry = latest.current_price
    const stop = market === 'KR'
      ? Math.round(entry * 0.95 / 1000) * 1000
      : Math.round(entry * 0.95 * 100) / 100
    const target = latest.week52_high
      ? (market === 'KR' ? Math.round(latest.week52_high * 1.05 / 1000) * 1000 : Math.round(latest.week52_high * 1.05 * 100) / 100)
      : (market === 'KR' ? Math.round(entry * 1.20 / 1000) * 1000 : Math.round(entry * 1.20 * 100) / 100)
    setRRInput({ entry, stop, target }) // eslint-disable-line react-hooks/set-state-in-effect
  }, [fundamentals, market])

  useEffect(() => {
    if (!gateAResult || !gateBResult || !rrInput) return
    const latest = fundamentals?.metrics_by_year.at(-1)
    const step1Pass = (latest?.debt_ratio ?? Infinity) <= 200 && (latest?.fcf ?? 0) > 0
    const rr = checkRR(rrInput)
    const result = getFinalVerdict(
      gateAResult.verdict, gateBResult.verdict, step1Pass, rr,
      rrInput.entry, rrInput.stop, rrInput.target, stockType,
    )
    setFinal(result) // eslint-disable-line react-hooks/set-state-in-effect
  }, [gateAResult, gateBResult, rrInput, fundamentals, stockType])

  useEffect(() => {
    if (!final) return
    const tone = final.verdict === 'PASS' ? 'strong' as const : final.verdict === 'CONDITIONAL' ? 'neutral' as const : 'weak' as const
    const score = final.verdict === 'PASS' ? 90 : final.verdict === 'CONDITIONAL' ? 62 : 20
    setTabBadge('swing', { label: final.verdict, tone, score })
  }, [final, setTabBadge])

  const gateABlocked = gateAResult?.verdict === 'BLOCK'
  const gateBBlocked = gateABlocked || gateBResult?.verdict === 'BLOCK'
  const rr = rrInput ? checkRR(rrInput) : null
  const latest = fundamentals?.metrics_by_year.at(-1)
  const timeStop = getTimeStop(new Date(), stockType)

  const { checks: sepaChecks, score: sepaScore } = buildSepaChecklist(tech)

  return (
    <div className="eq-tab-body">
      <TabHead
        n={4}
        kicker="Technical · SEPA 스윙"
        title="투자자의 판단 (feat. 얼마에 사고 팔아야 할까)"
        lede="좋은 기업이라도 진입 타이밍은 별개의 규율. Minervini의 SEPA 추세 템플릿으로 추세 정합성을 채점하고, 진입·손절·목표를 한 화면에서 판정합니다."
      />

      {/* Surface — 최종 판정 카드 */}
      {final && (
        <Card style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'auto 1px 1fr', gap: isMobile ? 16 : 26, alignItems: 'center', marginBottom: 22 }}>
          <div style={{ textAlign: 'center', minWidth: isMobile ? 0 : 140 }}>
            <Verdict label={FINAL_VERDICT_LABEL[final.verdict]} tone={FINAL_VERDICT_TONE[final.verdict]} big />
            <p style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 10, lineHeight: 1.5 }}>{final.summary_line}</p>
          </div>
          {!isMobile && <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--line)' }} />}
          <div style={{ display: 'flex', gap: isMobile ? 20 : 32, flexWrap: 'wrap' }}>
            <Stat
              value={`${sepaScore}/${sepaChecks.filter((c) => c.pass !== null).length || 8}`}
              label="추세 템플릿 동과"
              sub="SEPA Trend Template"
            />
            <Stat
              value={rr ? rr.rr.toFixed(2) : '—'}
              unit=": 1"
              label="손익비 R-Multiple"
              sub={rr ? `손익분기 승률 ${rr.breakeven_winrate}%` : undefined}
            />
            {rrInput && (
              <Stat
                value={fmtPrice(rrInput.entry, market)}
                label="현재가"
              />
            )}
          </div>
        </Card>
      )}

      {/* 스윙 차트 */}
      {tech && rrInput && (
        <Card style={{ marginBottom: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <Eyebrow>일봉 · 이동평균 · 진입 레벨</Eyebrow>
            <div style={{ display: 'flex', gap: 12, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-3)' }}>
              <span style={{ color: '#f59e0b' }}>— 50</span>
              <span style={{ color: '#a78bfa' }}>— 150</span>
              <span style={{ color: '#60a5fa' }}>— 200</span>
            </div>
          </div>
          <SwingChart tech={tech} entry={rrInput.entry} stop={rrInput.stop} target={rrInput.target} market={market} />
        </Card>
      )}

      {/* T/E/S 박스 */}
      {rrInput && (
        <div style={{ marginBottom: 22 }}>
          <TESBoxes rrInput={rrInput} setRRInput={setRRInput} market={market} isMobile={isMobile} />
          {rr && (
            <div className="eq-glass" style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '10px 14px', borderRadius: 8, marginTop: 8 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: rr.verdict === 'PASS' ? 'var(--accent)' : rr.verdict === 'CAUTION' ? '#b45309' : 'var(--ink-2)' }}>
                R:R = {rr.rr} : 1
              </span>
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>손익분기 승률 {rr.breakeven_winrate}%</span>
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>손실 {rr.loss_pct}% · 수익 {rr.gain_pct}%</span>
            </div>
          )}
        </div>
      )}

      {/* 지표 · METRICS — SEPA 8조건 체크리스트 */}
      {sepaChecks.length > 0 && (
        <Reveal
          title={`추세 템플릿 8조건 채점 — ${sepaScore}/${sepaChecks.filter((c) => c.pass !== null).length} 동과`}
          hint="Minervini SEPA Trend Template"
          depth={2}
          defaultOpen={false}
        >
          <div style={{ marginTop: 8 }}>
            {sepaChecks.map((c, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '20px 1fr auto',
                alignItems: 'flex-start', gap: 12,
                padding: '10px 0',
                borderBottom: i < sepaChecks.length - 1 ? '1px solid var(--line)' : 'none',
              }}>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
                  color: c.pass === true ? 'var(--accent)' : c.pass === false ? '#dc2626' : 'var(--ink-3)',
                }}>
                  {c.pass === true ? '✓' : c.pass === false ? '✗' : '?'}
                </span>
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.03em', color: 'var(--ink-2)', marginBottom: 2 }}>
                    {String(i + 1).padStart(2, '0')} {c.label}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{c.detail}</div>
                </div>
                <span style={{
                  fontSize: 10, fontFamily: 'var(--font-mono)',
                  padding: '2px 7px', borderRadius: 4,
                  background: c.pass === true ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
                    : c.pass === false ? 'color-mix(in srgb, #dc2626 12%, transparent)'
                    : 'var(--surface-2)',
                  color: c.pass === true ? 'var(--accent)' : c.pass === false ? '#dc2626' : 'var(--ink-3)',
                }}>
                  {c.pass === true ? 'PASS' : c.pass === false ? 'FAIL' : 'N/A'}
                </span>
              </div>
            ))}
          </div>
        </Reveal>
      )}

      {/* Gate A */}
      <Reveal title="Gate A — 거시환경 점검" hint="VIX · KOSPI · 금리" depth={2} defaultOpen>
        <div style={{ paddingTop: 8 }}>
          <GateAPanel onResult={setGateAResult} />
        </div>
      </Reveal>

      {/* Gate B */}
      <Reveal
        title="Gate B — 수급 강도 점검"
        hint="외국인·기관 · 섹터 ETF · 공매도"
        depth={2}
        defaultOpen={!gateABlocked}
      >
        <div style={{ paddingTop: 8, position: 'relative' }}>
          {gateABlocked && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'color-mix(in srgb, var(--surface-2) 80%, transparent)',
              borderRadius: 8, backdropFilter: 'blur(2px)',
            }}>
              <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>Gate A 통과 후 활성화</span>
            </div>
          )}
          <GateBPanel onResult={setGateBResult} />
        </div>
      </Reveal>

      {/* Step 1 체력 필터 */}
      <Reveal
        title="Step 1 — 체력 필터"
        hint="부채비율 · FCF · 분기 모멘텀"
        depth={2}
        defaultOpen={!gateBBlocked}
      >
        <div style={{ paddingTop: 8, position: 'relative', opacity: gateBBlocked ? 0.4 : 1 }}>
          {gateBBlocked && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'color-mix(in srgb, var(--surface-2) 80%, transparent)',
              borderRadius: 8,
            }}>
              <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>이전 단계 통과 후 활성화</span>
            </div>
          )}
          <SwingScoreDrawer
            metrics={latest ?? null}
            quarterlyInsights={quarterlyInsights}
            quarterlyLoading={quarterlyLoading}
            market={market}
          />
        </div>
      </Reveal>

      {/* 손절타임 */}
      <Reveal title="Step 6 — 손절타임" hint="보유 기한 · 청산 기준일" depth={3}>
        <div style={{ paddingTop: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(160px,1fr) 1fr 1fr', gap: 12 }}>
            <div className="eq-glass" style={{ borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.1em', color: 'var(--ink-3)', textTransform: 'uppercase', marginBottom: 8 }}>종목 유형</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(['high_beta', 'value', 'small_cap'] as StockType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setStockType(t)}
                    style={{
                      all: 'unset', boxSizing: 'border-box',
                      padding: '5px 10px', borderRadius: 5, cursor: 'pointer',
                      fontSize: 12, textAlign: 'left',
                      background: stockType === t ? 'var(--ink)' : 'transparent',
                      color: stockType === t ? 'var(--bg)' : 'var(--ink-2)',
                      border: '1px solid ' + (stockType === t ? 'var(--ink)' : 'var(--line-2)'),
                    }}
                  >
                    {STOCK_TYPE_LABEL[t]}
                  </button>
                ))}
              </div>
            </div>
            <div className="eq-glass" style={{ borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.1em', color: 'var(--ink-3)', textTransform: 'uppercase', marginBottom: 6 }}>시간 손절 기한</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, color: 'var(--ink)' }}>{timeStop.deadline}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>{timeStop.total_days}거래일 기준</div>
            </div>
            <div className="eq-glass" style={{ borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.1em', color: 'var(--ink-3)', textTransform: 'uppercase', marginBottom: 6 }}>상태</div>
              <div style={{
                fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600,
                color: timeStop.status === 'HOLDING' ? 'var(--accent)' : timeStop.status === 'PREPARE_EXIT' ? '#b45309' : 'var(--ink)',
              }}>
                {timeStop.status}
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>{timeStop.action}</div>
            </div>
          </div>
        </div>
      </Reveal>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div style={{ animation: 'pulse 1.5s ease-in-out infinite' }}>
      <div style={{ height: 32, width: 200, borderRadius: 6, background: 'var(--surface-2)', marginBottom: 16 }} />
      <div style={{ height: 120, borderRadius: 12, background: 'var(--surface-2)', marginBottom: 10 }} />
      <div style={{ height: 200, borderRadius: 12, background: 'var(--surface-2)' }} />
    </div>
  )
}

export default function SwingPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <SwingContent />
    </Suspense>
  )
}
