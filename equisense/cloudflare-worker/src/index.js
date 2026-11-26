/**
 * EquiSense Proxy — Cloudflare Worker
 *
 * Routes:
 *   GET /yahoo/summary?symbol=AAPL&modules=...
 *   GET /yahoo/chart?symbol=AAPL&range=1y&interval=1d
 *   GET /dart/corp?stock_code=005930   → { corp_code: "00126380" }
 *   GET /dart/fs?corp_code=00126380&year=2024
 *   GET /translate?text=...&target=ko   (Google 비공식 → 실패 시 MyMemory 폴백)
 *   GET /fmp/peer-comparison?symbol=AAPL   (동종업계 마진 비교, FMP 무료 티어)
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const YAHOO_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const YAHOO_HEADERS = {
  'User-Agent': YAHOO_UA,
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://finance.yahoo.com/',
}

const SUMMARY_MODULES = [
  'incomeStatementHistory',
  'balanceSheetHistory',
  'cashflowStatementHistory',
  'defaultKeyStatistics',
].join(',')

// ── Yahoo crumb cache ────────────────────────────────────────────────────────

let _crumb = null
let _cookieStr = null
let _crumbPromise = null

async function refreshCrumb() {
  if (_crumbPromise) return _crumbPromise
  _crumbPromise = (async () => {
    try {
      const homeRes = await fetch('https://finance.yahoo.com/', {
        headers: {
          'User-Agent': YAHOO_UA,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
      })

      const setCookieHeaders = homeRes.headers.getAll
        ? homeRes.headers.getAll('set-cookie')
        : [homeRes.headers.get('set-cookie') ?? '']

      const cookies = setCookieHeaders
        .flatMap((h) => h.split(','))
        .map((c) => c.split(';')[0].trim())
        .filter(Boolean)

      _cookieStr = cookies.join('; ')

      const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
        headers: {
          'User-Agent': YAHOO_UA,
          Accept: '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          Cookie: _cookieStr,
        },
      })

      const crumbText = (await crumbRes.text()).trim()
      if (!crumbText || crumbText.includes('<') || crumbText.includes('{') || crumbText.length > 40) {
        _crumb = null
        _cookieStr = null
        throw new Error(`Yahoo crumb 취득 실패: ${crumbText.slice(0, 60)}`)
      }
      _crumb = crumbText
    } finally {
      _crumbPromise = null
    }
  })()
  return _crumbPromise
}

async function yahooSummaryFetch(symbol, modules) {
  if (!_crumb) await refreshCrumb()

  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${encodeURIComponent(modules)}&formatted=false&lang=en-US&crumb=${encodeURIComponent(_crumb)}`
  const res = await fetch(url, { headers: { ...YAHOO_HEADERS, Cookie: _cookieStr } })
  const body = await res.text()

  let parsed
  try { parsed = JSON.parse(body) } catch { return { status: res.ok ? 502 : res.status, body } }

  const isInvalidCrumb =
    parsed?.finance?.error?.code === 'Unauthorized' ||
    parsed?.quoteSummary?.error?.code === 'Unauthorized'

  if (isInvalidCrumb) {
    _crumb = null
    _cookieStr = null
    await refreshCrumb()
    const retryUrl = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${encodeURIComponent(modules)}&formatted=false&lang=en-US&crumb=${encodeURIComponent(_crumb)}`
    const retryRes = await fetch(retryUrl, { headers: { ...YAHOO_HEADERS, Cookie: _cookieStr } })
    return { status: retryRes.status, body: await retryRes.text() }
  }

  return { status: res.status, body }
}

const TS_TYPES = [
  'annualRevenue',
  'annualNetIncome',
  'annualOperatingIncome',
  'annualGrossProfit',
  'annualTotalAssets',
  'annualTotalLiabilitiesNetMinorityInterest',
  'annualStockholdersEquity',
  'annualOperatingCashFlow',
  'annualCapitalExpenditure',
  'annualInterestExpense',
].join(',')

async function yahooTimeseriesFetch(symbol) {
  if (!_crumb) await refreshCrumb()

  const makeUrl = (crumb) =>
    `https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}` +
    `?type=${encodeURIComponent(TS_TYPES)}&period1=0&period2=9999999999&lang=en-US&region=US&crumb=${encodeURIComponent(crumb)}`

  const res = await fetch(makeUrl(_crumb), { headers: { ...YAHOO_HEADERS, Cookie: _cookieStr } })
  const body = await res.text()

  let parsed
  try { parsed = JSON.parse(body) } catch { return { status: res.ok ? 502 : res.status, body } }

  const isUnauth =
    parsed?.timeseries?.error?.code === 'Unauthorized' ||
    parsed?.finance?.error?.code === 'Unauthorized'

  if (isUnauth) {
    _crumb = null
    _cookieStr = null
    await refreshCrumb()
    const retryRes = await fetch(makeUrl(_crumb), { headers: { ...YAHOO_HEADERS, Cookie: _cookieStr } })
    return { status: retryRes.status, body: await retryRes.text() }
  }

  return { status: res.status, body }
}

// ── 번역 (Google 비공식 우선, 실패 시 MyMemory 폴백) ────────────────────────────

function splitIntoChunks(text, maxLen) {
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text]
  const chunks = []
  let cur = ''
  for (const s of sentences) {
    if (cur && (cur + s).length > maxLen) { chunks.push(cur); cur = s }
    else cur += s
  }
  if (cur) chunks.push(cur)
  return chunks
}

async function translateGoogle(text, target) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${target}&dt=t&q=${encodeURIComponent(text)}`
  const res = await fetch(url, { headers: { 'User-Agent': YAHOO_UA } })
  if (!res.ok) throw new Error(`Google Translate ${res.status}`)
  const data = await res.json()
  const segments = data?.[0]
  if (!Array.isArray(segments)) throw new Error('Google Translate: 예상치 못한 응답')
  return segments.map((seg) => seg[0]).join('')
}

async function translateMyMemory(text, target) {
  const chunks = splitIntoChunks(text, 480)
  const parts = []
  for (const chunk of chunks) {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=en|${target}`
    const res = await fetch(url)
    const data = await res.json()
    const translated = data?.responseData?.translatedText
    const isWarning = typeof translated === 'string' && /MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(translated)
    parts.push(!isWarning && data?.responseStatus === 200 && translated ? translated : chunk)
  }
  return parts.join(' ')
}

async function translateText(text, target) {
  try {
    return await translateGoogle(text, target)
  } catch {
    return await translateMyMemory(text, target)
  }
}

// ── FMP: 동종업계 피어 비교 ──────────────────────────────────────────────────

async function fmpJson(path, apikey) {
  const sep = path.includes('?') ? '&' : '?'
  const res = await fetch(`https://financialmodelingprep.com${path}${sep}apikey=${apikey}`)
  if (!res.ok) throw new Error(`FMP ${res.status}`)
  return res.json()
}

async function fetchPeerComparison(symbol, apikey) {
  const peersData = await fmpJson(`/stable/stock-peers?symbol=${encodeURIComponent(symbol)}`, apikey)
  const top = (Array.isArray(peersData) ? peersData : [])
    .sort((a, b) => (b.mktCap ?? 0) - (a.mktCap ?? 0))
    .slice(0, 4)

  return Promise.all(top.map(async (peer) => {
    try {
      const ratios = await fmpJson(`/stable/ratios-ttm?symbol=${encodeURIComponent(peer.symbol)}`, apikey)
      const margin = ratios?.[0]?.operatingProfitMarginTTM
      return {
        symbol: peer.symbol,
        name: peer.companyName ?? peer.symbol,
        operating_margin: typeof margin === 'number' ? margin * 100 : null,
      }
    } catch {
      return { symbol: peer.symbol, name: peer.companyName ?? peer.symbol, operating_margin: null }
    }
  }))
}

// ── Main handler ─────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS })
    }

    const url = new URL(request.url)
    const p = url.searchParams

    try {
      // ── Yahoo Finance: quote summary ────────────────────────────────────────
      if (url.pathname === '/yahoo/summary') {
        let symbol = p.get('symbol') ?? ''
        const modules = p.get('modules') ?? SUMMARY_MODULES

        if (p.get('market') === 'KR' && !/\.(KS|KQ)$/i.test(symbol)) {
          const ksRes = await yahooSummaryFetch(symbol + '.KS', 'financialData')
          let ksData
          try { ksData = JSON.parse(ksRes.body) } catch { ksData = null }
          symbol = ksData?.quoteSummary?.result ? symbol + '.KS' : symbol + '.KQ'
        }

        const result = await yahooSummaryFetch(symbol, modules)
        // 재무제표 모듈(장기 데이터)은 15분 캐시, 주가 전용은 60초 캐시 (단, 성공 응답만 캐싱)
        const isHeavy = modules.includes('incomeStatement') || modules.includes('balanceSheet') || modules.includes('cashflow')
        const ttl = isHeavy ? 900 : 60
        const headers = { ...CORS, 'Content-Type': 'application/json; charset=utf-8' }
        if (result.status === 200) headers['Cache-Control'] = `public, max-age=${ttl}`
        return new Response(result.body, { status: result.status, headers })
      }

      // ── Yahoo Finance: 종목 검색 자동완성 ────────────────────────────────────
      if (url.pathname === '/yahoo/search') {
        const q = p.get('q') ?? ''
        const upstream = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=6&newsCount=0&enableFuzzyQuery=false&quotesQueryId=tss_match_phrase_query`
        const res = await fetch(upstream, { headers: YAHOO_HEADERS })
        return new Response(await res.text(), {
          status: res.status,
          headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60' },
        })
      }

      // ── Yahoo Finance: 종목 뉴스 헤드라인 ────────────────────────────────────
      if (url.pathname === '/yahoo/news') {
        let symbol = p.get('symbol') ?? ''
        if (p.get('market') === 'KR' && !/\.(KS|KQ)$/i.test(symbol)) symbol = symbol + '.KS'
        const upstream = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&quotesCount=0&newsCount=10`
        const res = await fetch(upstream, { headers: YAHOO_HEADERS })
        return new Response(await res.text(), {
          status: res.status,
          headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=1800' },
        })
      }

      // ── Yahoo Finance: fundamentals timeseries ─────────────────────────────
      if (url.pathname === '/yahoo/timeseries') {
        let symbol = p.get('symbol') ?? ''
        if (p.get('market') === 'KR' && !/\.(KS|KQ)$/i.test(symbol)) {
          const ksRes = await yahooSummaryFetch(symbol + '.KS', 'financialData')
          let ksData
          try { ksData = JSON.parse(ksRes.body) } catch { ksData = null }
          symbol = ksData?.quoteSummary?.result ? symbol + '.KS' : symbol + '.KQ'
        }
        const result = await yahooTimeseriesFetch(symbol)
        const headers = { ...CORS, 'Content-Type': 'application/json; charset=utf-8' }
        if (result.status === 200) headers['Cache-Control'] = 'public, max-age=3600'
        return new Response(result.body, { status: result.status, headers })
      }

      // ── Yahoo Finance: price chart ──────────────────────────────────────────
      if (url.pathname === '/yahoo/chart') {
        let symbol = p.get('symbol') ?? ''
        const range = p.get('range') ?? '1y'
        const interval = p.get('interval') ?? '1d'
        if (p.get('market') === 'KR' && !/\.(KS|KQ)$/i.test(symbol)) symbol = symbol + '.KS'
        const upstream = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false&events=div%2Csplit`
        const res = await fetch(upstream, { headers: YAHOO_HEADERS })
        return new Response(await res.text(), {
          status: res.status,
          headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=900' },
        })
      }

      // ── DART: 재무제표 ────────────────────────────────────────────────────
      if (url.pathname === '/dart/fs') {
        const corpCode = p.get('corp_code') ?? ''
        const year = p.get('year') ?? String(new Date().getFullYear() - 1)
        const upstream = `https://opendart.fss.or.kr/api/fnlttSinglAcntAll.json?crtfc_key=${env.DART_API_KEY}&corp_code=${corpCode}&bsns_year=${year}&reprt_code=11011&fs_div=CFS`
        const res = await fetch(upstream, { headers: YAHOO_HEADERS })
        return new Response(await res.text(), {
          status: res.status,
          headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=900' },
        })
      }

      // ── DART: 최근 공시 목록 ──────────────────────────────────────────────
      if (url.pathname === '/dart/disclosures') {
        const corpCode = p.get('corp_code') ?? ''
        const pageCount = p.get('page_count') ?? '20'
        const upstream = `https://opendart.fss.or.kr/api/list.json?crtfc_key=${env.DART_API_KEY}&corp_code=${corpCode}&page_count=${pageCount}&sort=date&sort_mth=desc`
        const res = await fetch(upstream)
        return new Response(await res.text(), {
          status: res.status,
          headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
        })
      }

      // ── 번역 ───────────────────────────────────────────────────────────────
      if (url.pathname === '/translate') {
        const text = (p.get('text') ?? '').slice(0, 3000)
        const target = p.get('target') ?? 'ko'
        if (!text) {
          return new Response(JSON.stringify({ translated: '' }), {
            status: 200,
            headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
          })
        }
        const translated = await translateText(text, target)
        return new Response(JSON.stringify({ translated }), {
          status: 200,
          headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=86400' },
        })
      }

      // ── FMP: 동종업계 피어 비교 ────────────────────────────────────────────
      if (url.pathname === '/fmp/peer-comparison') {
        const symbol = p.get('symbol') ?? ''
        if (!symbol || !env.FMP_API_KEY) {
          return new Response(JSON.stringify({ peers: [] }), {
            status: 200,
            headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
          })
        }
        try {
          const peers = await fetchPeerComparison(symbol, env.FMP_API_KEY)
          return new Response(JSON.stringify({ peers }), {
            status: 200,
            headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=86400' },
          })
        } catch {
          // FMP 무료 티어 쿼터 소진 등 — 조회 실패 시 조용히 빈 배열 반환 (페이지 정상 동작 유지)
          return new Response(JSON.stringify({ peers: [] }), {
            status: 200,
            headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
          })
        }
      }

      // ── AI: 기업 개요 생성 (Workers AI) ──────────────────────────────────────
      if (url.pathname === '/ai/company-overview') {
        const ticker = (p.get('ticker') ?? '').trim().slice(0, 20)
        const name = (p.get('name') ?? '').trim().slice(0, 120)
        const market = (p.get('market') ?? 'US').trim().slice(0, 10)
        const sector = (p.get('sector') ?? '').trim().slice(0, 80)
        const industry = (p.get('industry') ?? '').trim().slice(0, 80)
        const summary = (p.get('summary') ?? '').trim().slice(0, 1500)

        if (!ticker || !env.AI) {
          return new Response(JSON.stringify({ overview: null }), {
            status: 200,
            headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
          })
        }

        const cache = caches.default
        const cacheKey = new Request(url.toString(), { method: 'GET' })
        const cached = await cache.match(cacheKey)
        if (cached) return cached

        const model = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
        const contextLines = [
          `종목코드: ${ticker} (${market})`,
          name ? `기업명: ${name}` : null,
          sector ? `섹터: ${sector}` : null,
          industry ? `산업: ${industry}` : null,
          summary ? `영문 사업 개요:\n${summary}` : null,
        ].filter(Boolean).join('\n')

        try {
          const aiRes = await env.AI.run(model, {
            messages: [
              {
                role: 'system',
                content:
                  '당신은 한국어 주식 리서치 애널리스트입니다. 제공된 기업 정보만을 바탕으로 핵심 사업, 주요 제품/서비스, 수익 구조를 2~3문장의 자연스러운 한국어 한 단락으로 요약하세요. 제공되지 않은 수치나 사실은 지어내지 말고, 마크다운/불릿/제목 없이 본문만 출력하세요.',
              },
              {
                role: 'user',
                content: contextLines,
              },
            ],
            max_tokens: 220,
            temperature: 0.2,
          })

          const raw =
            typeof aiRes?.response === 'string'
              ? aiRes.response.trim()
              : typeof aiRes?.choices?.[0]?.message?.content === 'string'
                ? aiRes.choices[0].message.content.trim()
                : ''
          const overview = raw || null
          const headers = {
            ...CORS,
            'Content-Type': 'application/json; charset=utf-8',
            ...(overview ? { 'Cache-Control': 'public, max-age=604800' } : {}),
          }
          const resp = new Response(JSON.stringify({ overview, model }), { status: 200, headers })
          if (overview) await cache.put(cacheKey, resp.clone())
          return resp
        } catch {
          return new Response(JSON.stringify({ overview: null }), {
            status: 200,
            headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
          })
        }
      }

      // ── AI: 사업적 해자(Business Moat) 평가 (오픈웨이트 Llama 3.3 70B) ────────
      if (url.pathname === '/ai/moat-business') {
        const ticker = (p.get('ticker') ?? '').trim().slice(0, 20)
        const name = (p.get('name') ?? '').trim().slice(0, 120)
        const market = (p.get('market') ?? 'US').trim().slice(0, 10)
        const sector = (p.get('sector') ?? '').trim().slice(0, 80)
        const industry = (p.get('industry') ?? '').trim().slice(0, 80)
        const summary = (p.get('summary') ?? '').trim().slice(0, 1500)

        if (!ticker || !env.AI) {
          return new Response(JSON.stringify({ business_moat: null }), {
            status: 200,
            headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
          })
        }

        const cache = caches.default
        const cacheKey = new Request(url.toString(), { method: 'GET' })
        const cached = await cache.match(cacheKey)
        if (cached) return cached

        const model = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
        const contextLines = [
          `종목코드: ${ticker} (${market})`,
          name ? `기업명: ${name}` : null,
          sector ? `섹터: ${sector}` : null,
          industry ? `산업: ${industry}` : null,
          summary ? `사업 개요:\n${summary}` : null,
        ].filter(Boolean).join('\n')

        try {
          const aiRes = await env.AI.run(model, {
            messages: [
              {
                role: 'system',
                content:
                  '당신은 Morningstar 경제적 해자(Economic Moat) 전문 애널리스트입니다. 제공된 기업의 사업 모델과 산업 구조만을 바탕으로 5개 해자 차원의 사업적 경쟁우위(0~10점)와 한국어 근거, 해자 침식 리스크를 평가하세요. 반드시 순수 JSON만 출력하세요(코드블록/설명 금지). 스키마: {"business_summary":"2문장 한국어 요약","dimensions":{"cost_advantage":{"score":0-10,"rationale":"1문장"},"intangible_assets":{"score":0-10,"rationale":"1문장"},"switching_costs":{"score":0-10,"rationale":"1문장"},"network_effects":{"score":0-10,"rationale":"1문장"},"efficient_scale":{"score":0-10,"rationale":"1문장"}},"erosion_risks":["리스크1","리스크2","리스크3"]}',
              },
              {
                role: 'user',
                content: contextLines,
              },
            ],
            max_tokens: 700,
            temperature: 0.2,
          })

          const rawText =
            typeof aiRes?.response === 'string'
              ? aiRes.response.trim()
              : typeof aiRes?.choices?.[0]?.message?.content === 'string'
                ? aiRes.choices[0].message.content.trim()
                : ''

          const jsonStr = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
          const parsed = JSON.parse(jsonStr)

          const dimKeys = ['cost_advantage', 'intangible_assets', 'switching_costs', 'network_effects', 'efficient_scale']
          const dims = {}
          for (const k of dimKeys) {
            const entry = parsed?.dimensions?.[k]
            const rawScore = Number(entry?.score)
            dims[k] = {
              score: Number.isFinite(rawScore) ? Math.max(0, Math.min(10, Math.round(rawScore * 10) / 10)) : 5,
              rationale: typeof entry?.rationale === 'string' ? entry.rationale.trim() : '',
            }
          }

          const business_moat = {
            business_summary: typeof parsed?.business_summary === 'string' ? parsed.business_summary.trim() : '',
            dimensions: dims,
            erosion_risks: Array.isArray(parsed?.erosion_risks)
              ? parsed.erosion_risks.filter((r) => typeof r === 'string' && r.trim()).slice(0, 4)
              : [],
            model,
          }

          const headers = {
            ...CORS,
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'public, max-age=86400',
          }
          const resp = new Response(JSON.stringify({ business_moat }), { status: 200, headers })
          await cache.put(cacheKey, resp.clone())
          return resp
        } catch {
          return new Response(JSON.stringify({ business_moat: null }), {
            status: 200,
            headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
          })
        }
      }

      return new Response('Not found', { status: 404, headers: CORS })
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err) }), {
        status: 502,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }
  },
}
