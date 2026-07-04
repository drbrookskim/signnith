'use client'

import { useEffect, useState } from 'react'
import type { GateAData, GateAResult, GateStatus } from '@/types'
import { checkGateA, MACRO_CONSTANTS } from '@/lib/adapters/swingPipeline'
import { fetchGateAData } from '@/lib/api-client'

const STATUS_COLOR: Record<GateStatus, string> = {
  GO:   'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/20',
  WARN: 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/20',
  STOP: 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950/20',
}
const STATUS_ICON: Record<GateStatus, string> = { GO: '🟢', WARN: '⚠️', STOP: '🔴' }

function fmt(n: number | null, decimals = 1): string {
  return n == null ? '—' : n.toFixed(decimals)
}

function GateACard({
  label, value, status, sub,
}: { label: string; value: string; status: GateStatus; sub?: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="mb-1 text-xs text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold">{value}</span>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${STATUS_COLOR[status]}`}>
          {STATUS_ICON[status]} {status}
        </span>
      </div>
      {sub && <div className="mt-0.5 text-[10px] text-zinc-400 dark:text-zinc-500">{sub}</div>}
    </div>
  )
}

export default function GateAPanel({
  onResult,
}: {
  onResult: (result: GateAResult | null) => void
}) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<GateAData | null>(null)
  const [result, setResult] = useState<GateAResult | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const d = await fetchGateAData()
      const r = checkGateA(d)
      setData(d)
      setResult(r)
      onResult(r)
    } catch {
      onResult(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])   // eslint-disable-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect

  const verdictCls = result?.verdict === 'PASS'
    ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:ring-emerald-800'
    : 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/20 dark:text-red-400 dark:ring-red-800'

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between bg-zinc-50 px-4 py-3 dark:bg-zinc-900">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            Gate A — 거시환경
          </span>
          <span className="text-xs text-zinc-400 dark:text-zinc-500">자동 조회</span>
        </div>
        <div className="flex items-center gap-2">
          {!loading && result && (
            <span className={`rounded-full px-3 py-0.5 text-xs font-bold ring-1 ${verdictCls}`}>
              {result.verdict === 'PASS' ? '✅ PASS' : '🚫 BLOCK'}
            </span>
          )}
          <button
            onClick={() => void load()}
            disabled={loading}
            className="rounded px-2 py-1 text-xs text-zinc-400 hover:text-zinc-600 disabled:opacity-40 dark:hover:text-zinc-200"
          >
            {loading ? '...' : '↻'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="animate-pulse grid grid-cols-2 gap-2 p-4 sm:grid-cols-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-zinc-100 dark:bg-zinc-800" />
          ))}
        </div>
      ) : data && result ? (
        <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3">
          <GateACard
            label="VIX"
            value={fmt(data.vix)}
            status={result.axes.vix ?? 'GO'}
            sub="≤20 GO / ≤30 WARN / >30 STOP"
          />
          <GateACard
            label="KOSPI vs 200MA"
            value={
              data.kospi_price != null && data.kospi_ma200 != null
                ? `${data.kospi_price.toLocaleString('ko-KR')} / MA${data.kospi_ma200.toLocaleString('ko-KR')}`
                : '—'
            }
            status={result.axes.index ?? 'GO'}
            sub="200MA 위↑ GO / 아래 WARN"
          />
          <GateACard
            label="USD/KRW"
            value={
              data.usdkrw != null
                ? data.usdkrw.toLocaleString('ko-KR', { maximumFractionDigits: 0 })
                : '—'
            }
            status={result.axes.usdkrw ?? 'GO'}
            sub="1,400 미만 GO / 이상 WARN"
          />
          <GateACard
            label={`금리 (기준: ${MACRO_CONSTANTS.last_updated})`}
            value={data.rate_bp === 0 ? '동결' : `${data.rate_bp > 0 ? '+' : ''}${data.rate_bp}bp`}
            status={result.axes.rate ?? 'GO'}
            sub="동결·25bp↓ GO / 50bp↑ STOP"
          />
          <GateACard
            label={`PMI (기준: ${MACRO_CONSTANTS.last_updated})`}
            value={`${fmt(data.pmi)} ${data.pmi_direction === 'up' ? '↑' : '↓'}`}
            status={result.axes.pmi ?? 'GO'}
            sub="≥50 GO / 45~50 WARN / <45 STOP"
          />
        </div>
      ) : (
        <div className="p-4 text-sm text-zinc-400 dark:text-zinc-500">데이터 조회 실패</div>
      )}
    </div>
  )
}
