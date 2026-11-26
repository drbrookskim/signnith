/**
 * 클라이언트 사이드 API 함수.
 *
 * Cloudflare Worker 프록시를 통해 Yahoo Finance / DART API를 직접 호출합니다.
 * 백엔드 없음 — output: export와 완전히 호환됩니다.
 */

import type {
  AnalysisJob,
  DocType,
  DualQualitativeResult,
  FundamentalAnalysis,
  GateAData,
  Market,
  MoatAnalysis,
  PeerComparison,
  PeerMargin,
  QuarterlyInsightMap,
  SentimentData,
  TechnicalAnalysis,
  TechnicalPeriod,
} from '@/types'
import { ApiError } from '@/lib/api-error'
import { transformDartToFundamentals } from '@/lib/adapters/dart'
import { extractOutlook, extractOwnershipSignals, extractProfile, transformYahooToFundamentals, transformYahooToTechnical, parseTimeseries } from '@/lib/adapters/yahoo'
import { computeQuarterlyInsights } from '@/lib/adapters/quarterly'
import { applyPeerComparisonToMoat, calculateMoat } from '@/lib/adapters/moat'
import { calculateQualitative, lookupJob } from '@/lib/adapters/qualitative'
import { parseSentimentData } from '@/lib/adapters/sentiment'
import { MACRO_CONSTANTS } from '@/lib/adapters/swingPipeline'

const PROXY = process.env.NEXT_PUBLIC_PROXY_URL ?? ''
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

const SUMMARY_MODULES = [
  'incomeStatementHistory',
  'balanceSheetHistory',
  'cashflowStatementHistory',
  'defaultKeyStatistics',
  'financialData',
  'quoteType',
  'summaryDetail',
  'assetProfile',
  'netSharePurchaseActivity',
  'majorHoldersBreakdown',
  'earningsTrend',
].join(',')

async function proxyFetch<T>(path: string, retries = 1): Promise<T> {
  if (!PROXY) throw new ApiError('NEXT_PUBLIC_PROXY_URL이 설정되지 않았습니다.')
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${PROXY}${path}`)
      if (res.ok) return res.json() as Promise<T>
      lastErr = new ApiError(`Proxy ${res.status}: ${path}`, res.status)
      if (res.status < 500 && res.status !== 429) throw lastErr
    } catch (err) {
      if (err instanceof ApiError && err.status && err.status < 500 && err.status !== 429) throw err
      lastErr = err
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, 350 * (attempt + 1)))
  }
  throw lastErr
}

function normalizeYahooSymbol(ticker: string, market: Market): string {
  if (market === 'US' && /^[A-Z]+\.[A-Z]$/.test(ticker)) {
    return ticker.replace('.', '-')
  }
  return ticker
}

// corp-codes.json / corp-names.json은 GitHub Pages 정적 파일로 제공
let _corpCodeMap: Record<string, string> | null = null
let _corpNameMap: Record<string, string> | null = null

async function getCorpCode(stockCode: string): Promise<string> {
  if (!_corpCodeMap) {
    const res = await fetch(`${BASE_PATH}/corp-codes.json`)
    if (!res.ok) throw new Error('corp-codes.json 로드 실패')
    _corpCodeMap = await res.json() as Record<string, string>
  }
  const corpCode = _corpCodeMap[stockCode]
  if (!corpCode) throw new ApiError(`DART: 기업코드 없음 (${stockCode})`, 404)
  return corpCode
}

async function getCorpName(stockCode: string): Promise<string | undefined> {
  if (!_corpNameMap) {
    const res = await fetch(`${BASE_PATH}/corp-names.json`).catch(() => null)
    if (!res?.ok) return undefined
    _corpNameMap = await res.json() as Record<string, string>
  }
  return _corpNameMap[stockCode]
}

export async function getFundamentals(ticker: string, market: Market): Promise<FundamentalAnalysis> {
  if (market === 'KR') {
    const [corpCode, corpName] = await Promise.all([
      getCorpCode(ticker),
      getCorpName(ticker),
    ])

    const year = new Date().getFullYear() - 1
    const [dartDataRecent, dartDataOld, yahooData] = await Promise.all([
      proxyFetch<unknown>(`/dart/fs?corp_code=${corpCode}&year=${year}`),
      proxyFetch<unknown>(`/dart/fs?corp_code=${corpCode}&year=${year - 2}`).catch(() => null),
      proxyFetch<unknown>(
        `/yahoo/summary?symbol=${ticker}&market=KR&modules=defaultKeyStatistics,financialData,summaryDetail,assetProfile,netSharePurchaseActivity,majorHoldersBreakdown,earningsTrend`,
      ).catch(() => null),
    ])

    const yahooResult = (
      yahooData as { quoteSummary?: { result?: Record<string, unknown>[] } } | null
    )?.quoteSummary?.result?.[0] ?? {}

    const keyStats = {
      ...((yahooResult.defaultKeyStatistics as Record<string, unknown>) ?? {}),
      ...((yahooResult.financialData     as Record<string, unknown>) ?? {}),
      ...((yahooResult.summaryDetail      as Record<string, unknown>) ?? {}),
    }

    const fundamentals = transformDartToFundamentals(dartDataRecent, dartDataOld, keyStats, ticker, corpName)
    fundamentals.profile = extractProfile(yahooResult.assetProfile, corpName ?? fundamentals.name)
    Object.assign(fundamentals, extractOwnershipSignals(yahooResult))
    fundamentals.outlook = extractOutlook(yahooResult)
    return fundamentals
  }

  const symbol = normalizeYahooSymbol(ticker, market)
  const [summaryResult, tsResult] = await Promise.allSettled([
    proxyFetch<unknown>(`/yahoo/summary?symbol=${encodeURIComponent(symbol)}&modules=${SUMMARY_MODULES}`),
    proxyFetch<unknown>(`/yahoo/timeseries?symbol=${encodeURIComponent(symbol)}`),
  ])
  if (summaryResult.status === 'rejected') throw summaryResult.reason
  const data = summaryResult.value
  const tsMap = tsResult.status === 'fulfilled' ? parseTimeseries(tsResult.value) : undefined
  return transformYahooToFundamentals(data, ticker, market, tsMap)
}

export async function translateToKo(text: string): Promise<string> {
  if (!PROXY || !text) return text
  try {
    const res = await fetch(`${PROXY}/translate?text=${encodeURIComponent(text)}&target=ko`)
    if (!res.ok) return text
    const data = await res.json() as { translated?: string }
    return data.translated || text
  } catch {
    return text
  }
}

export async function getCompanyOverview(params: {
  ticker: string
  name?: string | null
  market: Market
  sector?: string | null
  industry?: string | null
  summary?: string | null
}): Promise<string | null> {
  if (!PROXY || !params.ticker) return null
  try {
    const qs = new URLSearchParams({
      ticker: params.ticker,
      market: params.market,
    })
    if (params.name) qs.set('name', params.name)
    if (params.sector) qs.set('sector', params.sector)
    if (params.industry) qs.set('industry', params.industry)
    if (params.summary) qs.set('summary', params.summary.slice(0, 1500))
    const res = await fetch(`${PROXY}/ai/company-overview?${qs.toString()}`)
    if (!res.ok) return null
    const data = await res.json() as { overview?: string | null }
    return data.overview ?? null
  } catch {
    return null
  }
}

async function getPeerComparison(ticker: string, companyMargin: number | null): Promise<PeerComparison | null> {
  if (!PROXY) return null
  try {
    const res = await fetch(`${PROXY}/fmp/peer-comparison?symbol=${ticker}`)
    if (!res.ok) return null
    const data = await res.json() as { peers?: PeerMargin[] }
    const peers = data.peers ?? []
    const margins = peers.map((p) => p.operating_margin).filter((m): m is number => m != null)
    const peer_avg_margin = margins.length > 0 ? margins.reduce((a, b) => a + b, 0) / margins.length : null
    const delta_pct = companyMargin != null && peer_avg_margin != null ? companyMargin - peer_avg_margin : null
    return { peers, peer_avg_margin, company_margin: companyMargin, delta_pct }
  } catch {
    return null
  }
}

export async function getMoatScore(ticker: string, market: Market): Promise<MoatAnalysis> {
  const fundamentals = await getFundamentals(ticker, market)
  let moat = calculateMoat(fundamentals)
  if (market === 'US') {
    const companyMargin = fundamentals.metrics_by_year.at(-1)?.operating_margin ?? null
    const peerComparison = await getPeerComparison(ticker, companyMargin)
    moat = applyPeerComparisonToMoat(moat, peerComparison, fundamentals.name ?? ticker, fundamentals.profile?.sector)
  }
  return moat
}

export async function getTechnicalData(
  ticker: string,
  market: Market,
  period: TechnicalPeriod = '1y',
): Promise<TechnicalAnalysis> {
  const rangeMap: Record<TechnicalPeriod, string> = {
    '1m': '1mo',
    '3m': '3mo',
    '6m': '6mo',
    '1y': '1y',
    '3y': '3y',
  }
  const symbol = normalizeYahooSymbol(ticker, market)
  const data = await proxyFetch<unknown>(
    `/yahoo/chart?symbol=${encodeURIComponent(symbol)}&market=${market}&range=${rangeMap[period]}&interval=1d`,
  )
  return transformYahooToTechnical(data, ticker, market, period)
}

export async function getQuarterlyPrices(
  ticker: string,
  market: Market,
): Promise<{ quarter: string; close: number }[]> {
  const symbol = normalizeYahooSymbol(ticker, market)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await proxyFetch<any>(
    `/yahoo/chart?symbol=${encodeURIComponent(symbol)}&market=${market}&range=2y&interval=3mo`,
  )
  const result = raw?.chart?.result?.[0]
  if (!result) return []
  const timestamps: number[] = result.timestamp ?? []
  const closes: number[] = result.indicators?.quote?.[0]?.close ?? []
  const out: { quarter: string; close: number }[] = []
  timestamps.forEach((ts: number, i: number) => {
    const c = closes[i]
    if (c == null || isNaN(c)) return
    const d = new Date(ts * 1000)
    const q = Math.ceil((d.getMonth() + 1) / 3)
    out.push({ quarter: `'${String(d.getFullYear()).slice(2)} Q${q}`, close: c })
  })
  return out.slice(-8)
}

export async function triggerQualitativeAnalysis(
  ticker: string,
  market: Market,
  fiscal_year: number,
  doc_type: DocType,
): Promise<AnalysisJob> {
  const fundamentals = await getFundamentals(ticker, market)
  return calculateQualitative(fundamentals, fiscal_year, doc_type, market)
}

export async function triggerDualQualitativeAnalysis(
  ticker: string,
  market: Market,
  fiscal_year: number,
): Promise<DualQualitativeResult> {
  const fundamentals = await getFundamentals(ticker, market)
  const annual = calculateQualitative(fundamentals, fiscal_year, 'annual_report', market)
  const earnings = calculateQualitative(fundamentals, fiscal_year, 'earnings_call', market)
  return { annual: annual.result!, earnings: earnings.result! }
}

export async function getJobStatus(jobId: string): Promise<AnalysisJob> {
  const job = lookupJob(jobId)
  if (!job) throw new Error(`작업을 찾을 수 없습니다: ${jobId}`)
  return job
}

export async function getQuarterlyInsights(
  ticker: string,
  market: Market,
): Promise<QuarterlyInsightMap> {
  const QUARTERLY_MODULES = [
    'incomeStatementHistoryQuarterly',
    'balanceSheetHistoryQuarterly',
    'cashflowStatementHistoryQuarterly',
  ].join(',')

  const symbol = normalizeYahooSymbol(ticker, market)
  const data = await proxyFetch<unknown>(
    `/yahoo/summary?symbol=${encodeURIComponent(symbol)}&market=${market}&modules=${QUARTERLY_MODULES}`,
  )
  return computeQuarterlyInsights(data)
}

/** @deprecated 백엔드 미사용 */
export async function getPrice(_ticker: string): Promise<{ data: null; cached: false }> {
  return { data: null, cached: false }
}

export async function fetchSentimentData(
  ticker: string,
  market: Market,
): Promise<SentimentData> {
  const SENTIMENT_MODULES = [
    'recommendationTrend',
    'financialData',
    'earningsHistory',
    'insiderHolders',
    'institutionOwnership',
    'upgradeDowngradeHistory',
    'defaultKeyStatistics',
    'summaryDetail',
    'netSharePurchaseActivity',
    'majorHoldersBreakdown',
    'earningsTrend',
  ].join(',')

  const symbol = normalizeYahooSymbol(ticker, market)
  const [yahooRes, dartRes, newsRes] = await Promise.allSettled([
    proxyFetch<unknown>(
      `/yahoo/summary?symbol=${encodeURIComponent(symbol)}&market=${market}&modules=${SENTIMENT_MODULES}`,
    ),
    market === 'KR'
      ? getCorpCode(ticker).then(corpCode =>
          proxyFetch<unknown>(`/dart/disclosures?corp_code=${corpCode}&page_count=20`),
        )
      : Promise.resolve(null),
    proxyFetch<unknown>(
      `/yahoo/news?symbol=${encodeURIComponent(symbol)}&market=${market}`,
    ).catch(() => null),
  ])

  const yahooData = yahooRes.status === 'fulfilled' ? yahooRes.value : null
  const dartData  = dartRes.status  === 'fulfilled' ? dartRes.value  : null
  const newsData  = newsRes.status  === 'fulfilled' ? newsRes.value  : null

  return parseSentimentData(yahooData, dartData, newsData)
}

export async function fetchGateAData(): Promise<GateAData> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function extractPrice(data: any): number | null {
    const p = data?.quoteSummary?.result?.[0]?.price?.regularMarketPrice
    if (p == null) return null
    if (typeof p === 'number') return p
    if (typeof p === 'object' && 'raw' in p) return (p as { raw: number }).raw
    return null
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function extractMa200(data: any): number | null {
    const ma = data?.quoteSummary?.result?.[0]?.summaryDetail?.twoHundredDayAverage
    if (ma == null) return null
    if (typeof ma === 'number') return ma
    if (typeof ma === 'object' && 'raw' in ma) return (ma as { raw: number }).raw
    return null
  }

  const [vixRes, kospiRes, krwRes] = await Promise.allSettled([
    proxyFetch<unknown>('/yahoo/summary?symbol=%5EVIX&modules=price'),
    proxyFetch<unknown>('/yahoo/summary?symbol=%5EKS11&modules=price%2CsummaryDetail'),
    proxyFetch<unknown>('/yahoo/summary?symbol=KRW%3DX&modules=price'),
  ])

  return {
    vix:          vixRes.status   === 'fulfilled' ? extractPrice(vixRes.value)   : null,
    kospi_price:  kospiRes.status === 'fulfilled' ? extractPrice(kospiRes.value) : null,
    kospi_ma200:  kospiRes.status === 'fulfilled' ? extractMa200(kospiRes.value) : null,
    usdkrw:       krwRes.status   === 'fulfilled' ? extractPrice(krwRes.value)   : null,
    rate_bp:      MACRO_CONSTANTS.rate_bp,
    pmi:          MACRO_CONSTANTS.pmi,
    pmi_direction: MACRO_CONSTANTS.pmi_direction,
  }
}
