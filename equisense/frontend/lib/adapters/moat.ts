import type {
  CompoundMoat,
  CompoundMoatType,
  DimensionScore,
  FundamentalAnalysis,
  MoatAnalysis,
  MoatDimension,
  MoatGrade,
} from '@/types'

const DIMENSION_NAME_KO: Record<MoatDimension, string> = {
  cost_advantage: '비용 우위',
  intangible_assets: '무형 자산',
  switching_costs: '전환 비용',
  network_effects: '네트워크 효과',
  efficient_scale: '효율적 규모',
}

const COMPOUND_MOAT_DEFS: Record<
  CompoundMoatType,
  { name: string; description: string; dimensions: [MoatDimension, MoatDimension]; threshold: number }
> = {
  lock_in_ring: {
    name: '잠금 고리',
    description: '고객이 떠나기 어렵고, 남을수록 가치가 커지는 이중 잠금 구조',
    dimensions: ['switching_costs', 'network_effects'],
    threshold: 6.0,
  },
  value_flywheel: {
    name: '가치 플라이휠',
    description: '브랜드·IP 기반 프리미엄이 효율적 원가 구조로 증폭되는 선순환',
    dimensions: ['intangible_assets', 'cost_advantage'],
    threshold: 6.0,
  },
  scale_fortress: {
    name: '규모 요새',
    description: '구조적 진입 장벽과 원가 우위가 결합된 철옹성',
    dimensions: ['efficient_scale', 'cost_advantage'],
    threshold: 6.0,
  },
}

// 4개/5개 차원 업종별 가중치 (합계 = 1.0)
// 업종 특성에 따라 핵심 해자 원천에 더 높은 비중을 부여합니다.
const DEFAULT_DIMENSION_WEIGHTS: Record<MoatDimension, number> = {
  cost_advantage: 0.20,
  intangible_assets: 0.20,
  switching_costs: 0.20,
  network_effects: 0.20,
  efficient_scale: 0.20,
}

const SECTOR_DIMENSION_WEIGHTS: Record<string, Record<MoatDimension, number>> = {
  Technology: {
    cost_advantage: 0.15,
    intangible_assets: 0.20,
    switching_costs: 0.30,
    network_effects: 0.25,
    efficient_scale: 0.10,
  },
  'Communication Services': {
    cost_advantage: 0.15,
    intangible_assets: 0.20,
    switching_costs: 0.20,
    network_effects: 0.30,
    efficient_scale: 0.15,
  },
  Healthcare: {
    cost_advantage: 0.15,
    intangible_assets: 0.35,
    switching_costs: 0.20,
    network_effects: 0.10,
    efficient_scale: 0.20,
  },
  'Consumer Defensive': {
    cost_advantage: 0.25,
    intangible_assets: 0.35,
    switching_costs: 0.10,
    network_effects: 0.10,
    efficient_scale: 0.20,
  },
  'Consumer Cyclical': {
    cost_advantage: 0.25,
    intangible_assets: 0.30,
    switching_costs: 0.15,
    network_effects: 0.15,
    efficient_scale: 0.15,
  },
  'Financial Services': {
    cost_advantage: 0.20,
    intangible_assets: 0.20,
    switching_costs: 0.25,
    network_effects: 0.15,
    efficient_scale: 0.20,
  },
  Industrials: {
    cost_advantage: 0.25,
    intangible_assets: 0.15,
    switching_costs: 0.20,
    network_effects: 0.10,
    efficient_scale: 0.30,
  },
  Energy: {
    cost_advantage: 0.35,
    intangible_assets: 0.10,
    switching_costs: 0.10,
    network_effects: 0.05,
    efficient_scale: 0.40,
  },
  Utilities: {
    cost_advantage: 0.25,
    intangible_assets: 0.10,
    switching_costs: 0.15,
    network_effects: 0.05,
    efficient_scale: 0.45,
  },
  'Basic Materials': {
    cost_advantage: 0.35,
    intangible_assets: 0.10,
    switching_costs: 0.10,
    network_effects: 0.05,
    efficient_scale: 0.40,
  },
  'Real Estate': {
    cost_advantage: 0.20,
    intangible_assets: 0.15,
    switching_costs: 0.15,
    network_effects: 0.10,
    efficient_scale: 0.40,
  },
}

function calcWeightedComposite(
  dimensionScores: DimensionScore[],
  sector: string | null | undefined,
): number {
  const weights = (sector && SECTOR_DIMENSION_WEIGHTS[sector]) || DEFAULT_DIMENSION_WEIGHTS
  const totalWeight = dimensionScores.reduce((s, d) => s + (weights[d.dimension] ?? 0.2), 0)
  if (totalWeight <= 0) return 0
  return dimensionScores.reduce((s, d) => s + d.score * (weights[d.dimension] ?? 0.2), 0) / totalWeight
}

export interface RoicWaccPoint {
  year: string
  ROIC: number | null
  WACC: number
}

/** 시장(US/KR)·부채비율·이자보상배율(ICR)을 반영한 연도별 ROIC vs WACC 추정 */
export function computeRoicWaccSeries(fundamentals: FundamentalAnalysis): RoicWaccPoint[] {
  const baseEquityCost = fundamentals.market === 'KR' ? 9.5 : 8.5
  return fundamentals.metrics_by_year
    .filter((m) => m.roa != null)
    .map((m) => {
      const debtRatio = Math.max(0, m.debt_ratio ?? 30)
      // 비이자부채 제외 보정: D/E 기반 투하자본 승수 (1.1 ~ 1.6)
      const leverageFactor = 1.1 + Math.min(0.5, debtRatio / 300)
      const roic = m.roa != null ? Math.max(-50, Math.min(80, m.roa * leverageFactor)) : null

      // WACC = Ke * (E/V) + Kd*(1-t) * (D/V)
      const debtWeight = Math.min(0.6, debtRatio / (100 + debtRatio))
      const equityWeight = 1 - debtWeight
      const icrPenalty = m.icr != null && m.icr < 3 ? 2.0 : m.icr != null && m.icr > 12 ? -0.5 : 0
      const costOfDebtAfterTax = Math.max(2.5, Math.min(8.5, 3.8 + debtRatio * 0.012 + icrPenalty))
      const wacc = Math.round((equityWeight * baseEquityCost + debtWeight * costOfDebtAfterTax) * 10) / 10

      return { year: String(m.fiscal_year), ROIC: roic, WACC: wacc }
    })
}
// 업종별 영업이익률 임계값 [t1,t2,t3,t4] — Yahoo sector 문자열 기준
// 업종마다 "정상 마진" 수준이 달라, 고정 임계값은 소매업을 과소평가하고
// 금융/부동산을 과대평가하는 왜곡이 생김
const SECTOR_MARGIN_THRESHOLDS: Record<string, [number, number, number, number]> = {
  Technology: [10, 20, 30, 40],
  'Communication Services': [8, 15, 25, 35],
  'Consumer Cyclical': [3, 6, 10, 15],
  'Consumer Defensive': [3, 6, 10, 15],
  'Financial Services': [15, 25, 35, 45],
  Healthcare: [8, 15, 25, 35],
  Industrials: [5, 8, 12, 18],
  Energy: [5, 10, 15, 25],
  Utilities: [10, 15, 20, 25],
  'Real Estate': [10, 20, 30, 40],
  'Basic Materials': [5, 8, 12, 18],
}
const DEFAULT_MARGIN_THRESHOLDS: [number, number, number, number] = [5, 10, 20, 30]

const GRADE_TEXT: Record<MoatGrade, string> = {
  wide: '강력한 경제적 해자를 보유합니다',
  narrow: '일부 구조적 우위가 확인됩니다',
  none: '뚜렷한 해자가 확인되지 않습니다',
}

function score(value: number | null, thresholds: [number, number, number, number]): number {
  if (value == null || !isFinite(value)) return 0
  const [t1, t2, t3, t4] = thresholds
  if (value >= t4) return 10
  if (value >= t3) return 7.5 + ((value - t3) / (t4 - t3 || 1)) * 2.5
  if (value >= t2) return 5.0 + ((value - t2) / (t3 - t2 || 1)) * 2.5
  if (value >= t1) return 2.5 + ((value - t1) / (t2 - t1 || 1)) * 2.5
  if (t1 > 0 && value > 0) return (value / t1) * 2.5
  return 0
}

/** 다년간 지표의 평균, 표준편차(변동성), 추세 방향을 요약합니다. */
function summarizeSeries(values: (number | null | undefined)[]): {
  avg: number | null
  latest: number | null
  min: number | null
  std: number
  count: number
} {
  const valid = values.filter((v): v is number => v != null && isFinite(v))
  if (valid.length === 0) return { avg: null, latest: null, min: null, std: 0, count: 0 }
  const avg = valid.reduce((a, b) => a + b, 0) / valid.length
  const variance = valid.reduce((a, b) => a + (b - avg) ** 2, 0) / valid.length
  return {
    avg,
    latest: valid[valid.length - 1],
    min: Math.min(...valid),
    std: Math.sqrt(variance),
    count: valid.length,
  }
}

function deriveDurabilityTrend(
  margins: (number | null | undefined)[],
  roas: (number | null | undefined)[],
): 'expanding' | 'stable' | 'contracting' {
  const pickDelta = (arr: (number | null | undefined)[]) => {
    const valid = arr.filter((v): v is number => v != null && isFinite(v))
    if (valid.length < 2) return null
    const recent = valid[valid.length - 1]
    const prior = valid.slice(0, -1).reduce((a, b) => a + b, 0) / (valid.length - 1)
    return recent - prior
  }
  const mDelta = pickDelta(margins)
  const rDelta = pickDelta(roas)
  const deltas = [mDelta, rDelta].filter((d): d is number => d != null)
  if (deltas.length === 0) return 'stable'
  const avgDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length
  if (avgDelta >= 2.0) return 'expanding'
  if (avgDelta <= -2.0) return 'contracting'
  return 'stable'
}

function subjectParticle(word: string): string {
  const last = word[word.length - 1]
  const code = last.charCodeAt(0)
  // 한글 완성형: 받침 없으면(0) '는', 있으면 '은'
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 === 0 ? '는' : '은'
  return '은'
}

function detectCompoundMoats(scoreMap: Record<MoatDimension, number>): CompoundMoat[] {
  return (
    Object.entries(COMPOUND_MOAT_DEFS) as [
      CompoundMoatType,
      (typeof COMPOUND_MOAT_DEFS)[CompoundMoatType],
    ][]
  )
    .filter(([, def]) => def.dimensions.every((d) => (scoreMap[d] ?? 0) >= def.threshold))
    .map(([type, def]) => ({
      type,
      name: def.name,
      description: def.description,
      dimensions: def.dimensions,
    }))
}

function deriveStructuralInsight(scoreMap: Record<MoatDimension, number>): string | null {
  const ca = scoreMap.cost_advantage    ?? 0
  const ia = scoreMap.intangible_assets ?? 0
  const sc = scoreMap.switching_costs   ?? 0
  const ne = scoreMap.network_effects   ?? 0
  const es = scoreMap.efficient_scale   ?? 0

  if (ca >= 7.5 && ia >= 7.5)
    return '⚡ 구조 분석: 높은 마진과 무형 자산이 동반 강세 — 특허·독점 기술 기반 가격 결정력 구조로 경쟁사의 가격 추격이 어렵습니다.'
  if (ca >= 7.5 && es >= 7.5)
    return '⚡ 구조 분석: 원가 우위와 효율적 규모가 결합 — 대규모 인프라·설비 투자가 진입 장벽으로 작동하는 규모 요새 구조입니다.'
  if (sc >= 7.5 && ne >= 7.5)
    return '⚡ 구조 분석: 전환 비용과 네트워크 효과 동반 강세 — 플랫폼·생태계 기반 이중 잠금(lock-in) 구조로 고객 이탈 가능성이 낮습니다.'
  if (ca >= 7.5 && sc < 5.0)
    return '⚡ 구조 분석: 높은 마진이 고객 고착보다 공정·기술 효율에서 비롯됩니다. 대체 기술 등장 시 마진 압박 가능성을 주시해야 합니다.'
  if (ia >= 7.5 && sc >= 7.5)
    return '⚡ 구조 분석: 특허·브랜드 자산과 고객 전환 비용이 복합 작동 — B2B 맞춤형 솔루션 또는 인증 기반 독점 공급 구조 가능성입니다.'
  if (ca >= 7.5 && ne < 4.0 && sc < 5.0)
    return '⚡ 구조 분석: 마진 우위가 뚜렷하나 고객 고착도는 낮습니다. 원가·공정 혁신이 지속되지 않으면 경쟁사 추격이 가능합니다.'
  if (ia >= 7.5 && ne < 4.0)
    return '⚡ 구조 분석: 무형 자산 기반 해자 — 특허 만료·기술 공개 시 경쟁 심화 위험. 지속적 R&D 투자가 해자 유지의 핵심입니다.'
  return null
}

function generateAnalystNote(
  displayName: string,
  grade: MoatGrade,
  dimension_scores: DimensionScore[],
  compound_moats: CompoundMoat[],
): string {
  const sorted = [...dimension_scores].sort((a, b) => b.score - a.score)
  const strongest = sorted[0]
  const weakest = sorted[sorted.length - 1]

  const strongName = DIMENSION_NAME_KO[strongest.dimension] ?? strongest.dimension
  const weakName = DIMENSION_NAME_KO[weakest.dimension] ?? weakest.dimension

  const para1 =
    `${displayName}${subjectParticle(displayName)} ${GRADE_TEXT[grade]}. ` +
    `${strongName}(${strongest.score.toFixed(1)}점)이 가장 강한 경쟁 기반으로` +
    (strongest.rationale ? `, ${strongest.rationale}` : '') +
    `. ${weakName}(${weakest.score.toFixed(1)}점)은 상대적으로 약합니다.`

  const scoreMap = Object.fromEntries(
    dimension_scores.map((d) => [d.dimension, d.score]),
  ) as Record<MoatDimension, number>

  const structuralInsight = deriveStructuralInsight(scoreMap)

  const strengths = dimension_scores.filter((d) => d.score >= 6.0)
  const weaknesses = dimension_scores.filter((d) => d.score < 5.0)

  const lines: string[] = [para1]

  if (structuralInsight) lines.push(structuralInsight)

  if (compound_moats.length > 0) {
    lines.push(
      '⚡ 복합 해자: ' +
        compound_moats
          .map(
            (m) =>
              `${m.name}(${m.dimensions.map((d) => DIMENSION_NAME_KO[d] ?? d).join('+')} 동반 강세)`,
          )
          .join(' · '),
    )
  }

  if (strengths.length > 0) {
    lines.push(
      '✅ 강점: ' +
        strengths
          .map((d) => d.rationale ?? `${DIMENSION_NAME_KO[d.dimension] ?? d.dimension} ${d.score.toFixed(1)}점`)
          .join(' · '),
    )
  }
  if (weaknesses.length > 0) {
    lines.push(
      '⚠️ 개선 필요: ' +
        weaknesses
          .map((d) => d.rationale ?? `${DIMENSION_NAME_KO[d.dimension] ?? d.dimension} ${d.score.toFixed(1)}점`)
          .join(' · '),
    )
  }

  return lines.join('\n')
}

export function calculateMoat(fundamentals: FundamentalAnalysis): MoatAnalysis {
  const years = fundamentals.metrics_by_year
  const windowYears = years.slice(-4)
  const latest = years.at(-1)
  const fiscal_year = latest?.fiscal_year ?? new Date().getFullYear() - 1

  const sector = fundamentals.profile?.sector ?? null
  const marginThresholds = (sector && SECTOR_MARGIN_THRESHOLDS[sector]) || DEFAULT_MARGIN_THRESHOLDS

  // 다년간 지표 요약 (일회성 호황/적자 왜곡 완화)
  const opMarginStats = summarizeSeries(windowYears.map((y) => y.operating_margin))
  const debtStats = summarizeSeries(windowYears.map((y) => y.debt_ratio))
  const roeStats = summarizeSeries(windowYears.map((y) => y.roe))
  const roaStats = summarizeSeries(windowYears.map((y) => y.roa))
  const icrStats = summarizeSeries(windowYears.map((y) => y.icr))

  // Cost advantage: 다년간 영업이익률(업종별 임계값) 65% + 낮은 부채비율 35% - 변동성 페널티
  const opMargin = opMarginStats.avg ?? latest?.operating_margin ?? null
  const debtRatio = debtStats.avg ?? latest?.debt_ratio ?? null
  const marginStabilityPenalty = opMarginStats.count >= 2 && opMarginStats.std > 8 ? Math.min(1.0, (opMarginStats.std - 8) * 0.1) : 0
  const opMarginScore = Math.max(0, score(opMargin, marginThresholds) - marginStabilityPenalty)
  const debtScore = debtRatio != null ? score(100 - debtRatio, [20, 40, 55, 70]) : 0
  const costAdvantage = opMarginScore * 0.65 + debtScore * 0.35

  // Intangible assets: 다년간 ROE + 고레버리지 왜곡 보정 + 경영진 자사주 순매수 신호
  const roe = roeStats.avg ?? latest?.roe ?? null
  const roa = roaStats.avg ?? latest?.roa ?? null
  const leveragePenalty = debtRatio != null && debtRatio > 150 && (roa ?? 0) < 5 ? 1.5 : 0
  const insiderNetPct = fundamentals.insider_net_purchase_pct ?? null
  const insiderBonus = insiderNetPct == null ? 0 : insiderNetPct >= 5 ? 1 : insiderNetPct <= -5 ? -1 : 0
  const intangibleScore = Math.min(10, Math.max(0, score(roe, [5, 10, 15, 25]) - leveragePenalty + insiderBonus))

  // Switching costs: 매출 CAGR + 방향성 보정 + 하방 안정성(역성장 연도 페널티) + 기관 보유 비율
  const revTrend = fundamentals.trends.revenue ?? null
  const revCagr = revTrend?.cagr ?? null
  const revDirection = revTrend?.direction ?? 'stable'
  const cagrScore = score(revCagr, [0, 3, 7, 12])
  const directionBonus = revDirection === 'improving' ? 0.8 : revDirection === 'deteriorating' ? -1.0 : 0
  const revDownYears = (revTrend?.yoy_changes ?? []).filter(([, pct]) => pct != null && pct < -5).length
  const stabilityPenalty = Math.min(1.5, revDownYears * 0.5)
  const institutionPct = fundamentals.institution_ownership_pct ?? null
  const institutionBonus = institutionPct != null && institutionPct >= 70 ? 0.5 : 0
  const switchingCosts = Math.min(10, Math.max(0, cagrScore + directionBonus - stabilityPenalty + institutionBonus))

  // Network effects: 다년간 FCF 마진 평균 + FCF 흑자 일관성
  const revByYear = new Map((revTrend?.values ?? []).map(([yr, val]) => [yr, val]))
  const fcfMargins = windowYears
    .map((y) => {
      const rev = revByYear.get(y.fiscal_year)
      return y.fcf != null && rev != null && rev > 0 ? (y.fcf / rev) * 100 : null
    })
    .filter((v): v is number => v != null)
  const fcfMargin = fcfMargins.length > 0
    ? fcfMargins.reduce((a, b) => a + b, 0) / fcfMargins.length
    : (() => {
        const fcf = latest?.fcf ?? null
        const revVal = revTrend?.values.at(-1)?.[1] ?? null
        return fcf != null && revVal != null && revVal > 0 ? (fcf / revVal) * 100 : null
      })()
  const positiveFcfYears = fcfMargins.filter((m) => m > 0).length
  const fcfConsistencyBonus = fcfMargins.length >= 2 && positiveFcfYears === fcfMargins.length ? 0.5 : 0
  const networkEffects = Math.min(10, Math.max(0, score(fcfMargin, [-5, 0, 5, 15]) + fcfConsistencyBonus))

  // Efficient scale: 다년간 ROA (자본 효율) + ICR (자본 장벽)
  const icr = icrStats.avg ?? latest?.icr ?? null
  const roaScore = score(roa, [3, 6, 10, 15])
  const icrScore = score(icr, [2, 5, 10, 20])
  const efficientScale = (roaScore + icrScore) / 2
  const employees = fundamentals.profile?.employees ?? null

  // 비용 우위 rationale
  const caRationaleBase = opMargin != null
    ? `영업이익률 ${opMargin.toFixed(1)}%${sector ? ` (${sector} 업종 기준)` : ''}`
    : null
  const [, caT2, caT3, caT4] = marginThresholds
  const caInterpret = opMargin == null ? null
    : opMargin >= caT4 ? '업종 최상위 마진 — 독점적 가격 결정력 또는 구조적 원가 우위 확인'
    : opMargin >= caT3 ? '평균 상회 마진 — 공정 효율 또는 규모의 경제 작동'
    : opMargin >= caT2 ? '업종 평균 수준의 마진'
    : '원가 우위 미확인'
  const caRationale = caRationaleBase && caInterpret ? `${caRationaleBase} — ${caInterpret}` : caRationaleBase

  // 무형 자산 rationale
  const iaRationaleBase = roe != null ? `ROE ${roe.toFixed(1)}%` : null
  const iaInterpret = roe == null ? null
    : roe >= 25 ? '탁월한 자본 수익률 — 특허·브랜드 등 무형 자산이 초과 수익의 원천'
    : roe >= 15 ? '무형 자산이 수익성에 기여하는 신호'
    : roe >= 10 ? '무형 자산 효과 제한적'
    : '무형 자산 우위 미확인'
  const iaInsiderNote = insiderNetPct == null ? null
    : insiderNetPct >= 5 ? `경영진 순매수 ${insiderNetPct.toFixed(1)}%p — 내부자 확신 신호`
    : insiderNetPct <= -5 ? `경영진 순매도 ${insiderNetPct.toFixed(1)}%p — 내부자 신뢰 약화 신호`
    : null
  const iaRationale = [
    iaRationaleBase && iaInterpret ? `${iaRationaleBase} — ${iaInterpret}` : iaRationaleBase,
    iaInsiderNote,
  ].filter(Boolean).join(' · ') || null

  // 전환 비용 rationale
  const scRationaleBase = revCagr != null ? `매출 CAGR ${revCagr.toFixed(1)}%` : null
  const scInterpret = revCagr == null ? null
    : revCagr >= 12 ? '높은 고객 유지율 — 교체 비용이 크거나 플랫폼·통합 솔루션 구조'
    : revCagr >= 7  ? '고객 유지력 양호 — 부분적 전환 비용 존재'
    : revCagr >= 3  ? '전환 비용 제한적 — 고객 선택지 충분'
    : '고객 이탈 위험 — 전환 비용 낮음'
  const scInstitutionNote = institutionPct != null && institutionPct >= 70
    ? `기관 보유율 ${institutionPct.toFixed(1)}% — 안정적 지배구조`
    : null
  const scRationale = [
    scRationaleBase && scInterpret ? `${scRationaleBase} — ${scInterpret}` : scRationaleBase,
    scInstitutionNote,
  ].filter(Boolean).join(' · ') || null

  // 네트워크 효과 rationale
  const neRationaleBase = fcfMargin != null ? `FCF 마진 ${fcfMargin.toFixed(1)}%` : null
  const neInterpret = fcfMargin == null ? null
    : fcfMargin >= 15 ? '탁월한 현금 창출력 — 참여자 증가로 가치 상승하는 구조 가능'
    : fcfMargin >= 5  ? '안정적 현금 흐름 — 제한적 네트워크 효과'
    : fcfMargin >= 0  ? '현금 창출 보통 — 네트워크 효과 미약'
    : '투자 소요 증가 또는 사이클 영향'
  const neRationale = neRationaleBase && neInterpret ? `${neRationaleBase} — ${neInterpret}` : neRationaleBase

  // 효율적 규모 rationale
  const esRationaleBase = roa != null && icr != null
    ? `ROA ${roa.toFixed(1)}% · 이자보상 ${icr.toFixed(1)}배`
    : roa != null ? `ROA ${roa.toFixed(1)}%` : null
  const esInterpret = roa == null ? null
    : roa >= 15 && (icr ?? 0) >= 20 ? '신규 진입이 비경제적인 구조 — 과점·독점 시장 포지션 가능'
    : roa >= 10 ? '효율적 자본 운용 — 규모 경제 작동'
    : roa >= 6  ? '자본 효율 보통'
    : '자본 효율 개선 여지'
  const esEmployeeNote = employees != null ? `직원 수 ${employees.toLocaleString()}명` : null
  const esRationale = [
    esRationaleBase && esInterpret ? `${esRationaleBase} — ${esInterpret}` : esRationaleBase,
    esEmployeeNote,
  ].filter(Boolean).join(' · ') || null

  const dimension_scores: DimensionScore[] = [
    {
      dimension: 'cost_advantage',
      score: Math.round(costAdvantage * 10) / 10,
      rationale: caRationale,
    },
    {
      dimension: 'intangible_assets',
      score: Math.round(intangibleScore * 10) / 10,
      rationale: iaRationale,
    },
    {
      dimension: 'switching_costs',
      score: Math.round(switchingCosts * 10) / 10,
      rationale: scRationale,
    },
    {
      dimension: 'network_effects',
      score: Math.round(networkEffects * 10) / 10,
      rationale: neRationale,
    },
    {
      dimension: 'efficient_scale',
      score: Math.round(efficientScale * 10) / 10,
      rationale: esRationale,
    },
  ]

  const scoreMap = Object.fromEntries(
    dimension_scores.map((d) => [d.dimension, d.score]),
  ) as Record<MoatDimension, number>

  const compound_moats = detectCompoundMoats(scoreMap)

  const rawComposite = calcWeightedComposite(dimension_scores, sector)
  const compoundBonus = Math.min(0.6, compound_moats.length * 0.3)
  const composite_score = Math.min(10, rawComposite + compoundBonus)

  const grade: MoatGrade =
    composite_score >= 7.5 ? 'wide' : composite_score >= 5.0 ? 'narrow' : 'none'

  const durability_trend = deriveDurabilityTrend(
    windowYears.map((y) => y.operating_margin),
    windowYears.map((y) => y.roa),
  )

  return {
    ticker: fundamentals.ticker,
    market: fundamentals.market,
    fiscal_year,
    dimension_scores,
    compound_moats,
    composite_score: Math.round(composite_score * 10) / 10,
    grade,
    durability_trend,
    analyst_note: generateAnalystNote(
      fundamentals.name ?? fundamentals.ticker,
      grade,
      dimension_scores,
      compound_moats,
    ),
    scored_at: new Date().toISOString(),
  }
}

/** 동종업계 마진 비교(peer_comparison)를 원가 우위 점수 및 종합 해자 점수에 반영합니다. */
export function applyPeerComparisonToMoat(
  moat: MoatAnalysis,
  peerComparison: MoatAnalysis['peer_comparison'],
  displayName?: string,
  sector?: string | null,
): MoatAnalysis {
  if (!peerComparison || peerComparison.delta_pct == null) {
    return { ...moat, peer_comparison: peerComparison }
  }
  const delta = peerComparison.delta_pct
  // 동종업계 평균 대비 마진 스프레드(±10%p → ±1.0점 범위로 보정)
  const peerAdj = Math.max(-1.0, Math.min(1.0, delta * 0.1))

  const updatedDims = moat.dimension_scores.map((d) => {
    if (d.dimension !== 'cost_advantage') return d
    const nextScore = Math.round(Math.min(10, Math.max(0, d.score + peerAdj)) * 10) / 10
    const peerNote = `동종업계 평균 대비 ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%p`
    const nextRationale = d.rationale ? `${d.rationale} · ${peerNote}` : peerNote
    return { ...d, score: nextScore, rationale: nextRationale }
  })

  const scoreMap = Object.fromEntries(
    updatedDims.map((d) => [d.dimension, d.score]),
  ) as Record<MoatDimension, number>
  const compound_moats = detectCompoundMoats(scoreMap)
  const rawComposite = calcWeightedComposite(updatedDims, sector)
  const compoundBonus = Math.min(0.6, compound_moats.length * 0.3)
  const composite_score = Math.round(Math.min(10, rawComposite + compoundBonus) * 10) / 10
  const grade: MoatGrade =
    composite_score >= 7.5 ? 'wide' : composite_score >= 5.0 ? 'narrow' : 'none'

  return {
    ...moat,
    dimension_scores: updatedDims,
    compound_moats,
    composite_score,
    grade,
    peer_comparison: peerComparison,
    analyst_note: generateAnalystNote(
      displayName ?? moat.ticker,
      grade,
      updatedDims,
      compound_moats,
    ),
  }
}
