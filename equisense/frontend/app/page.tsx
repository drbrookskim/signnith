import Header from '@/components/layout/Header'
import SearchBox from '@/components/layout/SearchBox'
import QuickSuggestions from '@/components/layout/QuickSuggestions'

const MODULES = [
  {
    n: '01', ko: '분석', en: 'Fundamental',
    desc: '재무제표 · 핵심 지표 · 주가',
    glyph: <g><rect x="6" y="22" width="6" height="12"/><rect x="17" y="13" width="6" height="21"/><rect x="28" y="18" width="6" height="16"/><line x1="4" y1="34" x2="36" y2="34"/></g>,
  },
  {
    n: '02', ko: '해자', en: 'Moat',
    desc: '경쟁 우위 · 지속 가능성',
    glyph: <g><circle cx="20" cy="22" r="14"/><circle cx="20" cy="22" r="8.5"/><circle cx="20" cy="22" r="3"/></g>,
  },
  {
    n: '03', ko: '센티멘트', en: 'Qualitative',
    desc: 'AI 경영진 · 시장 심리',
    glyph: <g><path d="M8 14h24v14H22l-6 6v-6H8z"/><line x1="14" y1="21" x2="26" y2="21"/></g>,
  },
  {
    n: '04', ko: '스윙 투자', en: 'Technical',
    desc: 'SEPA 파이프라인 · 진입 판정',
    glyph: <g><line x1="12" y1="10" x2="12" y2="34"/><rect x="9" y="16" width="6" height="11"/><line x1="26" y1="12" x2="26" y2="34"/><rect x="23" y="20" width="6" height="9"/></g>,
  },
]

export default function Home() {
  return (
    <>
      <Header />
      <main className="eq-landing-main">
        {/* Hero */}
        <div style={{ textAlign: 'center', paddingTop: '11vh' }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 11,
            letterSpacing: '.34em', color: 'var(--ink-3)', textTransform: 'uppercase',
          }}>
            Four-Layer Equity Intelligence
          </div>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontWeight: 600,
            fontSize: 'clamp(40px,6vw,68px)',
            letterSpacing: '-.02em', color: 'var(--ink)',
            margin: '18px 0 0', lineHeight: 1.02,
          }}>
            쉬운 한 줄로 시작해,<br />끝까지 파고드는 분석
          </h1>
          <p style={{
            fontSize: 16, lineHeight: 1.6, color: 'var(--ink-2)',
            maxWidth: 560, margin: '20px auto 0',
          }}>
            종목을 입력하면{' '}
            <strong style={{ color: 'var(--ink)', fontWeight: 600 }}>
              분석 · 해자 · 센티멘트 · 스윙
            </strong>{' '}
            네 갈래로 진단합니다.
          </p>

          {/* Hero search box */}
          <div style={{ maxWidth: 580, margin: '30px auto 0' }}>
            <SearchBox variant="hero" autoFocus />

            {/* Quick suggestions — recent searches, falling back to defaults when empty */}
            <QuickSuggestions />
          </div>
        </div>

        {/* Module cards — glass blobs sit behind the grid so the blur has something to catch */}
        <div style={{ position: 'relative' }}>
          <div aria-hidden style={{
            position: 'absolute', top: -50, left: '4%', width: 220, height: 220,
            borderRadius: '50%', background: 'var(--accent)', opacity: 0.5,
            filter: 'blur(50px)', pointerEvents: 'none',
          }} />
          <div aria-hidden style={{
            position: 'absolute', bottom: -70, right: '6%', width: 260, height: 260,
            borderRadius: '50%', background: 'var(--ink-3)', opacity: 0.45,
            filter: 'blur(50px)', pointerEvents: 'none',
          }} />
          <div aria-hidden style={{
            position: 'absolute', top: '40%', left: '55%', width: 160, height: 160,
            borderRadius: '50%', background: 'var(--ink-2)', opacity: 0.3,
            filter: 'blur(50px)', pointerEvents: 'none',
          }} />
          <div className="eq-module-grid" style={{ position: 'relative' }}>
          {MODULES.map((m) => (
            <div key={m.n} className="eq-lift eq-card-glass" style={{
              background: 'rgba(var(--surface-rgb), 0.47)', border: '1px solid rgba(var(--glow-tone), 0.35)',
              borderRadius: 12, padding: '22px 20px',
              position: 'relative', overflow: 'hidden',
              backdropFilter: 'blur(18px) saturate(160%)',
              WebkitBackdropFilter: 'blur(18px) saturate(160%)',
              boxShadow: '0 14px 34px rgba(0, 0, 0, 0.14), inset 0 1px 0 rgba(var(--glow-tone), 0.4)',
            }}>
              <div style={{ position: 'absolute', top: 14, right: 16, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)' }}>
                {m.n}
              </div>
              <div style={{ color: 'var(--accent)', marginBottom: 16 }}>
                <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
                  {m.glyph}
                </svg>
              </div>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)' }}>{m.ko}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.08em', color: 'var(--ink-3)', textTransform: 'uppercase', margin: '3px 0 10px' }}>
                {m.en}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>{m.desc}</div>
            </div>
          ))}
          </div>
        </div>
      </main>
    </>
  )
}
