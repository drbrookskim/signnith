'use client'

import { useEffect, useRef } from 'react'

/* ── 커서를 따라다니는 스포트라이트 — 글래스 카드가 마우스 근처에서 더 뚜렷하게 보이도록 ── */
export default function MouseGlow() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (!window.matchMedia('(pointer: fine)').matches) return

    const el = ref.current
    if (!el) return

    let raf = 0
    let started = false

    function onMove(e: MouseEvent) {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        if (!el) return
        if (!started) {
          started = true
          el.style.opacity = '1'
        }
        el.style.transform = `translate3d(${e.clientX - 260}px, ${e.clientY - 260}px, 0)`
      })
    }

    function onLeave() {
      if (el) el.style.opacity = '0'
    }

    window.addEventListener('mousemove', onMove)
    document.addEventListener('mouseleave', onLeave)
    return () => {
      window.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseleave', onLeave)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div
      aria-hidden
      ref={ref}
      style={{
        position: 'fixed', top: 0, left: 0,
        width: 520, height: 520, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(var(--glow-tone), 0.5), rgba(var(--glow-tone), 0) 68%)',
        pointerEvents: 'none', zIndex: -1,
        opacity: 0, willChange: 'transform, opacity',
        transition: 'opacity 0.3s ease',
      }}
    />
  )
}
