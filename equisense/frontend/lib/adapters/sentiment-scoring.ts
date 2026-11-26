import type {
  DartDisclosure,
  EarningsSurprise,
  Market,
  NewsItem,
  SentimentData,
  UpgradeDowngrade,
} from '../../types/index.ts'

// ── 센티먼트 스코어링 (동적 가중치 재정규화 + KR 보완) ────────

const POSITIVE_DISCLOSURE_KW = ['자기주식취득', '자기주식 취득', '자사주', '배당', '단일판매', '공급계약']
const NEGATIVE_DISCLOSURE_KW = ['유상증자', '전환사채', '교환사채', '신주인수권부사채', '소송', '횡령', '배임', '영업정지']

function scoreDisclosures(disclosures: DartDisclosure[]): number | null {
  if (disclosures.length === 0) return null
  let score = 55
  for (const d of disclosures.slice(0, 15)) {
    const nm = d.report_nm
    if (NEGATIVE_DISCLOSURE_KW.some((kw) => nm.includes(kw))) score -= 12
    else if (POSITIVE_DISCLOSURE_KW.some((kw) => nm.includes(kw))) score += 10
    else if (d.importance === 'high') score -= 8
  }
  return Math.max(5, Math.min(95, score))
}

function scoreEarningsSurprises(surprises: EarningsSurprise[]): number | null {
  const valid = surprises.filter((s) => s.surprise_pct != null)
  if (valid.length === 0) return null
  const avg = valid.reduce((sum, s) => sum + (s.surprise_pct ?? 0), 0) / valid.length
  const beatRatio = valid.filter((s) => (s.surprise_pct ?? 0) > 0).length / valid.length
  const base = 50 + Math.max(-30, Math.min(30, avg * 2))
  const consistency = (beatRatio - 0.5) * 20
  return Math.max(5, Math.min(95, base + consistency))
}

function scoreUpgradeDowngrade(items: UpgradeDowngrade[]): number | null {
  const actionable = items.filter((u) => u.action === 'up' || u.action === 'down')
  if (actionable.length === 0) return null
  const up = actionable.filter((u) => u.action === 'up').length
  const down = actionable.filter((u) => u.action === 'down').length
  const netRatio = (up - down) / actionable.length
  return Math.max(10, Math.min(90, 50 + netRatio * 35))
}

const POSITIVE_NEWS_KW = [
  'beat', 'beats', 'surge', 'surges', 'soar', 'soars', 'rally', 'upgrade', 'upgraded',
  'growth', 'record', 'profit', 'outperform', 'buyback', 'dividend', 'partnership', 'breakthrough',
  '상승', '급등', '호실적', '어닝서프라이즈', '수주', '자사주', '배당', '상향', '신고가',
]
const NEGATIVE_NEWS_KW = [
  'miss', 'misses', 'plunge', 'plunges', 'drop', 'drops', 'downgrade', 'downgraded',
  'lawsuit', 'probe', 'investigation', 'recall', 'loss', 'cut', 'cuts', 'layoff', 'warning', 'decline',
  '하락', '급락', '어닝쇼크', '소송', '적자', '유상증자', '하향', '리콜', '감원', '악재',
]

export function classifyNewsTitle(title: string): 'positive' | 'negative' | 'neutral' {
  const lower = title.toLowerCase()
  const pos = POSITIVE_NEWS_KW.filter((kw) => lower.includes(kw)).length
  const neg = NEGATIVE_NEWS_KW.filter((kw) => lower.includes(kw)).length
  if (pos > neg) return 'positive'
  if (neg > pos) return 'negative'
  return 'neutral'
}

function scoreNewsSentiment(news: NewsItem[]): number | null {
  if (news.length === 0) return null
  const pos = news.filter((n) => n.sentiment === 'positive').length
  const neg = news.filter((n) => n.sentiment === 'negative').length
  if (pos + neg === 0) return 50
  const net = (pos - neg) / news.length // -1 ~ +1
  return Math.max(15, Math.min(85, 50 + net * 45))
}

export interface FearGreedResult {
  score: number
  label: string
  description: string
  activeSignals: number
}

export function computeFearGreed(params: {
  market?: Market
  vix: number | null
  kospiPrice?: number | null
  kospiMa200?: number | null
  bullishPct: number | null
  shortPctOfFloat?: number | null
  positionPct?: number | null
  earningsSurprises?: EarningsSurprise[]
  upgradeDowngrade?: UpgradeDowngrade[]
  disclosures?: DartDisclosure[]
  news?: NewsItem[]
}): FearGreedResult {
  const weighted: { value: number; weight: number }[] = []

  const vixScore = params.vix != null
    ? (params.vix <= 12 ? 85 : params.vix <= 17 ? 70 : params.vix <= 22 ? 50 : params.vix <= 30 ? 30 : 15)
    : null
  const kospiScore = params.market === 'KR' && params.kospiPrice != null && params.kospiMa200 != null && params.kospiMa200 > 0
    ? Math.max(15, Math.min(85, 55 + ((params.kospiPrice / params.kospiMa200) - 1) * 100 * 2.5))
    : null
  const macroScore = params.market === 'KR' && kospiScore != null
    ? (vixScore != null ? kospiScore * 0.7 + vixScore * 0.3 : kospiScore)
    : vixScore

  if (macroScore != null) {
    weighted.push({ value: macroScore, weight: 0.15 })
  }
  if (params.bullishPct != null) {
    weighted.push({ value: Math.min(100, Math.max(0, params.bullishPct)), weight: 0.25 })
  }
  if (params.shortPctOfFloat != null) {
    const s = params.shortPctOfFloat
    const shortScore = s < 0.03 ? 78 : s < 0.08 ? 60 : s < 0.15 ? 40 : s < 0.25 ? 24 : 10
    weighted.push({ value: shortScore, weight: 0.15 })
  }
  if (params.positionPct != null) {
    weighted.push({ value: Math.min(100, Math.max(0, params.positionPct)), weight: 0.15 })
  }
  const earningsScore = scoreEarningsSurprises(params.earningsSurprises ?? [])
  if (earningsScore != null) {
    weighted.push({ value: earningsScore, weight: 0.15 })
  }
  const udScore = scoreUpgradeDowngrade(params.upgradeDowngrade ?? [])
  if (udScore != null) {
    weighted.push({ value: udScore, weight: 0.10 })
  }
  const discScore = scoreDisclosures(params.disclosures ?? [])
  if (discScore != null) {
    weighted.push({ value: discScore, weight: 0.15 })
  }
  const newsScore = scoreNewsSentiment(params.news ?? [])
  if (newsScore != null) {
    weighted.push({ value: newsScore, weight: 0.15 })
  }

  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0)
  const score = totalWeight > 0
    ? Math.round(weighted.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight)
    : 50

  const label = score >= 75 ? '극단적 탐욕' : score >= 55 ? '탐욕 Greed'
    : score >= 45 ? '중립 Neutral' : score >= 25 ? '공포 Fear' : '극단적 공포'
  const description = score >= 55
    ? `가용 ${weighted.length}개 신호 기준 심리 우호적 · 과열 구간 주의`
    : score >= 45
      ? `가용 ${weighted.length}개 신호 기준 심리 중립 · 방향성 탐색 구간`
      : `가용 ${weighted.length}개 신호 기준 심리 위축 · 역발상 진입 고려`

  return { score, label, description, activeSignals: weighted.length }
}

/** 경영진 신뢰도: 애널리스트 컨센서스를 배제하고 내부자 거래·실적 달성률·공시 거버넌스만으로 산출 */
export function computeManagementGrade(sentiment: SentimentData | null): {
  grade: string
  color: string
  score: number | null
} {
  if (!sentiment) return { grade: 'N/A', color: 'var(--ink-3)', score: null }

  let score = 62
  let hasSignal = false

  if (sentiment.insider_net_purchase_pct != null) {
    hasSignal = true
    score += Math.max(-15, Math.min(18, sentiment.insider_net_purchase_pct * 1.5))
  } else {
    const insider = sentiment.insider_transactions ?? []
    const buyCount = insider.filter((t) => t.transaction === 'buy').length
    const sellCount = insider.filter((t) => t.transaction === 'sell').length
    if (buyCount + sellCount > 0) {
      hasSignal = true
      if (buyCount > sellCount) score += 12
      else if (sellCount > buyCount * 2) score -= 10
    }
  }

  const validSurprises = (sentiment.earnings_surprises ?? []).filter((s) => s.surprise_pct != null)
  if (validSurprises.length > 0) {
    hasSignal = true
    const beatRate = validSurprises.filter((s) => (s.surprise_pct ?? 0) >= 0).length / validSurprises.length
    score += (beatRate - 0.5) * 24
  }

  if ((sentiment.disclosures ?? []).length > 0) {
    hasSignal = true
    for (const d of sentiment.disclosures.slice(0, 15)) {
      if (NEGATIVE_DISCLOSURE_KW.some((kw) => d.report_nm.includes(kw))) score -= 6
      else if (POSITIVE_DISCLOSURE_KW.some((kw) => d.report_nm.includes(kw))) score += 4
    }
  }

  if (!hasSignal) return { grade: 'N/A', color: 'var(--ink-3)', score: null }

  const clamped = Math.round(Math.max(0, Math.min(100, score)))
  const grade = clamped >= 85 ? 'A+'
    : clamped >= 78 ? 'A'
    : clamped >= 70 ? 'A-'
    : clamped >= 62 ? 'B+'
    : clamped >= 54 ? 'B'
    : clamped >= 46 ? 'B-'
    : 'C+'
  const color = clamped >= 70 ? 'var(--accent)' : clamped >= 55 ? '#b45309' : '#dc2626'

  return { grade, color, score: clamped }
}
