import { Suspense } from 'react'
import Header from '@/components/layout/Header'
import TabNav from '@/components/layout/TabNav'
import CompanyBand from '@/components/layout/CompanyBand'
import { CompanyScoresProvider } from '@/contexts/CompanyScoresContext'

// 실제 ticker는 빌드 시 알 수 없으므로 placeholder로 라우트 등록.
// 실제 라우팅은 클라이언트 JS + 404.html SPA 폴백이 처리.
export async function generateStaticParams() {
  return [{ ticker: '_' }]
}

export default async function CompanyLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ ticker: string }>
}) {
  const { ticker } = await params

  return (
    <>
      <Header />
      {/* 글래스 Card 뒤에 비칠 배경 — 스크롤과 무관하게 고정 */}
      <div aria-hidden style={{
        position: 'fixed', top: '6%', left: '6%', width: 240, height: 240,
        borderRadius: '50%', background: 'var(--accent)', opacity: 0.22,
        filter: 'blur(60px)', pointerEvents: 'none', zIndex: -1,
      }} />
      <div aria-hidden style={{
        position: 'fixed', bottom: '4%', right: '8%', width: 280, height: 280,
        borderRadius: '50%', background: 'var(--ink-3)', opacity: 0.2,
        filter: 'blur(70px)', pointerEvents: 'none', zIndex: -1,
      }} />
      <CompanyScoresProvider>
        <Suspense fallback={null}>
          <CompanyBand />
        </Suspense>
        <Suspense
          fallback={
            <div style={{ borderBottom: '1px solid var(--line-2)', height: 72 }} />
          }
        >
          <TabNav ticker={ticker.toUpperCase()} />
        </Suspense>
        <main className="eq-company-main">
          {children}
        </main>
      </CompanyScoresProvider>
    </>
  )
}
