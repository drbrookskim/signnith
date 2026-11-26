import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { applyBusinessMoatToMoat, applyPeerComparisonToMoat, calculateMoat, computeRoicWaccSeries } from './moat.ts'
import type { FundamentalAnalysis } from '../../types/index.ts'

function makeBaseFundamentals(overrides: Partial<FundamentalAnalysis> = {}): FundamentalAnalysis {
  return {
    ticker: 'TEST',
    name: 'Test Corp',
    market: 'US',
    profile: {
      name: 'Test Corp',
      description: null,
      ceo: null,
      sector: 'Technology',
      industry: null,
      website: null,
      employees: 1000,
    },
    metrics_by_year: [
      {
        fiscal_year: 2022,
        roe: 22,
        roa: 12,
        debt_ratio: 35,
        operating_margin: 28,
        fcf: 200,
        per: null,
        pbr: null,
        icr: 15,
        peg_ratio: null,
        week52_high: null,
        week52_low: null,
        current_price: null,
      },
      {
        fiscal_year: 2023,
        roe: 25,
        roa: 14,
        debt_ratio: 30,
        operating_margin: 32,
        fcf: 250,
        per: null,
        pbr: null,
        icr: 18,
        peg_ratio: null,
        week52_high: null,
        week52_low: null,
        current_price: null,
      },
    ],
    trends: {
      revenue: {
        metric_name: 'revenue',
        values: [[2022, 1000], [2023, 1150]],
        cagr: 15,
        direction: 'improving',
        yoy_changes: [[2022, null], [2023, 15]],
      },
    },
    ...overrides,
  }
}

describe('calculateMoat', () => {
  it('연속 선형 보간으로 경계값 사이 점수를 세밀하게 계산한다', () => {
    const lowTech = makeBaseFundamentals({
      metrics_by_year: [
        {
          fiscal_year: 2023,
          roe: 12.5,
          roa: 8,
          debt_ratio: 60,
          operating_margin: 25, // Technology [10,20,30,40] 중 20~30 중간 -> 6.25
          fcf: 50,
          per: null,
          pbr: null,
          icr: 7.5,
          peg_ratio: null,
          week52_high: null,
          week52_low: null,
          current_price: null,
        },
      ],
    })
    const res = calculateMoat(lowTech)
    const cost = res.dimension_scores.find((d) => d.dimension === 'cost_advantage')!
    assert.ok(cost.score > 4 && cost.score < 7, `expected interpolated score, got ${cost.score}`)
  })

  it('다년간 변동성이 크고 일회성 급등인 경우 추세 및 안정성 페널티를 반영한다', () => {
    const volatile = makeBaseFundamentals({
      metrics_by_year: [
        {
          fiscal_year: 2021, roe: 5, roa: 3, debt_ratio: 50, operating_margin: 5, fcf: -10,
          per: null, pbr: null, icr: 3, peg_ratio: null, week52_high: null, week52_low: null, current_price: null,
        },
        {
          fiscal_year: 2022, roe: 6, roa: 4, debt_ratio: 50, operating_margin: 6, fcf: 10,
          per: null, pbr: null, icr: 4, peg_ratio: null, week52_high: null, week52_low: null, current_price: null,
        },
        {
          fiscal_year: 2023, roe: 28, roa: 15, debt_ratio: 30, operating_margin: 35, fcf: 250,
          per: null, pbr: null, icr: 20, peg_ratio: null, week52_high: null, week52_low: null, current_price: null,
        },
      ],
      trends: {
        revenue: {
          metric_name: 'revenue',
          values: [[2021, 1000], [2022, 1020], [2023, 1150]],
          cagr: 7.2,
          direction: 'stable',
          yoy_changes: [[2021, null], [2022, 2], [2023, 12.7]],
        },
      },
    })
    const res = calculateMoat(volatile)
    assert.equal(res.durability_trend, 'expanding')
    assert.notEqual(res.grade, 'wide', '일회성 급등만으로 wide가 나오지 않아야 함')
  })

  it('동종업계 마진 비교를 원가 우위 점수에 반영한다', () => {
    const base = calculateMoat(makeBaseFundamentals())
    const boosted = applyPeerComparisonToMoat(base, {
      peers: [{ symbol: 'PEER', name: 'Peer', operating_margin: 20 }],
      peer_avg_margin: 20,
      company_margin: 32,
      delta_pct: 12,
    })
    const baseCost = base.dimension_scores.find((d) => d.dimension === 'cost_advantage')!.score
    const boostedCost = boosted.dimension_scores.find((d) => d.dimension === 'cost_advantage')!.score
    assert.ok(boostedCost > baseCost)
  })

  it('업종별 가중치 차등에 따라 Technology와 Utilities의 종합 점수가 달라진다', () => {
    const sharedMetrics = [
      {
        fiscal_year: 2023,
        roe: 18,
        roa: 10,
        debt_ratio: 40,
        operating_margin: 22,
        fcf: 200,
        per: null,
        pbr: null,
        icr: 12,
        peg_ratio: null,
        week52_high: null,
        week52_low: null,
        current_price: null,
      },
    ]
    const tech = calculateMoat(
      makeBaseFundamentals({
        metrics_by_year: sharedMetrics,
        profile: { name: 'Tech', description: null, ceo: null, sector: 'Technology', industry: null, website: null, employees: 500 },
      }),
    )
    const util = calculateMoat(
      makeBaseFundamentals({
        metrics_by_year: sharedMetrics,
        profile: { name: 'Util', description: null, ceo: null, sector: 'Utilities', industry: null, website: null, employees: 500 },
      }),
    )
    assert.notEqual(tech.composite_score, util.composite_score)
  })

  it('computeRoicWaccSeries는 시장(KR/US)과 ICR에 따라 WACC를 차등 추정한다', () => {
    const usSeries = computeRoicWaccSeries(makeBaseFundamentals({ market: 'US' }))
    const krSeries = computeRoicWaccSeries(makeBaseFundamentals({ market: 'KR' }))
    assert.ok(krSeries[0].WACC > usSeries[0].WACC)
  })

  it('applyBusinessMoatToMoat는 재무 점수(70%)와 사업 점수(30%)를 블렌딩하고 사업 근거를 보존한다', () => {
    const base = calculateMoat(makeBaseFundamentals())
    const enriched = applyBusinessMoatToMoat(
      base,
      {
        business_summary: '강력한 생태계 잠금과 규모의 경제를 보유한 플랫폼 기업입니다.',
        dimensions: {
          cost_advantage: { score: 9.0, rationale: '수직 계열화 기반 원가 우위' },
          intangible_assets: { score: 9.0, rationale: '글로벌 브랜드 파워' },
          switching_costs: { score: 9.5, rationale: 'OS·클라우드 생태계 잠금' },
          network_effects: { score: 9.0, rationale: '개발자·사용자 양면 네트워크' },
          efficient_scale: { score: 8.0, rationale: '대규모 인프라 진입 장벽' },
        },
        erosion_risks: ['반독점 규제 강화', 'AI 플랫폼 패러다임 전환'],
        model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      },
      'Test Corp',
      'Technology',
    )
    const sw = enriched.dimension_scores.find((d) => d.dimension === 'switching_costs')!
    assert.equal(sw.business_rationale, 'OS·클라우드 생태계 잠금')
    assert.equal(enriched.business_moat?.erosion_risks.length, 2)
  })
})
