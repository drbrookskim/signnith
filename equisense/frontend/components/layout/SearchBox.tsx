'use client'

import { useEffect, useRef, useState } from 'react'
import { useRecentSearches } from '@/lib/hooks/useRecentSearches'

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
const PROXY = process.env.NEXT_PUBLIC_PROXY_URL ?? ''

type Market = 'KR' | 'US'
type Suggestion = { ticker: string; name: string; market: Market }

function isKrTicker(s: string) { return /^\d{5,6}$/.test(s) }
function hasKorean(s: string) { return /[가-힣]/.test(s) }

let krNamesCache: Record<string, string> | null = null

async function loadKrNames(): Promise<Record<string, string>> {
  if (krNamesCache) return krNamesCache
  const res = await fetch(`${BASE_PATH}/corp-names.json`)
  if (!res.ok) return {}
  krNamesCache = (await res.json()) as Record<string, string>
  return krNamesCache
}

function searchKR(query: string, names: Record<string, string>): Suggestion[] {
  const q = query.toLowerCase()
  const qUp = query.toUpperCase()
  const exact: Suggestion[] = [], sw: Suggestion[] = [], inc: Suggestion[] = []
  for (const [ticker, name] of Object.entries(names)) {
    const nameLow = name.toLowerCase()
    if (ticker === qUp) exact.push({ ticker, name, market: 'KR' })
    else if (ticker.startsWith(qUp) || nameLow.startsWith(q)) sw.push({ ticker, name, market: 'KR' })
    else if (nameLow.includes(q)) inc.push({ ticker, name, market: 'KR' })
  }
  sw.sort((a, b) => a.ticker.localeCompare(b.ticker))
  inc.sort((a, b) => a.ticker.localeCompare(b.ticker))
  return [...exact, ...sw, ...inc].slice(0, 6)
}

async function searchUS(query: string): Promise<Suggestion[]> {
  if (!PROXY || query.length < 1) return []
  try {
    const res = await fetch(`${PROXY}/yahoo/search?q=${encodeURIComponent(query)}`)
    if (!res.ok) return []
    const data = await res.json() as { quotes?: { symbol: string; longname?: string; shortname?: string; quoteType?: string; isYahooFinance?: boolean }[] }
    return (data.quotes ?? [])
      .filter((q) => q.quoteType === 'EQUITY' && q.isYahooFinance)
      .slice(0, 6)
      .map((q) => ({ ticker: q.symbol, name: q.longname || q.shortname || q.symbol, market: 'US' as const }))
  } catch { return [] }
}

interface SearchBoxProps {
  variant: 'hero' | 'compact'
  autoFocus?: boolean
  accentSubmit?: boolean
}

export default function SearchBox({ variant, autoFocus, accentSubmit }: SearchBoxProps) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const [cmdOpen, setCmdOpen] = useState(false)
  const [isMac, setIsMac] = useState(true)
  const [held, setHeld] = useState<{ mod: boolean; key: boolean }>({ mod: false, key: false })
  const [activeIdx, setActiveIdx] = useState(-1)
  const formRef = useRef<HTMLFormElement>(null)
  const pillRef = useRef<HTMLDivElement>(null)
  const cmdBtnRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const springRef = useRef<{ w: number; wv: number; wt: number; sc: number; scv: number; sct: number }>({
    w: 128, wv: 0, wt: 128, sc: 1, scv: 0, sct: 1,
  })
  const { recents, add: addRecent, remove: removeRecent } = useRecentSearches()

  const isHero = variant === 'hero'

  useEffect(() => {
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
    setIsMac(/mac|iphone|ipad|ipod/i.test(nav.userAgentData?.platform ?? navigator.platform ?? ''))
  }, [])

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (formRef.current && !formRef.current.contains(e.target as Node)) {
        setOpen(false)
        if (!isHero) setCmdOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [isHero])

  useEffect(() => {
    if (isHero) return
    const closedW = () => Math.max(118, Math.ceil(cmdBtnRef.current?.offsetWidth ?? 128))
    const openW = () => Math.min(360, Math.max(220, window.innerWidth - 140))
    const sp = springRef.current
    sp.wt = cmdOpen ? openW() : closedW()
    if (!cmdOpen) setOpen(false)
  }, [cmdOpen, isHero])

  useEffect(() => {
    if (isHero) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 30)
      last = now
      const sp = springRef.current
      const sub = 4
      const h = dt / sub
      for (let i = 0; i < sub; i++) {
        const aw = -300 * (sp.w - sp.wt) - 28 * sp.wv
        sp.wv += aw * h
        sp.w += sp.wv * h
        const asc = -520 * (sp.sc - sp.sct) - 34 * sp.scv
        sp.scv += asc * h
        sp.sc += sp.scv * h
      }
      if (pillRef.current) {
        pillRef.current.style.width = `${Math.max(96, sp.w).toFixed(2)}px`
        pillRef.current.style.transform = Math.abs(sp.sc - 1) > 0.001 ? `scale(${sp.sc.toFixed(4)})` : ''
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [isHero])

  useEffect(() => {
    if (isHero) return
    const isTyping = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
    const onKeyDown = (e: KeyboardEvent) => {
      const modDown = isMac ? e.metaKey : e.ctrlKey
      const kDown = e.key.toLowerCase() === 'k' || e.code === 'KeyK'
      if (!cmdOpen) {
        setHeld((c) => (c.mod === modDown && c.key === kDown ? c : { mod: modDown, key: kDown }))
        springRef.current.sct = modDown || kDown ? 0.97 : 1
      }
      if (!e.repeat && modDown && kDown) {
        e.preventDefault()
        setCmdOpen((prev) => {
          const next = !prev
          if (next) setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 40)
          return next
        })
        return
      }
      if (!cmdOpen && e.key === '/' && !isTyping(e.target)) {
        e.preventDefault()
        setCmdOpen(true)
        setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 40)
      }
    }
    const resetKeys = (e?: KeyboardEvent) => {
      const modDown = e ? (isMac ? e.metaKey : e.ctrlKey) : false
      const kDown = e ? (e.key.toLowerCase() === 'k' || e.code === 'KeyK') && e.type === 'keydown' : false
      setHeld({ mod: modDown, key: kDown })
      if (!modDown && !kDown) springRef.current.sct = 1
    }
    const onBlurWin = () => resetKeys()
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', resetKeys)
    window.addEventListener('blur', onBlurWin)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', resetKeys)
      window.removeEventListener('blur', onBlurWin)
    }
  }, [isHero, isMac, cmdOpen])

  async function runSearch(q: string) {
    const trimmed = q.trim()
    if (trimmed.length < 1) { setSuggestions([]); return }
    const korean = hasKorean(trimmed)
    const krNum = isKrTicker(trimmed)
    const [krResults, usResults] = await Promise.all([
      loadKrNames().then((names) => searchKR(trimmed, names)),
      !korean ? searchUS(trimmed) : Promise.resolve<Suggestion[]>([]),
    ])
    const combined = korean || krNum
      ? [...krResults.slice(0, 6), ...usResults.slice(0, 2)]
      : [...usResults.slice(0, 6), ...krResults.slice(0, 2)]
    setSuggestions(combined)
    setActiveIdx(-1)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setQuery(val)
    setOpen(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => runSearch(val), 250)
  }

  function navigate(s: Suggestion) {
    setOpen(false)
    setQuery(s.ticker)
    addRecent({ ticker: s.ticker, name: s.name, market: s.market })
    const nameParam = s.name ? `&name=${encodeURIComponent(s.name)}` : ''
    window.location.href = `${BASE_PATH}/companies/_/analysis?ticker=${s.ticker}&market=${s.market}${nameParam}` // eslint-disable-line react-hooks/immutability
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (activeIdx >= 0 && suggestions[activeIdx]) { navigate(suggestions[activeIdx]); return }
    if (suggestions.length > 0 && (hasKorean(query) || isKrTicker(query.trim()))) { navigate(suggestions[0]); return }
    const q = query.trim().toUpperCase()
    if (!q) return
    setOpen(false)
    window.location.href = `${BASE_PATH}/companies/_/analysis?ticker=${q}&market=${isKrTicker(q) ? 'KR' : 'US'}` // eslint-disable-line react-hooks/immutability
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setOpen(false)
      setActiveIdx(-1)
      if (!isHero) {
        setCmdOpen(false)
        setQuery('')
        inputRef.current?.blur()
      }
      return
    }
    if (!open || suggestions.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, -1)) }
  }

  const showRecents = open && query.trim() === '' && recents.length > 0
  const showSuggestions = open && query.trim() !== '' && suggestions.length > 0

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className={isHero ? undefined : 'eq-cmd-wrap'}
      style={isHero ? { position: 'relative', display: 'flex', width: '100%', gap: 10 } : undefined}
    >
      {isHero ? (
        <>
          <input
            value={query}
            onChange={handleChange}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            autoFocus={autoFocus}
            autoComplete="off"
            placeholder="종목 코드 또는 종목명 (예: AAPL, 삼성전자, NVDA)"
            style={{
              flex: 1, minWidth: 0,
              background: 'var(--surface)',
              border: '1px solid var(--line-2)',
              borderRadius: 8,
              padding: '15px 18px',
              fontSize: 15,
              color: 'var(--ink)',
              fontFamily: 'var(--font-ui)',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            style={{
              background: accentSubmit ? 'var(--accent)' : 'var(--ink)', color: 'var(--bg)',
              border: 'none', borderRadius: 8,
              padding: '0 28px',
              fontFamily: 'var(--font-mono)',
              fontSize: 14,
              fontWeight: 700, letterSpacing: '.05em',
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            분석 →
          </button>
        </>
      ) : (
        <div ref={pillRef} className={`eq-cmd-pill${cmdOpen ? ' open' : ''}`} style={{ width: 128 }}>
          <button
            ref={cmdBtnRef}
            type="button"
            className="eq-cmd-btn"
            aria-expanded={cmdOpen}
            onPointerDown={() => { if (!cmdOpen) springRef.current.sct = 0.97 }}
            onPointerUp={() => { springRef.current.sct = 1 }}
            onPointerLeave={() => { springRef.current.sct = 1 }}
            onClick={() => {
              setCmdOpen(true)
              setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 40)
            }}
          >
            <span>Search</span>
            <span className="eq-cmd-keys" aria-hidden="true">
              <kbd className="eq-cmd-kbd" data-on={held.mod ? 'true' : undefined}>{isMac ? '⌘' : 'Ctrl'}</kbd>
              <kbd className="eq-cmd-kbd" data-on={held.key ? 'true' : undefined}>K</kbd>
            </span>
          </button>
          <div className="eq-cmd-field">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: 'var(--cb-muted)', flexShrink: 0 }} aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              ref={inputRef}
              className="eq-cmd-input"
              value={query}
              onChange={handleChange}
              onFocus={() => setOpen(true)}
              onBlur={() => {
                setTimeout(() => {
                  if (!query.trim() && !formRef.current?.contains(document.activeElement)) {
                    setCmdOpen(false)
                    setOpen(false)
                  }
                }, 120)
              }}
              onKeyDown={handleKeyDown}
              autoComplete="off"
              placeholder="종목명 또는 티커 검색..."
              aria-label="종목 검색"
            />
            <button
              type="button"
              className="eq-cmd-kbd"
              title="닫기 (Esc)"
              onClick={() => {
                setCmdOpen(false)
                setOpen(false)
                setQuery('')
                inputRef.current?.blur()
              }}
            >
              Esc
            </button>
          </div>
        </div>
      )}

      {/* Recent searches dropdown */}
      {showRecents && (
        <div className="eq-glass" style={{
          position: 'absolute', left: isHero ? 0 : 'auto', right: isHero ? 'auto' : 0, top: 'calc(100% + 6px)',
          zIndex: 50, width: isHero ? '100%' : 'min(360px, calc(100vw - 32px))', maxWidth: isHero ? '100%' : 360,
          overflow: 'hidden', borderRadius: 10,
          background: 'var(--surface)', backdropFilter: 'none', WebkitBackdropFilter: 'none',
        }}>
          <div style={{
            padding: '7px 14px 5px',
            fontFamily: 'var(--font-mono)', fontSize: 10,
            letterSpacing: '.1em', textTransform: 'uppercase',
            color: 'var(--ink-3)',
          }}>
            최근 검색어
          </div>
          {recents.map((r) => (
            <div
              key={r.ticker}
              style={{
                display: 'flex', width: '100%', alignItems: 'center', gap: 12,
                padding: '8px 14px', boxSizing: 'border-box',
              }}
            >
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); navigate(r) }}
                style={{
                  all: 'unset', flex: 1, display: 'flex', alignItems: 'center',
                  gap: 12, cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: 14, flexShrink: 0 }}>{r.market === 'KR' ? '🕐' : '🕐'}</span>
                <span style={{ fontSize: 13, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {r.name}
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)', marginLeft: 4 }}>
                    ({r.ticker})
                  </span>
                </span>
              </button>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); removeRecent(r.ticker) }}
                style={{
                  all: 'unset', cursor: 'pointer',
                  fontSize: 14, color: 'var(--ink-3)',
                  flexShrink: 0, lineHeight: 1,
                  padding: '2px 4px',
                }}
                title="삭제"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Suggestions dropdown */}
      {showSuggestions && (
        <div className="eq-glass" style={{
          position: 'absolute', left: isHero ? 0 : 'auto', right: isHero ? 'auto' : 0, top: 'calc(100% + 6px)',
          zIndex: 50, width: isHero ? '100%' : 'min(360px, calc(100vw - 32px))', maxWidth: isHero ? '100%' : 360,
          overflow: 'hidden', borderRadius: 10,
        }}>
          {suggestions.map((s, i) => (
            <button
              key={`${s.market}-${s.ticker}`}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); navigate(s) }}
              onMouseEnter={() => setActiveIdx(i)}
              style={{
                all: 'unset', boxSizing: 'border-box',
                display: 'flex', width: '100%',
                alignItems: 'center', gap: 12,
                padding: '9px 14px', cursor: 'pointer',
                background: i === activeIdx ? 'var(--surface-2)' : 'transparent',
              }}
            >
              <span style={{ fontSize: 14, flexShrink: 0 }}>{s.market === 'KR' ? '🇰🇷' : '🇺🇸'}</span>
              <span style={{ fontSize: 13, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {s.name}
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)', marginLeft: 4 }}>
                  ({s.ticker})
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </form>
  )
}
