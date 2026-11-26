'use client'

import { useEffect, useRef } from 'react'

interface Spring {
  x: number
  v: number
  t: number
  k: number
  c: number
}

function makeSpring(x: number, k = 400, c = 30): Spring {
  return { x, v: 0, t: x, k, c }
}

function stepSpring(s: Spring, dt: number, reduceMotion: boolean) {
  const c = reduceMotion ? 2 * Math.sqrt(s.k) : s.c
  const a = -s.k * (s.x - s.t) - c * s.v
  s.v += a * dt
  s.x += s.v * dt
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v))
}

interface Props {
  loading: boolean
  hasResult: boolean
  idleLabel?: string
  doneLabel?: string
}

const IDLE_WIDTH = 132
const LOAD_WIDTH = 38
const DONE_WIDTH = 124
const BTN_HEIGHT = 38
const TICK_LEN = 22

/**
 * DesignBookmark Loading Success 스타일 스프링 애니메이션 알약 버튼.
 * idle(알약) → loading(원형 스피너) → success(초록 알약 + 체크 드로잉) → idle 복귀.
 */
export default function LoadingSuccessButton({
  loading,
  hasResult,
  idleLabel = '분석 시작',
  doneLabel = '완료',
}: Props) {
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const txtRef = useRef<HTMLSpanElement | null>(null)
  const spinRef = useRef<HTMLSpanElement | null>(null)
  const doneRef = useRef<HTMLSpanElement | null>(null)
  const tickRef = useRef<SVGPathElement | null>(null)

  const prevLoadingRef = useRef(loading)
  const stateRef = useRef<'idle' | 'load' | 'done'>('idle')
  const springsRef = useRef({
    W: makeSpring(IDLE_WIDTH, 300, 22),
    T: makeSpring(1, 400, 30),
    P: makeSpring(0, 300, 28),
    D: makeSpring(0, 220, 20),
    G: makeSpring(0, 200, 30),
    K: makeSpring(0, 120, 20),
  })

  // loading / success 상태 전환에 따라 스프링 타겟 업데이트
  useEffect(() => {
    const s = springsRef.current
    const wasLoading = prevLoadingRef.current
    prevLoadingRef.current = loading

    let t1: ReturnType<typeof setTimeout> | undefined
    let t2: ReturnType<typeof setTimeout> | undefined
    let t3: ReturnType<typeof setTimeout> | undefined

    if (loading) {
      stateRef.current = 'load'
      s.T.t = 0
      s.D.t = 0
      s.G.t = 0
      s.K.t = 0
      s.W.t = LOAD_WIDTH
      s.P.t = 1
    } else if (wasLoading && hasResult) {
      stateRef.current = 'done'
      s.P.t = 0
      s.W.t = DONE_WIDTH
      s.G.t = 1
      s.D.t = 1
      t1 = setTimeout(() => { s.K.t = 1 }, 150)
      t2 = setTimeout(() => {
        stateRef.current = 'idle'
        s.D.t = 0
        s.G.t = 0
        s.K.t = 0
        s.W.t = IDLE_WIDTH
        t3 = setTimeout(() => { s.T.t = 1 }, 120)
      }, 2000)
    } else if (!loading && stateRef.current === 'load') {
      // 에러 등으로 종료된 경우 즉시 idle 복귀
      stateRef.current = 'idle'
      s.P.t = 0
      s.D.t = 0
      s.G.t = 0
      s.K.t = 0
      s.W.t = IDLE_WIDTH
      t1 = setTimeout(() => { s.T.t = 1 }, 100)
    }

    return () => {
      if (t1) clearTimeout(t1)
      if (t2) clearTimeout(t2)
      if (t3) clearTimeout(t3)
    }
  }, [loading, hasResult])

  // 단일 rAF 스프링 물리 루프
  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let rafId = 0
    let last = performance.now()
    let rot = 0

    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 30)
      last = now
      rot += dt * 360 * 1.4

      const s = springsRef.current
      const sub = 4
      for (let k = 0; k < sub; k++) {
        stepSpring(s.W, dt / sub, reduce)
        stepSpring(s.T, dt / sub, reduce)
        stepSpring(s.P, dt / sub, reduce)
        stepSpring(s.D, dt / sub, reduce)
        stepSpring(s.G, dt / sub, reduce)
        stepSpring(s.K, dt / sub, reduce)
      }

      const btn = btnRef.current
      const txt = txtRef.current
      const spin = spinRef.current
      const done = doneRef.current
      const tick = tickRef.current

      if (btn && txt && spin && done && tick) {
        btn.style.width = `${s.W.x.toFixed(2)}px`
        const g = clamp(s.G.x, 0, 1)
        btn.style.background = g > 0.01
          ? `color-mix(in srgb, #34d17a ${(g * 100).toFixed(1)}%, var(--ink))`
          : 'var(--ink)'

        txt.style.opacity = clamp(s.T.x, 0, 1).toFixed(3)
        txt.style.transform = `translateY(${((1 - s.T.x) * 14).toFixed(2)}px)`

        spin.style.opacity = clamp(s.P.x, 0, 1).toFixed(3)
        spin.style.transform = `rotate(${rot % 360}deg) scale(${(0.6 + 0.4 * clamp(s.P.x, 0, 1.2)).toFixed(3)})`

        done.style.opacity = clamp(s.D.x, 0, 1).toFixed(3)
        done.style.transform = `translateY(${((1 - s.D.x) * 12).toFixed(2)}px)`
        tick.style.strokeDashoffset = (TICK_LEN * (1 - clamp(s.K.x, 0, 1))).toFixed(2)
      }

      rafId = requestAnimationFrame(loop)
    }

    rafId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafId)
  }, [])

  return (
    <button
      ref={btnRef}
      type="submit"
      disabled={loading}
      aria-live="polite"
      style={{
        position: 'relative',
        width: IDLE_WIDTH,
        height: BTN_HEIGHT,
        border: 0,
        borderRadius: 999,
        background: 'var(--ink)',
        color: 'var(--bg)',
        cursor: loading ? 'not-allowed' : 'pointer',
        overflow: 'hidden',
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: '.06em',
        flexShrink: 0,
      }}
    >
      <span
        ref={txtRef}
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          whiteSpace: 'nowrap',
          willChange: 'transform, opacity',
        }}
      >
        {idleLabel}
      </span>

      <span
        ref={spinRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 18,
          height: 18,
          margin: '-9px 0 0 -9px',
          borderRadius: '50%',
          background: 'conic-gradient(from 0deg, rgba(0,0,0,0) 0 10%, var(--bg) 85%, rgba(0,0,0,0) 85%)',
          WebkitMask: 'radial-gradient(circle closest-side, transparent 66%, #000 72%)',
          mask: 'radial-gradient(circle closest-side, transparent 66%, #000 72%)',
          opacity: 0,
          willChange: 'transform, opacity',
        }}
      />

      <span
        ref={doneRef}
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          whiteSpace: 'nowrap',
          color: '#04140a',
          opacity: 0,
          willChange: 'transform, opacity',
        }}
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path
            ref={tickRef}
            d="M5 12.5l4.5 4.5L19 7.5"
            style={{ strokeDasharray: TICK_LEN, strokeDashoffset: TICK_LEN }}
          />
        </svg>
        <b>{doneLabel}</b>
      </span>
    </button>
  )
}
