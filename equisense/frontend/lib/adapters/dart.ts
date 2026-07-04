import type {
  FundamentalAnalysis,
  FundamentalMetrics,
  Market,
  MetricTrend,
  TrendDirection,
} from '@/types'

interface DartAccount {
  sj_div: string
  account_nm: string
  thstrm_amount: string
  frmtrm_amount: string
  bfefrmtrm_amount: string
  bsns_year: string
}

function parseAmt(s: string | null | undefined): number | null {
  if (!s || s === '-' || s.trim() === '') return null
  const n = parseInt(s.replace(/,/g, ''), 10)
  return isNaN(n) ? null : n
}

const AMOUNT_FIELDS = ['bfefrmtrm_amount', 'frmtrm_amount', 'thstrm_amount'] as const // eslint-disable-line @typescript-eslint/no-unused-vars

function findAmt(
  list: DartAccount[],
  sjDiv: string,
  names: string[],
  field: (typeof AMOUNT_FIELDS)[number],
): number | null {
  // 일부 기업은 IS(손익계산서) 대신 CIS(포괄손익계산서)에 손익 항목을 기재
  const divs = sjDiv === 'IS' ? ['IS', 'CIS'] : [sjDiv]
  for (const div of divs) {
    for (const name of names) {
      const found = list.find((a) => a.sj_div === div && a.account_nm.trim() === name)
      if (found) return parseAmt(found[field])
    }
  }
  return null
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
  const yoy: [number, number | null][] = vals.map(([y, v], i) => [
    y,
    i === 0 || vals[i - 1][1] === 0
      ? null
      : ((v - vals[i - 1][1]) / Math.abs(vals[i - 1][1])) * 100,
  ])
  return {
    metric_name: name,
    values: vals,
    cagr: calcCagr(vals),
    direction: calcDirection(vals),
    yoy_changes: yoy,
  }
}

export function transformDartToFundamentals(
  dartDataRecent: unknown,
  dartDataOld: unknown | null,
  yahooKeyStats: unknown,
  ticker: string,
  corpName?: string,
): FundamentalAnalysis {
  const market: Market = 'KR'
  const recentList: DartAccount[] = (dartDataRecent as { list?: DartAccount[] })?.list ?? []
  if (recentList.length === 0) throw new Error(`DART: 재무제표 데이터 없음 (${ticker})`)

  const oldList: DartAccount[] = (dartDataOld as { list?: DartAccount[] } | null)?.list ?? []

  const bsnsYearRaw = parseInt(recentList[0]?.bsns_year ?? '', 10)
  const bsnsYear = isNaN(bsnsYearRaw) ? new Date().getFullYear() - 1 : bsnsYearRaw

  const REV_NAMES = ['매출액', '수익(매출액)', '영업수익', '매출']
  const OP_NAMES = ['영업이익', '영업이익(손실)']
  const NET_NAMES = [
    '당기순이익',
    '당기순이익(손실)',
    '지배기업의 소유주에게 귀속되는 당기순이익',
    '지배기업 소유주 귀속 당기순이익',
  ]
  const ASSET_NAMES = ['자산총계']
  const LIAB_NAMES = ['부채총계']
  const EQUITY_NAMES = ['자본총계', '자본 합계']
  const OCF_NAMES = ['영업활동현금흐름', '영업활동으로 인한 현금흐름', '영업활동 현금흐름']
  const CAPEX_NAMES = ['유형자산의 취득', '유형자산취득', '유형자산 취득']
  const INT_EXP_NAMES = ['이자비용', '금융원가', '이자비용 등']

  function rYahoo(v: unknown): number | null {
    if (v == null) return null
    if (typeof v === 'number') return isFinite(v) ? v : null
    if (typeof v === 'object' && 'raw' in v) return rYahoo((v as { raw: unknown }).raw)
    return null
  }
  const ks = yahooKeyStats as Record<string, unknown> | null
  const perLatest = rYahoo(ks?.trailingPE) ?? rYahoo(ks?.forwardPE)
  const yahooPbr = rYahoo(ks?.priceToBook)
  const yahooPrice = rYahoo(ks?.currentPrice) ?? rYahoo(ks?.regularMarketPrice)
  const yahooShares = rYahoo(ks?.sharesOutstanding)

  type YearEntry = { year: number; list: DartAccount[]; field: typeof AMOUNT_FIELDS[number] }
  const yearEntries: YearEntry[] = ([
    { year: bsnsYear - 4, list: oldList,    field: 'bfefrmtrm_amount' as const },
    { year: bsnsYear - 3, list: oldList,    field: 'frmtrm_amount' as const    },
    { year: bsnsYear - 2, list: recentList, field: 'bfefrmtrm_amount' as const },
    { year: bsnsYear - 1, list: recentList, field: 'frmtrm_amount' as const    },
    { year: bsnsYear,     list: recentList, field: 'thstrm_amount' as const    },
  ] as const).filter(e => e.list.length > 0) as YearEntry[]

  const revPairs: [number, number][] = []
  const opPairs: [number, number][] = []
  const netPairs: [number, number][] = []

  const metrics_by_year: FundamentalMetrics[] = yearEntries.map(({ year: yr, list, field }) => {
    const rev    = findAmt(list, 'IS', REV_NAMES,    field)
    const opInc  = findAmt(list, 'IS', OP_NAMES,     field)
    const netInc = findAmt(list, 'IS', NET_NAMES,    field)
    const assets = findAmt(list, 'BS', ASSET_NAMES,  field)
    const liab   = findAmt(list, 'BS', LIAB_NAMES,   field)
    const equity = findAmt(list, 'BS', EQUITY_NAMES, field)
    const ocf    = findAmt(list, 'CF', OCF_NAMES,    field)
    const capex  = findAmt(list, 'CF', CAPEX_NAMES,  field)
    const intExp = findAmt(list, 'IS', INT_EXP_NAMES, field)

    const icrVal =
      opInc != null && intExp != null && intExp !== 0
        ? opInc / Math.abs(intExp)
        : null

    if (rev    != null) revPairs.push([yr, rev])
    if (opInc  != null) opPairs.push([yr, opInc])
    if (netInc != null) netPairs.push([yr, netInc])

    let pbr: number | null = null
    if (yr === bsnsYear) {
      pbr = yahooPbr
      if (pbr == null && equity && equity > 0 && yahooPrice != null && yahooShares != null) {
        pbr = (yahooPrice * yahooShares) / equity
      }
    }

    return {
      fiscal_year:      yr,
      roe:              netInc != null && equity ? (netInc / equity) * 100 : null,
      roa:              netInc != null && assets ? (netInc / assets) * 100 : null,
      debt_ratio:       liab   != null && assets ? (liab   / assets) * 100 : null,
      operating_margin: opInc  != null && rev    ? (opInc  / rev)   * 100 : null,
      fcf:              ocf    != null ? (capex != null ? ocf + capex : ocf) : null,
      per:              yr === bsnsYear ? perLatest : null,
      pbr,
      icr:              icrVal,
      peg_ratio:        null,
      week52_high:      yr === bsnsYear ? (rYahoo(ks?.fiftyTwoWeekHigh) ?? null) : null,
      week52_low:       yr === bsnsYear ? (rYahoo(ks?.fiftyTwoWeekLow)  ?? null) : null,
      current_price:    yr === bsnsYear ? (yahooPrice ?? null) : null,
    }
  })

  return {
    ticker,
    name: corpName ?? null,
    market,
    metrics_by_year: metrics_by_year.filter(
      m => m.roe != null || m.roa != null || m.operating_margin != null,
    ),
    trends: {
      revenue:          makeTrend('revenue',          revPairs),
      operating_income: makeTrend('operating_income', opPairs),
      net_income:       makeTrend('net_income',       netPairs),
    },
  }
}
