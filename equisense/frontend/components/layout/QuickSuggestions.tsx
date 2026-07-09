'use client'

import { useRecentSearches } from '@/lib/hooks/useRecentSearches'

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

const DEFAULTS = [
  { ticker: 'AAPL', name: 'Apple', market: 'US' as const },
  { ticker: 'NVDA', name: 'NVIDIA', market: 'US' as const },
  { ticker: '005930', name: '삼성전자', market: 'KR' as const },
]

export default function QuickSuggestions() {
  const { recents } = useRecentSearches()
  const items = recents.length > 0 ? recents : DEFAULTS

  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 14, flexWrap: 'wrap' }}>
      {items.map((s) => (
        <a
          key={s.ticker}
          href={`${BASE_PATH}/companies/_/analysis?ticker=${s.ticker}&market=${s.market}&name=${encodeURIComponent(s.name)}`}
          style={{
            textDecoration: 'none',
            background: 'transparent',
            border: '1px solid var(--line-2)',
            borderRadius: 999, padding: '6px 14px',
            display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>
            {s.ticker}
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{s.name}</span>
        </a>
      ))}
    </div>
  )
}
