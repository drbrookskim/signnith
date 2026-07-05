'use client'

import { useState } from 'react'
import { loginWithGoogle } from '@/lib/auth'

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

export default function LoginPage() {
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGoogleLogin() {
    setIsPending(true)
    setError(null)
    try {
      await loginWithGoogle()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Google 로그인 중 오류가 발생했습니다.')
      setIsPending(false)
    }
  }

  return (
    <main style={{
      position: 'relative', display: 'flex', minHeight: '100vh',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: '0 16px', overflow: 'hidden',
    }}>
      <div aria-hidden style={{
        position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-140%)',
        width: 300, height: 300, borderRadius: '50%', background: 'var(--accent)',
        opacity: 0.42, filter: 'blur(65px)', pointerEvents: 'none',
      }} />
      <div aria-hidden style={{
        position: 'absolute', bottom: '15%', left: '50%', transform: 'translateX(60%)',
        width: 320, height: 320, borderRadius: '50%', background: 'var(--ink-3)',
        opacity: 0.35, filter: 'blur(70px)', pointerEvents: 'none',
      }} />
      <div aria-hidden style={{
        position: 'absolute', top: '55%', left: '50%', transform: 'translateX(10%)',
        width: 220, height: 220, borderRadius: '50%', background: 'var(--ink-2)',
        opacity: 0.22, filter: 'blur(60px)', pointerEvents: 'none',
      }} />
      <div className="eq-glass" style={{
        width: '100%', maxWidth: 380,
        borderRadius: 16, padding: '44px 36px 40px',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}>
        {/* 로고 */}
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: 'var(--accent)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          marginBottom: 16,
        }}>
          <svg width="22" height="22" viewBox="0 0 40 40" fill="none"
            stroke="white" strokeWidth="2.4" strokeLinecap="round">
            <circle cx="20" cy="20" r="13" />
            <circle cx="20" cy="20" r="4.5" />
          </svg>
        </div>

        <div style={{
          fontFamily: 'var(--font-display)', fontWeight: 700,
          fontSize: 20, color: 'var(--ink)', letterSpacing: '-.01em',
          marginBottom: 8,
        }}>
          Equi<span style={{ color: 'var(--accent)' }}>Sense</span>
        </div>

        <p style={{
          fontSize: 13, color: 'var(--ink-3)', marginBottom: 32,
          fontFamily: 'var(--font-ui)', textAlign: 'center', lineHeight: 1.5,
        }}>
          4단계 주식 분석 플랫폼
        </p>

        {/* Google 로그인 버튼 */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={isPending}
          style={{
            width: '100%', boxSizing: 'border-box',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            padding: '12px 0',
            background: 'var(--surface)', color: 'var(--ink)',
            border: '1px solid var(--line-2)',
            borderRadius: 9, cursor: isPending ? 'not-allowed' : 'pointer',
            fontSize: 14, fontWeight: 600,
            fontFamily: 'var(--font-ui)',
            opacity: isPending ? 0.7 : 1,
            transition: 'background 0.15s, box-shadow 0.15s',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}
          onMouseEnter={e => {
            if (!isPending) {
              (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'
              ;(e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.10)'
            }
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.background = 'var(--surface)'
            ;(e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'
          }}
        >
          <GoogleIcon />
          {isPending ? '연결 중…' : 'Google로 계속하기'}
        </button>

        {error && (
          <div style={{
            marginTop: 16, width: '100%', boxSizing: 'border-box',
            padding: '10px 13px', borderRadius: 8,
            background: 'rgba(220,38,38,0.08)',
            border: '1px solid rgba(220,38,38,0.20)',
            fontSize: 13, color: '#dc2626',
            fontFamily: 'var(--font-ui)', textAlign: 'center',
          }}>
            {error}
          </div>
        )}
      </div>
    </main>
  )
}
