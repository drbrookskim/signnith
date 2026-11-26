/**
 * 클라이언트 사이드 API 함수.
 *
 * Cloudflare Worker 프록시를 통해 Yahoo Finance / DART API를 직접 호출합니다.
 * 백엔드 없음 — output: export와 완전히 호환됩니다.
 */

import type {
  AnalysisJob,
  BusinessMoatInsight,
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
import { applyBusinessMoatToMoat, applyPeerComparisonToMoat, calculateMoat } from '@/lib/adapters/moat'
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

async function proxyFetch<T>(path: string, retries = 2): Promise<T> {
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
    if (attempt < retries) {
      const delay = 400 * Math.pow(2, attempt) + Math.floor(Math.random() * 150)
      await new Promise((r) => setTimeout(r, delay))
    }
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

async function getBusinessMoat(params: {
  ticker: string
  name?: string | null
  market: Market
  sector?: string | null
  industry?: string | null
  metrics?: string | null
  summary?: string | null
}): Promise<BusinessMoatInsight | null> {
  if (!PROXY || !params.ticker) return null
  try {
    const qs = new URLSearchParams({
      ticker: params.ticker,
      market: params.market,
    })
    if (params.name) qs.set('name', params.name)
    if (params.sector) qs.set('sector', params.sector)
    if (params.industry) qs.set('industry', params.industry)
    if (params.metrics) qs.set('metrics', params.metrics.slice(0, 400))
    if (params.summary) qs.set('summary', params.summary.slice(0, 1500))
    const res = await fetch(`${PROXY}/ai/moat-business?${qs.toString()}`)
    if (!res.ok) return null
    const data = (await res.json()) as { business_moat?: BusinessMoatInsight | null }
    return data.business_moat ?? null
  } catch {
    return null
  }
}

export async function getMoatScore(
  ticker: string,
  market: Market,
  existingFundamentals?: FundamentalAnalysis,
): Promise<MoatAnalysis> {
  const fundamentals = existingFundamentals ?? (await getFundamentals(ticker, market))
  let moat = calculateMoat(fundamentals)
  const latest = fundamentals.metrics_by_year.at(-1)
  const companyMargin = latest?.operating_margin ?? null
  const displayName = fundamentals.name ?? ticker
  const sector = fundamentals.profile?.sector
  const revCagr = fundamentals.trends.revenue?.cagr
  const metricsSummary = [
    companyMargin != null ? `영업이익률 ${companyMargin.toFixed(1)}%` : null,
    latest?.roe != null ? `ROE ${latest.roe.toFixed(1)}%` : null,
    latest?.roa != null ? `ROA ${latest.roa.toFixed(1)}%` : null,
    revCagr != null ? `매출 CAGR ${revCagr.toFixed(1)}%` : null,
    latest?.debt_ratio != null ? `부채비율 ${latest.debt_ratio.toFixed(1)}%` : null,
  ].filter(Boolean).join(', ')

  const [peerRes, bizRes] = await Promise.allSettled([
    market === 'US' ? getPeerComparison(ticker, companyMargin) : Promise.resolve(null),
    getBusinessMoat({
      ticker,
      name: fundamentals.name,
      market,
      sector,
      industry: fundamentals.profile?.industry,
      metrics: metricsSummary || null,
      summary: fundamentals.profile?.description,
    }),
  ])

  if (peerRes.status === 'fulfilled' && peerRes.value) {
    moat = applyPeerComparisonToMoat(moat, peerRes.value, displayName, sector)
  }
  if (bizRes.status === 'fulfilled' && bizRes.value) {
    moat = applyBusinessMoatToMoat(moat, bizRes.value, displayName, sector)
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
  quarterLabel: string,
): Promise<DualQualitativeResult> {
  const fiscalYear = parseInt(quarterLabel.slice(0, 4), 10) || new Date().getFullYear()
  const [fundRes, qRes, sentRes] = await Promise.allSettled([
    getFundamentals(ticker, market),
    getQuarterlyInsights(ticker, market),
    fetchSentimentData(ticker, market),
  ])
  if (fundRes.status === 'rejected') throw fundRes.reason
  const fundamentals = fundRes.value
  const annual = calculateQualitative(fundamentals, fiscalYear, 'annual_report', market).result!
  const earnings = calculateQualitative(fundamentals, fiscalYear, 'earnings_call', market).result!
  annual.fiscal_period = quarterLabel
  earnings.fiscal_period = quarterLabel

  if (!PROXY) return { annual, earnings }

  try {
    const moat = await getMoatScore(ticker, market, fundamentals).catch(() => null)
    const quarterly = qRes.status === 'fulfilled' ? qRes.value : null
    const sentiment = sentRes.status === 'fulfilled' ? sentRes.value : null

    const moatLines = moat ? [
      `종합 해자: ${moat.grade.toUpperCase()} (${moat.composite_score}/10, ${moat.durability_trend ?? 'stable'})`,
      moat.business_moat?.business_summary ? `사업 구조: ${moat.business_moat.business_summary}` : null,
      ...moat.dimension_scores.map(
        (d) => `- ${d.dimension} ${d.score}점: ${d.business_rationale ?? d.rationale ?? ''}`,
      ),
      moat.business_moat?.erosion_risks?.length
        ? `침식 리스크: ${moat.business_moat.erosion_risks.join(' / ')}`
        : null,
    ].filter(Boolean).join('\n') : ''

    const quarterlyLines = quarterly
      ? Object.entries(quarterly)
          .filter(([, v]) => v && !v.insufficient)
          .map(([k, v]) => `${k}: ${v!.trend_line} (${v!.momentum_label})`)
          .join('\n')
      : ''

    const sentLines = sentiment ? [
      sentiment.consensus ? `애널리스트 매수 ${sentiment.consensus.strong_buy + sentiment.consensus.buy}/${sentiment.consensus.total}` : null,
      sentiment.earnings_surprises.length > 0
        ? `최근 서프라이즈: ${sentiment.earnings_surprises.map((s) => `${s.quarter} ${s.surprise_pct != null ? `${s.surprise_pct.toFixed(1)}%` : '—'}`).join(', ')}`
        : null,
      sentiment.news?.length
        ? `최근 뉴스: ${sentiment.news.slice(0, 4).map((n) => `[${n.sentiment}] ${n.title}`).join(' | ')}`
        : null,
      sentiment.disclosures?.length
        ? `DART 공시: ${sentiment.disclosures.slice(0, 4).map((d) => d.report_nm).join(' | ')}`
        : null,
    ].filter(Boolean).join('\n') : ''

    const qs = new URLSearchParams({
      ticker,
      market,
      quarter: quarterLabel,
    })
    if (fundamentals.name) qs.set('name', fundamentals.name)
    if (moatLines) qs.set('moat', moatLines.slice(0, 1400))
    if (quarterlyLines) qs.set('quarterly', quarterlyLines.slice(0, 800))
    if (sentLines) qs.set('sentiment', sentLines.slice(0, 800))

    const res = await fetch(`${PROXY}/ai/qualitative-quarter?${qs.toString()}`)
    if (res.ok) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as { analysis?: any }
      const s = data?.analysis?.structural
      const q = data?.analysis?.quarterly
      if (s) {
        if (typeof s.summary_ko === 'string' && s.summary_ko.trim()) annual.summary_ko = s.summary_ko.trim()
        if (Array.isArray(s.risk_factors) && s.risk_factors.length > 0) annual.risk_factors = s.risk_factors
        if (Array.isArray(s.growth_drivers) && s.growth_drivers.length > 0) annual.growth_drivers = s.growth_drivers
        if (Array.isArray(s.noise_filter) && s.noise_filter.length > 0) annual.noise_filter = s.noise_filter
      }
      if (q) {
        if (typeof q.summary_ko === 'string' && q.summary_ko.trim()) earnings.summary_ko = q.summary_ko.trim()
        if (Array.isArray(q.risk_factors) && q.risk_factors.length > 0) earnings.risk_factors = q.risk_factors
        if (Array.isArray(q.growth_drivers) && q.growth_drivers.length > 0) earnings.growth_drivers = q.growth_drivers
        if (Array.isArray(q.noise_filter) && q.noise_filter.length > 0) earnings.noise_filter = q.noise_filter
      }
    }
  } catch {
    // AI 생성 실패 시 계산된 정량 기반 폴백 유지
  }

  return { annual, earnings }
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
