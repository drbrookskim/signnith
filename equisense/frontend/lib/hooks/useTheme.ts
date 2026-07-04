'use client'

import { useEffect, useState } from 'react'

type Theme = 'light' | 'dark'
const KEY = 'eq-theme'

export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>('light')
  const [ready, setReady] = useState(false)

  // localStorage를 마운트 시 한 번만 읽음
  useEffect(() => {
    try {
      const stored = localStorage.getItem(KEY)
      let parsed: Theme = 'light'
      try { parsed = JSON.parse(stored ?? '') as Theme } catch { /* raw string fallback */ parsed = (stored as Theme) ?? 'light' }
      if (parsed === 'dark') setTheme('dark')
    } catch { /* ignore */ }
    setReady(true)
  }, [])

  // ready 이후에만 DOM을 조작해서 no-flash 스크립트가 적용한 다크 모드를 초기에 되돌리지 않음
  useEffect(() => {
    if (!ready) return
    const root = document.documentElement
    if (theme === 'dark') {
      root.setAttribute('data-theme', 'dark')
      root.classList.add('dark')
    } else {
      root.removeAttribute('data-theme')
      root.classList.remove('dark')
    }
    try { localStorage.setItem(KEY, JSON.stringify(theme)) } catch { /* ignore */ }
  }, [theme, ready])

  function toggle() {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark')
  }

  return { theme, toggle }
}
