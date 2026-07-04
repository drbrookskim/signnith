'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { getTechnicalData } from '@/lib/api-client'
import type { Market, TechnicalAnalysis, TechnicalPeriod } from '@/types'
import TechnicalCharts from '@/components/charts/TechnicalCharts'

const VALID_PERIODS = new Set<string>(['1m', '3m', '6m', '1y', '3y'])

interface Props { hideHeader?: boolean }

function TechnicalContent({ hideHeader = false }: Props) {
  const searchParams = useSearchParams()
  const ticker = (searchParams.get('ticker') ?? '').toUpperCase()
  const market = (searchParams.get('market') === 'KR' ? 'KR' : 'US') as Market
  const name = searchParams.get('name')

  // period는 URL에서 초기값을 읽되 React state로 관리
  // (Next.js 16 static export에서 router.push가 query param을 갱신하지 않는 문제 우회)
  const [period, setPeriod] = useState<TechnicalPeriod>(() => {
    const p = searchParams.get('period')
    return (VALID_PERIODS.has(p ?? '') ? p : '1y') as TechnicalPeriod
  })

  const [data, setData] = useState<TechnicalAnalysis | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true) // eslint-disable-line react-hooks/set-state-in-effect
    setErrorMsg(null) // eslint-disable-line react-hooks/set-state-in-effect
    getTechnicalData(ticker, market, period)
      .then(d => { if (!cancelled) setData(d) })
      .catch((err: { status?: number }) => {
        if (!cancelled) setErrorMsg(
          err?.status === 404
            ? `${ticker} 종목의 주가 데이터를 찾을 수 없습니다.`
            : '데이터를 불러오는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
        )
      })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [ticker, market, period])

  if (isLoading) return <LoadingSkeleton />
  if (errorMsg) {
    return (
      <div className="flex h-60 items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-800">
        <p className="text-sm text-zinc-500">{errorMsg}</p>
      </div>
    )
  }
  if (!data) return null

  return (
    <div className="space-y-8">
      {!hideHeader && (
        <h2 className="text-2xl font-bold">
          {name ? `${name} (${data.ticker})` : data.ticker}
        </h2>
      )}
      <Suspense
        fallback={
          <div className="flex h-60 items-center justify-center">
            <span className="text-sm text-zinc-400">차트 로딩 중…</span>
          </div>
        }
      >
        <TechnicalCharts data={data} ticker={ticker} period={period} onPeriodChange={setPeriod} />
      </Suspense>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 w-48 rounded bg-zinc-100 dark:bg-zinc-800" />
      <div className="h-60 rounded bg-zinc-100 dark:bg-zinc-800" />
    </div>
  )
}

export default function TechnicalPage({ hideHeader = false }: Props) {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <TechnicalContent hideHeader={hideHeader} />
    </Suspense>
  )
}
