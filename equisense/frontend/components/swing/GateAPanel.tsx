'use client'

import { useEffect, useState } from 'react'
import type { GateAData, GateAResult, GateStatus } from '@/types'
import { checkGateA, MACRO_CONSTANTS } from '@/lib/adapters/swingPipeline'
import { fetchGateAData } from '@/lib/api-client'

const STATUS_COLOR: Record<GateStatus, string> = {
  GO:   'var(--status-go)',
  WARN: 'var(--status-warn)',
  STOP: 'var(--status-stop)',
}

function fmt(n: number | null, decimals = 1): string {
  return n == null ? '—' : n.toFixed(decimals)
}

function GateACard({
  label, value, status, sub,
}: { label: string; value: string; status: GateStatus; sub?: string }) {
  const color = STATUS_COLOR[status]
  return (
    <div className="eq-glass" style={{ padding: '12px 14px', borderRadius: 8, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>{label}</span>
        <span style={{
          fontSize: 10, fontFamily: 'var(--font-mono)', color, flexShrink: 0,
          border: `1px solid ${color}`, borderRadius: 4, padding: '1px 5px',
        }}>{status}</span>
      </div>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 700, color,
        wordBreak: 'break-word', marginBottom: sub ? 4 : 0,
      }}>{value}</div>
      {sub && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-3)' }}>{sub}</div>}
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

  const verdictColor = result?.verdict === 'PASS' ? 'var(--status-go)' : 'var(--status-stop)'

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Gate A — 거시환경</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-3)' }}>자동 조회</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!loading && result && (
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: verdictColor,
              border: `1px solid ${verdictColor}`, borderRadius: 999, padding: '2px 10px',
            }}>
              {result.verdict === 'PASS' ? '✅ PASS' : '🚫 BLOCK'}
            </span>
          )}
          <button
            onClick={() => void load()}
            disabled={loading}
            style={{
              all: 'unset', cursor: loading ? 'default' : 'pointer',
              fontSize: 12, color: 'var(--ink-3)', opacity: loading ? 0.4 : 1, padding: '2px 4px',
            }}
          >
            {loading ? '...' : '↻'}
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} style={{ height: 56, borderRadius: 8, background: 'var(--surface-2)', animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
      ) : data && result ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
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
        <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>데이터 조회 실패</div>
      )}
    </div>
  )
}
