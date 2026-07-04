import type { QuarterlyInsight, QuarterlyInsightMap } from '@/types'

// ── 헬퍼 ────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function r(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === 'number') return isFinite(v) ? v : null
  if (typeof v === 'object' && 'raw' in v) return r((v as { raw: unknown }).raw)
  return null
}

function toQuarterLabel(endDateRaw: unknown): string | null {
  const ts = r(endDateRaw)
  if (!ts) return null
  const d = new Date(ts * 1000)
  const q = Math.floor(d.getMonth() / 3) + 1
  return `${d.getFullYear()} Q${q}`
}

function fmtVal(value: number | null, key: string): string {
  if (value == null) return '—'
  if (['roe', 'roa', 'operating_margin', 'debt_ratio', 'margin'].includes(key)) {
    return `${value.toFixed(1)}%`
  }
  if (['per', 'pbr'].includes(key)) return `${value.toFixed(1)}x`
  const abs = Math.abs(value)
  if (abs >= 1e12) return `${(value / 1e12).toFixed(1)}T`
  if (abs >= 1e9)  return `${(value / 1e9).toFixed(1)}B`
  if (abs >= 1e6)  return `${(value / 1e6).toFixed(1)}M`
  return value.toFixed(0)
}

// ── 인사이트 생성 ────────────────────────────────

function buildInsight(
  key: string,
  quarters: { label: string; value: number | null }[],
): QuarterlyInsight {
  const shortLabel = (l: string) => l.replace(/^\d{4} /, '')
  const trend_line = quarters
    .map(q => `${shortLabel(q.label)} ${fmtVal(q.value, key)}`)
    .join(' → ')

  const valid = quarters.filter(q => q.value !== null)
  if (valid.length < 2) {
    return { quarters, trend_line, momentum_label: '분기 데이터 부족', direction: 'flat', insufficient: true }
  }

  const values = valid.map(q => q.value as number)
  const changes = values.slice(1).map((v, i) => v - values[i])
  const allUp   = changes.every(c => c > 0)
  const allDown = changes.every(c => c < 0)
  const lastUp  = changes[changes.length - 1] > 0

  let direction: QuarterlyInsight['direction']
  let momentum_label: string
  const n = valid.length

  if (allUp) {
    direction = 'up'
    if (changes.length >= 2) {
      const accel = Math.abs(changes[changes.length - 1]) - Math.abs(changes[changes.length - 2])
      momentum_label =
        accel > 0  ? `↑ ${n}분기 연속 상승 · 모멘텀 가속` :
        accel < 0  ? `↑ ${n}분기 연속 상승 · 모멘텀 약화` :
                     `↑ ${n}분기 연속 상승 · 모멘텀 유지`
    } else {
      momentum_label = `↑ ${n}분기 연속 상승`
    }
  } else if (allDown) {
    direction = 'down'
    momentum_label = `↓ ${n}분기 연속 하락 · 주의 필요`
  } else if (lastUp) {
    direction = 'mixed'
    momentum_label = '↑ 상승 반전 · 모멘텀 회복 중'
  } else {
    direction = 'mixed'
    momentum_label = '↓ 하락 전환 · 모멘텀 약화'
  }

  return { quarters, trend_line, momentum_label, direction }
}

// ── 메인 파싱 함수 ───────────────────────────────

type QMap = Map<string, Record<string, unknown>>

/**
 * income 분기 레이블 기준으로 balance sheet를 찾음.
 * 정확히 일치하는 분기가 없으면 인접 분기(±1)를 fallback으로 사용.
 * Yahoo Finance는 income/balance end date가 며칠 차이나는 경우가 있음.
 */
function findBalance(label: string, balanceMap: QMap): Record<string, unknown> | undefined {
  if (balanceMap.has(label)) return balanceMap.get(label)
  const [yearStr, qStr] = label.split(' Q')
  const year = parseInt(yearStr, 10)
  const q    = parseInt(qStr, 10)
  const prev = q === 1 ? `${year - 1} Q4` : `${year} Q${q - 1}`
  const next = q === 4 ? `${year + 1} Q1` : `${year} Q${q + 1}`
  return balanceMap.get(prev) ?? balanceMap.get(next)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function computeQuarterlyInsights(yahooData: any): QuarterlyInsightMap {
  const result = yahooData?.quoteSummary?.result?.[0]
  if (!result) return {}

  const incomeList: Record<string, unknown>[] =
    result.incomeStatementHistoryQuarterly?.incomeStatementHistory ?? []
  const balanceList: Record<string, unknown>[] =
    result.balanceSheetHistoryQuarterly?.balanceSheetStatements ?? []
  const cfList: Record<string, unknown>[] =
    result.cashflowStatementHistoryQuarterly?.cashflowStatements ?? []

  function sortAsc(list: Record<string, unknown>[]) {
    return [...list].sort((a, b) => (r(a.endDate) ?? 0) - (r(b.endDate) ?? 0))
  }

  function toMap(sorted: Record<string, unknown>[]): QMap {
    const m = new Map<string, Record<string, unknown>>()
    for (const s of sorted) {
      const label = toQuarterLabel(s.endDate)
      if (label) m.set(label, s)
    }
    return m
  }

  const incomeMap  = toMap(sortAsc(incomeList))
  const balanceMap = toMap(sortAsc(balanceList))
  const cfMap      = toMap(sortAsc(cfList))

  // 각 지표의 기준 데이터 소스에서 독립적으로 최근 3분기 선택
  const incomeKeys  = Array.from(incomeMap.keys()).sort().slice(-3)
  const balanceKeys = Array.from(balanceMap.keys()).sort().slice(-3)
  const cfKeys      = Array.from(cfMap.keys()).sort().slice(-3)

  if (incomeKeys.length === 0 && balanceKeys.length === 0) return {}

  const insights: QuarterlyInsightMap = {}

  // operating_margin — income 기준
  if (incomeKeys.length >= 2) {
    insights['operating_margin'] = buildInsight('operating_margin', incomeKeys.map(label => {
      const s     = incomeMap.get(label)!
      const rev   = r(s.totalRevenue)
      const opInc = r(s.operatingIncome)
      return { label, value: rev && opInc != null && rev !== 0 ? (opInc / rev) * 100 : null }
    }))
  }

  // roe — income 기준, balance는 인접 분기 fallback 허용
  if (incomeKeys.length >= 2) {
    const roeQs = incomeKeys.map(label => {
      const inc    = incomeMap.get(label)!
      const bal    = findBalance(label, balanceMap)
      const net    = r(inc.netIncome)
      const equity = bal ? r(bal.totalStockholderEquity) : null
      return { label, value: net != null && equity ? ((net * 4) / equity) * 100 : null }
    })
    insights['roe']    = buildInsight('roe', roeQs)
    insights['margin'] = buildInsight('margin', roeQs)
  }

  // roa — income 기준, balance는 인접 분기 fallback 허용
  if (incomeKeys.length >= 2) {
    insights['roa'] = buildInsight('roa', incomeKeys.map(label => {
      const inc    = incomeMap.get(label)!
      const bal    = findBalance(label, balanceMap)
      const net    = r(inc.netIncome)
      const assets = bal ? r(bal.totalAssets) : null
      return { label, value: net != null && assets ? ((net * 4) / assets) * 100 : null }
    }))
  }

  // debt_ratio — balance 기준 (income 불필요)
  if (balanceKeys.length >= 2) {
    insights['debt_ratio'] = buildInsight('debt_ratio', balanceKeys.map(label => {
      const bal    = balanceMap.get(label)!
      const liab   = r(bal.totalLiab)
      const assets = r(bal.totalAssets)
      return { label, value: liab != null && assets ? (liab / assets) * 100 : null }
    }))
  }

  // fcf — cashflow 기준
  if (cfKeys.length >= 2) {
    insights['fcf'] = buildInsight('fcf', cfKeys.map(label => {
      const cf    = cfMap.get(label)!
      const ocf   = r(cf.totalCashFromOperatingActivities)
      const capex = r(cf.capitalExpenditures)
      return { label, value: ocf != null ? (capex != null ? ocf + capex : ocf) : null }
    }))
  }

  // income 카드 — 매출액, income 기준
  if (incomeKeys.length >= 2) {
    insights['income'] = buildInsight('income', incomeKeys.map(label => ({
      label,
      value: r(incomeMap.get(label)!.totalRevenue),
    })))
  }

  return insights
}

/** 연간 sparkData를 QuarterlyInsight와 동일한 구조로 변환 (분기 데이터 부족 시 fallback) */
export function computeAnnualInsight(
  key: string,
  sparkData: { year: number; value: number | null }[],
): QuarterlyInsight {
  const last3 = [...sparkData].sort((a, b) => a.year - b.year).slice(-3)
  const quarters = last3.map(d => ({ label: String(d.year), value: d.value }))
  return buildInsight(key, quarters)
}
