'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useCompanyScores } from '@/contexts/CompanyScoresContext'
import { useFavorites } from '@/lib/hooks/useFavorites'
import { useIsMobile } from '@/lib/hooks/useIsMobile'

const PROXY = process.env.NEXT_PUBLIC_PROXY_URL ?? ''

interface CompanyMeta {
  exchangeName: string
  sector: string
  industry: string
  marketCap: number | null
  price: number | null
  change: number | null
  changePct: number | null
}

function fmtMarketCap(v: number, market: string): string {
  if (market === 'KR') {
    if (v >= 1e12) return `${(v / 1e12).toFixed(1)}조원`
    if (v >= 1e8)  return `${(v / 1e8).toFixed(0)}억원`
    return `${v.toLocaleString('ko-KR')}원`
  }
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(1)}B`
  if (v >= 1e6)  return `$${(v / 1e6).toFixed(0)}M`
  return `$${v.toLocaleString()}`
}

function fmtExchange(raw: string, market: string): string {
  if (market === 'KR') return raw.toUpperCase().includes('KOSDAQ') ? 'KOSDAQ' : 'KOSPI'
  if (/nasdaq/i.test(raw)) return 'NASDAQ'
  if (/nyse/i.test(raw)) return 'NYSE'
  return raw
}

function raw(obj: unknown, key: string): number | null {
  if (!obj || typeof obj !== 'object') return null
  const v = (obj as Record<string, unknown>)[key]
  if (v == null) return null
  if (typeof v === 'number') return v
  if (typeof v === 'object' && v !== null && 'raw' in v) return (v as { raw: number }).raw
  return null
}

function str(obj: unknown, key: string): string {
  if (!obj || typeof obj !== 'object') return ''
  const v = (obj as Record<string, unknown>)[key]
  return typeof v === 'string' ? v : ''
}

export default function CompanyBand() {
  const searchParams = useSearchParams()
  const ticker = (searchParams.get('ticker') ?? '').toUpperCase()
  const market = searchParams.get('market') ?? 'US'
  const name = searchParams.get('name')
  const { compositeScore } = useCompanyScores()
  const { isFavorite, toggle: toggleFavorite } = useFavorites()
  const isMobile = useIsMobile()

  const [meta, setMeta] = useState<CompanyMeta | null>(null)

  useEffect(() => {
    if (!ticker || !PROXY) return
    let cancelled = false
    // financialData 포함: currentPrice가 price.regularMarketPrice보다 신선한 경우가 있음
    const modules = 'price,summaryProfile,financialData'
    fetch(`${PROXY}/yahoo/summary?symbol=${ticker}&market=${market}&modules=${modules}`)
      .then(r => r.json())
      .then((json: unknown) => {
        if (cancelled) return
        const result = (json as { quoteSummary?: { result?: unknown[] } })
          ?.quoteSummary?.result?.[0]
        if (!result || typeof result !== 'object') return

        const res = result as Record<string, unknown>
        const p  = res['price']         as Record<string, unknown> | undefined
        const sp = res['summaryProfile'] as Record<string, unknown> | undefined
        const fd = res['financialData']  as Record<string, unknown> | undefined

        // currentPrice(financialData) 가 regularMarketPrice(price) 보다 신선한 경우가 있어 우선 사용
        const priceVal = raw(fd, 'currentPrice') ?? raw(p, 'regularMarketPrice')

        setMeta({
          exchangeName: fmtExchange(str(p, 'exchangeName'), market),
          sector: str(sp, 'sector'),
          industry: str(sp, 'industry'),
          marketCap: raw(p, 'marketCap'),
          price: priceVal,
          change: raw(p, 'regularMarketChange'),
          changePct: raw(p, 'regularMarketChangePercent'),
        })
      })
      .catch(() => {/* silent */})
    return () => { cancelled = true }
  }, [ticker, market])

  if (!ticker) return null

  const isUp = (meta?.change ?? 0) >= 0
  const changeColor = isUp ? '#dc2626' : '#2563eb'
  const changePrefix = isUp ? '▲' : '▼'

  const scoreTone = compositeScore == null ? 'var(--ink-3)'
    : compositeScore >= 80 ? 'var(--accent)'
    : compositeScore >= 60 ? '#b45309'
    : '#dc2626'

  const metaParts: string[] = []
  if (meta?.exchangeName) metaParts.push(meta.exchangeName)
  if (meta?.sector) metaParts.push(meta.sector)
  if (meta?.industry) metaParts.push(meta.industry)
  if (meta?.marketCap) metaParts.push(`시총 ${fmtMarketCap(meta.marketCap, market)}`)

  return (
    <div style={{
      maxWidth: 1080, margin: '0 auto',
      padding: isMobile ? '16px 16px 0' : '26px 32px 0',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        {/* Left: title + meta + price */}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h1 style={{
              margin: 0,
              fontFamily: 'var(--font-display)', fontWeight: 600,
              fontSize: isMobile ? 24 : 32, color: 'var(--ink)',
              letterSpacing: '-.01em', lineHeight: 1.08,
            }}>
              {name ?? ticker}
            </h1>
            <button
              onClick={() => toggleFavorite({ ticker, name: name ?? ticker, market: market as 'KR' | 'US' })}
              title={isFavorite(ticker) ? '즐겨찾기 해제' : '즐겨찾기 추가'}
              style={{
                all: 'unset', cursor: 'pointer',
                fontSize: isMobile ? 16 : 20, lineHeight: 1,
                color: isFavorite(ticker) ? 'var(--accent)' : 'var(--ink-3)',
                transition: 'color 0.15s, transform 0.12s',
                paddingTop: 2,
              }}
            >
              {isFavorite(ticker) ? '★' : '☆'}
            </button>
          </div>

          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: isMobile ? 10 : 11,
            color: 'var(--ink-3)', marginTop: 6, letterSpacing: '.04em',
          }}>
            {[ticker, ...metaParts].join(' · ')}
          </div>

          {meta?.price != null && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
              <span style={{
                fontFamily: 'var(--font-display)', fontWeight: 600,
                fontSize: isMobile ? 22 : 26, color: 'var(--ink)', letterSpacing: '-.01em',
              }}>
                {market === 'KR'
                  ? `${meta.price.toLocaleString('ko-KR')}원`
                  : `$${Math.round(meta.price).toLocaleString('en-US')}`}
              </span>
              {meta.change != null && meta.changePct != null && (
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: isMobile ? 11 : 12, fontWeight: 600,
                  color: changeColor,
                }}>
                  {changePrefix} {market === 'KR'
                    ? `${Math.abs(meta.change).toLocaleString('ko-KR')}원`
                    : `$${Math.round(Math.abs(meta.change)).toLocaleString('en-US')}`
                  }{' '}({Math.abs(meta.changePct * 100).toFixed(2)}%)
                </span>
              )}
            </div>
          )}
        </div>

        {/* Right: composite score */}
        {compositeScore != null && (
          <div style={{ textAlign: 'right', flexShrink: 0, paddingTop: 4 }}>
            <div style={{
              fontFamily: 'var(--font-display)', fontWeight: 700,
              fontSize: isMobile ? 32 : 40, lineHeight: 1, color: scoreTone,
              letterSpacing: '-.02em',
            }}>
              {compositeScore}
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 10,
              color: 'var(--ink-3)', letterSpacing: '.08em',
              textTransform: 'uppercase', marginTop: 4,
            }}>
              종합
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
