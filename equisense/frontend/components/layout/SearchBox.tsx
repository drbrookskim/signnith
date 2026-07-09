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
  const [activeIdx, setActiveIdx] = useState(-1)
  const formRef = useRef<HTMLFormElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { recents, add: addRecent, remove: removeRecent } = useRecentSearches()

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (formRef.current && !formRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

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
    if (!open || suggestions.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, -1)) }
    if (e.key === 'Escape') { setOpen(false); setActiveIdx(-1) }
  }

  const isHero = variant === 'hero'
  const showRecents = open && query.trim() === '' && recents.length > 0
  const showSuggestions = open && query.trim() !== '' && suggestions.length > 0

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      style={{ position: 'relative', display: 'flex', width: '100%', gap: isHero ? 10 : 8 }}
    >
      <input
        value={query}
        onChange={handleChange}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        autoFocus={autoFocus}
        autoComplete="off"
        placeholder={isHero
          ? '종목 코드 또는 종목명 (예: AAPL, 삼성전자, NVDA)'
          : '종목 검색…'}
        style={{
          flex: 1, minWidth: 0,
          background: 'var(--surface)',
          border: '1px solid var(--line-2)',
          borderRadius: 8,
          padding: isHero ? '15px 18px' : '10px 14px',
          fontSize: isHero ? 15 : 13.5,
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
          padding: isHero ? '0 28px' : '0 15px',
          fontFamily: 'var(--font-mono)',
          fontSize: isHero ? 14 : 12.5,
          fontWeight: 700, letterSpacing: '.05em',
          cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        {isHero ? '분석 →' : '→'}
      </button>

      {/* Recent searches dropdown */}
      {showRecents && (
        <div className="eq-glass" style={{
          position: 'absolute', left: 0, top: 'calc(100% + 6px)',
          zIndex: 50, width: '100%', maxWidth: isHero ? '100%' : 420,
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
          position: 'absolute', left: 0, top: 'calc(100% + 6px)',
          zIndex: 50, width: '100%', maxWidth: isHero ? '100%' : 420,
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
