'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useCompanyScores, type TabHref } from '@/contexts/CompanyScoresContext'
import { useIsMobile } from '@/lib/hooks/useIsMobile'

const TABS = [
  {
    href: 'analysis',
    ko: '분석',
    en: 'Fundamental',
    glyph: (
      <g>
        <rect x="6" y="22" width="6" height="12" />
        <rect x="17" y="13" width="6" height="21" />
        <rect x="28" y="18" width="6" height="16" />
        <line x1="4" y1="34" x2="36" y2="34" />
      </g>
    ),
  },
  {
    href: 'moat',
    ko: '해자',
    en: 'Moat',
    glyph: (
      <g>
        <circle cx="20" cy="22" r="14" />
        <circle cx="20" cy="22" r="8.5" />
        <circle cx="20" cy="22" r="3" />
      </g>
    ),
  },
  {
    href: 'qualitative',
    ko: '센티멘트',
    en: 'Qualitative',
    glyph: (
      <g>
        <path d="M8 14h24v14H22l-6 6v-6H8z" />
        <line x1="14" y1="21" x2="26" y2="21" />
      </g>
    ),
  },
  {
    href: 'swing',
    ko: '스윙 투자',
    en: 'Technical',
    glyph: (
      <g>
        <line x1="12" y1="10" x2="12" y2="34" />
        <rect x="9" y="16" width="6" height="11" />
        <line x1="26" y1="12" x2="26" y2="34" />
        <rect x="23" y="20" width="6" height="9" />
      </g>
    ),
  },
]

const BADGE_COLOR: Record<string, string> = {
  strong: 'var(--accent)',
  neutral: '#b45309',
  weak: '#dc2626',
}

function badgeText(label: string, score?: number): string {
  if (score != null) return `${score}/100 · ${label}`
  return label
}

export default function TabNav({ ticker: _tickerProp }: { ticker: string }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const market = searchParams.get('market') ?? 'US'
  const ticker = searchParams.get('ticker') ?? _tickerProp
  const name = searchParams.get('name')
  const nameParam = name ? `&name=${encodeURIComponent(name)}` : ''
  const { badges } = useCompanyScores()
  const isMobile = useIsMobile()

  return (
    <nav className="eq-tabnav-glass" style={{ paddingBottom: isMobile ? 10 : 14 }}>
      <div
        className={isMobile ? 'eq-ribbon-scroll' : undefined}
        style={isMobile ? {
          display: 'flex',
          overflowX: 'auto',
          padding: '0 16px',
          gap: 0,
        } : {
          maxWidth: 1080, margin: '0 auto',
          padding: '0 32px',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 0,
        }}
      >
        {TABS.map((tab) => {
          const isActive = pathname === `/companies/_/${tab.href}`
          const badge = badges[tab.href as TabHref]
          return (
            <Link
              key={tab.href}
              href={`/companies/_/${tab.href}?ticker=${ticker}&market=${market}${nameParam}`}
              style={{
                textDecoration: 'none',
                textAlign: 'left',
                background: isActive ? 'rgba(var(--glow-tone), 0.16)' : 'transparent',
                border: isActive ? '1px solid var(--line-2)' : 'none',
                borderBottom: isActive ? 'none' : '1px solid var(--line-2)',
                borderRadius: '10px 10px 0 0',
                padding: isMobile ? '10px 14px' : '13px 16px',
                cursor: 'pointer',
                position: 'relative',
                display: 'block',
                flexShrink: isMobile ? 0 : undefined,
                minWidth: isMobile ? 110 : undefined,
              }}
            >
              {isActive && (
                <span style={{
                  position: 'absolute', top: 0, left: 16, right: 16,
                  height: 2, background: 'var(--accent)',
                }} />
              )}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 7,
                color: isActive ? 'var(--accent)' : 'var(--ink-3)',
                whiteSpace: 'nowrap',
              }}>
                <svg
                  width="16" height="16" viewBox="0 0 40 40"
                  fill="none" stroke="currentColor"
                  strokeWidth="1.6" strokeLinejoin="round"
                >
                  {tab.glyph}
                </svg>
                <span style={{
                  fontSize: isMobile ? 12.5 : 13.5, fontWeight: 700,
                  color: isActive ? 'var(--ink)' : 'var(--ink-2)',
                }}>
                  {tab.ko}
                </span>
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                marginTop: 4, whiteSpace: 'nowrap',
              }}>
                {!isMobile && (
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.08em',
                    color: 'var(--ink-3)', textTransform: 'uppercase',
                  }}>
                    {tab.en}
                  </span>
                )}
                {badge && (
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 800,
                    letterSpacing: '.06em', textTransform: 'uppercase',
                    color: BADGE_COLOR[badge.tone],
                  }}>
                    {isMobile ? badgeText(badge.label, badge.score) : badge.label}
                  </span>
                )}
              </div>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
