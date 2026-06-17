'use client'

import { useEffect, useState } from 'react'
import type {
  AnalystConsensus,
  DartDisclosure,
  EarningsSurprise,
  InstitutionHolder,
  InsiderTransaction,
  Market,
  SentimentData,
} from '@/types'
import { fetchSentimentData } from '@/lib/api-client'
import { fmtShares } from '@/lib/adapters/sentiment'

// ── 포맷 헬퍼 ─────────────────────────────────────

function fmtPrice(n: number | null, market: Market): string {
  if (n == null) return '—'
  if (market === 'KR') return `${n.toLocaleString('ko-KR')}원`
  return `$${n.toFixed(2)}`
}

function fmtDate(dt: string): string {
  if (!dt || dt.length !== 8) return dt
  return `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}`
}

// ── 스켈레톤 ──────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="animate-pulse rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="mb-3 h-3 w-28 rounded bg-zinc-200 dark:bg-zinc-700" />
          <div className="space-y-2">
            <div className="h-3 w-full rounded bg-zinc-100 dark:bg-zinc-800" />
            <div className="h-3 w-3/4 rounded bg-zinc-100 dark:bg-zinc-800" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── 1. 애널리스트 컨센서스 ────────────────────────

function ConsensusPanel({ data, market }: { data: AnalystConsensus; market: Market }) {
  const { strong_buy, buy, hold, sell, strong_sell, total } = data
  const bullish = strong_buy + buy
  const bearish = sell + strong_sell

  const bars: { label: string; count: number; cls: string }[] = [
    { label: '강력매수', count: strong_buy,  cls: 'bg-emerald-600' },
    { label: '매수',    count: buy,          cls: 'bg-emerald-400' },
    { label: '중립',    count: hold,         cls: 'bg-zinc-400' },
    { label: '매도',    count: sell,         cls: 'bg-red-400' },
    { label: '강력매도', count: strong_sell,  cls: 'bg-red-600' },
  ]

  const overallCls =
    bullish > bearish + hold
      ? 'text-emerald-600 dark:text-emerald-400'
      : bearish > bullish + hold
      ? 'text-red-600 dark:text-red-400'
      : 'text-zinc-500 dark:text-zinc-400'

  return (
    <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">📊 애널리스트 컨센서스</h3>
        {total > 0 && (
          <span className="text-xs text-zinc-400">{total}명 기준</span>
        )}
      </div>

      {total === 0 ? (
        <p className="text-xs text-zinc-400">데이터 없음</p>
      ) : (
        <>
          {/* 전체 의견 막대 */}
          <div className="mb-3 flex h-3 overflow-hidden rounded-full">
            {bars.map(b => b.count > 0 && (
              <div
                key={b.label}
                className={`${b.cls} transition-all`}
                style={{ width: `${(b.count / total) * 100}%` }}
                title={`${b.label}: ${b.count}`}
              />
            ))}
          </div>

          {/* 항목별 수치 */}
          <div className="grid grid-cols-5 gap-1 text-center">
            {bars.map(b => (
              <div key={b.label}>
                <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300">{b.count}</p>
                <p className="text-[10px] text-zinc-400">{b.label}</p>
                <p className="text-[10px] text-zinc-500">
                  {total > 0 ? `${Math.round((b.count / total) * 100)}%` : '—'}
                </p>
              </div>
            ))}
          </div>

          {/* 의미 설명 */}
          <div className="mt-2.5 rounded-md bg-zinc-50 px-3 py-2 dark:bg-zinc-900/50">
            <p className="mb-1 text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
              등급 의미
            </p>
            <div className="grid grid-cols-1 gap-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
              <p><span className="font-medium text-emerald-600 dark:text-emerald-400">강력매수</span> — 목표가 대비 강한 상승 여력. 적극 매수 권고.</p>
              <p><span className="font-medium text-emerald-500 dark:text-emerald-500">매수</span> — 시장 대비 초과 수익 기대. 매수 권고.</p>
              <p><span className="font-medium text-zinc-500">중립</span> — 현 주가가 적정 수준. 보유 또는 관망.</p>
              <p><span className="font-medium text-red-400">매도</span> — 하락 또는 시장 대비 부진 예상. 비중 축소 권고.</p>
              <p><span className="font-medium text-red-600 dark:text-red-400">강력매도</span> — 상당한 하락 위험. 매도 권고.</p>
            </div>
          </div>

          {/* 목표주가 */}
          {data.target_mean != null && (
            <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
              <p className="mb-1 text-[11px] text-zinc-400">목표주가 범위</p>
              <div className="flex items-baseline gap-2">
                <span className="text-xs text-zinc-400">
                  {fmtPrice(data.target_low, market)}
                </span>
                <span className="text-base font-bold text-zinc-800 dark:text-zinc-200">
                  평균 {fmtPrice(data.target_mean, market)}
                </span>
                <span className="text-xs text-zinc-400">
                  {fmtPrice(data.target_high, market)}
                </span>
              </div>
              {data.current_price != null && data.target_mean != null && (
                <p className={`mt-0.5 text-xs font-medium ${overallCls}`}>
                  현재가 대비{' '}
                  {((data.target_mean / data.current_price - 1) * 100) >= 0 ? '+' : ''}
                  {((data.target_mean / data.current_price - 1) * 100).toFixed(1)}% 업사이드
                </p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}

// ── 2. 어닝 서프라이즈 이력 ───────────────────────

function EarningsSurprisePanel({ items }: { items: EarningsSurprise[] }) {
  if (items.length === 0) return null

  return (
    <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <h3 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
        📈 어닝 서프라이즈 이력
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-100 dark:border-zinc-800 text-left text-zinc-400">
              <th className="pb-2 font-medium">분기</th>
              <th className="pb-2 text-right font-medium">예측 EPS</th>
              <th className="pb-2 text-right font-medium">실제 EPS</th>
              <th className="pb-2 text-right font-medium">서프라이즈</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {items.map((s, i) => {
              const pos = s.surprise_pct != null && s.surprise_pct >= 0
              return (
                <tr key={i}>
                  <td className="py-1.5 text-zinc-600 dark:text-zinc-400">{s.quarter}</td>
                  <td className="py-1.5 text-right text-zinc-500">
                    {s.eps_estimate != null ? s.eps_estimate.toFixed(2) : '—'}
                  </td>
                  <td className="py-1.5 text-right font-medium text-zinc-700 dark:text-zinc-300">
                    {s.eps_actual != null ? s.eps_actual.toFixed(2) : '—'}
                  </td>
                  <td className="py-1.5 text-right">
                    {s.surprise_pct != null ? (
                      <span className={`font-bold ${pos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                        {pos ? '+' : ''}{s.surprise_pct.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ── 3. DART 공시 타임라인 (KR) ────────────────────

const IMPORTANCE_CLS: Record<string, string> = {
  high:   'bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400',
  medium: 'bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400',
  low:    'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
}
const IMPORTANCE_LABEL: Record<string, string> = {
  high: '중요', medium: '일반', low: '기타',
}

function DisclosurePanel({ items }: { items: DartDisclosure[] }) {
  if (items.length === 0) return null

  return (
    <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <h3 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
        📋 최근 공시 (DART)
      </h3>
      <ul className="space-y-1.5">
        {items.map((d, i) => (
          <li
            key={i}
            className="flex items-start gap-2 text-xs"
          >
            <span className="mt-0.5 shrink-0 text-zinc-400">{fmtDate(d.rcept_dt)}</span>
            <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${IMPORTANCE_CLS[d.importance]}`}>
              {IMPORTANCE_LABEL[d.importance]}
            </span>
            <span className="min-w-0 truncate text-zinc-700 dark:text-zinc-300" title={d.report_nm}>
              {d.report_nm}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ── 4. 내부자 거래 + 기관 보유 ────────────────────

const TXN_CLS: Record<string, string> = {
  buy:   'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400',
  sell:  'bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400',
  other: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
}
const TXN_LABEL: Record<string, string> = {
  buy: '매수', sell: '매도', other: '기타',
}

function InsiderPanel({
  insider,
  institutions,
}: {
  insider: InsiderTransaction[]
  institutions: InstitutionHolder[]
}) {
  const hasInsider = insider.length > 0
  const hasInstitution = institutions.length > 0
  if (!hasInsider && !hasInstitution) return null

  return (
    <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <h3 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
        🏦 내부자·기관 행동 신호
      </h3>

      {hasInsider && (
        <>
          <p className="mb-2 text-[11px] font-medium text-zinc-400 uppercase tracking-wide">
            내부자 거래
          </p>
          <ul className="mb-4 space-y-1.5">
            {insider.map((t, i) => (
              <li key={i} className="flex items-center gap-2 text-xs">
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${TXN_CLS[t.transaction]}`}>
                  {TXN_LABEL[t.transaction]}
                </span>
                <span className="font-medium text-zinc-700 dark:text-zinc-300 truncate">{t.name}</span>
                <span className="shrink-0 text-zinc-400">{t.relation}</span>
                {t.shares != null && (
                  <span className="ml-auto shrink-0 text-zinc-500">{fmtShares(t.shares)}주</span>
                )}
                <span className="shrink-0 text-zinc-400">{t.date}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {hasInstitution && (
        <>
          <p className="mb-2 text-[11px] font-medium text-zinc-400 uppercase tracking-wide">
            주요 기관 보유
          </p>
          <ul className="space-y-1.5">
            {institutions.map((inst, i) => (
              <li key={i} className="flex items-center gap-2 text-xs">
                <span className="flex-1 truncate text-zinc-700 dark:text-zinc-300">{inst.name}</span>
                {inst.pct_held != null && (
                  <span className="shrink-0 font-bold text-indigo-600 dark:text-indigo-400">
                    {inst.pct_held.toFixed(1)}%
                  </span>
                )}
                {inst.shares != null && (
                  <span className="shrink-0 text-zinc-400">{fmtShares(inst.shares)}</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

// ── 메인 컴포넌트 ─────────────────────────────────

export default function SentimentPanels({
  ticker,
  market,
}: {
  ticker: string
  market: Market
}) {
  const [data, setData] = useState<SentimentData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!ticker) return
    let cancelled = false
    setLoading(true) // eslint-disable-line react-hooks/set-state-in-effect
    fetchSentimentData(ticker, market)
      .then(d => { if (!cancelled) setData(d) })
      .catch(() => { if (!cancelled) setData(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [ticker, market])

  if (loading) return <Skeleton />
  if (!data) return null

  const hasConsensus  = data.consensus != null && data.consensus.total > 0
  const hasEarnings   = data.earnings_surprises.length > 0
  const hasDisclosure = data.disclosures.length > 0
  const hasInsider    = data.insider_transactions.length > 0 || data.institution_holders.length > 0

  if (!hasConsensus && !hasEarnings && !hasDisclosure && !hasInsider) {
    return (
      <p className="text-sm text-zinc-400">
        이 종목의 시장 데이터를 불러올 수 없습니다.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {hasConsensus && (
        <ConsensusPanel data={data.consensus!} market={market} />
      )}
      {hasEarnings && (
        <EarningsSurprisePanel items={data.earnings_surprises} />
      )}
      {hasDisclosure && (
        <DisclosurePanel items={data.disclosures} />
      )}
      {hasInsider && (
        <InsiderPanel
          insider={data.insider_transactions}
          institutions={data.institution_holders}
        />
      )}
    </div>
  )
}
