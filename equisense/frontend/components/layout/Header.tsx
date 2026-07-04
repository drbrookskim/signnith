'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import SearchBox from './SearchBox'
import { useAuth } from './AuthProvider'
import { useTheme } from '@/lib/hooks/useTheme'
import { useFavorites } from '@/lib/hooks/useFavorites'
import { useIsMobile } from '@/lib/hooks/useIsMobile'

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

export default function Header() {
  const pathname = usePathname()
  const router = useRouter()
  const isLanding = pathname === '/' || pathname === ''
  const { theme, toggle: toggleTheme } = useTheme()
  const { favorites } = useFavorites()
  const { user, logout } = useAuth()
  const [favOpen, setFavOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  const [avatarError, setAvatarError] = useState(false)
  const avatarUrl = (user?.user_metadata?.avatar_url ?? user?.user_metadata?.picture) as string | undefined
  const favRef = useRef<HTMLDivElement>(null)
  const userRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (favRef.current && !favRef.current.contains(e.target as Node)) setFavOpen(false)
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  useEffect(() => { setAvatarError(false) }, [user?.id])

  const hasFavs = favorites.length > 0

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 40,
      background: 'color-mix(in srgb, var(--bg) 86%, transparent)',
      backdropFilter: 'blur(12px)',
      borderBottom: '1px solid var(--line)',
    }}>
      <div style={{
        maxWidth: 1080, margin: '0 auto',
        padding: isMobile ? '0 16px' : '0 32px',
        height: 60,
        display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 16,
      }}>

        {/* Logo */}
        <a
          href={`${BASE_PATH || '/'}`}
          style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0 }}
        >
          <span style={{
            width: 26, height: 26, borderRadius: 6,
            background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="15" height="15" viewBox="0 0 40 40" fill="none"
              stroke="var(--bg)" strokeWidth="2.4" strokeLinecap="round">
              <circle cx="20" cy="20" r="13" />
              <circle cx="20" cy="20" r="4.5" />
            </svg>
          </span>
          {!isMobile && (
            <span style={{
              fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 600,
              letterSpacing: '-.01em', color: 'var(--ink)', whiteSpace: 'nowrap',
            }}>
              Equity<span style={{ color: 'var(--accent)' }}>Sense</span>
            </span>
          )}
        </a>

        {/* Search — 회사 페이지에서만 표시 / 랜딩에서는 spacer */}
        {!isLanding ? (
          <div style={{ flex: 1, maxWidth: isMobile ? undefined : 480 }}>
            <SearchBox variant="compact" accentSubmit={isMobile} />
          </div>
        ) : (
          <div style={{ flex: 1 }} />
        )}

        {/* ── 유저 메뉴 (모바일 포함 항상 표시) ── */}
        <div
          ref={userRef}
          style={{
            position: 'relative', flexShrink: 0,
          }}
        >
          {user ? (
            <>
              {/* 아바타 버튼 */}
              <button
                onClick={() => setUserOpen(v => !v)}
                title={user.email}
                style={{
                  all: 'unset', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '5px 10px 5px 6px',
                  border: '1px solid var(--line-2)',
                  borderRadius: 999,
                  background: 'var(--surface)',
                }}
              >
                {/* 프로필 아바타 */}
                {avatarUrl && !avatarError ? (
                  <img
                    src={avatarUrl}
                    alt="profile"
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarError(true)}
                    style={{
                      width: 24, height: 24, borderRadius: '50%',
                      objectFit: 'cover', flexShrink: 0,
                      border: '1px solid var(--line-2)',
                    }}
                  />
                ) : (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 24, height: 24, borderRadius: '50%',
                    background: 'var(--accent)', color: '#fff',
                    fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700,
                    flexShrink: 0,
                  }}>
                    {(user.email ?? '?')[0].toUpperCase()}
                  </span>
                )}
                {!isMobile && (
                  <span style={{
                    fontSize: 12.5, color: 'var(--ink-2)',
                    fontFamily: 'var(--font-ui)', maxWidth: 140,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {user.email}
                  </span>
                )}
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
                  style={{ color: 'var(--ink-3)', transform: userOpen ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }}>
                  <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {/* 드롭다운 */}
              {userOpen && (
                <div className="eq-glass" style={{
                  position: 'absolute', right: 0, top: 'calc(100% + 8px)',
                  zIndex: 60, minWidth: 200,
                  borderRadius: 10,
                  overflow: 'hidden',
                }}>
                  <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid var(--line)' }}>
                    <div style={{ fontSize: 10, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', letterSpacing: '.06em', marginBottom: 3 }}>로그인 계정</div>
                    <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {user.email}
                    </div>
                  </div>
                  <button
                    onClick={() => { setUserOpen(false); logout() }}
                    style={{
                      all: 'unset', boxSizing: 'border-box',
                      display: 'flex', alignItems: 'center', gap: 8,
                      width: '100%', padding: '10px 14px',
                      cursor: 'pointer', fontSize: 13,
                      color: '#dc2626', fontFamily: 'var(--font-ui)',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(220,38,38,0.07)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    로그아웃
                  </button>
                </div>
              )}
            </>
          ) : (
            /* 비로그인 상태 — 로그인 버튼 */
            <button
              onClick={() => router.push('/login')}
              style={{
                all: 'unset', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 14px',
                background: 'var(--accent)', color: '#fff',
                borderRadius: 999,
                fontSize: 13, fontWeight: 600,
                fontFamily: 'var(--font-ui)',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <polyline points="10 17 15 12 10 7" />
                <line x1="15" y1="12" x2="3" y2="12" />
              </svg>
              로그인
            </button>
          )}
        </div>

        {/* ── 데스크탑 전용 컨트롤 (유저 버튼 오른쪽) ── */}
        {!isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {/* 구분선 */}
            <div style={{ width: 1, height: 18, background: 'var(--line-2)', marginRight: 2 }} />

            {/* Favorites */}
            <div ref={favRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setFavOpen(v => !v)}
                title="즐겨찾기"
                style={{
                  all: 'unset', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 17, lineHeight: 1,
                  color: hasFavs ? 'var(--accent)' : 'var(--ink-3)',
                }}
              >
                {hasFavs ? '★' : '☆'}
              </button>
              {favOpen && (
                <div className="eq-glass" style={{
                  position: 'absolute', right: 0, top: 'calc(100% + 8px)',
                  zIndex: 60, width: 240,
                  borderRadius: 10,
                  overflow: 'hidden',
                }}>
                  {favorites.length === 0 ? (
                    <div style={{ padding: '16px', fontSize: 12, color: 'var(--ink-3)', textAlign: 'center' }}>
                      즐겨찾기한 종목이 없습니다
                    </div>
                  ) : favorites.map(f => (
                    <a
                      key={f.ticker}
                      href={`${BASE_PATH}/companies/_/analysis?ticker=${f.ticker}&market=${f.market}&name=${encodeURIComponent(f.name)}`}
                      onClick={() => setFavOpen(false)}
                      style={{ all: 'unset', boxSizing: 'border-box', display: 'flex', width: '100%', alignItems: 'center', gap: 8, padding: '9px 14px', cursor: 'pointer' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                    >
                      <span style={{ fontSize: 13, color: 'var(--ink)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)', flexShrink: 0 }}>{f.ticker}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              title={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
              style={{ all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, lineHeight: 1 }}
            >
              {theme === 'dark' ? '☀' : '🌙'}
            </button>

            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 10.5,
              letterSpacing: '.12em', color: 'var(--ink-3)',
              textTransform: 'uppercase', whiteSpace: 'nowrap', paddingLeft: 4,
            }}>
              4-Layer Analysis
            </div>
          </div>
        )}

      </div>
    </header>
  )
}
