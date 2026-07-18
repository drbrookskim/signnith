import type {
  AnalystConsensus,
  DartDisclosure,
  DisclosureImportance,
  EarningsSurprise,
  FiftyTwoWeek,
  InstitutionHolder,
  InsiderTransaction,
  RecTrendPoint,
  SentimentData,
  ShortData,
  UpgradeDowngrade,
} from '@/types'
import { extractOwnershipSignals } from '@/lib/adapters/yahoo'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any

function r(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === 'number') return isFinite(v) ? v : null
  if (typeof v === 'object' && 'raw' in v) return r((v as { raw: unknown }).raw)
  return null
}

function tsToDate(v: unknown): string {
  const ts = r(v)
  if (!ts) return '—'
  return new Date(ts * 1000).toISOString().slice(0, 10)
}

function tsToQuarter(v: unknown): string {
  const ts = r(v)
  if (!ts) return '—'
  const d = new Date(ts * 1000)
  return `${d.getFullYear()} Q${Math.floor(d.getMonth() / 3) + 1}`
}

function fmtShares(n: number | null): string {
  if (n == null) return '—'
  const abs = Math.abs(n)
  if (abs >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return n.toLocaleString()
}

export { fmtShares }

// ── 애널리스트 컨센서스 ──────────────────────────

export function parseAnalystConsensus(raw: Raw): AnalystConsensus | null {
  const result = raw?.quoteSummary?.result?.[0]
  if (!result) return null
  const trends = result.recommendationTrend?.trend
  const current = Array.isArray(trends)
    ? trends.find((t: Raw) => t.period === '0m')
    : null
  if (!current) return null
  const fd = result.financialData ?? {}
  const strong_buy  = current.strongBuy  ?? 0
  const buy         = current.buy        ?? 0
  const hold        = current.hold       ?? 0
  const sell        = current.sell       ?? 0
  const strong_sell = current.strongSell ?? 0
  return {
    strong_buy, buy, hold, sell, strong_sell,
    total: strong_buy + buy + hold + sell + strong_sell,
    target_mean:   r(fd.targetMeanPrice),
    target_high:   r(fd.targetHighPrice),
    target_low:    r(fd.targetLowPrice),
    current_price: r(fd.currentPrice),
  }
}

// ── 어닝 서프라이즈 이력 ──────────────────────────

export function parseEarningsSurprises(raw: Raw): EarningsSurprise[] {
  const result = raw?.quoteSummary?.result?.[0]
  const history = result?.earningsHistory?.history
  if (!Array.isArray(history)) return []
  return history
    .map((h: Raw): EarningsSurprise => ({
      quarter:      tsToQuarter(h.startdatetime ?? h.quarter),
      eps_estimate: r(h.epsEstimate),
      eps_actual:   r(h.epsActual),
      surprise_pct: r(h.surprisePercent) != null ? r(h.surprisePercent)! * 100 : null,
    }))
    .filter(h => h.eps_estimate != null || h.eps_actual != null)
    .slice(-4)
}

// ── DART 공시 타임라인 ────────────────────────────

const HIGH_KW = [
  '유상증자', '전환사채', '교환사채', '신주인수권부사채',
  '임원ㆍ주요주주', '임원·주요주주', '최대주주', '주요주주',
  '합병', '분할', '청산', '소송', '횡령', '배임',
]
const MED_KW = ['사업보고서', '반기보고서', '분기보고서', '주주총회', '자기주식']

function classifyDisclosure(nm: string): DisclosureImportance {
  if (HIGH_KW.some(kw => nm.includes(kw))) return 'high'
  if (MED_KW.some(kw => nm.includes(kw))) return 'medium'
  return 'low'
}

export function parseDartDisclosures(raw: Raw): DartDisclosure[] {
  const list = raw?.list
  if (!Array.isArray(list)) return []
  return list.slice(0, 15).map((item: Raw): DartDisclosure => ({
    rcept_no:   item.rcept_no  ?? '',
    report_nm:  item.report_nm ?? '',
    rcept_dt:   item.rcept_dt  ?? '',
    flr_nm:     item.flr_nm    ?? '',
    importance: classifyDisclosure(item.report_nm ?? ''),
  }))
}

// ── 내부자 거래 ───────────────────────────────────

function classifyTxn(desc: string | undefined): 'buy' | 'sell' | 'other' {
  if (!desc) return 'other'
  const d = desc.toLowerCase()
  if (d.includes('purchase') || d.includes('buy')) return 'buy'
  if (d.includes('sale') || d.includes('sell')) return 'sell'
  return 'other'
}

export function parseInsiderTransactions(raw: Raw): InsiderTransaction[] {
  const result = raw?.quoteSummary?.result?.[0]
  const holders = result?.insiderHolders?.holders
  if (!Array.isArray(holders)) return []
  return holders.slice(0, 8).map((h: Raw): InsiderTransaction => ({
    name:        h.name ?? '—',
    relation:    h.relation?.longFmt ?? h.relation?.raw ?? h.relation ?? '—',
    transaction: classifyTxn(h.transactionDescription),
    shares:      r(h.positionDirect),
    date:        tsToDate(h.latestTransDate),
  }))
}

// ── 기관 투자자 ───────────────────────────────────

export function parseInstitutionHolders(raw: Raw): InstitutionHolder[] {
  const result = raw?.quoteSummary?.result?.[0]
  const list = result?.institutionOwnership?.ownershipList
  if (!Array.isArray(list)) return []
  return list.slice(0, 5).map((h: Raw): InstitutionHolder => ({
    name:        h.organization ?? '—',
    pct_held:    r(h.pctHeld) != null ? r(h.pctHeld)! * 100 : null,
    shares:      r(h.shares),
    report_date: h.reportDate?.fmt ?? tsToDate(h.reportDate) ?? '—',
  }))
}

// ── 추천 추이 (4개월) ─────────────────────────────

export function parseRecTrend(raw: Raw): RecTrendPoint[] {
  const trends = raw?.quoteSummary?.result?.[0]?.recommendationTrend?.trend
  if (!Array.isArray(trends)) return []
  return trends.map((t: Raw): RecTrendPoint => ({
    period:     t.period      ?? '0m',
    strong_buy: t.strongBuy   ?? 0,
    buy:        t.buy         ?? 0,
    hold:       t.hold        ?? 0,
    sell:       t.sell        ?? 0,
    strong_sell: t.strongSell ?? 0,
  }))
}

// ── 업/다운그레이드 이력 (90일) ───────────────────

export function parseUpgradeDowngrade(raw: Raw): UpgradeDowngrade[] {
  const history = raw?.quoteSummary?.result?.[0]?.upgradeDowngradeHistory?.history
  if (!Array.isArray(history)) return []
  const cutoff = Date.now() / 1000 - 90 * 24 * 3600
  return history
    .filter((h: Raw) => (h.epochGradeDate ?? 0) >= cutoff)
    .slice(0, 12)
    .map((h: Raw): UpgradeDowngrade => ({
      date:       tsToDate(h.epochGradeDate),
      firm:       h.firm      ?? '—',
      to_grade:   h.toGrade   ?? '—',
      from_grade: h.fromGrade ?? '—',
      action:     h.action === 'up' ? 'up' : h.action === 'down' ? 'down' : 'main',
    }))
}

// ── 공매도 데이터 ─────────────────────────────────

export function parseShortData(raw: Raw): ShortData {
  const stats = raw?.quoteSummary?.result?.[0]?.defaultKeyStatistics
  return {
    short_pct_of_float: r(stats?.shortPercentOfFloat),
    short_ratio:        r(stats?.shortRatio),
    shares_short:       r(stats?.sharesShort),
  }
}

// ── 52주 고/저 위치 ───────────────────────────────

export function parseFiftyTwoWeek(raw: Raw): FiftyTwoWeek {
  const detail = raw?.quoteSummary?.result?.[0]?.summaryDetail
  const fd     = raw?.quoteSummary?.result?.[0]?.financialData
  const low    = r(detail?.fiftyTwoWeekLow)
  const high   = r(detail?.fiftyTwoWeekHigh)
  const current = r(detail?.regularMarketPrice) ?? r(fd?.currentPrice)
  const position_pct = low != null && high != null && current != null && high > low
    ? ((current - low) / (high - low)) * 100
    : null
  return { low, high, current, position_pct }
}

// ── 통합 파서 ──────────────────────────────────────

export function parseSentimentData(yahooRaw: Raw, dartRaw: Raw | null): SentimentData {
  const ownership = extractOwnershipSignals(yahooRaw?.quoteSummary?.result?.[0])
  return {
    consensus:            parseAnalystConsensus(yahooRaw),
    earnings_surprises:   parseEarningsSurprises(yahooRaw),
    disclosures:          dartRaw ? parseDartDisclosures(dartRaw) : [],
    insider_transactions: parseInsiderTransactions(yahooRaw),
    institution_holders:  parseInstitutionHolders(yahooRaw),
    rec_trend:            parseRecTrend(yahooRaw),
    upgrade_downgrade:    parseUpgradeDowngrade(yahooRaw),
    short_data:           parseShortData(yahooRaw),
    fifty_two_week:       parseFiftyTwoWeek(yahooRaw),
    ...ownership,
  }
}
