/**
 * Signnith Suite Bridge (Phase 1: Cross-App Context & Signal Handoff)
 *
 * Zero-dependency UMD/global helper shared across:
 *   signnith, newsfinder, equisense, chartdeepdive, buythedip
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SignnithSuite = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var APPS = {
    signnith: {
      id: 'signnith',
      label: 'Signnith',
      baseUrl: 'https://drbrookskim.github.io/signnith/',
      path: '',
      tickerParam: 'ticker',
      stripKrSuffix: false,
      prefersName: false,
      requiresAuth: false
    },
    newsfinder: {
      id: 'newsfinder',
      label: 'News Finder',
      baseUrl: 'https://drbrookskim.github.io/newsfinder/',
      path: '',
      tickerParam: 'ticker',
      stripKrSuffix: false,
      prefersName: true,
      requiresAuth: false
    },
    equisense: {
      id: 'equisense',
      label: 'EquiSense',
      baseUrl: 'https://drbrookskim.github.io/equisense/',
      path: 'companies/_/analysis',
      tickerParam: 'ticker',
      stripKrSuffix: true,
      prefersName: false,
      requiresAuth: true
    },
    buythedip: {
      id: 'buythedip',
      label: 'BuyTheDip',
      baseUrl: 'https://drbrookskim.github.io/buythedip/',
      path: '',
      tickerParam: 'ticker',
      stripKrSuffix: false,
      prefersName: false,
      requiresAuth: true
    },
    chartdeepdive: {
      id: 'chartdeepdive',
      label: 'ChartDeepDive',
      baseUrl: 'https://chartdeepdive.vercel.app/',
      path: 'chart',
      tickerParam: 'symbol',
      stripKrSuffix: false,
      prefersName: false,
      requiresAuth: true
    }
  };

  function normalizeTickerInput(raw) {
    var s = String(raw || '').trim();
    if (!s) return '';
    var parenMatch = s.match(/\(([A-Z0-9]+(?:\.[A-Z]{1,3})?)\)\s*$/i);
    return (parenMatch ? parenMatch[1] : s).toUpperCase();
  }

  function detectMarket(ticker) {
    return /\.(KS|KQ)$/i.test(String(ticker || '')) ? 'KR' : 'US';
  }

  function formatTickerForApp(ticker, appCfg) {
    if (!ticker) return '';
    if (appCfg.stripKrSuffix) {
      return ticker.replace(/\.(KS|KQ)$/i, '');
    }
    return ticker;
  }

  function attachSignalParams(params, signal) {
    if (!signal || typeof signal !== 'object') return;
    if (signal.signalId) params.set('signal_id', String(signal.signalId));
    if (signal.action)   params.set('sig_action', String(signal.action));
    if (typeof signal.confidence === 'number' && isFinite(signal.confidence)) {
      params.set('sig_conf', signal.confidence.toFixed(3));
    }
    if (typeof signal.combined === 'number' && isFinite(signal.combined)) {
      params.set('sig_score', signal.combined.toFixed(3));
    }
    if (signal.style)  params.set('sig_style', String(signal.style));
    if (signal.period) params.set('sig_period', String(signal.period));
  }

  /**
   * Build a handoff URL for any app in the suite.
   * @param {string} appId
   * @param {object} ctx { ticker, name, theme, from, signal }
   */
  function buildAppUrl(appId, ctx) {
    var cfg = APPS[appId];
    if (!cfg) throw new Error('Unknown suite app: ' + appId);
    var c = ctx || {};
    var theme = c.theme || 'light';
    var ticker = normalizeTickerInput(c.ticker || '');
    var name = String(c.name || '').trim();
    var params = new URLSearchParams({ theme: theme });

    if (c.from) params.set('from', c.from);

    if (cfg.prefersName) {
      if (ticker) {
        params.set(cfg.tickerParam, ticker);
        params.set('market', c.market || detectMarket(ticker));
        if (name && name !== ticker) params.set('name', name);
      } else if (name) {
        params.set(cfg.tickerParam, name);
      }
      attachSignalParams(params, c.signal);
      return cfg.baseUrl + '?' + params.toString();
    }

    if (!ticker) {
      return cfg.baseUrl + '?' + params.toString();
    }

    var market = c.market || detectMarket(ticker);
    var formattedTicker = formatTickerForApp(ticker, cfg);
    params.set(cfg.tickerParam, formattedTicker);
    params.set('market', market);
    if (name && name !== ticker && name !== formattedTicker) {
      params.set('name', name);
    }
    attachSignalParams(params, c.signal);

    var targetPath = cfg.path ? cfg.baseUrl + cfg.path : cfg.baseUrl;
    return targetPath + '?' + params.toString();
  }

  /**
   * Parse inbound suite context from location.search (or a custom query string).
   */
  function readSuiteContext(searchStr) {
    var qs = new URLSearchParams(
      typeof searchStr === 'string'
        ? searchStr
        : (typeof location !== 'undefined' ? location.search : '')
    );
    var ticker = normalizeTickerInput(qs.get('ticker') || qs.get('symbol') || '');
    var confRaw = qs.get('sig_conf');
    var scoreRaw = qs.get('sig_score');
    var fbScoreRaw = qs.get('fb_score');
    var hasSignal = Boolean(
      qs.get('signal_id') || qs.get('sig_action') || confRaw !== null || scoreRaw !== null
    );
    var hasFeedback = Boolean(fbScoreRaw !== null || qs.get('fb_summary'));

    return {
      ticker: ticker,
      market: qs.get('market') || (ticker ? detectMarket(ticker) : ''),
      name: qs.get('name') || '',
      theme: qs.get('theme') || '',
      style: qs.get('style') || qs.get('sig_style') || '',
      period: qs.get('period') || qs.get('sig_period') || '',
      from: qs.get('from') || '',
      signal: hasSignal ? {
        signalId: qs.get('signal_id') || '',
        action: qs.get('sig_action') || '',
        confidence: confRaw !== null ? Number(confRaw) : null,
        combined: scoreRaw !== null ? Number(scoreRaw) : null,
        style: qs.get('sig_style') || '',
        period: qs.get('sig_period') || ''
      } : null,
      feedback: hasFeedback ? {
        source: qs.get('from') || 'external',
        signalId: qs.get('signal_id') || '',
        score: fbScoreRaw !== null ? Number(fbScoreRaw) : null,
        summary: qs.get('fb_summary') || ''
      } : null
    };
  }

  /**
   * Build a feedback callback URL returning from a connected app to Signnith.
   */
  function buildFeedbackUrl(sourceAppId, payload) {
    var p = payload || {};
    var params = new URLSearchParams();
    if (p.ticker) params.set('ticker', normalizeTickerInput(p.ticker));
    if (p.theme)  params.set('theme', p.theme);
    params.set('from', sourceAppId || 'external');
    if (p.signalId) params.set('signal_id', String(p.signalId));
    if (p.feedbackScore !== undefined && p.feedbackScore !== null) {
      params.set('fb_score', String(p.feedbackScore));
    }
    if (p.feedbackSummary) params.set('fb_summary', String(p.feedbackSummary));
    return APPS.signnith.baseUrl + '?' + params.toString();
  }

  function openApp(appId, ctx, target) {
    var url = buildAppUrl(appId, ctx);
    if (typeof window !== 'undefined') {
      window.open(url, target || '_blank');
    }
    return url;
  }

  return {
    APPS: APPS,
    normalizeTickerInput: normalizeTickerInput,
    detectMarket: detectMarket,
    buildAppUrl: buildAppUrl,
    readSuiteContext: readSuiteContext,
    buildFeedbackUrl: buildFeedbackUrl,
    openApp: openApp
  };
}));
