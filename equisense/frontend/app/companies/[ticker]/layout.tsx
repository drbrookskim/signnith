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
        position: 'fixed', top: '4%', left: '4%', width: 340, height: 340,
        borderRadius: '50%', background: 'var(--accent)', opacity: 0.4,
        filter: 'blur(65px)', pointerEvents: 'none', zIndex: -1,
      }} />
      <div aria-hidden style={{
        position: 'fixed', top: '10%', right: '6%', width: 300, height: 300,
        borderRadius: '50%', background: 'var(--ink-2)', opacity: 0.3,
        filter: 'blur(65px)', pointerEvents: 'none', zIndex: -1,
      }} />
      <div aria-hidden style={{
        position: 'fixed', bottom: '4%', right: '10%', width: 360, height: 360,
        borderRadius: '50%', background: 'var(--ink-3)', opacity: 0.38,
        filter: 'blur(75px)', pointerEvents: 'none', zIndex: -1,
      }} />
      <div aria-hidden style={{
        position: 'fixed', bottom: '8%', left: '12%', width: 260, height: 260,
        borderRadius: '50%', background: 'var(--accent)', opacity: 0.25,
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
