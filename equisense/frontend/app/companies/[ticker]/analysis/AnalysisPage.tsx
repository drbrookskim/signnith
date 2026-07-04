'use client'

import { Suspense } from 'react'
import FundamentalsPage from '@/app/companies/[ticker]/fundamentals/FundamentalsPage'
import TechnicalPage from '@/app/companies/[ticker]/technical/TechnicalPage'

function Skeleton({ height }: { height: string }) {
  return <div className={`animate-pulse rounded ${height} bg-zinc-100 dark:bg-zinc-800`} />
}

function AnalysisContent() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 48 }}>
      <section>
        <FundamentalsPage />
      </section>
      <section>
        <TechnicalPage hideHeader />
      </section>
    </div>
  )
}

export default function AnalysisPage() {
  return (
    <Suspense fallback={<Skeleton height="h-8" />}>
      <AnalysisContent />
    </Suspense>
  )
}
