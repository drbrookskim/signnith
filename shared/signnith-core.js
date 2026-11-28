/**
 * Signnith Quantitative Signal Core (UMD)
 * Pure, DOM-free quantitative analysis & orchestrator feedback-fusion engine.
 * Shared across Signnith PWA, Cloudflare Workers, and Node.js verification.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SignnithCore = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function computeWACC(fundInfo, isKr) {
    const rfRate   = isKr ? 0.035 : 0.043;
    const erp      = isKr ? 0.065 : 0.055;

    const SECTOR_ADJ = {
      'Technology':             { erpAdj: 0.010, sizeAdj: 0.005, label: 'IT/기술' },
      'Healthcare':             { erpAdj: 0.008, sizeAdj: 0.005, label: '헬스케어' },
      'Financial Services':     { erpAdj: 0.000, sizeAdj: 0.000, label: '금융' },
      'Consumer Cyclical':      { erpAdj: 0.005, sizeAdj: 0.005, label: '경기소비재' },
      'Consumer Defensive':     { erpAdj: -0.005,sizeAdj: 0.000, label: '필수소비재' },
      'Industrials':            { erpAdj: 0.003, sizeAdj: 0.005, label: '산업재' },
      'Energy':                 { erpAdj: 0.010, sizeAdj: 0.005, label: '에너지' },
      'Utilities':              { erpAdj: -0.010,sizeAdj: 0.000, label: '유틸리티' },
      'Real Estate':            { erpAdj: -0.005,sizeAdj: 0.003, label: '부동산' },
      'Basic Materials':        { erpAdj: 0.008, sizeAdj: 0.005, label: '소재' },
      'Communication Services': { erpAdj: 0.005, sizeAdj: 0.003, label: '통신서비스' },
    };
    const info      = fundInfo || {};
    const sector    = info.sector || '-';
    const adj       = SECTOR_ADJ[sector] || { erpAdj: 0.005, sizeAdj: 0.003, label: sector };
    const adjErp    = erp + adj.erpAdj;

    const beta = (info.beta != null && info.beta > 0) ? info.beta : 1.0;
    const betaAdj = isKr && info.beta == null ? 1.1 : beta;
    const re = rfRate + betaAdj * adjErp + adj.sizeAdj;

    const E  = info.marketCap  || 0;
    const D  = info.totalDebt  || 0;
    const V  = E + D;
    const eRatio  = V > 0 ? E / V : 1;
    const deRatio = V > 0 ? D / V : 0;

    const ebitda   = info.ebitda || 0;
    const interestCoverage = ebitda > 0 && D > 0 ? ebitda / (D * 0.05) : null;
    let rd = 0.05;
    if (interestCoverage != null) {
      if (interestCoverage > 8)  rd = 0.030;
      else if (interestCoverage > 4) rd = 0.040;
      else if (interestCoverage > 2) rd = 0.055;
      else rd = 0.075;
    }
    rd = isKr ? rd + 0.005 : rd;

    const tc = info.taxRate != null ? Math.min(Math.max(info.taxRate, 0), 0.45)
             : (isKr ? 0.22 : 0.21);
    const wacc = eRatio * re + deRatio * rd * (1 - tc);

    return {
      wacc, re, rd, tc,
      beta: betaAdj, rfRate, adjErp,
      eRatio, deRatio,
      sectorLabel: adj.label,
      erpAdj: adj.erpAdj,
      sizeAdj: adj.sizeAdj,
      interestCoverage,
    };
  }

  function calcEMA(arr, span) {
    const k = 2 / (span + 1);
    const out = new Array(arr.length).fill(null);
    let start = arr.findIndex(v => v != null);
    if (start < 0 || start + span > arr.length) return out;
    let val = arr.slice(start, start + span).reduce((a, b) => a + b, 0) / span;
    out[start + span - 1] = val;
    for (let i = start + span; i < arr.length; i++) {
      if (arr[i] != null) { val = arr[i] * k + val * (1 - k); out[i] = val; }
    }
    return out;
  }

  function computeIndicators(bars) {
    const n = bars.length;
    const C = bars.map(b => b.close), H = bars.map(b => b.high), L = bars.map(b => b.low), V = bars.map(b => b.volume);

    const ema12 = calcEMA(C, 12), ema26 = calcEMA(C, 26);
    const macdLine = C.map((_, i) => (ema12[i] != null && ema26[i] != null) ? ema12[i] - ema26[i] : null);
    const macdOnlyValid = macdLine.filter(v => v != null);
    const sigShort = calcEMA(macdOnlyValid, 9);
    let si = 0;
    const sigLine = macdLine.map(v => v != null ? (sigShort[si++] ?? null) : null);
    const hist = macdLine.map((v, i) => (v != null && sigLine[i] != null) ? v - sigLine[i] : null);

    const rsi = new Array(n).fill(null);
    if (n > 14) {
      let ag = 0, al = 0;
      for (let i = 1; i <= 14; i++) { const d = C[i] - C[i - 1]; d > 0 ? ag += d : al -= d; }
      ag /= 14; al /= 14;
      rsi[14] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
      for (let i = 15; i < n; i++) {
        const d = C[i] - C[i - 1], g = Math.max(d, 0), l = Math.max(-d, 0);
        ag = (ag * 13 + g) / 14; al = (al * 13 + l) / 14;
        rsi[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
      }
    }

    const stochK = new Array(n).fill(null), stochD = new Array(n).fill(null);
    for (let i = 13; i < n; i++) {
      const lo = Math.min(...L.slice(i - 13, i + 1)), hi = Math.max(...H.slice(i - 13, i + 1));
      stochK[i] = hi === lo ? 50 : 100 * (C[i] - lo) / (hi - lo);
    }
    for (let i = 15; i < n; i++) {
      if (stochK[i] != null && stochK[i - 1] != null && stochK[i - 2] != null)
        stochD[i] = (stochK[i] + stochK[i - 1] + stochK[i - 2]) / 3;
    }

    const sma5 = new Array(n).fill(null), sma50 = new Array(n).fill(null);
    for (let i = 4; i < n; i++) sma5[i] = C.slice(i - 4, i + 1).reduce((a, b) => a + b, 0) / 5;
    for (let i = 49; i < n; i++) sma50[i] = C.slice(i - 49, i + 1).reduce((a, b) => a + b, 0) / 50;

    const sma20 = new Array(n).fill(null), bbU = new Array(n).fill(null), bbL = new Array(n).fill(null), bbPct = new Array(n).fill(null);
    for (let i = 19; i < n; i++) {
      const sl = C.slice(i - 19, i + 1), m = sl.reduce((a, b) => a + b, 0) / 20;
      const std = Math.sqrt(sl.reduce((a, b) => a + (b - m) ** 2, 0) / 20);
      sma20[i] = m; bbU[i] = m + 2 * std; bbL[i] = m - 2 * std;
      bbPct[i] = (bbU[i] - bbL[i]) > 0 ? (C[i] - bbL[i]) / (bbU[i] - bbL[i]) : 0.5;
    }

    const atr = new Array(n).fill(null), tr = new Array(n).fill(null);
    for (let i = 1; i < n; i++) tr[i] = Math.max(H[i] - L[i], Math.abs(H[i] - C[i - 1]), Math.abs(L[i] - C[i - 1]));
    if (n > 14) {
      let a = tr.slice(1, 15).reduce((s, v) => s + v, 0) / 14; atr[14] = a;
      for (let i = 15; i < n; i++) { a = (a * 13 + tr[i]) / 14; atr[i] = a; }
    }

    const volRatio = new Array(n).fill(null);
    for (let i = 19; i < n; i++) {
      const avg = V.slice(i - 19, i + 1).reduce((a, b) => a + (b || 0), 0) / 20;
      volRatio[i] = avg > 0 ? (V[i] || 0) / avg : 1;
    }

    const obv = new Array(n).fill(null);
    obv[0] = V[0] || 0;
    for (let i = 1; i < n; i++) {
      if (C[i] == null || V[i] == null) { obv[i] = obv[i - 1]; continue; }
      obv[i] = obv[i - 1] + (C[i] > C[i - 1] ? V[i] : C[i] < C[i - 1] ? -V[i] : 0);
    }

    const stochSlowK = new Array(n).fill(null);
    const stochSlowD = new Array(n).fill(null);
    for (let i = 2; i < n; i++) {
      if (stochK[i] != null && stochK[i - 1] != null && stochK[i - 2] != null) {
        stochSlowK[i] = (stochK[i] + stochK[i - 1] + stochK[i - 2]) / 3;
      }
    }
    for (let i = 2; i < n; i++) {
      if (stochSlowK[i] != null && stochSlowK[i - 1] != null && stochSlowK[i - 2] != null) {
        stochSlowD[i] = (stochSlowK[i] + stochSlowK[i - 1] + stochSlowK[i - 2]) / 3;
      }
    }

    return { C, H, L, V, macdLine, sigLine, hist, rsi, stochK, stochD, stochSlowK, stochSlowD, sma5, sma20, sma50, bbU, bbL, bbPct, atr, volRatio, obv };
  }

  function computeCandlestick(bars) {
    const n = bars.length;
    if (n < 3) return { cs_signal: 0, cs_score: 0, patterns: [] };
    const O = bars.map(b => b.open), H = bars.map(b => b.high), L = bars.map(b => b.low), C = bars.map(b => b.close);
    const body_pct = 0.1, shadow_ratio = 2.0;
    const detectedPatterns = [];

    const i = n - 1;
    function body(j)  { return Math.abs(C[j] - O[j]); }
    function rng(j)   { return H[j] - L[j] || 1e-9; }
    function upper(j) { return H[j] - Math.max(O[j], C[j]); }
    function lower(j) { return Math.min(O[j], C[j]) - L[j]; }
    function isBull(j){ return C[j] > O[j]; }

    let bullScore = 0, bearScore = 0;

    if (body(i) / rng(i) < body_pct) { detectedPatterns.push('Doji'); }
    if (lower(i) > body(i) * shadow_ratio && upper(i) < body(i) * 0.3 && isBull(i)) { detectedPatterns.push('Hammer'); bullScore++; }
    if (upper(i) > body(i) * shadow_ratio && lower(i) < body(i) * 0.3 && isBull(i)) { detectedPatterns.push('InvertedHammer'); bullScore++; }
    if (upper(i) > body(i) * shadow_ratio && lower(i) < body(i) * 0.3 && !isBull(i)) { detectedPatterns.push('ShootingStar'); bearScore++; }

    if (i >= 1) {
      const prevBull = isBull(i - 1);
      if (!prevBull && isBull(i) && O[i] < C[i - 1] && C[i] > O[i - 1]) { detectedPatterns.push('BullishEngulfing'); bullScore += 2; }
      if (prevBull && !isBull(i) && O[i] > C[i - 1] && C[i] < O[i - 1]) { detectedPatterns.push('BearishEngulfing'); bearScore += 2; }
      if (!prevBull && isBull(i) && O[i] > C[i - 1] && C[i] < O[i - 1]) { detectedPatterns.push('BullishHarami'); bullScore++; }
      if (prevBull && !isBull(i) && O[i] < C[i - 1] && C[i] > O[i - 1]) { detectedPatterns.push('BearishHarami'); bearScore++; }
      if (!prevBull && isBull(i) && O[i] < L[i - 1] && C[i] > (O[i - 1] + C[i - 1]) / 2) { detectedPatterns.push('PiercingLine'); bullScore += 2; }
      if (prevBull && !isBull(i) && O[i] > H[i - 1] && C[i] < (O[i - 1] + C[i - 1]) / 2) { detectedPatterns.push('DarkCloudCover'); bearScore += 2; }
    }

    if (i >= 2) {
      const ppBull = isBull(i - 2);
      const pDoji = body(i - 1) / rng(i - 1) < body_pct;
      if (ppBull && pDoji && isBull(i) && C[i] > (O[i - 2] + C[i - 2]) / 2) { detectedPatterns.push('MorningStar'); bullScore += 2; }
      if (!ppBull && pDoji && !isBull(i) && C[i] < (O[i - 2] + C[i - 2]) / 2) { detectedPatterns.push('EveningStar'); bearScore += 2; }
      if (isBull(i) && isBull(i - 1) && isBull(i - 2) && C[i] > C[i - 1] && C[i - 1] > C[i - 2]) { detectedPatterns.push('ThreeWhiteSoldiers'); bullScore += 2; }
      if (!isBull(i) && !isBull(i - 1) && !isBull(i - 2) && C[i] < C[i - 1] && C[i - 1] < C[i - 2]) { detectedPatterns.push('ThreeBlackCrows'); bearScore += 2; }
    }

    const cs_score = bullScore - bearScore;
    const cs_signal = cs_score > 0 ? 1 : cs_score < 0 ? -1 : 0;
    return { cs_signal, cs_score, patterns: detectedPatterns };
  }

  function computeElliottWave(bars) {
    const closes = bars.map(b => b.close);
    const n = closes.length;
    const sw = Math.max(5, Math.floor(n / 20));

    const highs = [], lows = [];
    for (let i = sw; i < n - sw; i++) {
      const w = closes.slice(i - sw, i + sw + 1);
      if (closes[i] === Math.max(...w)) highs.push({ idx: i, val: closes[i] });
      if (closes[i] === Math.min(...w)) lows.push({ idx: i, val: closes[i] });
    }

    const swings = [...highs.map(h => ({ ...h, type: 'H' })), ...lows.map(l => ({ ...l, type: 'L' }))]
      .sort((a, b) => a.idx - b.idx).slice(-10);

    const pivotHigh = Math.max(...closes.slice(-sw * 2));
    const pivotLow  = Math.min(...closes.slice(-sw * 2));
    const diff = pivotHigh - pivotLow;
    const FIB = [0.236, 0.382, 0.5, 0.618, 0.786, 1.0, 1.272, 1.618, 2.618];
    const fibLevels = {};
    FIB.forEach(r => { fibLevels[`fib_${r}`] = Math.round(pivotHigh - diff * r); });

    let ew_signal = 0, wave_label = '분석 불충분';
    const entry_zone = {};

    if (swings.length >= 5) {
      const pts = swings.slice(-5).map(s => s.val);
      const w1 = pts[1] - pts[0], w3 = pts[3] - pts[2];
      const w2r = w1 !== 0 ? (pts[1] - pts[2]) / (pts[1] - pts[0]) : 0;
      const w4r = w3 !== 0 ? (pts[3] - pts[4]) / (pts[3] - pts[2]) : 0;
      const impulseUp = pts[1] > pts[0] && pts[3] > pts[2] && pts[4] < pts[3]
        && w2r >= 0.382 && w2r <= 0.786 && w4r >= 0.236 && w4r <= 0.5;
      if (impulseUp) {
        wave_label = '5파 완성 → 조정 예상';
        ew_signal = -1;
        ['fib_0.382', 'fib_0.5', 'fib_0.618'].forEach(k => { if (fibLevels[k]) entry_zone[k] = fibLevels[k]; });
      } else if (w2r >= 0.382) {
        wave_label = 'ABC 조정 완료 → 매수 구간';
        ew_signal = 1;
        ['fib_0.5', 'fib_0.618'].forEach(k => { if (fibLevels[k]) entry_zone[k] = fibLevels[k]; });
      } else {
        wave_label = '파동 진행 중';
      }
    }

    return { ew_signal, wave_label, entry_zone, fib_levels: fibLevels, pivot_high: pivotHigh, pivot_low: pivotLow };
  }

  function computeIchimoku(bars) {
    const n = bars.length;
    const C = bars.map(b => b.close);
    const midN = (len) => {
      if (n < len) return null;
      const sl = bars.slice(n - len);
      return (Math.max(...sl.map(b => b.high)) + Math.min(...sl.map(b => b.low))) / 2;
    };
    const tk = midN(9), kj = midN(26), skb = midN(52);
    const ska = (tk != null && kj != null) ? (tk + kj) / 2 : null;
    const lastClose = C[n - 1];
    const prevTk = n > 1 ? (() => { const sl = bars.slice(Math.max(0, n - 10), n - 1); return (Math.max(...sl.map(b => b.high)) + Math.min(...sl.map(b => b.low))) / 2; })() : null;
    const prevKj = n > 1 ? (() => { const sl = bars.slice(Math.max(0, n - 27), n - 1); return (Math.max(...sl.map(b => b.high)) + Math.min(...sl.map(b => b.low))) / 2; })() : null;

    const aboveCloud = ska != null && skb != null && lastClose > ska && lastClose > skb;
    const belowCloud = ska != null && skb != null && lastClose < ska && lastClose < skb;
    const tkCrossUp = tk != null && kj != null && prevTk != null && prevKj != null && tk > kj && prevTk <= prevKj;
    const tkCrossDn = tk != null && kj != null && prevTk != null && prevKj != null && tk < kj && prevTk >= prevKj;

    let ichi_signal = 0;
    if (aboveCloud && tkCrossUp) ichi_signal = 1;
    else if (!aboveCloud && tkCrossDn) ichi_signal = -1;
    else if (aboveCloud) ichi_signal = 0.5;
    else if (belowCloud) ichi_signal = -0.5;

    return { ichi_signal: Math.round(ichi_signal), tenkan: tk, kijun: kj, senkou_a: ska, senkou_b: skb, aboveCloud, belowCloud };
  }

  function computeSMC(bars) {
    const n = bars.length;
    if (n < 20) return { smc_signal: 0, bos: null, fvg: null, ob: null };
    const H = bars.map(b => b.high), L = bars.map(b => b.low), C = bars.map(b => b.close), O = bars.map(b => b.open);
    const sw = 10;
    const i = n - 1;

    const prevHiWindow = H.slice(Math.max(0, i - sw), i);
    const prevLoWindow = L.slice(Math.max(0, i - sw), i);
    const prevHi = Math.max(...prevHiWindow), prevLo = Math.min(...prevLoWindow);
    const bos_bull = C[i] > prevHi && C[i - 1] <= prevHi;
    const bos_bear = C[i] < prevLo && C[i - 1] >= prevLo;

    const fvg_bull = i >= 2 && L[i] > H[i - 2];
    const fvg_bear = i >= 2 && H[i] < L[i - 2];

    const bearish = idx => C[idx] < O[idx];
    const ob_demand = i >= 2 && bearish(i - 1) && C[i] > H[i - 1];
    const ob_supply = i >= 2 && !bearish(i - 1) && C[i] < L[i - 1];

    let smc_signal = 0;
    if (bos_bull || fvg_bull || ob_demand) smc_signal = 1;
    if (bos_bear || fvg_bear || ob_supply) smc_signal = -1;

    const bos  = bos_bull ? '강세 BOS' : bos_bear ? '약세 BOS' : null;
    const fvg  = fvg_bull ? '상승 FVG' : fvg_bear ? '하락 FVG' : null;
    const ob   = ob_demand ? '수요 OB' : ob_supply ? '공급 OB' : null;

    return { smc_signal, bos, fvg, ob };
  }

  function computeMultiTimeframe(bars) {
    const C = bars.map(b => b.close);
    const n = C.length;
    const sma = (w) => n >= w ? C.slice(n - w).reduce((a, b) => a + b, 0) / w : null;
    const tfs = [
      { tf: '단기 · 1주',   maLabel: 'MA5',   w: 5 },
      { tf: '중기 · 1개월', maLabel: 'MA20',  w: 21 },
      { tf: '분기 · 3개월', maLabel: 'MA60',  w: 63 },
      { tf: '장기 · 6개월', maLabel: 'MA120', w: 126 },
    ];
    const rows = []; let sum = 0, cnt = 0, bull = 0, bear = 0, neut = 0;
    for (const t of tfs) {
      if (n <= t.w) { rows.push({ ...t, na: true }); continue; }
      const past = C[n - 1 - t.w];
      const ret  = past ? (C[n - 1] - past) / past : 0;
      const ma   = sma(t.w);
      const aboveMA = ma != null ? (C[n - 1] >= ma ? 1 : -1) : 0;
      const score = (Math.tanh(ret * 8) + aboveMA) / 2;
      const sig   = score > 0.33 ? 'bull' : score < -0.33 ? 'bear' : 'neutral';
      if (sig === 'bull') bull++; else if (sig === 'bear') bear++; else neut++;
      sum += score; cnt++;
      rows.push({ ...t, ret: ret * 100, aboveMA, score, sig });
    }
    const avg = cnt ? sum / cnt : 0;
    let verdict, vlabel;
    if (cnt >= 2 && bull === cnt)      { verdict = 'bull';    vlabel = '정배열 · 전 구간 상승'; }
    else if (cnt >= 2 && bear === cnt) { verdict = 'bear';    vlabel = '역배열 · 전 구간 하락'; }
    else if (avg > 0.2)                { verdict = 'bull';    vlabel = '상승 우위'; }
    else if (avg < -0.2)               { verdict = 'bear';    vlabel = '하락 우위'; }
    else                               { verdict = 'neutral'; vlabel = '혼조 · 방향성 불명확'; }
    return { rows, avg, bull, bear, neut, cnt, verdict, vlabel };
  }

  function computeQuantFactors(bars, ind) {
    const n = bars.length;
    const C = bars.map(b => b.close);

    const mom1m  = n > 21  ? (C[n - 1] - C[n - 22]) / C[n - 22] : null;
    const mom3m  = n > 63  ? (C[n - 1] - C[n - 64]) / C[n - 64] : null;
    const mom6m  = n > 126 ? (C[n - 1] - C[n - 127]) / C[n - 127] : null;

    const ma20  = ind.sma20[n - 1];
    const ma60  = n >= 60 ? C.slice(n - 60).reduce((a, b) => a + b, 0) / 60 : null;
    const above_ma20 = ma20 != null ? (C[n - 1] > ma20 ? 1 : -1) : 0;
    const above_ma60 = ma60 != null ? (C[n - 1] > ma60 ? 1 : -1) : 0;

    let vol20 = null;
    if (n >= 21) {
      const rets = C.slice(n - 21).map((v, i, a) => i > 0 ? (v - a[i - 1]) / a[i - 1] : null).filter(v => v != null);
      const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
      vol20 = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length) * Math.sqrt(252);
    }

    const rsiV = last(ind.rsi), macdH = last(ind.hist), bbP = last(ind.bbPct);

    const momZ   = mom1m != null ? Math.tanh(mom1m * 5) : 0;
    const mom3Z  = mom3m != null ? Math.tanh(mom3m * 3) : 0;
    const mom6Z  = mom6m != null ? Math.tanh(mom6m * 2) : 0;
    const trendZ = (above_ma20 + above_ma60) / 2;
    const rsiZ   = rsiV != null ? (rsiV < 30 ? 0.8 : rsiV > 70 ? -0.8 : (50 - rsiV) / 50 * 0.4) : 0;
    const macdZ  = macdH != null ? Math.tanh(macdH / (last(ind.atr) || 1) * 3) : 0;
    const bbZ    = bbP != null ? (1 - 2 * bbP) * 0.5 : 0;
    const volZ   = vol20 != null ? -Math.tanh(vol20 * 2) * 0.5 : 0;

    const factor_score = (momZ * 0.2 + mom3Z * 0.15 + mom6Z * 0.1 + trendZ * 0.15 + rsiZ * 0.1 + macdZ * 0.15 + bbZ * 0.1 + volZ * 0.05);
    const quant_signal = factor_score > 0.3 ? 1 : factor_score < -0.3 ? -1 : 0;

    return {
      quant_signal, factor_score,
      mom1m: mom1m != null ? mom1m * 100 : null,
      mom3m: mom3m != null ? mom3m * 100 : null,
      mom6m: mom6m != null ? mom6m * 100 : null,
      vol20: vol20 != null ? vol20 * 100 : null,
      above_ma20, above_ma60,
    };
  }

  function computeIPP(bars, ind) {
    const n = bars.length;
    if (n < 30) return { ipp_score: 0, direction: 'NEUTRAL', eta_days: 7, confidence: 0, signals: [] };
    const C = bars.map(b => b.close), H = bars.map(b => b.high), L = bars.map(b => b.low), V = bars.map(b => b.volume || 0);
    const li = n - 1;
    const signals = [];
    let rule_score = 0;

    const rsi = last(ind.rsi);
    if (rsi != null && rsi < 30) { rule_score += 20; signals.push('🔴 RSI 과매도 (' + rsi.toFixed(1) + ')'); }
    if (rsi != null && rsi > 70) { rule_score -= 20; signals.push('🔵 RSI 과매수 (' + rsi.toFixed(1) + ')'); }

    let consec_down = 0;
    for (let i = li; i >= Math.max(1, li - 5); i--) { if (C[i] < C[i - 1]) consec_down++; else break; }
    const body = Math.abs(C[li] - bars[li].open);
    const lower_shadow = Math.min(C[li], bars[li].open) - L[li];
    if (consec_down >= 4 && lower_shadow > body * 1.5) { rule_score += 25; signals.push('🔨 ' + consec_down + '일 연속하락 + 긴 아래꼬리'); }

    let consec_up = 0;
    for (let i = li; i >= Math.max(1, li - 5); i--) { if (C[i] > C[i - 1]) consec_up++; else break; }
    const upper_shadow = H[li] - Math.max(C[li], bars[li].open);
    if (consec_up >= 4 && upper_shadow > body * 1.5) { rule_score -= 25; signals.push('⚡ ' + consec_up + '일 연속상승 + 긴 윗꼬리'); }

    let obv = 0; const obvArr = [];
    for (let i = 0; i < n; i++) { obv += (i === 0 ? 0 : C[i] > C[i - 1] ? V[i] : C[i] < C[i - 1] ? -V[i] : 0); obvArr.push(obv); }
    const obvSlope = n >= 10 ? obvArr[li] - obvArr[li - 10] : 0;
    const priceSlope = n >= 10 ? C[li] - C[li - 10] : 0;
    if (obvSlope > 0 && priceSlope < 0) { rule_score += 20; signals.push('📈 OBV↑ + 주가↓ (강세 다이버전스)'); }
    if (obvSlope < 0 && priceSlope > 0) { rule_score -= 20; signals.push('📉 OBV↓ + 주가↑ (약세 다이버전스)'); }

    if (n >= 21) {
      const vol20avg = V.slice(li - 19, li + 1).reduce((a, b) => a + b, 0) / 20;
      const vol5avg  = V.slice(li - 4,  li + 1).reduce((a, b) => a + b, 0) / 5;
      const volRatio = vol20avg > 0 ? vol5avg / vol20avg : 1;
      if (volRatio < 0.5) { rule_score += 10; signals.push('📊 거래량 바닥 수렴 (' + volRatio.toFixed(2) + 'x)'); }
      if (volRatio > 2.0 && n >= 10 && Math.abs(priceSlope) / (C[li - 10] || 1) < 0.01) { rule_score -= 15; signals.push('💥 거래량 급증 + 가격 미반응'); }
    }

    const bbUv = last(ind.bbU), bbLv = last(ind.bbL), sma20v = last(ind.sma20);
    const bbW = (bbUv != null && bbLv != null && sma20v != null && sma20v > 0) ? (bbUv - bbLv) / sma20v : null;
    if (bbW != null && bbW < 0.05) { rule_score += 12; signals.push('🎯 BB 수축 (에너지 축적)'); }

    const atr = last(ind.atr);
    const atrMA = n >= 30 ? ind.atr.slice(li - 29, li + 1).filter(v => v != null).reduce((a, b) => a + b, 0) / 30 : null;
    if (atr != null && atrMA != null && atr < atrMA * 0.7) { rule_score += 10; signals.push('🔇 ATR 수축 (<0.7배, 변동성 소진)'); }

    const ipp_score = Math.max(-100, Math.min(100, rule_score));
    const direction = ipp_score >= 20 ? 'BULLISH_REVERSAL' : ipp_score <= -20 ? 'BEARISH_REVERSAL' : 'NEUTRAL';
    const confidence = Math.min(100, Math.round(Math.abs(ipp_score)));
    const eta_days = Math.abs(ipp_score) >= 40 ? 3 : Math.abs(ipp_score) >= 20 ? 5 : 7;
    return { ipp_score, direction, eta_days, confidence, signals };
  }

  const MASTER_WEIGHTS = { cs: 1.5, ew: 2.0, ichi: 1.5, smc: 1.5, quant: 2.0, wacc: 1.5, ipp: 2.0 };

  function computeWACCSignal(waccResult, fundMetrics) {
    const wacc = waccResult?.wacc ?? null;
    const roe  = (fundMetrics?.roe ?? null);
    if (wacc == null || roe == null) return 0;
    const roeDecimal = roe > 1 ? roe / 100 : roe;
    if (roeDecimal > wacc * 1.2) return  1;
    if (roeDecimal < wacc * 0.8) return -1;
    return 0;
  }

  function fuseAdvancedSignals(cs, ew, ichi, smc, quant, waccResult, fundMetrics, ipp) {
    const waccSig = computeWACCSignal(waccResult, fundMetrics);
    const ippSig = ipp?.ipp_score >= 20 ? 1 : ipp?.ipp_score <= -20 ? -1 : 0;
    const signals = {
      cs:    cs.cs_signal,
      ew:    ew.ew_signal,
      ichi:  ichi.ichi_signal,
      smc:   smc.smc_signal,
      quant: quant.quant_signal,
      wacc:  waccSig,
      ipp:   ippSig,
    };
    let wsum = 0, wtotal = 0;
    const details = {};
    for (const [key, w] of Object.entries(MASTER_WEIGHTS)) {
      const val = signals[key] || 0;
      wsum += val * w;
      wtotal += w;
      details[key] = { score: val, weight: w, label: val > 0 ? '▲ 매수' : val < 0 ? '▼ 매도' : '— 관망' };
    }
    const composite = wtotal > 0 ? wsum / wtotal : 0;
    return { composite, details, waccSignal: waccSig };
  }

  function last(arr) {
    for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return arr[i];
    return null;
  }

  function scoreToSignal(s) {
    if (s >  0.6) return 'STRONG_BUY';
    if (s >  0.2) return 'BUY';
    if (s < -0.6) return 'STRONG_SELL';
    if (s < -0.2) return 'SELL';
    return 'NEUTRAL';
  }

  function norm(v, lo, mid, hi) {
    if (v <= lo) return -1; if (v >= hi) return 1;
    return v < mid ? (v - lo) / (mid - lo) - 1 : (v - mid) / (hi - mid);
  }
  const normInv = (v, lo, mid, hi) => -norm(v, lo, mid, hi);

  function scoreTechnical(ind) {
    const mh  = last(ind.hist),    atrV = last(ind.atr);
    const rsiV = last(ind.rsi),    bbP  = last(ind.bbPct);
    const k    = last(ind.stochK), d    = last(ind.stochD);
    const vr   = last(ind.volRatio);
    const C    = ind.C;
    const lastDiff = C[C.length - 1] - C[C.length - 2];

    const clip = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const macdScore = Math.tanh(mh / (atrV + 1e-9));
    let rsiScore = rsiV < 30 ? (30 - rsiV) / 30 : rsiV > 70 ? (70 - rsiV) / 30 : (50 - rsiV) / 50 * 0.3;
    rsiScore = clip(rsiScore, -1, 1);
    const bbScore   = clip(1 - 2 * bbP, -1, 1);
    const stochScore = k < 20 && k > d ? 0.8 : k > 80 && k < d ? -0.8 : (50 - k) / 50 * 0.3;
    const volScore  = Math.tanh(vr - 1) * Math.sign(lastDiff);

    const score = macdScore * 0.25 + rsiScore * 0.20 + bbScore * 0.20 + stochScore * 0.15 + volScore * 0.20;
    const signal = scoreToSignal(score);
    const conf   = Math.min(Math.abs(score) * 1.5, 1.0);

    return {
      signal, score, confidence: conf, atr: atrV,
      indicators: {
        rsi: rsiV, macd: last(ind.macdLine), macdHist: mh,
        stochK: k, stochD: d, bbPct: bbP,
        bbUpper: last(ind.bbU), bbLower: last(ind.bbL), atr: atrV, volRatio: vr,
        obv: last(ind.obv),
        stochSlowK: last(ind.stochSlowK),
        stochSlowD: last(ind.stochSlowD),
      }
    };
  }

  function scoreFundamental(info, price) {
    const pct2num = v => (v != null && !isNaN(v)) ? (Math.abs(v) < 2 ? v * 100 : v) : null;
    const g = (k, def) => { const v = info ? info[k] : null; return (v != null && !isNaN(v)) ? v : def; };

    const per       = g('trailingPE',    25);
    const pbr       = g('priceToBook',    2);
    const roe       = pct2num(g('returnOnEquity', 0.10)) ?? 10;
    const netMargin = pct2num(g('profitMargins',  0.05)) ?? 5;
    const revGrowth = pct2num(g('revenueGrowth',  0.05)) ?? 5;
    const earnGrowth= pct2num(g('earningsGrowth', 0.05)) ?? 5;
    const debtEq    = g('debtToEquity',   100);
    const currRatio = g('currentRatio',   1.5);
    const divYield  = pct2num(g('dividendYield',   0))   ?? 0;

    const val    = (normInv(per, 10, 20, 35) + normInv(pbr, 0.8, 2.0, 4.0)) / 2;
    const prof   = (norm(roe, 5, 15, 25)     + norm(netMargin, 2, 10, 20))  / 2;
    const growth = (norm(revGrowth, 0, 10, 30)+ norm(earnGrowth, 0, 15, 40))/ 2;
    const health = (normInv(debtEq, 50, 100, 200) + norm(currRatio, 1.0, 1.5, 3.0)) / 2;

    const score = val * 0.30 + prof * 0.25 + growth * 0.25 + health * 0.20;
    const intrinsic = price * (score * 0.3 + 1.0);

    return {
      signal: scoreToSignal(score), score,
      confidence: Math.min(Math.abs(score) * 1.2, 1.0),
      intrinsic,
      metrics: { per, pbr, roe, netMargin, revGrowth, earnGrowth, debtEq, currRatio, divYield }
    };
  }

  function makeDecision(tech, fund, style, price, advanced) {
    const W = { short_term: [0.75, 0.25], balanced: [0.60, 0.40], long_term: [0.35, 0.65] };
    const [tw, fw] = W[style] || W.balanced;

    const baseCombined = tech.score * tw + fund.score * fw;
    const advW = 0.40;
    const adv = advanced || { composite: 0 };
    const combined = baseCombined * (1 - advW) + adv.composite * advW;

    let conf = tech.confidence * tw + fund.confidence * fw;
    const reasoning = [];
    const sameDir = (tech.score > 0 && fund.score > 0) || (tech.score < 0 && fund.score < 0);
    if (sameDir) { conf = Math.min(conf * 1.2, 1.0); reasoning.push('기술/기본 신호 방향 일치 → 신뢰도 상승'); }
    else         { conf *= 0.8;                        reasoning.push('기술/기본 신호 방향 불일치 → 신뢰도 하락'); }

    if (adv.composite > 0.3 && combined > 0)  { conf = Math.min(conf * 1.1, 1.0); reasoning.push(`고급 분석 복합점수(${adv.composite.toFixed(2)}) 매수 방향 일치`); }
    if (adv.composite < -0.3 && combined < 0) { conf = Math.min(conf * 1.1, 1.0); reasoning.push(`고급 분석 복합점수(${adv.composite.toFixed(2)}) 매도 방향 일치`); }

    let action;
    if (combined > 0.25 && conf > 0.5) {
      action = 'BUY';
      reasoning.push(`통합 점수 ${combined.toFixed(2)} (매수 기준 0.25 초과)`);
      if (fund.intrinsic > price) reasoning.push(`내재가치(${Math.round(fund.intrinsic).toLocaleString()}) > 현재가 → 저평가`);
    } else if (combined < -0.25 && conf > 0.5) {
      action = 'SELL';
      reasoning.push(`통합 점수 ${combined.toFixed(2)} (매도 기준 -0.25 미만)`);
    } else {
      action = 'HOLD';
      reasoning.push(`신호 강도(${combined.toFixed(2)}) 또는 신뢰도(${(conf * 100).toFixed(0)}%) 불충분 → 관망`);
    }

    const atr = tech.atr;
    let targetPrice, stopLoss;
    if (action === 'BUY') {
      targetPrice = price + atr * 2.5;
      stopLoss    = price - atr * 1.0;
    } else if (action === 'SELL') {
      targetPrice = price - atr * 2.5;
      stopLoss    = price + atr * 1.0;
    } else {
      targetPrice = price + atr * 1.5;
      stopLoss    = price - atr * 1.0;
    }

    const risk = Math.abs(price - stopLoss), reward = Math.abs(targetPrice - price);
    const rr = risk > 0 ? Math.round(reward / risk * 10) / 10 : 0;
    if (rr < 2.0 && action !== 'HOLD') reasoning.push(`RR비율(${rr.toFixed(1)}:1) 불량 → 진입 재검토 권고`);

    return {
      action, confidence: Math.round(conf * 1000) / 1000,
      targetPrice, stopLoss, rr,
      techScore: tech.score, fundScore: fund.score,
      combined: Math.round(combined * 10000) / 10000,
      advancedComposite: Math.round(adv.composite * 1000) / 1000,
      reasoning
    };
  }

  /**
   * Single-call full pipeline (mirrors backtest/signnith_engine.py analyze()).
   */
  function analyze(bars, fundInfo, isKr, style) {
    const st = style || 'balanced';
    const price = bars[bars.length - 1].close;
    const ind = computeIndicators(bars);
    const cs = computeCandlestick(bars);
    const ew = computeElliottWave(bars);
    const ichi = computeIchimoku(bars);
    const smc = computeSMC(bars);
    const mtf = computeMultiTimeframe(bars);
    const quant = computeQuantFactors(bars, ind);
    const ipp = computeIPP(bars, ind);
    const waccResult = computeWACC(fundInfo || {}, Boolean(isKr));
    const tech = scoreTechnical(ind, price);
    const fund = scoreFundamental(fundInfo || {}, price);
    const advanced = fuseAdvancedSignals(cs, ew, ichi, smc, quant, waccResult, fund.metrics, ipp);
    const decision = makeDecision(tech, fund, st, price, advanced);
    return {
      price, ind, cs, ew, ichi, smc, mtf, quant, ipp,
      waccResult, tech, fund, advanced, decision
    };
  }

  const DEFAULT_FEEDBACK_WEIGHTS = {
    newsfinder: 0.15,
    equisense: 0.25,
    chartdeepdive: 0.20,
    buythedip: 0.20
  };

  /**
   * Orchestrator feedback-fusion helper (Phase 2/3).
   * Preserves Signnith's independent `decision` while computing an adjusted consensus.
   * @param {object} decision Output of makeDecision()
   * @param {Array<{source:string, score:number, confidence?:number, riskFlag?:boolean, summary?:string}>} feedbacks
   * @param {object} [options] { weights, maxFeedbackShare }
   */
  function applyFeedbacks(decision, feedbacks, options) {
    const base = decision || { action: 'HOLD', combined: 0, confidence: 0 };
    const list = Array.isArray(feedbacks) ? feedbacks : [];
    const opts = options || {};
    const weights = Object.assign({}, DEFAULT_FEEDBACK_WEIGHTS, opts.weights || {});
    const maxShare = typeof opts.maxFeedbackShare === 'number' ? opts.maxFeedbackShare : 0.35;

    if (!list.length) {
      return {
        baseAction: base.action,
        adjustedAction: base.action,
        baseCombined: base.combined,
        adjustedCombined: base.combined,
        baseConfidence: base.confidence,
        adjustedConfidence: base.confidence,
        riskFlags: [],
        feedbackCount: 0,
        feedbackBreakdown: []
      };
    }

    let wSum = 0, wTotal = 0, confAdj = 0;
    const riskFlags = [];
    const breakdown = [];

    for (const fb of list) {
      if (!fb || typeof fb.score !== 'number' || !isFinite(fb.score)) continue;
      const src = String(fb.source || 'external');
      const w = typeof weights[src] === 'number' ? weights[src] : 0.15;
      const clampedScore = Math.max(-1, Math.min(1, fb.score));
      const fbConf = (typeof fb.confidence === 'number' && isFinite(fb.confidence))
        ? Math.max(0, Math.min(1, fb.confidence)) : 1.0;

      wSum += clampedScore * w * fbConf;
      wTotal += w;
      if (fb.riskFlag) riskFlags.push({ source: src, summary: fb.summary || '' });
      breakdown.push({ source: src, score: clampedScore, weight: w, confidence: fbConf, riskFlag: Boolean(fb.riskFlag), summary: fb.summary || '' });
    }

    const fbAvg = wTotal > 0 ? wSum / wTotal : 0;
    const share = Math.min(maxShare, wTotal);
    const adjustedCombined = Math.round((base.combined * (1 - share) + fbAvg * share) * 10000) / 10000;

    const aligned = (base.combined > 0 && fbAvg > 0) || (base.combined < 0 && fbAvg < 0);
    const opposed = (base.combined > 0 && fbAvg < -0.1) || (base.combined < 0 && fbAvg > 0.1);
    confAdj = aligned ? 1.08 : (opposed ? 0.85 : 1.0);
    if (riskFlags.length > 0) confAdj *= 0.9;

    const adjustedConfidence = Math.round(Math.max(0, Math.min(1, base.confidence * confAdj)) * 1000) / 1000;
    let adjustedAction = 'HOLD';
    if (adjustedCombined > 0.25 && adjustedConfidence > 0.5) adjustedAction = 'BUY';
    else if (adjustedCombined < -0.25 && adjustedConfidence > 0.5) adjustedAction = 'SELL';

    return {
      baseAction: base.action,
      adjustedAction,
      baseCombined: base.combined,
      adjustedCombined,
      baseConfidence: base.confidence,
      adjustedConfidence,
      riskFlags,
      feedbackCount: breakdown.length,
      feedbackBreakdown: breakdown
    };
  }

  return {
    MASTER_WEIGHTS,
    DEFAULT_FEEDBACK_WEIGHTS,
    computeWACC,
    calcEMA,
    computeIndicators,
    computeCandlestick,
    computeElliottWave,
    computeIchimoku,
    computeSMC,
    computeMultiTimeframe,
    computeQuantFactors,
    computeIPP,
    computeWACCSignal,
    fuseAdvancedSignals,
    last,
    scoreToSignal,
    norm,
    normInv,
    scoreTechnical,
    scoreFundamental,
    makeDecision,
    analyze,
    applyFeedbacks
  };
}));
