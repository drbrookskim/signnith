import type {
  CompanyProfile,
  FundamentalAnalysis,
  FundamentalMetrics,
  Market,
  MetricTrend,
  TechnicalAnalysis,
  TechnicalDataPoint,
  TechnicalPeriod,
  TechnicalSummary,
  TrendDirection,
} from '@/types'

/** Yahoo Finance assetProfile 모듈 → CompanyProfile */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractProfile(assetProfile: any, fallbackName?: string | null): CompanyProfile | null {
  if (!assetProfile) return null
  const officers: { name?: string; title?: string }[] = assetProfile.companyOfficers ?? []
  const ceo = officers.find((o) => /\bCEO\b|Chief Executive/i.test(o.title ?? ''))?.name ?? null
  return {
    name: fallbackName ?? null,
    description: typeof assetProfile.longBusinessSummary === 'string' ? assetProfile.longBusinessSummary : null,
    ceo,
    sector: typeof assetProfile.sector === 'string' ? assetProfile.sector : null,
    industry: typeof assetProfile.industry === 'string' ? assetProfile.industry : null,
    website: typeof assetProfile.website === 'string' ? assetProfile.website : null,
    employees: r(assetProfile.fullTimeEmployees),
  }
}

/** netSharePurchaseActivity(내부자 순매수) + majorHoldersBreakdown(기관 보유율) → 해자/센티멘트 공용 신호 */
export function extractOwnershipSignals(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result: any,
): { insider_net_purchase_pct: number | null; institution_ownership_pct: number | null } {
  const nsp = result?.netSharePurchaseActivity
  const buyPct = r(nsp?.buyPercentInsiderShares)
  const sellPct = r(nsp?.sellPercentInsiderShares)
  const insider_net_purchase_pct = buyPct != null && sellPct != null ? (buyPct - sellPct) * 100 : null

  const institution_ownership_pct = r(result?.majorHoldersBreakdown?.institutionsPercentHeld) != null
    ? r(result.majorHoldersBreakdown.institutionsPercentHeld)! * 100
    : null

  return { insider_net_purchase_pct, institution_ownership_pct }
}

/** Yahoo Finance 숫자 필드: {raw: number} 또는 number 모두 처리 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function r(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === 'number') return isFinite(v) ? v : null
  if (typeof v === 'object' && 'raw' in v) return r((v as { raw: unknown }).raw)
  return null
}

function toYear(endDateRaw: unknown): number | null {
  const ts = r(endDateRaw)
  return ts ? new Date(ts * 1000).getFullYear() : null
}

function calcCagr(vals: [number, number][]): number | null {
  if (vals.length < 2) return null
  const [, first] = vals[0]
  const [, last] = vals[vals.length - 1]
  if (first <= 0 || last <= 0) return null
  return (Math.pow(last / first, 1 / (vals.length - 1)) - 1) * 100
}

function calcDirection(vals: [number, number][]): TrendDirection {
  if (vals.length < 2) return 'stable'
  const change = (vals[vals.length - 1][1] - vals[0][1]) / Math.abs(vals[0][1])
  return change > 0.05 ? 'improving' : change < -0.05 ? 'deteriorating' : 'stable'
}

function makeTrend(name: string, vals: [number, number][]): MetricTrend {
  const sorted = [...vals].sort(([a], [b]) => a - b)
  const yoy: [number, number | null][] = sorted.map(([y, v], i) => [
    y,
    i === 0 || sorted[i - 1][1] === 0
      ? null
      : ((v - sorted[i - 1][1]) / Math.abs(sorted[i - 1][1])) * 100,
  ])
  return {
    metric_name: name,
    values: sorted,
    cagr: calcCagr(sorted),
    direction: calcDirection(sorted),
    yoy_changes: yoy,
  }
}

// ── Timeseries 파서 ──────────────────────────────────────────────────────────

interface TsEntry {
  _revenue?: number | null
  _netIncome?: number | null
  _opIncome?: number | null
  _interestExpense?: number | null
  totalAssets?: number | null
  totalLiab?: number | null
  equity?: number | null
  ocf?: number | null
  capex?: number | null
}

const TS_KEY_MAP: Record<string, keyof TsEntry> = {
  Revenue:                                  '_revenue',
  NetIncome:                                '_netIncome',
  OperatingIncome:                          '_opIncome',
  TotalAssets:                              'totalAssets',
  TotalLiabilitiesNetMinorityInterest:      'totalLiab',
  StockholdersEquity:                       'equity',
  OperatingCashFlow:                        'ocf',
  CapitalExpenditure:                       'capex',
  InterestExpense:                          '_interestExpense',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseTimeseries(raw: unknown): Map<number, TsEntry> {
  const map = new Map<number, TsEntry>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results: any[] = (raw as any)?.timeseries?.result ?? []
  for (const series of results) {
    const type: string = series?.meta?.type?.[0] ?? ''
    if (!type.startsWith('annual')) continue
    const key = TS_KEY_MAP[type.slice('annual'.length)]
    if (!key) continue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entries: any[] = series[type] ?? []
    for (const entry of entries) {
      if (!entry) continue
      const yr = parseInt(String(entry.asOfDate).slice(0, 4))
      if (!yr || isNaN(yr)) continue
      const val = entry.reportedValue?.raw ?? null
      if (!map.has(yr)) map.set(yr, {})
      map.get(yr)![key] = typeof val === 'number' && isFinite(val) ? val : null
    }
  }
  return map
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function transformYahooToFundamentals(data: any, ticker: string, market: Market, tsMap?: Map<number, TsEntry>): FundamentalAnalysis {
  const result = data?.quoteSummary?.result?.[0]
  if (!result) throw new Error(`Yahoo Finance: 데이터 없음 (${ticker})`)

  const incomeList: unknown[] = result.incomeStatementHistory?.incomeStatementHistory ?? []
  const balanceList: unknown[] = result.balanceSheetHistory?.balanceSheetStatements ?? []
  const cfList: unknown[] = result.cashflowStatementHistory?.cashflowStatements ?? []
  const keyStats = result.defaultKeyStatistics ?? {}

  type YearEntry = Partial<FundamentalMetrics> & {
    _revenue?: number | null
    _opIncome?: number | null
    _netIncome?: number | null
    _interestExpense?: number | null   // 신규
  }
  const map = new Map<number, YearEntry>()

  // Income Statement
  for (const s of incomeList as Record<string, unknown>[]) {
    const yr = toYear(s.endDate)
    if (!yr) continue
    const e = map.get(yr) ?? {}
    e._revenue = r(s.totalRevenue)
    // ebit: {raw: 0} 는 Yahoo Finance의 미래/미확정 연도 플레이스홀더 — 0은 null로 처리
    e._opIncome = r(s.operatingIncome) ?? (r(s.ebit) || null)
    e._netIncome = r(s.netIncome)
    e._interestExpense = r(s.interestExpense)
    map.set(yr, e)
  }

  // Balance Sheet
  for (const s of balanceList as Record<string, unknown>[]) {
    const yr = toYear(s.endDate)
    if (!yr) continue
    const e = map.get(yr) ?? {}
    const assets = r(s.totalAssets)
    const liab = r(s.totalLiab)
    const equity = r(s.totalStockholderEquity)
    const net = e._netIncome ?? null
    e.debt_ratio = assets && liab ? (liab / assets) * 100 : null
    e.roe = net != null && equity ? (net / equity) * 100 : null
    e.roa = net != null && assets ? (net / assets) * 100 : null
    map.set(yr, e)
  }

  // Cash Flow
  for (const s of cfList as Record<string, unknown>[]) {
    const yr = toYear(s.endDate)
    if (!yr) continue
    const e = map.get(yr) ?? {}
    const ocf = r(s.totalCashFromOperatingActivities)
    const capex = r(s.capitalExpenditures) // negative
    e.fcf = ocf != null ? (capex != null ? ocf + capex : ocf) : null
    map.set(yr, e)
  }

  // Timeseries 보완: incomeStatementHistory/balanceSheet 공백을 timeseries로 채움
  if (tsMap) {
    for (const [yr, ts] of tsMap) {
      const e = map.get(yr) ?? {}
      if (ts._revenue != null && e._revenue == null)        e._revenue = ts._revenue
      if (ts._netIncome != null && e._netIncome == null)    e._netIncome = ts._netIncome
      if (ts._opIncome != null && e._opIncome == null)      e._opIncome = ts._opIncome
      if (ts._interestExpense != null && e._interestExpense == null) e._interestExpense = ts._interestExpense
      // Balance sheet → ROE / ROA / debt_ratio
      const net  = e._netIncome ?? ts._netIncome ?? null
      if (ts.totalAssets && ts.totalLiab != null && e.debt_ratio == null)
        e.debt_ratio = (ts.totalLiab / ts.totalAssets) * 100
      if (ts.totalAssets && net != null && e.roa == null)
        e.roa = (net / ts.totalAssets) * 100
      if (ts.equity && ts.equity !== 0 && net != null && e.roe == null)
        e.roe = (net / ts.equity) * 100
      // FCF = OCF − |capex|  (capex may be positive or negative in timeseries)
      if (ts.ocf != null && e.fcf == null) {
        const capex = ts.capex != null ? -Math.abs(ts.capex) : 0
        e.fcf = ts.ocf + capex
      }
      map.set(yr, e)
    }
  }

  // financialData 모듈 — incomeStatementHistory/balanceSheet가 비어있을 때 최신 연도 보완
  const fd = result.financialData ?? {}

  // Operating margin + PER/PBR for each year
  const sortedYears = Array.from(map.keys()).sort((a, b) => a - b)
  const latestYear = sortedYears.at(-1)

  // 최신 연도 영업이익이 없으면 financialData.operatingMargins × revenue로 역산
  if (latestYear != null) {
    const le = map.get(latestYear)!
    if (!le._opIncome && le._revenue != null) {
      const opMgn = r(fd.operatingMargins)
      if (opMgn != null) le._opIncome = le._revenue * opMgn
    }
  }

  for (const yr of sortedYears) {
    const e = map.get(yr)!
    if (e._revenue && e._opIncome != null) {
      e.operating_margin = (e._opIncome / e._revenue) * 100
    }
    // ICR = 영업이익 / |이자비용|
    if (e._opIncome != null && e._interestExpense != null && e._interestExpense !== 0) {
      e.icr = e._opIncome / Math.abs(e._interestExpense)
    } else {
      e.icr = null
    }
    if (yr === latestYear) {
      e.per = r(keyStats.trailingPE) ?? r(keyStats.forwardPE)
      e.pbr = r(keyStats.priceToBook) ?? r(fd.priceToBook)
      // PEG Ratio
      e.peg_ratio = r(keyStats.pegRatio)
      // 52주 고저 + 현재가 (summaryDetail 모듈)
      const summary = result.summaryDetail ?? {}
      e.week52_high   = r(summary.fiftyTwoWeekHigh)
      e.week52_low    = r(summary.fiftyTwoWeekLow)
      e.current_price = r(fd.currentPrice) ?? r(fd.regularMarketPrice)
      // financialData를 최신 연도 우선 소스로 사용 (incomeStatementHistory ebit=0 같은 오염 데이터 방어)
      const opMgn = r(fd.operatingMargins)
      if (opMgn != null) e.operating_margin = opMgn * 100
      const roe = r(fd.returnOnEquity)
      if (roe != null) e.roe = roe * 100
      const roa = r(fd.returnOnAssets)
      if (roa != null) e.roa = roa * 100
      const fcf = r(fd.freeCashflow)
      if (fcf != null) e.fcf = fcf
      // debtToEquity(%) → debt_ratio 근사: D/(D+E)×100 = (D/E)/(1+D/E)×100
      const de = r(fd.debtToEquity)
      if (de != null && de >= 0) e.debt_ratio = (de / (100 + de)) * 100
    }
    e.fiscal_year = yr
  }

  const metrics_by_year: FundamentalMetrics[] = sortedYears.map((yr) => {
    const e = map.get(yr)!
    return {
      fiscal_year:      yr,
      roe:              e.roe ?? null,
      roa:              e.roa ?? null,
      debt_ratio:       e.debt_ratio ?? null,
      operating_margin: e.operating_margin ?? null,
      fcf:              e.fcf ?? null,
      per:              e.per ?? null,
      pbr:              e.pbr ?? null,
      icr:              e.icr ?? null,
      peg_ratio:        e.peg_ratio ?? null,
      week52_high:      e.week52_high ?? null,
      week52_low:       e.week52_low ?? null,
      current_price:    e.current_price ?? null,
    }
  })

  const revPairs: [number, number][] = []
  const opPairs: [number, number][] = []
  const netPairs: [number, number][] = []
  for (const [yr, e] of map) {
    if (e._revenue != null) revPairs.push([yr, e._revenue])
    if (e._opIncome != null) opPairs.push([yr, e._opIncome])
    if (e._netIncome != null) netPairs.push([yr, e._netIncome])
  }

  const qt = result.quoteType ?? {}
  const name: string | null =
    (typeof qt.longName === 'string' && qt.longName) ||
    (typeof qt.shortName === 'string' && qt.shortName) ||
    null

  return {
    ticker,
    name,
    market,
    metrics_by_year,
    trends: {
      revenue: makeTrend('revenue', revPairs),
      operating_income: makeTrend('operating_income', opPairs),
      net_income: makeTrend('net_income', netPairs),
    },
    profile: extractProfile(result.assetProfile, name),
    ...extractOwnershipSignals(result),
  }
}

export function transformYahooToTechnical(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any,
  ticker: string,
  market: Market,
  period: TechnicalPeriod,
): TechnicalAnalysis {
  const result = data?.chart?.result?.[0]
  if (!result) throw new Error(`Yahoo Finance: 차트 데이터 없음 (${ticker})`)

  const timestamps: number[] = result.timestamp ?? []
  const q = result.indicators?.quote?.[0] ?? {}

  const data_points: TechnicalDataPoint[] = timestamps
    .map((ts, i) => {
      const close = (q.close?.[i] as number | null | undefined) ?? null
      const prevClose = i > 0 ? ((q.close?.[i - 1] as number | null | undefined) ?? null) : null
      return {
        date: new Date(ts * 1000).toISOString().slice(0, 10),
        open: (q.open?.[i] as number | null | undefined) ?? null,
        high: (q.high?.[i] as number | null | undefined) ?? null,
        low: (q.low?.[i] as number | null | undefined) ?? null,
        close,
        volume: (q.volume?.[i] as number | null | undefined) ?? null,
        change_pct:
          close != null && prevClose != null && prevClose !== 0
            ? ((close - prevClose) / prevClose) * 100
            : null,
      }
    })
    .filter((d) => d.close != null)

  const closes = data_points.map((d) => d.close).filter((c): c is number => c != null)
  const vols = data_points.map((d) => d.volume).filter((v): v is number => v != null)
  const s = data_points[0]?.close ?? null
  const e = data_points.at(-1)?.close ?? null

  const summary: TechnicalSummary = {
    start_price: s,
    end_price: e,
    period_return_pct: s && e ? ((e - s) / s) * 100 : null,
    high_period: closes.length ? Math.max(...closes) : null,
    low_period: closes.length ? Math.min(...closes) : null,
    avg_volume: vols.length ? vols.reduce((a, b) => a + b, 0) / vols.length : null,
  }

  return { ticker, market, period, data_points, summary }
}
