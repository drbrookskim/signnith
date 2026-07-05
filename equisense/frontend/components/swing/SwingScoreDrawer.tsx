'use client'

import type { FundamentalMetrics, Market, QuarterlyInsightMap } from '@/types'

function formatLargeNumber(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1e12) return `${(value / 1e12).toFixed(1)}T`
  if (abs >= 1e9)  return `${(value / 1e9).toFixed(1)}B`
  if (abs >= 1e6)  return `${(value / 1e6).toFixed(1)}M`
  return value.toFixed(0)
}

interface SwingScoreItem {
  key: string
  label: string
  status: 'pass' | 'warn' | 'fail' | 'na'
  value: string
  detail: string
  score: number
  maxScore: number
}

interface SwingScore {
  total: number
  grade: 'strong' | 'good' | 'caution' | 'weak'
  items: SwingScoreItem[]
  comment: string
}

export function computeSwingScore(
  metrics: FundamentalMetrics,
  quarterlyInsights: QuarterlyInsightMap | null,
): SwingScore {
  const items: SwingScoreItem[] = []

  // 1. 부채비율
  const dr = metrics.debt_ratio
  if (dr != null) {
    const s = dr <= 200 ? 'pass' : dr <= 300 ? 'warn' : 'fail'
    items.push({
      key: 'debt_ratio', label: '부채비율', status: s,
      value: `${dr.toFixed(1)}%`,
      detail: s === 'pass' ? '기준 ≤ 200% 충족' : s === 'warn' ? '200~300% 주의' : '300% 초과 부적합',
      score: s === 'pass' ? 25 : s === 'warn' ? 12 : 0, maxScore: 25,
    })
  }

  // 2. 이자보상배율
  const icr = metrics.icr
  if (icr != null) {
    const s = icr >= 3 ? 'pass' : icr >= 1.5 ? 'warn' : 'fail'
    items.push({
      key: 'icr', label: '이자보상배율', status: s,
      value: `${icr.toFixed(1)}x`,
      detail: s === 'pass' ? '기준 ≥ 3배 충족' : s === 'warn' ? '1.5x~3x 주의' : '1.5배 미만 위험',
      score: s === 'pass' ? 15 : s === 'warn' ? 7 : 0, maxScore: 15,
    })
  }

  // 3. FCF
  const fcf = metrics.fcf
  if (fcf != null) {
    const s = fcf > 0 ? 'pass' : 'fail'
    items.push({
      key: 'fcf', label: 'FCF', status: s,
      value: formatLargeNumber(fcf),
      detail: s === 'pass' ? '잉여현금흐름 양호' : '잉여현금흐름 마이너스',
      score: s === 'pass' ? 10 : 0, maxScore: 10,
    })
  }

  // 4. 이익 모멘텀
  const opInsight = quarterlyInsights?.['operating_margin'] ?? quarterlyInsights?.['margin']
  if (opInsight && !opInsight.insufficient) {
    const s = opInsight.direction === 'up' ? 'pass' : opInsight.direction === 'mixed' ? 'warn' : 'fail'
    items.push({
      key: 'momentum', label: '이익 모멘텀', status: s,
      value: opInsight.momentum_label,
      detail: opInsight.trend_line,
      score: s === 'pass' ? 25 : s === 'warn' ? 12 : 0, maxScore: 25,
    })
  } else {
    const om = metrics.operating_margin
    if (om != null) {
      items.push({
        key: 'momentum', label: '이익 모멘텀', status: om > 0 ? 'pass' : 'fail',
        value: `영업이익률 ${om.toFixed(1)}%`,
        detail: '분기 데이터 없음 — 연간 기준',
        score: om > 0 ? 12 : 0, maxScore: 25,
      })
    }
  }

  // 5. PEG Ratio
  const peg = metrics.peg_ratio
  if (peg != null) {
    const s = peg < 1.0 ? 'pass' : peg < 2.0 ? 'warn' : 'fail'
    items.push({
      key: 'peg', label: 'PEG Ratio', status: s,
      value: `${peg.toFixed(1)}x`,
      detail: s === 'pass' ? '기준 < 1.0 저평가' : s === 'warn' ? '1.0~2.0 적정' : '2.0 이상 고평가',
      score: s === 'pass' ? 15 : s === 'warn' ? 7 : 0, maxScore: 15,
    })
  }

  // 6. 52주 위치
  const high52 = metrics.week52_high
  const cur    = metrics.current_price
  if (high52 != null && cur != null && high52 > 0) {
    const distPct = (1 - cur / high52) * 100
    const s = distPct <= 25 ? 'pass' : distPct <= 40 ? 'warn' : 'fail'
    items.push({
      key: 'position52', label: '52주 위치', status: s,
      value: `고점 대비 -${distPct.toFixed(1)}%`,
      detail: s === 'pass' ? '고점 근처 (모멘텀 구간)' : s === 'warn' ? '재집결 구간' : '고점 대비 과도한 조정',
      score: s === 'pass' ? 10 : s === 'warn' ? 5 : 0, maxScore: 10,
    })
  }

  const totalMax   = items.reduce((a, i) => a + i.maxScore, 0)
  const totalScore = items.reduce((a, i) => a + i.score, 0)
  const total      = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0
  const grade: SwingScore['grade'] =
    total >= 80 ? 'strong' : total >= 60 ? 'good' : total >= 40 ? 'caution' : 'weak'

  const healthFail   = items.find(i => i.key === 'debt_ratio')?.status === 'fail'
  const momentumFail = items.find(i => i.key === 'momentum')?.status === 'fail'
  const healthPass   = items.find(i => i.key === 'debt_ratio')?.status === 'pass'
                    && (items.find(i => i.key === 'fcf')?.status ?? 'pass') !== 'fail'
  const momentumPass = items.find(i => i.key === 'momentum')?.status === 'pass'
  const positionPass = items.find(i => i.key === 'position52')?.status === 'pass'

  const comment =
    healthFail   ? '재무 체력 기준 미달. 스윙 트레이딩 진입 부적합.' :
    momentumFail ? '이익 모멘텀 정체·하락. 촉발 이벤트 발생 시까지 관망 권장.' :
    (healthPass && momentumPass && positionPass) ? '재무·모멘텀·기술적 조건 모두 양호. 진입 검토 가능.' :
    (healthPass && momentumPass && !positionPass) ? '재무 체력 우수, 이익 모멘텀 양호 — 고점 대비 조정 중. 50MA 회복 후 진입 재검토 권장.' :
    '일부 지표 주의 필요. 세부 항목을 확인하세요.'

  return { total, grade, items, comment }
}

const STATUS_COLOR: Record<SwingScoreItem['status'], string> = {
  pass: 'var(--accent)',
  warn: '#b45309',
  fail: '#dc2626',
  na:   'var(--ink-3)',
}

const STATUS_LABEL: Record<SwingScoreItem['status'], string> = {
  pass: '통과', warn: '주의', fail: '미달', na: 'N/A',
}

const GRADE_COLOR: Record<SwingScore['grade'], string> = {
  strong:  'var(--accent)',
  good:    'var(--accent)',
  caution: '#b45309',
  weak:    '#dc2626',
}

function ScoreTile({ label, value, status, detail }: {
  label: string
  value: string
  status: SwingScoreItem['status']
  detail: string
}) {
  const color = STATUS_COLOR[status]
  return (
    <div className="eq-glass" style={{ padding: '12px 14px', borderRadius: 8, border: `1px solid ${color}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color }}>{value}</span>
          <span style={{
            fontSize: 10, fontFamily: 'var(--font-mono)', color,
            border: `1px solid ${color}`, borderRadius: 4, padding: '1px 5px',
          }}>{STATUS_LABEL[status]}</span>
        </div>
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-3)' }}>{detail}</div>
    </div>
  )
}

export default function SwingScoreDrawer({
  metrics,
  quarterlyInsights,
  quarterlyLoading,
  market,
}: {
  metrics: FundamentalMetrics | null
  quarterlyInsights: QuarterlyInsightMap | null
  quarterlyLoading: boolean
  market: Market
}) {
  if (!metrics) return null

  const score = quarterlyLoading ? null : computeSwingScore(metrics, quarterlyInsights)

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.1em',
          textTransform: 'uppercase', color: 'var(--ink-3)', flexShrink: 0,
        }}>스윙 적합도</span>
        {score ? (
          <>
            <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'var(--line-2)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 999, width: `${score.total}%`,
                background: GRADE_COLOR[score.grade], transition: 'width .4s ease',
              }} />
            </div>
            <span style={{
              fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700,
              color: GRADE_COLOR[score.grade], flexShrink: 0,
            }}>{score.total}점</span>
          </>
        ) : (
          <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'var(--surface-2)', animation: 'pulse 1.5s ease-in-out infinite' }} />
        )}
      </div>

      {score && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            {score.items.map((item) => (
              <ScoreTile key={item.key} label={item.label} value={item.value} status={item.status} detail={item.detail} />
            ))}
            {market === 'KR' && !score.items.find(i => i.key === 'peg') && (
              <ScoreTile label="PEG Ratio" value="—" status="na" detail="KR 종목 미제공" />
            )}
          </div>
          <p style={{
            marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)',
            fontSize: 12, lineHeight: 1.5, color: 'var(--ink-2)',
          }}>
            💡 {score.comment}
          </p>
        </div>
      )}

      {!score && (
        <div style={{ marginTop: 12, height: 90, borderRadius: 8, background: 'var(--surface-2)', animation: 'pulse 1.5s ease-in-out infinite' }} />
      )}
    </section>
  )
}
