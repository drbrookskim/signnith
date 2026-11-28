/**
 * Signnith Orchestrator Cloudflare Worker
 *
 * Endpoints:
 *   GET  /health
 *   GET  /signal?ticker=NVDA&period=6mo&style=balanced
 *   POST /consensus   { decision, feedbacks, options }
 *   POST /feedback    { signalId, source, score, confidence?, riskFlag?, summary?, decision? }
 */
import SignnithCore from '../shared/signnith-core.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS },
  });
}

async function fetchYahooBars(ticker, period = '6mo') {
  const validPeriods = new Set(['1mo', '3mo', '6mo', '1y', '2y']);
  const range = validPeriods.has(period) ? period : '6mo';
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=1d`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SignnithOrchestrator/1.0)' },
  });
  if (!res.ok) throw new Error(`Yahoo chart HTTP ${res.status}`);
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result?.timestamp?.length) throw new Error('No chart data for ticker');

  const q = result.indicators?.quote?.[0] || {};
  const bars = [];
  for (let i = 0; i < result.timestamp.length; i++) {
    const close = q.close?.[i];
    const open = q.open?.[i];
    const high = q.high?.[i];
    const low = q.low?.[i];
    if (close == null || open == null || high == null || low == null) continue;
    bars.push({
      time: result.timestamp[i],
      open,
      high,
      low,
      close,
      volume: q.volume?.[i] ?? 0,
    });
  }
  if (bars.length < 30) throw new Error(`Insufficient bars (${bars.length})`);
  return { bars, meta: result.meta || {} };
}

async function supabaseFetch(env, authHeader, path, init = {}) {
  const baseUrl = env?.SUPABASE_URL;
  const anonKey = env?.SUPABASE_ANON_KEY;
  if (!baseUrl || !anonKey || !authHeader) return null;
  const res = await fetch(`${baseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: anonKey,
      Authorization: authHeader,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const authHeader = request.headers.get('Authorization') || '';

    try {
      if (url.pathname === '/health') {
        return json({ ok: true, service: 'signnith-orchestrator' });
      }

      if (url.pathname === '/signal' && request.method === 'GET') {
        const ticker = (url.searchParams.get('ticker') || '').trim().toUpperCase();
        if (!ticker) return json({ error: 'Missing ticker parameter' }, 400);
        const period = url.searchParams.get('period') || '6mo';
        const style = url.searchParams.get('style') || 'balanced';
        const isKr = /\.(KS|KQ)$/i.test(ticker);

        const { bars, meta } = await fetchYahooBars(ticker, period);
        const result = SignnithCore.analyze(bars, {}, isKr, style);

        return json({
          ticker,
          market: isKr ? 'KR' : 'US',
          style,
          period,
          price: result.price,
          currency: meta.currency || (isKr ? 'KRW' : 'USD'),
          decision: result.decision,
          advanced: {
            composite: result.advanced.composite,
            details: result.advanced.details,
          },
          techScore: result.tech.score,
          fundScore: result.fund.score,
          asOf: new Date().toISOString(),
        });
      }

      if (url.pathname === '/consensus' && request.method === 'POST') {
        const body = await request.json();
        const consensus = SignnithCore.applyFeedbacks(
          body?.decision,
          body?.feedbacks || [],
          body?.options || {},
        );
        return json(consensus);
      }

      if (url.pathname === '/feedback' && request.method === 'POST') {
        const body = await request.json();
        const { signalId, source, score, confidence, riskFlag, summary, decision } = body || {};
        if (!source || typeof score !== 'number' || !isFinite(score)) {
          return json({ error: 'source and numeric score (-1..1) are required' }, 400);
        }

        let feedbacks = [{ source, score, confidence, riskFlag, summary }];
        if (signalId && env?.SUPABASE_URL && authHeader) {
          await supabaseFetch(env, authHeader, 'signal_feedbacks?on_conflict=signal_id,source_app', {
            method: 'POST',
            headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
            body: JSON.stringify({
              signal_id: signalId,
              source_app: source,
              score: Math.max(-1, Math.min(1, score)),
              confidence: typeof confidence === 'number' ? Math.max(0, Math.min(1, confidence)) : 1.0,
              risk_flag: Boolean(riskFlag),
              summary: summary || '',
            }),
          });
          const rows = await supabaseFetch(
            env,
            authHeader,
            `signal_feedbacks?signal_id=eq.${encodeURIComponent(signalId)}&select=source_app,score,confidence,risk_flag,summary`,
          );
          if (Array.isArray(rows) && rows.length) {
            feedbacks = rows.map(r => ({
              source: r.source_app,
              score: Number(r.score),
              confidence: Number(r.confidence),
              riskFlag: Boolean(r.risk_flag),
              summary: r.summary || '',
            }));
          }
        }

        const consensus = decision
          ? SignnithCore.applyFeedbacks(decision, feedbacks)
          : null;
        return json({ ok: true, feedbacks, consensus });
      }

      return json({ error: 'Not found' }, 404);
    } catch (err) {
      return json({ error: err?.message || 'Internal error' }, 500);
    }
  },
};
