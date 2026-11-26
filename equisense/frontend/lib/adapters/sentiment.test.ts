import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { classifyNewsTitle, computeFearGreed, computeManagementGrade } from './sentiment-scoring.ts'
import type { SentimentData } from '../../types/index.ts'

function makeSentiment(overrides: Partial<SentimentData> = {}): SentimentData {
  return {
    consensus: null,
    earnings_surprises: [],
    disclosures: [],
    insider_transactions: [],
    institution_holders: [],
    rec_trend: [],
    upgrade_downgrade: [],
    short_data: { short_pct_of_float: null, short_ratio: null, shares_short: null },
    fifty_two_week: { low: null, high: null, current: null, position_pct: null },
    insider_net_purchase_pct: null,
    institution_ownership_pct: null,
    outlook: null,
    ...overrides,
  }
}

describe('computeFearGreed', () => {
  it('결측치를 고정값 55로 채우지 않고 가용 신호만으로 동적 가중 평균한다', () => {
    const bullishOnly = computeFearGreed({
      vix: null,
      bullishPct: 90,
      shortPctOfFloat: null,
      positionPct: null,
    })
    assert.equal(bullishOnly.activeSignals, 1)
    assert.equal(bullishOnly.score, 90)
  })

  it('어닝 서프라이즈·업그레이드·DART 공시 센티먼트를 반영한다', () => {
    const krNegative = computeFearGreed({
      vix: 18,
      bullishPct: null,
      disclosures: [
        { rcept_no: '1', report_nm: '유상증자 결정', rcept_dt: '20260101', flr_nm: 'A', importance: 'high' },
        { rcept_no: '2', report_nm: '전환사채 발행', rcept_dt: '20260102', flr_nm: 'A', importance: 'high' },
      ],
    })
    const krPositive = computeFearGreed({
      vix: 18,
      bullishPct: null,
      disclosures: [
        { rcept_no: '1', report_nm: '자기주식취득 신탁계약 체결', rcept_dt: '20260101', flr_nm: 'A', importance: 'medium' },
        { rcept_no: '2', report_nm: '단일판매ㆍ공급계약 체결', rcept_dt: '20260102', flr_nm: 'A', importance: 'low' },
      ],
    })
    assert.ok(krPositive.score > krNegative.score)
  })

  it('KR 종목은 KOSPI 200MA 이격도를 매크로 심리에 우선 반영한다', () => {
    const bullKospi = computeFearGreed({
      market: 'KR',
      vix: 25,
      kospiPrice: 2860,
      kospiMa200: 2600, // +10%
      bullishPct: null,
    })
    const bearKospi = computeFearGreed({
      market: 'KR',
      vix: 25,
      kospiPrice: 2340,
      kospiMa200: 2600, // -10%
      bullishPct: null,
    })
    assert.ok(bullKospi.score > bearKospi.score)
  })

  it('뉴스 헤드라인 감성 분류 및 FearGreed 반영이 동작한다', () => {
    assert.equal(classifyNewsTitle('Apple beats earnings and surges on record growth'), 'positive')
    assert.equal(classifyNewsTitle('Company faces lawsuit after earnings miss'), 'negative')
    const posNews = computeFearGreed({
      vix: 18,
      bullishPct: null,
      news: [
        { title: 'Beats estimates', link: '', publisher: 'R', published_at: '2026-01-01', sentiment: 'positive' },
        { title: 'Upgrade on growth', link: '', publisher: 'R', published_at: '2026-01-01', sentiment: 'positive' },
      ],
    })
    const negNews = computeFearGreed({
      vix: 18,
      bullishPct: null,
      news: [
        { title: 'Lawsuit probe', link: '', publisher: 'R', published_at: '2026-01-01', sentiment: 'negative' },
        { title: 'Earnings miss', link: '', publisher: 'R', published_at: '2026-01-01', sentiment: 'negative' },
      ],
    })
    assert.ok(posNews.score > negNews.score)
  })
})

describe('computeManagementGrade', () => {
  it('신호가 전혀 없으면 N/A를 반환한다', () => {
    const res = computeManagementGrade(makeSentiment())
    assert.equal(res.grade, 'N/A')
    assert.equal(res.score, null)
  })

  it('애널리스트 컨센서스 없이 내부자 순매수·어닝 비트만으로 높은 등급을 산출한다', () => {
    const res = computeManagementGrade(
      makeSentiment({
        insider_net_purchase_pct: 8,
        earnings_surprises: [
          { quarter: '2025 Q1', eps_estimate: 1.0, eps_actual: 1.2, surprise_pct: 20 },
          { quarter: '2025 Q2', eps_estimate: 1.1, eps_actual: 1.3, surprise_pct: 18 },
        ],
      }),
    )
    assert.ok((res.score ?? 0) >= 78)
    assert.ok(res.grade === 'A' || res.grade === 'A+')
  })
})
