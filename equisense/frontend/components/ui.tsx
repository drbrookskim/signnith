'use client'

import { useEffect, useRef, useState } from 'react'
import { useRevealState } from '@/contexts/RevealStateContext'

/* ── Eyebrow — small mono uppercase label ── */
export function Eyebrow({ children, n }: { children: React.ReactNode; n?: number }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.16em',
      textTransform: 'uppercase', color: 'var(--ink-3)',
    }}>
      {n != null && (
        <span style={{ color: 'var(--accent)', flexShrink: 0 }}>
          {String(n).padStart(2, '0')}
        </span>
      )}
      <span>{children}</span>
    </div>
  )
}

/* ── Term — jargon tooltip on dotted underline ── */
export function Term({ children, def }: { children: React.ReactNode; def: string }) {
  const [open, setOpen] = useState(false)
  return (
    <span
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      tabIndex={0}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span style={{ borderBottom: '1px dotted var(--ink-3)', cursor: 'help', color: 'inherit' }}>
        {children}
      </span>
      {open && (
        <span style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%',
          transform: 'translateX(-50%)', zIndex: 50,
          width: 'min(240px, 76vw)',
          background: 'var(--ink)', color: 'var(--bg)',
          padding: '10px 12px', borderRadius: 6,
          fontSize: 12, lineHeight: 1.5,
          fontFamily: 'var(--font-ui)',
          boxShadow: '0 12px 30px rgba(0,0,0,.28)',
          fontWeight: 400, letterSpacing: 0, textTransform: 'none',
          pointerEvents: 'none',
        }}>
          {def}
          <span style={{
            position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
            width: 0, height: 0,
            borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
            borderTop: '5px solid var(--ink)',
          }} />
        </span>
      )}
    </span>
  )
}

/* ── Verdict pill ── */
export type VerdictTone = 'strong' | 'positive' | 'neutral' | 'weak'
export function Verdict({ label, tone = 'neutral', big }: { label: string; tone?: VerdictTone; big?: boolean }) {
  const styles: Record<VerdictTone, React.CSSProperties> = {
    strong:   { background: 'var(--accent)', color: 'var(--bg)', border: '1px solid var(--accent)' },
    positive: { background: 'var(--ink)', color: 'var(--bg)', border: '1px solid var(--ink)' },
    neutral:  { background: 'transparent', color: 'var(--ink)', border: '1px solid var(--ink-2)' },
    weak:     { background: 'transparent', color: 'var(--ink-3)', border: '1px dashed var(--line-2)' },
  }
  return (
    <span style={{
      ...styles[tone],
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: big ? '8px 16px' : '5px 11px',
      borderRadius: 999,
      fontFamily: 'var(--font-mono)', fontWeight: 700,
      letterSpacing: '.08em',
      fontSize: big ? 14 : 11,
      textTransform: 'uppercase',
    }}>
      {label}
    </span>
  )
}

/* ── Stat — big serif number ── */
export function Stat({
  value, unit, label, delta, sub,
}: {
  value: React.ReactNode
  unit?: string
  label?: string
  delta?: string
  sub?: React.ReactNode
}) {
  return (
    <div>
      {label && (
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.08em',
          color: 'var(--ink-3)', marginBottom: 5, textTransform: 'uppercase', whiteSpace: 'nowrap',
        }}>
          {label}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, whiteSpace: 'nowrap' }}>
        <span style={{
          fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 600,
          lineHeight: 1, color: 'var(--ink)', letterSpacing: '-.01em',
        }}>
          {value}
        </span>
        {unit && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--ink-2)' }}>{unit}</span>
        )}
        {delta && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-2)', marginLeft: 4 }}>{delta}</span>
        )}
      </div>
      {sub && <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 5 }}>{sub}</div>}
    </div>
  )
}

/* ── Card shell — glass ── */
const cardGlassStyle: React.CSSProperties = {
  background: 'rgba(var(--surface-rgb), 0.47)',
  border: '1px solid rgba(var(--glow-tone), 0.35)',
  borderRadius: 12,
  padding: 22,
  backdropFilter: 'blur(18px) saturate(160%)',
  WebkitBackdropFilter: 'blur(18px) saturate(160%)',
  boxShadow: '0 14px 34px rgba(0, 0, 0, 0.14), inset 0 1px 0 rgba(var(--glow-tone), 0.4)',
}

export function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="eq-card-glass" style={{ ...cardGlassStyle, ...style }}>
      {children}
    </div>
  )
}

/* ── TabHead — section header ── */
export function TabHead({
  n, kicker, title, lede,
}: {
  n?: number
  kicker: string
  title: string
  lede?: string
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <Eyebrow n={n}>{kicker}</Eyebrow>
      <h2 style={{
        margin: '10px 0 0',
        fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 26,
        letterSpacing: '-.01em', color: 'var(--ink)', lineHeight: 1.15,
      }}>
        {title}
      </h2>
      {lede && (
        <p style={{
          margin: '8px 0 0', fontSize: 15, lineHeight: 1.5,
          color: 'var(--ink-2)',
        }}>
          {lede}
        </p>
      )}
    </div>
  )
}

/* ── Reveal — collapsible depth block ── */
export function Reveal({
  title, hint, depth = 2, defaultOpen = false, children, dense,
}: {
  title: string
  hint?: string
  depth?: number
  defaultOpen?: boolean
  children: React.ReactNode
  dense?: boolean
}) {
  const revealState = useRevealState()
  const [open, setOpenState] = useState(() => revealState?.getOpen(title, defaultOpen) ?? defaultOpen)
  const ref = useRef<HTMLDivElement>(null)
  const [h, setH] = useState<number | 'auto'>(open ? 'auto' : 0)

  function toggleOpen() {
    setOpenState((prev) => {
      const next = !prev
      revealState?.setOpen(title, next)
      return next
    })
  }

  useEffect(() => {
    if (!ref.current) return
    if (open) {
      setH(ref.current.scrollHeight)
      const t = setTimeout(() => setH('auto'), 460)
      return () => clearTimeout(t)
    } else {
      setH(ref.current.scrollHeight)
      requestAnimationFrame(() => setH(0))
    }
  }, [open])

  const tag = depth >= 3 ? '원자료 · RAW' : '지표 · METRICS'
  const padX = 18

  return (
    <div
      className="eq-reveal eq-glass"
      style={{
        borderRadius: 8,
        overflow: 'hidden',
        marginTop: 10,
        boxShadow: open
          ? 'inset 0 2px 8px -6px rgba(0,0,0,.4), 0 14px 34px rgba(0, 0, 0, 0.14), inset 0 1px 0 rgba(var(--glow-tone), 0.4)'
          : undefined,
        transition: 'box-shadow .4s ease',
      }}
    >
      <button
        onClick={toggleOpen}
        style={{
          all: 'unset', boxSizing: 'border-box',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%',
          padding: dense ? `11px ${padX}px` : `14px ${padX}px`,
          cursor: 'pointer', gap: 12,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 12, minWidth: 0 }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.14em',
            color: 'var(--accent)', border: '1px solid var(--line-2)',
            borderRadius: 3, padding: '2px 5px', whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            {tag}
          </span>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{title}</span>
          {hint && (
            <span style={{
              fontSize: 12, color: 'var(--ink-3)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {hint}
            </span>
          )}
        </span>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 13,
          color: open ? 'var(--accent)' : 'var(--ink-2)',
          transform: open ? 'rotate(90deg)' : 'none',
          transition: 'transform .4s cubic-bezier(.22,1,.36,1), color .3s',
          flexShrink: 0,
        }}>
          ›
        </span>
      </button>
      <div style={{
        height: h === 'auto' ? 'auto' : h,
        overflow: 'hidden',
        transition: 'height .46s cubic-bezier(.22,1,.36,1)',
      }}>
        <div
          ref={ref}
          style={{ padding: dense ? `0 ${padX}px 16px` : `2px ${padX}px 20px` }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

/* ── MetricBar — horizontal progress bar ── */
export function MetricBar({
  value, min = 0, max = 100, threshold, accent, color,
}: {
  value: number
  min?: number
  max?: number
  threshold?: number
  accent?: boolean
  color?: string
}) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))
  const thrPct = threshold != null ? ((threshold - min) / (max - min)) * 100 : null
  const barColor = color ?? (accent ? 'var(--accent)' : 'var(--ink)')
  return (
    <div style={{ position: 'relative', height: 4, borderRadius: 2, background: 'var(--line-2)' }}>
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0,
        width: `${pct}%`, borderRadius: 2,
        background: barColor,
        transition: 'width .4s ease',
      }} />
      {thrPct != null && (
        <div style={{
          position: 'absolute', top: -2, bottom: -2, width: 2,
          left: `${thrPct}%`, borderRadius: 1,
          background: 'var(--ink-3)',
        }} />
      )}
    </div>
  )
}
