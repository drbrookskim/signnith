import type {
  AnalysisJob,
  DocType,
  FundamentalAnalysis,
  GrowthDriver,
  Market,
  NoiseFilterItem,
  QualitativeResult,
  RiskFactor,
} from '@/types'

// ── 점수 계산 헬퍼 ────────────────────────────────────────────────

function scoreROE(roe: number | null): number {
  if (roe == null) return 0
  if (roe >= 20) return 30
  if (roe >= 15) return 22
  if (roe >= 10) return 15
  if (roe >= 0) return 7
  return 0
}

function scoreMargin(margin: number | null, direction: string): number {
  if (margin == null) return 10
  if (direction === 'improving') return 25
  if (direction === 'stable') return margin >= 10 ? 20 : 15
  return margin >= 10 ? 10 : 5
}

function scoreFCF(fcf: number | null, direction: string): number {
  if (fcf == null || fcf <= 0) return 0
  if (direction === 'improving') return 25
  if (direction === 'stable') return 18
  return 10
}

function scoreRevenue(direction: string): number {
  if (direction === 'improving') return 20
  if (direction === 'stable') return 12
  return 4
}

// ── 언행일치 점수 (사업보고서 — 장기 일관성) ────────────────────

function calcIntegrityScoreAnnual(f: FundamentalAnalysis): number {
  const latest = f.metrics_by_year.at(-1)
  const opTrend = f.trends.operating_income?.direction ?? 'stable'
  const revTrend = f.trends.revenue?.direction ?? 'stable'

  return Math.min(100, Math.round(
    scoreROE(latest?.roe ?? null) +
    scoreMargin(latest?.operating_margin ?? null, opTrend) +
    scoreFCF(latest?.fcf ?? null, opTrend) +
    scoreRevenue(revTrend),
  ))
}

// ── 언행일치 점수 (실적발표 — 단기 실적 품질) ───────────────────
// FCF vs 순이익 비율, 최근 1년 성장 가속도, ROE 방향성을 중심으로 평가

function calcIntegrityScoreEarnings(f: FundamentalAnalysis): number {
  const years = [...f.metrics_by_year].sort((a, b) => a.fiscal_year - b.fiscal_year)
  const latest = years.at(-1)
  const prev = years.at(-2)

  let score = 0

  // FCF / 순이익 비율 — 1에 가까울수록 어닝 품질 높음 (최대 35점)
  const fcf = latest?.fcf ?? null
  const fcfPrev = prev?.fcf ?? null
  if (fcf != null && fcf > 0) {
    score += fcfPrev != null && fcf > fcfPrev ? 35 : 25
  } else if (fcf != null && fcf < 0) {
    score += 5
  }

  // 최근 영업이익률 방향 (최대 30점)
  const opTrend = f.trends.operating_income?.direction ?? 'stable'
  if (opTrend === 'improving') score += 30
  else if (opTrend === 'stable') score += 18
  else score += 5

  // 매출 성장 모멘텀 — 최근 YoY (최대 20점)
  const revYoy = f.trends.revenue?.yoy_changes ?? []
  const latestYoy = revYoy.at(-1)?.[1] ?? null
  if (latestYoy != null && latestYoy > 10) score += 20
  else if (latestYoy != null && latestYoy > 0) score += 12
  else if (latestYoy != null) score += 3

  // ROE 개선 여부 (최대 15점)
  const roe = latest?.roe ?? null
  const roePrev = prev?.roe ?? null
  if (roe != null && roePrev != null && roe > roePrev) score += 15
  else if (roe != null && roe > 15) score += 10

  return Math.min(100, Math.round(score))
}

// ── 리스크 요인 (사업보고서 — 구조적·장기 리스크) ───────────────

function buildRiskFactorsAnnual(f: FundamentalAnalysis): RiskFactor[] {
  const latest = f.metrics_by_year.at(-1)
  const opTrend = f.trends.operating_income?.direction ?? 'stable'
  const revTrend = f.trends.revenue?.direction ?? 'stable'
  const risks: RiskFactor[] = []

  const debt = latest?.debt_ratio ?? null
  if (debt != null && debt > 70) {
    risks.push({
      title: '장기 부채 구조 부담',
      description: `부채비율 ${debt.toFixed(1)}%로 경기 하강 시 이자 부담 및 재무 유연성 저하 리스크가 있습니다.`,
      severity: 'high',
    })
  } else if (debt != null && debt > 50) {
    risks.push({
      title: '부채 수준 모니터링 필요',
      description: `부채비율 ${debt.toFixed(1)}%로 금리 환경 변화에 따른 이자 비용 증가를 점검해야 합니다.`,
      severity: 'medium',
    })
  }

  const opMargin = latest?.operating_margin ?? null
  if (opMargin != null && opMargin < 0) {
    risks.push({
      title: '구조적 영업 손실',
      description: `영업이익률 ${opMargin.toFixed(1)}%로 사업 모델의 수익 구조 재검토가 필요합니다.`,
      severity: 'high',
    })
  } else if (opTrend === 'deteriorating') {
    risks.push({
      title: '다년간 수익성 하락 추세',
      description: `복수 회계연도에 걸쳐 영업이익률이 지속 하락하고 있어 경쟁 심화 또는 비용 구조 악화를 의심해 볼 필요가 있습니다.`,
      severity: 'medium',
    })
  }

  const fcf = latest?.fcf ?? null
  if (fcf != null && fcf < 0) {
    risks.push({
      title: '지속적 음의 잉여현금흐름',
      description: `FCF가 음수로 외부 자본 조달 의존 구조가 고착되면 재무 부담이 누적됩니다.`,
      severity: 'high',
    })
  }

  if (revTrend === 'deteriorating') {
    risks.push({
      title: '다년간 매출 성장 정체 또는 역성장',
      description: `장기 매출 추세가 약화되고 있어 시장 포지셔닝 또는 제품 경쟁력 점검이 필요합니다.`,
      severity: 'medium',
    })
  }

  const roe = latest?.roe ?? null
  if (roe != null && roe < 0) {
    risks.push({
      title: '주주 자본 훼손',
      description: `ROE ${roe.toFixed(1)}%로 주주 자본이 순손실로 지속 감소하는 구조입니다.`,
      severity: 'high',
    })
  }

  const per = latest?.per ?? null
  if (per != null && per > 40) {
    risks.push({
      title: '장기 고평가 부담',
      description: `PER ${per.toFixed(1)}배로 미래 성장 기대가 과도하게 반영된 경우 연간 실적 미달 시 대폭 조정이 발생할 수 있습니다.`,
      severity: 'medium',
    })
  }

  return risks
}

// ── 리스크 요인 (실적발표 — 단기·가이던스 리스크) ───────────────

function buildRiskFactorsEarnings(f: FundamentalAnalysis): RiskFactor[] {
  const years = [...f.metrics_by_year].sort((a, b) => a.fiscal_year - b.fiscal_year)
  const latest = years.at(-1)
  const prev = years.at(-2)
  const risks: RiskFactor[] = []

  // 최근 FCF vs 순이익 괴리 — 실적 품질 저하 시그널
  const fcf = latest?.fcf ?? null
  const roe = latest?.roe ?? null
  const roePrev = prev?.roe ?? null
  if (fcf != null && fcf < 0 && roe != null && roe > 0) {
    risks.push({
      title: '순이익과 현금흐름의 괴리',
      description: `순이익은 양수이나 FCF가 음수로, 이익의 현금 전환율이 낮습니다. 일회성 항목이나 운전자본 증가를 확인해야 합니다.`,
      severity: 'high',
    })
  }

  // 최근 ROE 하락
  if (roe != null && roePrev != null && roe < roePrev && roe < 10) {
    risks.push({
      title: '최근 분기 수익성 하락',
      description: `ROE가 ${roePrev.toFixed(1)}% → ${roe.toFixed(1)}%로 감소하며 최근 실적 모멘텀이 둔화되고 있습니다.`,
      severity: 'medium',
    })
  }

  // 최근 영업이익률 방향
  const opTrend = f.trends.operating_income?.direction ?? 'stable'
  const opMargin = latest?.operating_margin ?? null
  if (opTrend === 'deteriorating') {
    risks.push({
      title: '가이던스 하향 가능성',
      description: `영업이익률이 하락 추세로, 다음 분기 가이던스 보수화 또는 컨센서스 하향이 발생할 수 있습니다.`,
      severity: 'medium',
    })
  }

  // 고 PER + 최근 성장 둔화
  const per = latest?.per ?? null
  const revYoy = f.trends.revenue?.yoy_changes ?? []
  const latestRevYoy = revYoy.at(-1)?.[1] ?? null
  if (per != null && per > 30 && latestRevYoy != null && latestRevYoy < 5) {
    risks.push({
      title: '밸류에이션 프리미엄 vs 성장 둔화 괴리',
      description: `PER ${per.toFixed(1)}배의 성장주 평가를 받고 있으나 최근 매출 증가율이 ${latestRevYoy.toFixed(1)}%로 낮아, 기대 미달 시 리레이팅 압력이 커질 수 있습니다.`,
      severity: 'medium',
    })
  }

  // 영업손실
  if (opMargin != null && opMargin < 0) {
    risks.push({
      title: '영업 적자 지속 — 흑자 전환 불확실',
      description: `영업이익률 ${opMargin.toFixed(1)}%로, 흑자 전환 시점에 대한 경영진 가이던스의 신뢰성을 검증해야 합니다.`,
      severity: 'high',
    })
  }

  return risks
}

// ── 성장 동력 (사업보고서 — 장기·구조적) ───────────────────────

function buildGrowthDriversAnnual(f: FundamentalAnalysis): GrowthDriver[] {
  const latest = f.metrics_by_year.at(-1)
  const revCagr = f.trends.revenue?.cagr ?? null
  const revTrend = f.trends.revenue?.direction ?? 'stable'
  const opTrend = f.trends.operating_income?.direction ?? 'stable'
  const drivers: GrowthDriver[] = []

  if (revCagr != null && revCagr > 10) {
    drivers.push({
      title: '복수 연도에 걸친 강한 매출 성장',
      description: `매출 CAGR ${revCagr.toFixed(1)}%로 업종 내 구조적 성장 모멘텀이 확인됩니다.`,
    })
  } else if (revCagr != null && revCagr > 5 && revTrend !== 'deteriorating') {
    drivers.push({
      title: '안정적 다년간 매출 성장',
      description: `매출 CAGR ${revCagr.toFixed(1)}%로 일관된 성장 기조를 장기간 유지하고 있습니다.`,
    })
  }

  const opMargin = latest?.operating_margin ?? null
  if (opTrend === 'improving' && opMargin != null && opMargin > 0) {
    drivers.push({
      title: '장기 수익성 개선 — 규모의 경제',
      description: `복수 회계연도에 걸쳐 영업이익이 지속 상승하며 비용 효율화 또는 가격 결정력이 강화되고 있습니다.`,
    })
  } else if (opMargin != null && opMargin > 20) {
    drivers.push({
      title: '업종 상위권 영업이익률 유지',
      description: `영업이익률 ${opMargin.toFixed(1)}%로 장기간 고수익 구조를 지속하고 있습니다.`,
    })
  }

  const roe = latest?.roe ?? null
  if (roe != null && roe > 15) {
    drivers.push({
      title: '우수한 자기자본이익률 — 자본 효율성',
      description: `ROE ${roe.toFixed(1)}%로 주주 자본을 효율적으로 운용하며 장기 복리 성장 기반을 유지합니다.`,
    })
  }

  const fcf = latest?.fcf ?? null
  if (fcf != null && fcf > 0) {
    drivers.push({
      title: '지속적 잉여현금흐름 창출',
      description: `양수 FCF가 유지되어 신규 투자, 부채 상환, 주주 환원을 위한 내부 재원이 확보되어 있습니다.`,
    })
  }

  const debt = latest?.debt_ratio ?? null
  if (debt != null && debt < 30) {
    drivers.push({
      title: '낮은 부채비율 — 재무 여력 확보',
      description: `부채비율 ${debt.toFixed(1)}%로 추가 자본 투하 또는 M&A 기회 포착 시 재무 유연성이 높습니다.`,
    })
  }

  return drivers
}

// ── 성장 동력 (실적발표 — 최근 분기 모멘텀) ─────────────────────

function buildGrowthDriversEarnings(f: FundamentalAnalysis): GrowthDriver[] {
  const years = [...f.metrics_by_year].sort((a, b) => a.fiscal_year - b.fiscal_year)
  const latest = years.at(-1)
  const prev = years.at(-2)
  const drivers: GrowthDriver[] = []

  // 최근 YoY 매출 가속
  const revYoy = f.trends.revenue?.yoy_changes ?? []
  const latestYoy = revYoy.at(-1)?.[1] ?? null
  const prevYoy = revYoy.at(-2)?.[1] ?? null
  if (latestYoy != null && latestYoy > 10) {
    const isAccel = prevYoy != null && latestYoy > prevYoy
    drivers.push({
      title: isAccel ? '매출 성장 가속 — 강한 수요 신호' : '두 자릿수 매출 성장 유지',
      description: isAccel
        ? `최근 매출 YoY ${latestYoy.toFixed(1)}%로 직전 ${prevYoy!.toFixed(1)}%에서 가속되어 수요 기반이 확대되고 있습니다.`
        : `최근 매출이 YoY ${latestYoy.toFixed(1)}% 증가하며 강한 수요 모멘텀을 보이고 있습니다.`,
    })
  } else if (latestYoy != null && latestYoy > 0) {
    drivers.push({
      title: '안정적 매출 성장 유지',
      description: `최근 매출 YoY ${latestYoy.toFixed(1)}%로 플러스 성장 기조를 유지하고 있습니다.`,
    })
  }

  // 최근 FCF 개선
  const fcf = latest?.fcf ?? null
  const fcfPrev = prev?.fcf ?? null
  if (fcf != null && fcf > 0) {
    if (fcfPrev != null && fcf > fcfPrev) {
      drivers.push({
        title: '잉여현금흐름 전년 대비 개선',
        description: `FCF가 전년 대비 증가하여 실적의 현금 전환 품질이 향상되고 있습니다.`,
      })
    } else {
      drivers.push({
        title: '양호한 현금 창출력',
        description: `FCF가 양수로 유지되어 이익이 실제 현금으로 전환되고 있음이 확인됩니다.`,
      })
    }
  }

  // 최근 ROE 개선
  const roe = latest?.roe ?? null
  const roePrev = prev?.roe ?? null
  if (roe != null && roePrev != null && roe > roePrev && roe > 10) {
    drivers.push({
      title: 'ROE 개선 — 자본 효율성 향상',
      description: `ROE가 ${roePrev.toFixed(1)}% → ${roe.toFixed(1)}%로 개선되며 최근 실적 개선이 수익 구조에 반영되고 있습니다.`,
    })
  }

  // 수익성 개선
  const opTrend = f.trends.operating_income?.direction ?? 'stable'
  const opMargin = latest?.operating_margin ?? null
  if (opTrend === 'improving' && opMargin != null && opMargin > 0) {
    drivers.push({
      title: '영업이익률 상승 추세 — 레버리지 효과',
      description: `매출 성장에 따른 고정비 희석 효과로 영업이익률이 개선 흐름을 이어가고 있습니다.`,
    })
  }

  return drivers
}

// ── 노이즈 필터 (사업보고서 — 구조적 내러티브) ──────────────────

function buildNoiseFilterAnnual(f: FundamentalAnalysis): NoiseFilterItem[] {
  const latest = f.metrics_by_year.at(-1)
  const opTrend = f.trends.operating_income?.direction ?? 'stable'
  const revTrend = f.trends.revenue?.direction ?? 'stable'
  const per = latest?.per ?? null
  const debt = latest?.debt_ratio ?? null
  const fcf = latest?.fcf ?? null

  return [
    {
      claim: '고평가 우려: 현재 주가는 실적 대비 지나치게 비싸다',
      is_substantiated: per != null && per > 25,
      evidence:
        per != null
          ? per > 25
            ? `PER ${per.toFixed(1)}배로 시장 평균을 상회합니다. 성장 프리미엄의 지속 가능성을 다년간 실적으로 검증해야 합니다.`
            : `PER ${per.toFixed(1)}배로 구조적 고평가 주장을 장기 재무 데이터로 뒷받침하기 어렵습니다.`
          : 'PER 데이터가 없어 판단이 어렵습니다.',
    },
    {
      claim: '부채 리스크: 과도한 부채로 장기 재무 위기 가능성이 있다',
      is_substantiated: debt != null && debt > 60,
      evidence:
        debt != null
          ? debt > 60
            ? `부채비율 ${debt.toFixed(1)}%로 금리 사이클 변동 시 이자 부담 증가 리스크가 실재합니다.`
            : `부채비율 ${debt.toFixed(1)}%로 장기 재무 위기 우려는 현재 데이터로 뒷받침되지 않습니다.`
          : '부채 데이터가 없어 판단이 어렵습니다.',
    },
    {
      claim: '성장 한계론: 기업이 이미 성숙기에 접어들어 성장은 끝났다',
      is_substantiated: revTrend === 'deteriorating',
      evidence:
        revTrend === 'deteriorating'
          ? '매출 성장률이 다년간 감소 추세로 성장 한계 논거가 재무 데이터로 확인됩니다.'
          : revTrend === 'improving'
            ? '매출이 지속 성장 추세에 있어 성숙기 도달 주장은 근거가 부족합니다.'
            : '매출이 안정적으로 유지되고 있어 급격한 성장 소멸은 관찰되지 않습니다.',
    },
    {
      claim: '수익성 구조 악화: 경쟁 심화로 장기적으로 이익 기반이 훼손된다',
      is_substantiated: opTrend === 'deteriorating',
      evidence:
        opTrend === 'deteriorating'
          ? '다년간 영업이익이 감소 추세로 수익성 구조 악화 우려가 데이터로 확인됩니다.'
          : opTrend === 'improving'
            ? '영업이익이 지속 개선 추세로 경쟁 심화에 의한 이익 훼손 주장은 근거가 부족합니다.'
            : '영업이익이 안정적으로 유지되고 있습니다.',
    },
    {
      claim: '현금흐름 위기: 현금이 빠르게 소진되어 유동성 위험이 있다',
      is_substantiated: fcf != null && fcf < 0,
      evidence:
        fcf != null
          ? fcf < 0
            ? 'FCF가 음수로 영업 활동의 현금 창출 구조를 장기적으로 점검해야 합니다.'
            : 'FCF가 양수로 현금흐름 위기 주장은 재무 데이터로 뒷받침되지 않습니다.'
          : 'FCF 데이터가 없어 판단이 어렵습니다.',
    },
  ]
}

// ── 노이즈 필터 (실적발표 — 어닝콜 단골 내러티브) ───────────────

function buildNoiseFilterEarnings(f: FundamentalAnalysis): NoiseFilterItem[] {
  const latest = f.metrics_by_year.at(-1)
  const opTrend = f.trends.operating_income?.direction ?? 'stable'
  const revYoy = f.trends.revenue?.yoy_changes ?? []
  const latestYoy = revYoy.at(-1)?.[1] ?? null
  const fcf = latest?.fcf ?? null
  const opMargin = latest?.operating_margin ?? null

  return [
    {
      claim: '가이던스 하향: 경영진이 보수적으로 가이던스를 낮춰 컨센서스를 관리하고 있다',
      is_substantiated: opTrend === 'deteriorating',
      evidence:
        opTrend === 'deteriorating'
          ? '영업이익률이 하락 추세로, 가이던스 보수화가 단순한 기대치 관리가 아닌 실제 사업 압박을 반영할 가능성이 있습니다.'
          : opTrend === 'improving'
            ? '영업이익이 개선 추세로, 가이던스 하향이 전략적 기대치 관리일 가능성이 높습니다.'
            : '현재 실적 추세는 가이던스 보수화가 구조적 악화인지 전략적 관리인지를 단정하기 어렵습니다.',
    },
    {
      claim: '일회성 비용: 이번 분기 실적 부진은 일회성 요인 때문으로 지속적이지 않다',
      is_substantiated: opMargin != null && opMargin < 5 && opTrend === 'deteriorating',
      evidence:
        opMargin != null && opMargin < 5
          ? `영업이익률 ${opMargin.toFixed(1)}%로 낮은 수준이 지속되고 있어 일회성 비용 주장만으로 설명하기 어렵습니다.`
          : `영업이익률이 상대적으로 양호하여 일회성 비용의 영향이 제한적일 가능성이 있습니다.`,
    },
    {
      claim: '성장 가속: 최근 분기는 일시적 둔화이며 다음 분기부터 재가속된다',
      is_substantiated: latestYoy != null && latestYoy < 3,
      evidence:
        latestYoy != null && latestYoy < 3
          ? `최근 매출 YoY ${latestYoy.toFixed(1)}%로 실제로 성장이 둔화되어 있어 재가속 주장을 뒷받침하는 근거가 필요합니다.`
          : latestYoy != null
            ? `최근 매출이 YoY ${latestYoy.toFixed(1)}% 증가 중으로 성장 둔화 자체를 확인하기 어렵습니다.`
            : '매출 성장률 데이터가 없어 판단이 어렵습니다.',
    },
    {
      claim: '현금흐름은 문제없다: 이익의 현금화가 충분히 이루어지고 있다',
      is_substantiated: fcf != null && fcf > 0,
      evidence:
        fcf != null
          ? fcf > 0
            ? 'FCF가 양수로 이익의 현금 전환이 실제로 이루어지고 있음이 확인됩니다.'
            : 'FCF가 음수로, 이익의 현금화 주장을 재무 데이터로 뒷받침하기 어렵습니다.'
          : 'FCF 데이터가 없어 판단이 어렵습니다.',
    },
    {
      claim: '계절성 효과: 이번 분기 실적은 계절적 비수기를 반영한 것으로 정상 범위다',
      is_substantiated: opTrend === 'stable',
      evidence:
        opTrend === 'stable'
          ? '영업이익이 안정적 수준을 유지하고 있어 계절성 주장이 타당할 가능성이 있습니다.'
          : opTrend === 'deteriorating'
            ? '영업이익이 다년간 하락 추세로, 계절성만으로 부진을 설명하기에는 패턴이 지속적입니다.'
            : '개선 추세 속의 계절성 조정이라면 다음 분기 회복 여부로 검증 가능합니다.',
    },
  ]
}

// ── AI 요약 (사업보고서) ──────────────────────────────────────────

function buildSummaryAnnual(f: FundamentalAnalysis, fiscal_year: number): string {
  const latest = f.metrics_by_year.at(-1)
  const revTrend = f.trends.revenue?.direction ?? 'stable'
  const opTrend = f.trends.operating_income?.direction ?? 'stable'
  const revCagr = f.trends.revenue?.cagr ?? null
  const opMargin = latest?.operating_margin ?? null
  const roe = latest?.roe ?? null
  const debt = latest?.debt_ratio ?? null

  const revDesc =
    revTrend === 'improving' && revCagr != null
      ? `매출 CAGR ${revCagr.toFixed(1)}%의 복수 연도 성장세를 유지하며`
      : revTrend === 'deteriorating'
        ? '장기 매출 성장이 정체·역행하는 흐름을 보이며'
        : '매출이 안정적 기조를 다년간 유지하며'

  const profitDesc =
    opTrend === 'improving'
      ? '수익성이 구조적으로 개선되고 있습니다'
      : opTrend === 'deteriorating'
        ? '영업 수익성이 장기 하락 추세에 있어 경쟁 구조 또는 비용 구조 점검이 필요합니다'
        : opMargin != null
          ? `영업이익률 ${opMargin.toFixed(1)}%의 안정적 수익 구조를 유지하고 있습니다`
          : '수익성은 안정적 수준입니다'

  const healthDesc =
    debt != null && roe != null
      ? `재무 건전성 측면에서는 부채비율 ${debt.toFixed(1)}%, ROE ${roe.toFixed(1)}%로`
      : '재무 지표를 종합하면'

  const integrityScore = calcIntegrityScoreAnnual(f)
  const overallDesc =
    integrityScore >= 70
      ? '전반적으로 일관된 경영 성과를 장기간 유지하고 있습니다.'
      : integrityScore >= 40
        ? '일부 개선 여지가 있으나 전체적으로 무난한 사업 기반을 갖추고 있습니다.'
        : '복수 재무 지표에서 개선이 필요하여 사업 전략의 재점검이 요구됩니다.'

  return `${fiscal_year}년 사업보고서 분석 — ${f.ticker}: ${revDesc} ${profitDesc}. ${healthDesc} ${overallDesc}`
}

// ── AI 요약 (실적발표) ───────────────────────────────────────────

function buildSummaryEarnings(f: FundamentalAnalysis, fiscal_year: number): string {
  const years = [...f.metrics_by_year].sort((a, b) => a.fiscal_year - b.fiscal_year)
  const latest = years.at(-1)
  const prev = years.at(-2)

  const revYoy = f.trends.revenue?.yoy_changes ?? []
  const latestYoy = revYoy.at(-1)?.[1] ?? null
  const opTrend = f.trends.operating_income?.direction ?? 'stable'
  const fcf = latest?.fcf ?? null
  const fcfPrev = prev?.fcf ?? null
  const roe = latest?.roe ?? null
  const roePrev = prev?.roe ?? null

  const toplineDesc =
    latestYoy != null && latestYoy > 10
      ? `최근 매출이 YoY ${latestYoy.toFixed(1)}% 증가하며 강한 수요 모멘텀을 보였고`
      : latestYoy != null && latestYoy > 0
        ? `최근 매출이 YoY ${latestYoy.toFixed(1)}% 증가하며 성장 기조를 유지했고`
        : latestYoy != null
          ? `최근 매출 성장률이 ${latestYoy.toFixed(1)}%로 부진하며`
          : '최근 매출 성장 추이를 종합하면'

  const bottomlineDesc =
    opTrend === 'improving'
      ? '영업이익률 개선으로 수익 레버리지가 작동하고 있습니다'
      : opTrend === 'deteriorating'
        ? '영업이익률이 하락 추세로 비용 압박 또는 경쟁 심화가 반영되고 있습니다'
        : '영업 수익성은 안정적 수준을 유지하고 있습니다'

  const cashDesc =
    fcf != null && fcfPrev != null
      ? fcf > fcfPrev
        ? `FCF는 전년 대비 개선되어 실적의 현금 전환 품질이 향상되고 있습니다.`
        : fcf > 0
          ? `FCF는 양수를 유지하나 전년 대비 감소하여 현금 창출 추이를 모니터링해야 합니다.`
          : `FCF가 음수로 전환되어 이익의 현금 품질을 점검해야 합니다.`
      : fcf != null && fcf > 0
        ? `FCF가 양수로 이익의 현금 전환이 이루어지고 있습니다.`
        : '현금흐름 데이터를 추가로 확인해야 합니다.'

  const roeSignal =
    roe != null && roePrev != null
      ? roe > roePrev
        ? ` ROE는 ${roePrev.toFixed(1)}% → ${roe.toFixed(1)}%로 개선됐습니다.`
        : roe < roePrev
          ? ` ROE는 ${roePrev.toFixed(1)}% → ${roe.toFixed(1)}%로 하락했습니다.`
          : ''
      : ''

  return `${fiscal_year}년 실적발표 분석 — ${f.ticker}: ${toplineDesc} ${bottomlineDesc}. ${cashDesc}${roeSignal}`
}

// ── 메모리 내 잡 스토어 ───────────────────────────────────────────

const jobStore = new Map<string, AnalysisJob>()

// ── 공개 API ─────────────────────────────────────────────────────

export function calculateQualitative(
  f: FundamentalAnalysis,
  fiscal_year: number,
  doc_type: DocType,
  market: Market,
): AnalysisJob {
  const job_id = crypto.randomUUID()

  const isEarnings = doc_type === 'earnings_call'

  const result: QualitativeResult = {
    id: crypto.randomUUID(),
    job_id,
    ticker: f.ticker,
    fiscal_period: `${fiscal_year}A`,
    integrity_score: isEarnings
      ? calcIntegrityScoreEarnings(f)
      : calcIntegrityScoreAnnual(f),
    summary_ko: isEarnings
      ? buildSummaryEarnings(f, fiscal_year)
      : buildSummaryAnnual(f, fiscal_year),
    risk_factors: isEarnings
      ? buildRiskFactorsEarnings(f)
      : buildRiskFactorsAnnual(f),
    growth_drivers: isEarnings
      ? buildGrowthDriversEarnings(f)
      : buildGrowthDriversAnnual(f),
    noise_filter: isEarnings
      ? buildNoiseFilterEarnings(f)
      : buildNoiseFilterAnnual(f),
    created_at: new Date().toISOString(),
  }

  void market

  const job: AnalysisJob = { job_id, status: 'COMPLETED', result, error: null }
  jobStore.set(job_id, job)
  return job
}

export function lookupJob(job_id: string): AnalysisJob | null {
  return jobStore.get(job_id) ?? null
}
