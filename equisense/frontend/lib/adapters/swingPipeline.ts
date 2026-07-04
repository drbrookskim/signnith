import type {
  GateAData, GateAResult, GateBInput, GateBResult,
  GateStatus, GateVerdict, RRInput, RRResult,
  StockType, TimeStopResult, SwingFinalResult, FinalVerdict,
} from '@/types'

// ── 하드코딩 상수 (공표값 변경 시 여기만 수정) ──────────
export const MACRO_CONSTANTS = {
  rate_bp: 0 as number,           // BOK 기준금리 동결 (기준: 2025-01)
  pmi: 51.2 as number,            // Korea Mfg PMI (기준: 2026-05)
  pmi_direction: 'up' as const,
  last_updated: '2026-05',
}

// ── Gate A ───────────────────────────────────────────────
export function checkGateA(data: GateAData): GateAResult {
  const axes: Record<string, GateStatus> = {}

  axes.vix = data.vix == null ? 'GO'
    : data.vix <= 20 ? 'GO' : data.vix <= 30 ? 'WARN' : 'STOP'

  axes.rate = data.rate_bp <= 25 ? 'GO' : data.rate_bp <= 50 ? 'WARN' : 'STOP'

  axes.pmi = data.pmi >= 50 ? 'GO'
    : data.pmi >= 45
      ? (data.pmi_direction === 'down' ? 'WARN' : 'GO')
      : 'STOP'

  if (data.kospi_price != null && data.kospi_ma200 != null) {
    axes.index = data.kospi_price > data.kospi_ma200 ? 'GO' : 'WARN'
  } else {
    axes.index = 'GO'
  }

  if (data.usdkrw != null) {
    axes.usdkrw = data.usdkrw >= 1400 ? 'WARN' : 'GO'
  }

  const verdict: GateVerdict = Object.values(axes).some(v => v === 'STOP') ? 'BLOCK' : 'PASS'
  return { data, axes, verdict }
}

// ── Gate B ───────────────────────────────────────────────
export function checkGateB(input: GateBInput): GateBResult {
  const layer1: GateStatus =
    input.market_foreign_days >= 3 && input.market_institution === 'buy' ? 'GO' :
    input.market_foreign_days <= -3 && input.market_institution === 'sell' ? 'STOP' : 'WARN'

  const layer2: GateStatus =
    input.sector_etf_days >= 5 ? 'GO' :
    input.sector_etf_days <= -3 ? 'STOP' : 'WARN'

  const short_ok = input.short_ratio < 0.03 && input.short_trend === 'decrease'
  const stock_ok = input.stock_foreign_days >= 5 && input.stock_institution_weeks >= 3
  const layer3: GateStatus =
    (stock_ok && short_ok) ? 'GO' :
    (input.stock_foreign_days <= -3 || input.stock_institution_weeks <= -2) ? 'STOP' : 'WARN'

  const verdict: GateVerdict =
    [layer1, layer2, layer3].some(l => l === 'STOP') ? 'BLOCK' : 'PASS'

  const matrix =
    layer2 === 'GO' && layer3 === 'GO' ? 'STRONG_BUY' :
    layer2 === 'GO' && layer3 !== 'GO' ? 'FIND_ALTERNATIVE' :
    layer2 !== 'GO' && layer3 === 'GO' ? 'HEADWIND_SHORT_ONLY' : 'NO_ENTRY'

  return { input, layer1, layer2, layer3, matrix, verdict }
}

// ── R:R 검증 ─────────────────────────────────────────────
export function checkRR(input: RRInput): RRResult {
  const { entry, stop, target } = input
  if (stop >= entry || target <= entry) {
    return { rr: 0, loss_pct: 0, gain_pct: 0, breakeven_winrate: 100, verdict: 'BLOCK' }
  }
  const risk   = entry - stop
  const reward = target - entry
  const rr     = reward / risk
  return {
    rr:                 Math.round(rr * 100) / 100,
    loss_pct:           Math.round((entry - stop) / entry * 1000) / 10,
    gain_pct:           Math.round((target - entry) / entry * 1000) / 10,
    breakeven_winrate:  Math.round(1 / (1 + rr) * 1000) / 10,
    verdict:            rr >= 2.0 ? 'PASS' : rr >= 1.5 ? 'CAUTION' : 'BLOCK',
  }
}

// ── 시간 손절 ────────────────────────────────────────────
const TRADING_DAYS: Record<StockType, number> = {
  high_beta: 10,
  value:     15,
  small_cap: 10,
}

function addTradingDays(date: Date, n: number): Date {
  const d = new Date(date)
  let added = 0
  while (added < n) {
    d.setDate(d.getDate() + 1)
    if (d.getDay() !== 0 && d.getDay() !== 6) added++
  }
  return d
}

function tradingDaysBetween(a: Date, b: Date): number {
  if (a > b) return -tradingDaysBetween(b, a)
  let count = 0
  const cur = new Date(a)
  while (cur < b) {
    cur.setDate(cur.getDate() + 1)
    if (cur.getDay() !== 0 && cur.getDay() !== 6) count++
  }
  return count
}

export function getTimeStop(entryDate: Date, stockType: StockType): TimeStopResult {
  const totalDays = TRADING_DAYS[stockType]
  const deadline  = addTradingDays(entryDate, totalDays)
  const today     = new Date()
  const elapsed   = Math.max(0, tradingDaysBetween(entryDate, today))
  const remaining = Math.max(0, totalDays - elapsed)

  const status: TimeStopResult['status'] =
    remaining > 5 ? 'HOLDING' : remaining > 0 ? 'PREPARE_EXIT' : 'TIME_STOP'

  const action =
    status === 'HOLDING'       ? `보유 유지 — ${remaining}거래일 남음` :
    status === 'PREPARE_EXIT'  ? `청산 준비 — ${remaining}거래일 남음` :
    '시간 손절 실행 — 익일 시초가 청산'

  return {
    entry_date: entryDate.toISOString().slice(0, 10),
    deadline:   deadline.toISOString().slice(0, 10),
    total_days: totalDays,
    elapsed,
    remaining,
    status,
    action,
  }
}

// ── 최종 판정 ────────────────────────────────────────────
export function getFinalVerdict(
  gateA: GateVerdict,
  gateB: GateVerdict,
  step1Pass: boolean,
  rr: RRResult,
  entry: number,
  stop: number,
  target: number,
  stockType: StockType = 'high_beta',
): SwingFinalResult {
  const today = new Date()
  const timeStop = getTimeStop(today, stockType)

  let verdict: FinalVerdict
  let summaryLine: string

  if (gateA === 'BLOCK') {
    verdict = 'BLOCK'
    summaryLine = '거시환경 진입 불가 — 전면 대기'
  } else if (gateB === 'BLOCK') {
    verdict = 'BLOCK'
    summaryLine = '수급 진입 불가 — 외국인·기관 동반 이탈 확인'
  } else if (!step1Pass) {
    verdict = 'BLOCK'
    summaryLine = '재무 체력 미달 — 스윙 진입 부적합'
  } else if (rr.verdict === 'BLOCK') {
    verdict = 'BLOCK'
    summaryLine = `R:R ${rr.rr} : 1 — 기준 2:1 미달`
  } else if (gateB === 'PASS') {
    verdict = 'PASS'
    const fmt = (n: number) => n.toLocaleString('ko-KR')
    summaryLine = `진입 ${fmt(entry)}원 / 손절 ${fmt(stop)}원 / 목표 ${fmt(target)}원 / R:R ${rr.rr}:1`
  } else {
    verdict = 'CONDITIONAL'
    summaryLine = 'Gate B 수급 재확인 후 진입 결정'
  }

  return {
    verdict,
    gate_a: gateA,
    gate_b: gateB,
    step1_pass: step1Pass,
    rr,
    time_stop: timeStop,
    summary_line: summaryLine,
  }
}
