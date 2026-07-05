'use client'

import { useState, useEffect } from 'react'
import type { GateBInput, GateBResult, GateStatus } from '@/types'
import { checkGateB } from '@/lib/adapters/swingPipeline'

const STATUS_COLOR: Record<GateStatus, string> = {
  GO:   'var(--status-go)',
  WARN: 'var(--status-warn)',
  STOP: 'var(--status-stop)',
}
const STATUS_ICON: Record<GateStatus, string> = { GO: '🟢', WARN: '⚠️', STOP: '🔴' }

function StatusPill({ status }: { status: GateStatus }) {
  const color = STATUS_COLOR[status]
  return (
    <span style={{
      marginLeft: 8, fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color,
      border: `1px solid ${color}`, borderRadius: 4, padding: '1px 6px',
    }}>
      {STATUS_ICON[status]} {status}
    </span>
  )
}

const MATRIX_LABEL: Record<GateBResult['matrix'], string> = {
  STRONG_BUY:          '최강 진입 신호 ✅',
  FIND_ALTERNATIVE:    '섹터 대안 종목 탐색',
  HEADWIND_SHORT_ONLY: '헤드윈드 진입 (2주 이내)',
  NO_ENTRY:            '진입 금지 🚫',
}

const DEFAULT_INPUT: GateBInput = {
  market_foreign_days: 0,
  market_institution: 'neutral',
  sector_etf_days: 0,
  stock_foreign_days: 0,
  stock_institution_weeks: 0,
  short_ratio: 0.02,
  short_trend: 'stable',
}

// ── 힌트 색상 ──────────────────────────────────────────────────

type HintLevel = 'go' | 'warn' | 'stop' | 'neutral'

const HINT_STYLE: Record<HintLevel, React.CSSProperties> = {
  go:      { color: 'var(--status-go)',   fontSize: 11, lineHeight: 1.4, marginTop: 5 },
  warn:    { color: 'var(--status-warn)', fontSize: 11, lineHeight: 1.4, marginTop: 5 },
  stop:    { color: 'var(--status-stop)', fontSize: 11, lineHeight: 1.4, marginTop: 5 },
  neutral: { color: 'var(--ink-3)',       fontSize: 11, lineHeight: 1.4, marginTop: 5 },
}

interface Hint { level: HintLevel; text: string }

// ── 힌트 계산 함수 ─────────────────────────────────────────────

function hintMarketForeign(v: number, inst: GateBInput['market_institution']): Hint {
  if (v >= 3 && inst === 'buy')
    return { level: 'go', text: `외국인 ${v}일 연속 순매수 + 기관 매수 → Layer 1 GO` }
  if (v <= -3 && inst === 'sell')
    return { level: 'stop', text: `외국인 ${v}일 연속 순매도 + 기관 매도 → Layer 1 STOP (진입 차단)` }
  if (v >= 3)
    return { level: 'warn', text: `외국인 조건 충족(≥+3). 기관을 '매수'로 바꾸면 GO` }
  if (v <= -3)
    return { level: 'warn', text: `외국인 약세. 기관이 '매도'면 STOP — 기관 방향 주의` }
  const need = 3 - v
  return { level: 'neutral', text: `+${need}일 더 올리면 GO 조건 진입 가능 (현재: ${v > 0 ? '+' : ''}${v}일)` }
}

function hintMarketInstitution(v: GateBInput['market_institution'], days: number): Hint {
  if (v === 'buy') {
    if (days >= 3) return { level: 'go', text: '외국인+기관 동반 매수 — Layer 1 GO' }
    return { level: 'warn', text: `기관 매수 확인. 외국인 +${3 - days}일 더 필요하면 GO` }
  }
  if (v === 'sell') {
    if (days <= -3) return { level: 'stop', text: '외국인+기관 동반 매도 → Layer 1 STOP (진입 차단)' }
    return { level: 'warn', text: '기관 매도. 외국인도 -3일 이하면 STOP 위험' }
  }
  return { level: 'neutral', text: '기관 중립 — Layer 1 WARN 유지. 매수 전환 시 GO 가능' }
}

function hintSectorEtf(v: number): Hint {
  if (v >= 5)  return { level: 'go',  text: `섹터 ETF ${v}일 연속 순유입 → Layer 2 GO (섹터 강세)` }
  if (v <= -3) return { level: 'stop', text: `섹터 ETF ${v}일 연속 순유출 → Layer 2 STOP (섹터 이탈)` }
  if (v >= 0) {
    const need = 5 - v
    return { level: 'neutral', text: `+${need}일 더 오르면 GO. -3일 이하면 STOP` }
  }
  return { level: 'warn', text: `약한 이탈 신호. -3일 이하면 STOP, +5일 이상이면 GO` }
}

function hintStockForeign(v: number, instWeeks: number): Hint {
  if (v >= 5 && instWeeks >= 3)
    return { level: 'go', text: `외국인 ${v}일 + 기관 ${instWeeks}주 누적 → 종목 수급 GO 조건 충족` }
  if (v <= -3)
    return { level: 'stop', text: `외국인 ${v}일 연속 순매도 → Layer 3 STOP (진입 차단)` }
  if (v >= 5)
    return { level: 'warn', text: `외국인 조건 충족. 기관 누적 +3주 이상 필요 (현재 ${instWeeks}주)` }
  const need = 5 - v
  return { level: 'neutral', text: `+${need}일 더 올리면 GO 조건 진입 가능 (현재 ${v}일)` }
}

function hintStockInstitution(v: number, foreignDays: number): Hint {
  if (v <= -2)
    return { level: 'stop', text: `기관 ${v}주 연속 순매도 → Layer 3 STOP (진입 차단)` }
  if (v >= 3 && foreignDays >= 5)
    return { level: 'go', text: `기관 ${v}주 누적 순매수 + 외국인 조건 충족 → GO 조건 달성` }
  if (v >= 3)
    return { level: 'warn', text: `기관 조건 충족. 외국인 +${5 - foreignDays}일 더 필요` }
  if (v < 0)
    return { level: 'warn', text: `기관 순매도 구간. -2주 이하면 STOP, +3주 이상이면 GO` }
  const need = 3 - v
  return { level: 'neutral', text: `+${need}주 더 올리면 GO 조건 진입 가능 (현재 ${v}주)` }
}

function hintShortRatio(v: number, trend: GateBInput['short_trend']): Hint {
  const pct = (v * 100).toFixed(1)
  if (v < 0.03 && trend === 'decrease')
    return { level: 'go', text: `대차잔고 ${pct}% + 감소 추세 → 공매도 압력 낮음 (GO 기여)` }
  if (v >= 0.03)
    return { level: 'stop', text: `대차잔고 ${pct}% ≥ 3% → 공매도 과다, GO 불가` }
  return { level: 'warn', text: `대차잔고 ${pct}% (3% 미만). 추세를 '감소'로 바꾸면 GO 기여` }
}

function hintShortTrend(v: GateBInput['short_trend'], ratio: number): Hint {
  if (v === 'decrease') {
    if (ratio < 0.03) return { level: 'go', text: '공매도 감소 + 잔고 3% 미만 → GO 기여' }
    return { level: 'warn', text: `감소 추세지만 대차잔고 ${(ratio * 100).toFixed(1)}% ≥ 3% — 비율도 낮춰야 GO` }
  }
  if (v === 'increase')
    return { level: 'stop', text: '공매도 증가 — 세력 하락 베팅 신호, GO 불가' }
  return { level: 'neutral', text: '안정 추세 — 대차잔고 3% 미만 + 감소로 전환해야 GO 기여' }
}

// ── 범례 ──────────────────────────────────────────────────────

function Legend() {
  const row: React.CSSProperties = {
    display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6,
  }
  const badge = (bg: string, color: string, text: string) => (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 99,
      background: bg, color, fontFamily: 'var(--font-mono)',
      fontSize: 10, fontWeight: 700, flexShrink: 0, letterSpacing: '.04em',
    }}>{text}</span>
  )
  const desc: React.CSSProperties = {
    fontSize: 11, color: 'var(--ink-3)', lineHeight: 1.45,
  }
  const divider: React.CSSProperties = {
    height: 1, background: 'var(--line)', margin: '10px 0',
  }
  const colTitle: React.CSSProperties = {
    fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '.12em',
    textTransform: 'uppercase', color: 'var(--ink-3)', fontWeight: 600, marginBottom: 8,
  }

  return (
    <details className="eq-glass" style={{
      borderRadius: 9, overflow: 'hidden',
    }}>
      <summary style={{
        padding: '9px 13px', cursor: 'pointer', userSelect: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.1em',
        textTransform: 'uppercase', color: 'var(--ink-3)', fontWeight: 600,
        listStyle: 'none',
      }}>
        <span>📖 용어 범례 — GO / WARN / STOP / PASS / BLOCK</span>
        <span style={{ fontSize: 9, color: 'var(--ink-3)' }}>펼치기 ▾</span>
      </summary>

      <div style={{ padding: '12px 14px 14px', borderTop: '1px solid var(--line)' }}>

        {/* 레이어 상태 */}
        <p style={colTitle}>레이어 상태 — 각 수급 레이어의 현재 신호</p>
        <div style={row}>
          {badge('var(--status-go-bg)', 'var(--status-go)', '🟢 GO')}
          <p style={desc}>해당 레이어의 수급이 강함. 진입에 유리한 환경.</p>
        </div>
        <div style={row}>
          {badge('var(--status-warn-bg)', 'var(--status-warn)', '⚠️ WARN')}
          <p style={desc}>수급 중립 또는 혼조. 단독으로 진입을 막지는 않음.</p>
        </div>
        <div style={row}>
          {badge('var(--status-stop-bg)', 'var(--status-stop)', '🔴 STOP')}
          <p style={desc}>해당 레이어에서 이탈 신호 감지. STOP이 하나라도 있으면 Gate B 자동 차단.</p>
        </div>

        <div style={divider} />

        {/* Gate 판정 */}
        <p style={colTitle}>Gate 판정 — Gate B 최종 통과 여부</p>
        <div style={row}>
          {badge('var(--status-go-bg)', 'var(--status-go)', '✅ PASS')}
          <p style={desc}>3개 레이어 모두 STOP 없음 → 다음 단계(체력 필터·기술적 진입) 진행 가능.</p>
        </div>
        <div style={row}>
          {badge('var(--status-stop-bg)', 'var(--status-stop)', '🚫 BLOCK')}
          <p style={desc}>레이어 중 하나 이상 STOP → 현시점 진입 불가. WARN만으로는 차단되지 않음.</p>
        </div>

        <div style={divider} />

        {/* 2×2 매트릭스 */}
        <p style={colTitle}>2×2 매트릭스 — 섹터(L2) × 종목(L3) 조합</p>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6,
        }}>
          {([
            { label: '최강 진입 신호', sub: 'L2 GO + L3 GO',    color: 'var(--status-go)',   bg: 'var(--status-go-bg)' },
            { label: '섹터 대안 탐색', sub: 'L2 GO + L3 WARN',  color: 'var(--status-warn)', bg: 'var(--status-warn-bg)' },
            { label: '헤드윈드 진입', sub: 'L2 WARN + L3 GO',   color: 'var(--status-info)', bg: 'var(--status-info-bg)' },
            { label: '진입 금지',     sub: 'L2·L3 모두 GO 아님', color: 'var(--status-stop)', bg: 'var(--status-stop-bg)' },
          ]).map(({ label, sub, color, bg }) => (
            <div key={label} style={{
              borderRadius: 7, padding: '8px 10px', background: bg,
              border: '1px solid var(--line)',
            }}>
              <p style={{ fontSize: 12, fontWeight: 600, color, margin: '0 0 2px' }}>{label}</p>
              <p style={{ fontSize: 10, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', margin: 0 }}>{sub}</p>
            </div>
          ))}
        </div>

      </div>
    </details>
  )
}

// ── 서브 컴포넌트 ──────────────────────────────────────────────

function SliderField({
  label, value, min, max, step = 1, display, hint, onChange,
}: {
  label: string; value: number; min: number; max: number
  step?: number; display?: string; hint?: Hint; onChange: (v: number) => void
}) {
  const fillPct = ((value - min) / (max - min)) * 100
  return (
    <div className="eq-glass" style={{ padding: '12px 14px', borderRadius: 8 }}>
      <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ position: 'relative', display: 'flex', flex: 1, alignItems: 'center', height: 20 }}>
          {/* Track background */}
          <div style={{ position: 'absolute', left: 0, right: 0, height: 4, borderRadius: 999, background: 'var(--line-2)' }}>
            {/* Filled (left) portion */}
            <div style={{ height: '100%', borderRadius: 999, width: `${fillPct}%`, background: 'var(--status-go)' }} />
          </div>
          {/* Thumb dot */}
          <div style={{
            position: 'absolute', height: 16, width: 16, borderRadius: '50%',
            background: 'var(--status-go)', boxShadow: '0 1px 3px rgba(0,0,0,.2)', pointerEvents: 'none',
            left: `calc(${fillPct}% - 8px)`,
          }} />
          {/* Native input — transparent, handles all interaction */}
          <input
            type="range" min={min} max={max} step={step} value={value}
            onChange={e => onChange(parseFloat(e.target.value))}
            style={{ position: 'absolute', inset: 0, width: '100%', cursor: 'pointer', opacity: 0 }}
          />
        </div>
        <span style={{ minWidth: 40, textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
          {display ?? (value > 0 ? `+${value}` : String(value))}
        </span>
      </div>
      {hint && (
        <p style={HINT_STYLE[hint.level]}>{hint.text}</p>
      )}
    </div>
  )
}

function Toggle3Way<T extends string>({
  label, value, options, labels, hint, onChange,
}: {
  label: string; value: T; options: readonly T[]; labels: string[]
  hint?: Hint; onChange: (v: T) => void
}) {
  return (
    <div className="eq-glass" style={{ padding: '12px 14px', borderRadius: 8 }}>
      <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', gap: 4 }}>
        {options.map((opt, i) => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            style={{
              all: 'unset', boxSizing: 'border-box', flex: 1, textAlign: 'center',
              padding: '5px 8px', borderRadius: 5, cursor: 'pointer',
              fontSize: 12, fontWeight: 500, transition: 'background-color .15s, color .15s',
              background: value === opt ? 'var(--accent)' : 'var(--surface-2)',
              color: value === opt ? 'var(--bg)' : 'var(--ink-2)',
            }}
          >
            {labels[i]}
          </button>
        ))}
      </div>
      {hint && (
        <p style={HINT_STYLE[hint.level]}>{hint.text}</p>
      )}
    </div>
  )
}

// ── 메인 컴포넌트 ──────────────────────────────────────────────

export default function GateBPanel({
  onResult,
}: {
  onResult: (result: GateBResult) => void
}) {
  const [input, setInput] = useState<GateBInput>(DEFAULT_INPUT)
  const result = checkGateB(input)

  useEffect(() => { onResult(result) }, [input])  // eslint-disable-line react-hooks/exhaustive-deps

  function patch<K extends keyof GateBInput>(key: K, val: GateBInput[K]) {
    setInput(prev => ({ ...prev, [key]: val }))
  }

  const verdictColor = result.verdict === 'PASS' ? 'var(--status-go)' : 'var(--status-stop)'

  // 힌트 계산 (현재 input 기준 실시간)
  const hints = {
    marketForeign:    hintMarketForeign(input.market_foreign_days, input.market_institution),
    marketInstitution: hintMarketInstitution(input.market_institution, input.market_foreign_days),
    sectorEtf:        hintSectorEtf(input.sector_etf_days),
    stockForeign:     hintStockForeign(input.stock_foreign_days, input.stock_institution_weeks),
    stockInstitution: hintStockInstitution(input.stock_institution_weeks, input.stock_foreign_days),
    shortRatio:       hintShortRatio(input.short_ratio, input.short_trend),
    shortTrend:       hintShortTrend(input.short_trend, input.short_ratio),
  }

  const layerTitle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', marginBottom: 10,
    fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.08em',
    textTransform: 'uppercase', fontWeight: 700, color: 'var(--ink-3)',
  }

  return (
    <div>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Gate B — 수급</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--status-warn)' }}>HTS 확인 후 직접 입력</span>
        </div>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: verdictColor,
          border: `1px solid ${verdictColor}`, borderRadius: 999, padding: '2px 10px',
        }}>
          {result.verdict === 'PASS' ? '✅ PASS' : '🚫 BLOCK'}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* 범례 */}
        <Legend />

        {/* Layer 1 */}
        <div>
          <h4 style={layerTitle}>
            Layer 1 — 시장 전체
            <StatusPill status={result.layer1} />
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            <SliderField
              label="외국인 순매수 연속 (일)"
              value={input.market_foreign_days} min={-10} max={10}
              hint={hints.marketForeign}
              onChange={v => patch('market_foreign_days', v)}
            />
            <Toggle3Way
              label="기관 방향"
              value={input.market_institution}
              options={['buy', 'neutral', 'sell'] as const}
              labels={['매수', '중립', '매도']}
              hint={hints.marketInstitution}
              onChange={v => patch('market_institution', v)}
            />
          </div>
        </div>

        {/* Layer 2 */}
        <div>
          <h4 style={layerTitle}>
            Layer 2 — 섹터
            <StatusPill status={result.layer2} />
          </h4>
          <SliderField
            label="섹터 ETF 순유입 연속 (일)"
            value={input.sector_etf_days} min={-10} max={10}
            hint={hints.sectorEtf}
            onChange={v => patch('sector_etf_days', v)}
          />
        </div>

        {/* Layer 3 */}
        <div>
          <h4 style={layerTitle}>
            Layer 3 — 종목
            <StatusPill status={result.layer3} />
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            <SliderField
              label="외국인 순매수 연속 (일)"
              value={input.stock_foreign_days} min={0} max={10}
              hint={hints.stockForeign}
              onChange={v => patch('stock_foreign_days', v)}
            />
            <SliderField
              label="기관 누적 순매수 (주)"
              value={input.stock_institution_weeks} min={-5} max={5}
              hint={hints.stockInstitution}
              onChange={v => patch('stock_institution_weeks', v)}
            />
            <SliderField
              label="대차잔고 / 시총 (%)"
              value={Math.round(input.short_ratio * 100)}
              min={0} max={20}
              display={`${(input.short_ratio * 100).toFixed(1)}%`}
              hint={hints.shortRatio}
              onChange={v => patch('short_ratio', v / 100)}
            />
            <Toggle3Way
              label="대차잔고 추세"
              value={input.short_trend}
              options={['decrease', 'stable', 'increase'] as const}
              labels={['감소', '안정', '증가']}
              hint={hints.shortTrend}
              onChange={v => patch('short_trend', v)}
            />
          </div>
        </div>

        {/* 매트릭스 결과 */}
        <div className="eq-glass" style={{ borderRadius: 8, padding: '10px 14px' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)' }}>2×2 매트릭스: </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{MATRIX_LABEL[result.matrix]}</span>
        </div>
      </div>
    </div>
  )
}
