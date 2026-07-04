'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { triggerDualQualitativeAnalysis } from '@/lib/api-client'
import type {
  DualQualitativeResult,
  Market,
  QualitativeResult,
  RiskFactor,
} from '@/types'

const CURRENT_YEAR = new Date().getFullYear()
const FISCAL_YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 1 - i)

const SEV_COLOR: Record<RiskFactor['severity'], string> = {
  high:   '#dc2626',
  medium: '#b45309',
  low:    'var(--ink-3)',
}
const SEV_BG: Record<RiskFactor['severity'], string> = {
  high:   'rgba(220,38,38,0.08)',
  medium: 'rgba(180,83,9,0.08)',
  low:    'var(--surface-2)',
}
const SEV_LABEL: Record<RiskFactor['severity'], string> = {
  high: '높음', medium: '중간', low: '낮음',
}

const LONG_COLOR  = 'var(--accent)'   // #1c6e4a
const SHORT_COLOR = '#b45309'

interface Props {
  ticker: string
  market: Market
  name: string | null
}

// ── 서브 컴포넌트 ─────────────────────────────────────────────

function IntegrityGauge({ score, label, color }: { score: number; label: string; color: string }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.1em',
        textTransform: 'uppercase', color, marginBottom: 6, fontWeight: 600,
      }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginBottom: 8 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 700, color, lineHeight: 1 }}>
          {score}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-3)' }}>/ 100</span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: 'var(--surface-2)' }}>
        <div style={{ height: 4, borderRadius: 2, width: `${score}%`, background: color, transition: 'width .4s ease' }} />
      </div>
    </div>
  )
}

function SeverityBadge({ severity }: { severity: RiskFactor['severity'] }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 7px', borderRadius: 4,
      fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
      background: SEV_BG[severity], color: SEV_COLOR[severity],
    }}>
      {SEV_LABEL[severity]}
    </span>
  )
}

function ColHeader({ label, color }: { label: string; color: string }) {
  return (
    <div style={{
      fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.12em',
      textTransform: 'uppercase', color, fontWeight: 600, marginBottom: 8,
    }}>
      {label}
    </div>
  )
}

function RiskList({ items }: { items: QualitativeResult['risk_factors'] }) {
  if (!items?.length) return <p style={{ fontSize: 12, color: 'var(--ink-3)' }}>해당 없음</p>
  return (
    <ul style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map((rf, i) => (
        <li key={i} className="eq-glass" style={{
          borderRadius: 8, padding: '10px 14px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{rf.title}</span>
            <SeverityBadge severity={rf.severity} />
          </div>
          <p style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.5 }}>{rf.description}</p>
        </li>
      ))}
    </ul>
  )
}

function DriverList({ items }: { items: QualitativeResult['growth_drivers'] }) {
  if (!items?.length) return <p style={{ fontSize: 12, color: 'var(--ink-3)' }}>해당 없음</p>
  return (
    <ul style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map((gd, i) => (
        <li key={i} className="eq-glass" style={{
          borderRadius: 8, padding: '10px 14px',
        }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>{gd.title}</p>
          {gd.description && <p style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.5 }}>{gd.description}</p>}
        </li>
      ))}
    </ul>
  )
}

function NoiseList({ items }: { items: QualitativeResult['noise_filter'] }) {
  if (!items?.length) return <p style={{ fontSize: 12, color: 'var(--ink-3)' }}>해당 없음</p>
  return (
    <ul style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map((nf, i) => (
        <li key={i} className="eq-glass" style={{
          borderRadius: 8, padding: '10px 14px',
          display: 'flex', gap: 10,
        }}>
          <span style={{
            flexShrink: 0, width: 16, height: 16, marginTop: 1,
            fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
            color: nf.is_substantiated ? '#dc2626' : 'var(--accent)',
          }}>
            {nf.is_substantiated ? '✗' : '✓'}
          </span>
          <div>
            <p style={{ fontSize: 13, color: 'var(--ink)', marginBottom: 3 }}>{nf.claim}</p>
            <p style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.5 }}>{nf.evidence}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}

function SectionLabel({ title }: { title: string }) {
  return (
    <div style={{
      fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.12em',
      textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 10,
    }}>
      {title}
    </div>
  )
}

function DualResultCard({ result }: { result: DualQualitativeResult }) {
  const { annual, earnings } = result

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* 언행일치 점수 — 두 게이지 나란히 */}
      <div className="eq-glass" style={{
        borderRadius: 10, padding: 16,
      }}>
        <SectionLabel title="언행일치 점수" />
        <div style={{ display: 'flex', gap: 24 }}>
          {annual.integrity_score != null && (
            <IntegrityGauge score={annual.integrity_score} label="장기 구조" color={LONG_COLOR} />
          )}
          <div style={{ width: 1, background: 'var(--line)', flexShrink: 0 }} />
          {earnings.integrity_score != null && (
            <IntegrityGauge score={earnings.integrity_score} label="단기 모멘텀" color={SHORT_COLOR} />
          )}
        </div>
      </div>

      {/* AI 요약 — 두 단락 */}
      {(annual.summary_ko || earnings.summary_ko) && (
        <div className="eq-glass" style={{
          borderRadius: 10, padding: 16,
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <SectionLabel title="AI 요약" />
          {annual.summary_ko && (
            <div>
              <span style={{
                display: 'inline-block', marginBottom: 5,
                fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
                letterSpacing: '.08em', textTransform: 'uppercase', color: LONG_COLOR,
              }}>장기 구조</span>
              <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6 }}>{annual.summary_ko}</p>
            </div>
          )}
          {annual.summary_ko && earnings.summary_ko && (
            <div style={{ height: 1, background: 'var(--line)' }} />
          )}
          {earnings.summary_ko && (
            <div>
              <span style={{
                display: 'inline-block', marginBottom: 5,
                fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
                letterSpacing: '.08em', textTransform: 'uppercase', color: SHORT_COLOR,
              }}>단기 모멘텀</span>
              <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6 }}>{earnings.summary_ko}</p>
            </div>
          )}
        </div>
      )}

      {/* 리스크 요인 — 2열 */}
      <div className="eq-glass" style={{ borderRadius: 10, padding: 16 }}>
        <SectionLabel title="리스크 요인" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <ColHeader label="장기 구조" color={LONG_COLOR} />
            <RiskList items={annual.risk_factors} />
          </div>
          <div>
            <ColHeader label="단기 모멘텀" color={SHORT_COLOR} />
            <RiskList items={earnings.risk_factors} />
          </div>
        </div>
      </div>

      {/* 성장 동력 — 2열 */}
      <div className="eq-glass" style={{ borderRadius: 10, padding: 16 }}>
        <SectionLabel title="성장 동력" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <ColHeader label="장기 구조" color={LONG_COLOR} />
            <DriverList items={annual.growth_drivers} />
          </div>
          <div>
            <ColHeader label="단기 모멘텀" color={SHORT_COLOR} />
            <DriverList items={earnings.growth_drivers} />
          </div>
        </div>
      </div>

      {/* 노이즈 필터 — 2열 */}
      <div className="eq-glass" style={{ borderRadius: 10, padding: 16 }}>
        <SectionLabel title="노이즈 필터" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <ColHeader label="장기 구조" color={LONG_COLOR} />
            <NoiseList items={annual.noise_filter} />
          </div>
          <div>
            <ColHeader label="단기 모멘텀" color={SHORT_COLOR} />
            <NoiseList items={earnings.noise_filter} />
          </div>
        </div>
      </div>

    </div>
  )
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────

export default function QualitativeAnalysisView({ ticker, market, name }: Props) {
  const [fiscalYear, setFiscalYear] = useState<number>(FISCAL_YEARS[0])
  const [dualResult, setDualResult] = useState<DualQualitativeResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => () => { abortRef.current?.abort() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    setError(null)
    setLoading(true)
    try {
      const result = await triggerDualQualitativeAnalysis(ticker, market, fiscalYear)
      setDualResult(result)
    } catch (err: unknown) {
      const e = err as { message?: string; code?: string }
      if ((err as { name?: string })?.name === 'AbortError') return
      setError(e?.code === 'RATE_LIMIT_EXCEEDED'
        ? '일일 분석 한도에 도달했습니다. 내일 다시 시도해 주세요.'
        : (e?.message ?? '분석 요청에 실패했습니다.'))
    } finally {
      setLoading(false)
    }
  }

  const ticker_ = name ? `${name} (${ticker})` : ticker

  const selectStyle: React.CSSProperties = {
    borderRadius: 6, border: '1px solid var(--line-2)',
    background: 'var(--surface)', color: 'var(--ink)',
    fontFamily: 'var(--font-ui)', fontSize: 13,
    padding: '6px 10px', outline: 'none',
    opacity: loading ? 0.5 : 1,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>{ticker_}</p>

      {/* 분석 폼 */}
      <form onSubmit={handleSubmit} className="eq-glass" style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12,
        borderRadius: 8, padding: '12px 14px',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
            회계연도
          </label>
          <select value={fiscalYear} onChange={(e) => setFiscalYear(Number(e.target.value))}
            style={selectStyle} disabled={loading}>
            {FISCAL_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <button type="submit" disabled={loading} style={{
          borderRadius: 6, padding: '6px 16px',
          background: loading ? 'var(--line-2)' : 'var(--ink)', color: 'var(--bg)',
          fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600,
          letterSpacing: '.06em', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
          transition: 'background .2s',
        }}>
          {loading ? '분석 중…' : '분석 시작'}
        </button>
      </form>

      {error && (
        <div style={{
          borderRadius: 8, border: '1px solid rgba(220,38,38,0.3)',
          background: 'rgba(220,38,38,0.06)', padding: '10px 14px',
          fontSize: 13, color: '#dc2626',
        }}>
          {error}
        </div>
      )}

      {loading && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          borderRadius: 8, padding: '10px 14px',
          background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.22)',
          fontSize: 13, color: '#2563eb',
        }}>
          <svg style={{ width: 14, height: 14, animation: 'spin 1s linear infinite', flexShrink: 0 }} viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.25" />
            <path fill="currentColor" opacity="0.75" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          장기 구조 · 단기 모멘텀 동시 분석 중…
        </div>
      )}

      {dualResult && <DualResultCard result={dualResult} />}
    </div>
  )
}
