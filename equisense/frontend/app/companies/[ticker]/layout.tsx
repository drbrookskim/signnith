import { Suspense } from 'react'
import Header from '@/components/layout/Header'
import TabNav from '@/components/layout/TabNav'
import CompanyBand from '@/components/layout/CompanyBand'
import { CompanyScoresProvider } from '@/contexts/CompanyScoresContext'
import { RevealStateProvider } from '@/contexts/RevealStateContext'

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
      <div aria-hidden className="eq-bg-blob eq-bg-blob-green-1" />
      <div aria-hidden className="eq-bg-blob eq-bg-blob-gray-1" />
      <div aria-hidden className="eq-bg-blob eq-bg-blob-gray-2" />
      <div aria-hidden className="eq-bg-blob eq-bg-blob-green-2" />
      <CompanyScoresProvider>
        <RevealStateProvider>
          <Suspense fallback={null}>
            <CompanyBand />
          </Suspense>
          <Suspense
            fallback={
              <div className="eq-tabnav-glass" style={{ height: 72 }} />
            }
          >
            <TabNav ticker={ticker.toUpperCase()} />
          </Suspense>
          <main className="eq-company-main">
            {children}
          </main>
        </RevealStateProvider>
      </CompanyScoresProvider>
    </>
  )
}
