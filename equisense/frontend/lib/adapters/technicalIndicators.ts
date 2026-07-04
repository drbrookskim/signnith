import type { TechnicalDataPoint } from '@/types'

// ── 기초 계산 ──────────────────────────────────

/** 단순 이동평균 (기간이 부족한 앞부분은 null 반환) */
export function calcSMA(closes: (number | null)[], period: number): (number | null)[] {
  return closes.map((_, i) => {
    if (i < period - 1) return null
    const slice = closes.slice(i - period + 1, i + 1)
    if (slice.some(v => v === null)) return null
    return (slice as number[]).reduce((a, b) => a + b, 0) / period
  })
}

/** 지수 이동평균 (기간이 부족한 앞부분은 null 반환) */
export function calcEMA(closes: (number | null)[], period: number): (number | null)[] {
  const k = 2 / (period + 1)
  const result: (number | null)[] = new Array(closes.length).fill(null)
  const smaResult = calcSMA(closes, period)
  let started = false
  let prev = 0

  for (let i = 0; i < closes.length; i++) {
    const v = closes[i]
    if (v === null) continue
    if (!started) {
      const seed = smaResult[i]
      if (seed === null) continue
      prev = seed
      result[i] = prev
      started = true
    } else {
      prev = v * k + prev * (1 - k)
      result[i] = prev
    }
  }
  return result
}

/** 볼린저 밴드 (MA20 ± 2σ) */
export function calcBollingerBands(
  closes: (number | null)[],
  period = 20,
  multiplier = 2,
): { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] } {
  const middle = calcSMA(closes, period)
  const upper: (number | null)[] = []
  const lower: (number | null)[] = []

  for (let i = 0; i < closes.length; i++) {
    const ma = middle[i]
    if (ma === null) {
      upper.push(null)
      lower.push(null)
      continue
    }
    const slice = closes.slice(i - period + 1, i + 1).filter(v => v !== null) as number[]
    const variance = slice.reduce((s, v) => s + (v - ma) ** 2, 0) / period
    const std = Math.sqrt(variance)
    upper.push(ma + multiplier * std)
    lower.push(ma - multiplier * std)
  }
  return { upper, middle, lower }
}

/** RSI (14일 기준) */
export function calcRSI(closes: (number | null)[], period = 14): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null)
  if (closes.length < period + 1) return result

  const gains: number[] = []
  const losses: number[] = []

  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1]
    const cur = closes[i]
    if (prev === null || cur === null) {
      gains.push(0)
      losses.push(0)
    } else {
      const diff = cur - prev
      gains.push(diff > 0 ? diff : 0)
      losses.push(diff < 0 ? -diff : 0)
    }
  }

  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period

  for (let i = period; i < closes.length; i++) {
    if (avgLoss === 0) {
      result[i] = 100
    } else {
      const rs = avgGain / avgLoss
      result[i] = 100 - 100 / (1 + rs)
    }
    if (i < closes.length - 1) {
      avgGain = (avgGain * (period - 1) + gains[i]) / period
      avgLoss = (avgLoss * (period - 1) + losses[i]) / period
    }
  }
  return result
}

/** MACD: { macd, signal, histogram } */
export function calcMACD(
  closes: (number | null)[],
  fast = 12,
  slow = 26,
  signal = 9,
): {
  macd: (number | null)[]
  signal: (number | null)[]
  histogram: (number | null)[]
} {
  const emaFast = calcEMA(closes, fast)
  const emaSlow = calcEMA(closes, slow)

  const macdLine: (number | null)[] = emaFast.map((f, i) => {
    const s = emaSlow[i]
    return f !== null && s !== null ? f - s : null
  })
  const signalLine = calcEMA(macdLine, signal)
  const histogram = macdLine.map((m, i) => {
    const s = signalLine[i]
    return m !== null && s !== null ? m - s : null
  })

  return { macd: macdLine, signal: signalLine, histogram }
}

// ── 시그널 계산 ─────────────────────────────────

export type SignalType = 'golden_cross' | 'dead_cross' | 'rsi_oversold' | 'rsi_overbought' | 'macd_bullish' | 'macd_bearish'

export interface Signal {
  index: number
  type: SignalType
  direction: 'buy' | 'sell'
  label: string
}

export function detectSignals(
  ma20: (number | null)[],
  ma50: (number | null)[],
  rsi: (number | null)[],
  macd: (number | null)[],
  signalLine: (number | null)[],
): Signal[] {
  const signals: Signal[] = []

  for (let i = 1; i < ma20.length; i++) {
    const m20Prev = ma20[i - 1], m20Cur = ma20[i]
    const m50Prev = ma50[i - 1], m50Cur = ma50[i]
    const rsiPrev = rsi[i - 1], rsiCur = rsi[i]
    const macdPrev = macd[i - 1], macdCur = macd[i]
    const sigPrev = signalLine[i - 1], sigCur = signalLine[i]

    if (m20Prev !== null && m50Prev !== null && m20Cur !== null && m50Cur !== null) {
      if (m20Prev <= m50Prev && m20Cur > m50Cur) {
        signals.push({ index: i, type: 'golden_cross', direction: 'buy', label: '골든X' })
      } else if (m20Prev >= m50Prev && m20Cur < m50Cur) {
        signals.push({ index: i, type: 'dead_cross', direction: 'sell', label: '데드X' })
      }
    }

    if (rsiPrev !== null && rsiCur !== null) {
      if (rsiPrev <= 30 && rsiCur > 30) {
        signals.push({ index: i, type: 'rsi_oversold', direction: 'buy', label: 'RSI↑' })
      } else if (rsiPrev < 70 && rsiCur >= 70) {
        signals.push({ index: i, type: 'rsi_overbought', direction: 'sell', label: 'RSI↓' })
      }
    }

    if (macdPrev !== null && sigPrev !== null && macdCur !== null && sigCur !== null) {
      if (macdPrev <= sigPrev && macdCur > sigCur) {
        signals.push({ index: i, type: 'macd_bullish', direction: 'buy', label: 'MACD↑' })
      } else if (macdPrev >= sigPrev && macdCur < sigCur) {
        signals.push({ index: i, type: 'macd_bearish', direction: 'sell', label: 'MACD↓' })
      }
    }
  }
  return signals
}

// ── 통합 계산 ──────────────────────────────────

export interface IndicatorRow {
  ma20: number | null
  ma50: number | null
  ma150: number | null
  ma200: number | null
  bbUpper: number | null
  bbLower: number | null
  rsi: number | null
  macd: number | null
  macdSignal: number | null
  macdHistogram: number | null
  buySignal: number | null
  sellSignal: number | null
  signalLabel: string | null
}

export function computeIndicators(dataPoints: TechnicalDataPoint[]): IndicatorRow[] {
  const closes = dataPoints.map(d => d.close)

  const ma20 = calcSMA(closes, 20)
  const ma50 = calcSMA(closes, 50)
  const ma150 = calcSMA(closes, 150)
  const ma200 = calcSMA(closes, 200)
  const bb = calcBollingerBands(closes)
  const rsi = calcRSI(closes)
  const { macd, signal: macdSignal, histogram } = calcMACD(closes)

  const signals = detectSignals(ma20, ma50, rsi, macd, macdSignal)
  const signalMap = new Map<number, Signal>()
  signals.forEach(s => signalMap.set(s.index, s))

  return dataPoints.map((dp, i) => {
    const sig = signalMap.get(i)
    return {
      ma20: ma20[i],
      ma50: ma50[i],
      ma150: ma150[i],
      ma200: ma200[i],
      bbUpper: bb.upper[i],
      bbLower: bb.lower[i],
      rsi: rsi[i],
      macd: macd[i],
      macdSignal: macdSignal[i],
      macdHistogram: histogram[i],
      buySignal: sig?.direction === 'buy' ? dp.close : null,
      sellSignal: sig?.direction === 'sell' ? dp.close : null,
      signalLabel: sig?.label ?? null,
    }
  })
}

export interface CurrentSignalSummary {
  maCross: { state: 'golden' | 'dead' | 'neutral'; label: string; detail: string }
  rsiState: { value: number | null; state: 'overbought' | 'oversold' | 'neutral'; label: string; detail: string }
  macdState: { state: 'bullish' | 'bearish' | 'neutral'; label: string; detail: string }
}

export function getCurrentSignalSummary(
  indicators: IndicatorRow[],
): CurrentSignalSummary {
  if (indicators.length === 0) {
    return {
      maCross: { state: 'neutral', label: '— 데이터 부족', detail: '계산 불가' },
      rsiState: { value: null, state: 'neutral', label: '— 데이터 부족', detail: '계산 불가' },
      macdState: { state: 'neutral', label: '— 데이터 부족', detail: '계산 불가' },
    }
  }
  const last = indicators[indicators.length - 1]

  let maCross: CurrentSignalSummary['maCross']
  if (last.ma20 !== null && last.ma50 !== null) {
    if (last.ma20 > last.ma50) {
      maCross = { state: 'golden', label: '▲ 골든크로스', detail: 'MA20 > MA50' }
    } else if (last.ma20 < last.ma50) {
      maCross = { state: 'dead', label: '▼ 데드크로스', detail: 'MA20 < MA50' }
    } else {
      maCross = { state: 'neutral', label: '— 중립', detail: 'MA20 ≈ MA50' }
    }
  } else {
    maCross = { state: 'neutral', label: '— 데이터 부족', detail: '계산 불가' }
  }

  const rsiVal = last.rsi
  let rsiState: CurrentSignalSummary['rsiState']
  if (rsiVal !== null) {
    if (rsiVal >= 70) {
      rsiState = { value: rsiVal, state: 'overbought', label: `▼ 과매수 (${rsiVal.toFixed(1)})`, detail: 'RSI ≥ 70' }
    } else if (rsiVal <= 30) {
      rsiState = { value: rsiVal, state: 'oversold', label: `▲ 과매도 (${rsiVal.toFixed(1)})`, detail: 'RSI ≤ 30' }
    } else {
      rsiState = { value: rsiVal, state: 'neutral', label: `— 중립 (${rsiVal.toFixed(1)})`, detail: '30~70 범위' }
    }
  } else {
    rsiState = { value: null, state: 'neutral', label: '— 데이터 부족', detail: '계산 불가' }
  }

  let macdState: CurrentSignalSummary['macdState']
  if (last.macd !== null && last.macdSignal !== null) {
    if (last.macd > last.macdSignal) {
      macdState = { state: 'bullish', label: '▲ 골든크로스', detail: 'MACD > Signal' }
    } else if (last.macd < last.macdSignal) {
      macdState = { state: 'bearish', label: '▼ 데드크로스', detail: 'MACD < Signal' }
    } else {
      macdState = { state: 'neutral', label: '— 중립', detail: 'MACD ≈ Signal' }
    }
  } else {
    macdState = { state: 'neutral', label: '— 데이터 부족', detail: '계산 불가' }
  }

  return { maCross, rsiState, macdState }
}
