/**
 * EquiSense Proxy — Cloudflare Worker
 *
 * Routes:
 *   GET /yahoo/summary?symbol=AAPL&modules=...
 *   GET /yahoo/chart?symbol=AAPL&range=1y&interval=1d
 *   GET /dart/corp?stock_code=005930   → { corp_code: "00126380" }
 *   GET /dart/fs?corp_code=00126380&year=2024
 *   GET /translate?text=...&target=ko   (Google 비공식 → 실패 시 MyMemory 폴백)
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

async function refreshCrumb() {
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
}

async function yahooSummaryFetch(symbol, modules) {
  if (!_crumb) await refreshCrumb()

  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${encodeURIComponent(modules)}&formatted=false&lang=en-US&crumb=${encodeURIComponent(_crumb)}`
  const res = await fetch(url, { headers: { ...YAHOO_HEADERS, Cookie: _cookieStr } })
  const body = await res.text()

  let parsed
  try { parsed = JSON.parse(body) } catch { return body }

  const isInvalidCrumb =
    parsed?.finance?.error?.code === 'Unauthorized' ||
    parsed?.quoteSummary?.error?.code === 'Unauthorized'

  if (isInvalidCrumb) {
    _crumb = null
    _cookieStr = null
    await refreshCrumb()
    const retryUrl = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${encodeURIComponent(modules)}&formatted=false&lang=en-US&crumb=${encodeURIComponent(_crumb)}`
    return (await fetch(retryUrl, { headers: { ...YAHOO_HEADERS, Cookie: _cookieStr } })).text()
  }

  return body
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
  try { parsed = JSON.parse(body) } catch { return body }

  const isUnauth =
    parsed?.timeseries?.error?.code === 'Unauthorized' ||
    parsed?.finance?.error?.code === 'Unauthorized'

  if (isUnauth) {
    _crumb = null
    _cookieStr = null
    await refreshCrumb()
    return (await fetch(makeUrl(_crumb), { headers: { ...YAHOO_HEADERS, Cookie: _cookieStr } })).text()
  }

  return body
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
    parts.push(data?.responseData?.translatedText ?? chunk)
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
          const ksBody = await yahooSummaryFetch(symbol + '.KS', 'financialData')
          let ksData
          try { ksData = JSON.parse(ksBody) } catch { ksData = null }
          symbol = ksData?.quoteSummary?.result ? symbol + '.KS' : symbol + '.KQ'
        }

        const body = await yahooSummaryFetch(symbol, modules)
        // 재무제표 모듈(장기 데이터)은 15분 캐시, 주가 전용은 60초 캐시
        const isHeavy = modules.includes('incomeStatement') || modules.includes('balanceSheet') || modules.includes('cashflow')
        const ttl = isHeavy ? 900 : 60
        return new Response(body, {
          status: 200,
          headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${ttl}` },
        })
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

      // ── Yahoo Finance: fundamentals timeseries ─────────────────────────────
      if (url.pathname === '/yahoo/timeseries') {
        let symbol = p.get('symbol') ?? ''
        if (p.get('market') === 'KR' && !/\.(KS|KQ)$/i.test(symbol)) {
          const ksBody = await yahooSummaryFetch(symbol + '.KS', 'financialData')
          let ksData
          try { ksData = JSON.parse(ksBody) } catch { ksData = null }
          symbol = ksData?.quoteSummary?.result ? symbol + '.KS' : symbol + '.KQ'
        }
        const body = await yahooTimeseriesFetch(symbol)
        return new Response(body, {
          status: 200,
          headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
        })
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

      return new Response('Not found', { status: 404, headers: CORS })
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err) }), {
        status: 502,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }
  },
}
