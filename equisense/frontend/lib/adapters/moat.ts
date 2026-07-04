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

const GRADE_TEXT: Record<MoatGrade, string> = {
  wide: '강력한 경제적 해자를 보유합니다',
  narrow: '일부 구조적 우위가 확인됩니다',
  none: '뚜렷한 해자가 확인되지 않습니다',
}

function score(value: number | null, thresholds: [number, number, number, number]): number {
  if (value == null) return 0
  const [t1, t2, t3, t4] = thresholds
  if (value >= t4) return 10
  if (value >= t3) return 7.5
  if (value >= t2) return 5
  if (value >= t1) return 2.5
  return 0
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
  const latest = years.at(-1)
  const fiscal_year = latest?.fiscal_year ?? new Date().getFullYear() - 1

  // Cost advantage: operating margin + low debt
  const opMargin = latest?.operating_margin ?? null
  const debtRatio = latest?.debt_ratio ?? null
  const opMarginScore = score(opMargin, [5, 10, 20, 30])
  const debtScore = debtRatio != null ? score(100 - debtRatio, [20, 40, 55, 70]) : 0
  const costAdvantage = (opMarginScore + debtScore) / 2

  // Intangible assets: ROE as proxy for brand/IP value
  const roe = latest?.roe ?? null
  const intangibleScore = score(roe, [5, 10, 15, 25])

  // Switching costs: revenue CAGR + trend direction
  const revTrend = fundamentals.trends.revenue ?? null
  const revCagr = revTrend?.cagr ?? null
  const revDirection = revTrend?.direction ?? 'stable'
  const cagrScore = score(revCagr, [0, 3, 7, 12])
  const directionBonus = revDirection === 'improving' ? 1 : revDirection === 'deteriorating' ? -1 : 0
  const switchingCosts = Math.min(10, Math.max(0, cagrScore + directionBonus))

  // Network effects: FCF margin as proxy
  const fcf = latest?.fcf ?? null
  const revVal = revTrend?.values.at(-1)?.[1] ?? null
  const fcfMargin = fcf != null && revVal != null && revVal > 0 ? (fcf / revVal) * 100 : null
  const networkEffects = score(fcfMargin, [-5, 0, 5, 15])

  // Efficient scale: ROA (capital efficiency in saturated market) + ICR (capital cost barrier to entry)
  const roa = latest?.roa ?? null
  const icr = latest?.icr ?? null
  const roaScore = score(roa, [3, 6, 10, 15])
  const icrScore = score(icr, [2, 5, 10, 20])
  const efficientScale = (roaScore + icrScore) / 2

  // 비용 우위 rationale
  const caRationaleBase = opMargin != null ? `영업이익률 ${opMargin.toFixed(1)}%` : null
  const caInterpret = opMargin == null ? null
    : opMargin >= 30 ? '업종 최상위 마진 — 독점적 가격 결정력 또는 구조적 원가 우위 확인'
    : opMargin >= 20 ? '평균 상회 마진 — 공정 효율 또는 규모의 경제 작동'
    : opMargin >= 10 ? '업종 평균 수준의 마진'
    : '원가 우위 미확인'
  const caRationale = caRationaleBase && caInterpret ? `${caRationaleBase} — ${caInterpret}` : caRationaleBase

  // 무형 자산 rationale
  const iaRationaleBase = roe != null ? `ROE ${roe.toFixed(1)}%` : null
  const iaInterpret = roe == null ? null
    : roe >= 25 ? '탁월한 자본 수익률 — 특허·브랜드 등 무형 자산이 초과 수익의 원천'
    : roe >= 15 ? '무형 자산이 수익성에 기여하는 신호'
    : roe >= 10 ? '무형 자산 효과 제한적'
    : '무형 자산 우위 미확인'
  const iaRationale = iaRationaleBase && iaInterpret ? `${iaRationaleBase} — ${iaInterpret}` : iaRationaleBase

  // 전환 비용 rationale
  const scRationaleBase = revCagr != null ? `매출 CAGR ${revCagr.toFixed(1)}%` : null
  const scInterpret = revCagr == null ? null
    : revCagr >= 12 ? '높은 고객 유지율 — 교체 비용이 크거나 플랫폼·통합 솔루션 구조'
    : revCagr >= 7  ? '고객 유지력 양호 — 부분적 전환 비용 존재'
    : revCagr >= 3  ? '전환 비용 제한적 — 고객 선택지 충분'
    : '고객 이탈 위험 — 전환 비용 낮음'
  const scRationale = scRationaleBase && scInterpret ? `${scRationaleBase} — ${scInterpret}` : scRationaleBase

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
  const esRationale = esRationaleBase && esInterpret ? `${esRationaleBase} — ${esInterpret}` : esRationaleBase

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

  const rawComposite = dimension_scores.reduce((s, d) => s + d.score, 0) / dimension_scores.length
  const compoundBonus = Math.min(0.6, compound_moats.length * 0.3)
  const composite_score = Math.min(10, rawComposite + compoundBonus)

  const grade: MoatGrade =
    composite_score >= 7.5 ? 'wide' : composite_score >= 5.0 ? 'narrow' : 'none'

  return {
    ticker: fundamentals.ticker,
    market: fundamentals.market,
    fiscal_year,
    dimension_scores,
    compound_moats,
    composite_score: Math.round(composite_score * 10) / 10,
    grade,
    analyst_note: generateAnalystNote(
      fundamentals.name ?? fundamentals.ticker,
      grade,
      dimension_scores,
      compound_moats,
    ),
    scored_at: new Date().toISOString(),
  }
}
