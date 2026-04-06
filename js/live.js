/**
 * live.js — On-demand data fetching via Cloudflare Worker proxy.
 * Falls back to Yahoo Finance (through the proxy) when pipeline data is missing.
 * Transforms Yahoo responses to match pipeline JSON format so pages work unchanged.
 */
const LiveData = (() => {
    function getProxyUrl() { return Config.get('proxy')?.replace(/\/+$/, ''); }
    function isConfigured() { return !!getProxyUrl(); }

    async function _fetch(path) {
        const base = getProxyUrl();
        if (!base) return null;
        try {
            const resp = await fetch(`${base}${path}`);
            if (!resp.ok) return null;
            return await resp.json();
        } catch { return null; }
    }

    /**
     * Fetch lookup data (fundamentals) for a symbol.
     * Returns object matching yfinance .info format (same as lookup/{SYM}.json).
     */
    async function fetchLookup(sym) {
        const modules = [
            'price', 'summaryDetail', 'defaultKeyStatistics', 'financialData',
            'assetProfile', 'calendarEvents', 'recommendationTrend',
        ].join(',');
        const raw = await _fetch(`/v10/finance/quoteSummary/${sym}?modules=${modules}`);
        if (!raw?.quoteSummary?.result?.[0]) return null;

        // Flatten all modules into a single dict (mirrors yfinance .info)
        const result = raw.quoteSummary.result[0];
        const flat = {};
        for (const mod of Object.values(result)) {
            if (typeof mod !== 'object' || mod === null) continue;
            for (const [k, v] of Object.entries(mod)) {
                if (k === 'maxAge') continue;
                // Yahoo wraps values as {raw: N, fmt: "N"} — extract raw
                flat[k] = (v && typeof v === 'object' && 'raw' in v) ? v.raw : v;
            }
        }
        return flat;
    }

    /**
     * Fetch OHLCV chart data for a symbol (all timeframes).
     * Returns object matching charts/{SYM}.json format.
     */
    async function fetchChart(sym) {
        const timeframes = [
            { key: '1d', range: '1d', interval: '5m' },
            { key: '5d', range: '5d', interval: '15m' },
            { key: '1mo', range: '1mo', interval: '1d' },
            { key: '3mo', range: '3mo', interval: '1d' },
            { key: '1y', range: '1y', interval: '1d' },
            { key: '5y', range: '5y', interval: '1wk' },
        ];

        const chartData = {};

        // Fetch all timeframes in parallel
        const results = await Promise.all(
            timeframes.map(tf =>
                _fetch(`/v8/finance/chart/${sym}?range=${tf.range}&interval=${tf.interval}&includePrePost=false`)
                    .then(raw => ({ key: tf.key, raw }))
            )
        );

        for (const { key, raw } of results) {
            if (!raw?.chart?.result?.[0]) { chartData[key] = []; continue; }

            const r = raw.chart.result[0];
            const ts = r.timestamp || [];
            const q = r.indicators?.quote?.[0] || {};
            const bars = [];

            for (let i = 0; i < ts.length; i++) {
                if (q.close?.[i] == null) continue;
                bars.push({
                    time: ts[i],
                    open: q.open?.[i] ?? q.close[i],
                    high: q.high?.[i] ?? q.close[i],
                    low: q.low?.[i] ?? q.close[i],
                    close: q.close[i],
                    volume: q.volume?.[i] ?? 0,
                });
            }
            chartData[key] = bars;
        }

        return chartData;
    }

    /**
     * Fetch sparkline (1mo closing prices) for a symbol.
     * Returns array of closing prices matching sparklines.json[SYM] format.
     */
    async function fetchSparkline(sym) {
        const raw = await _fetch(`/v8/finance/chart/${sym}?range=1mo&interval=1d`);
        if (!raw?.chart?.result?.[0]) return null;

        const closes = raw.chart.result[0].indicators?.quote?.[0]?.close;
        return closes ? closes.filter(c => c != null) : null;
    }

    /**
     * Fetch real-time quote for a symbol.
     * Returns object matching quotes.json item format.
     */
    async function fetchQuote(sym) {
        const raw = await _fetch(`/v7/finance/quote?symbols=${sym}`);
        if (!raw?.quoteResponse?.result?.[0]) return null;

        const q = raw.quoteResponse.result[0];
        const result = {
            symbol: q.symbol,
            price: q.regularMarketPrice,
            change: q.regularMarketChange,
            pct: q.regularMarketChangePercent,
            volume: q.regularMarketVolume,
            name: q.shortName || q.longName || '',
        };

        // Extended hours
        if (q.preMarketPrice) {
            result.ext_price = q.preMarketPrice;
            result.ext_change = q.preMarketChange;
            result.ext_pct = q.preMarketChangePercent;
            result.ext_label = 'Pre';
        } else if (q.postMarketPrice) {
            result.ext_price = q.postMarketPrice;
            result.ext_change = q.postMarketChange;
            result.ext_pct = q.postMarketChangePercent;
            result.ext_label = 'AH';
        }

        return result;
    }

    /**
     * Fetch technicals for a symbol (computed from chart data).
     * Returns object matching technicals.json[SYM] format.
     */
    async function fetchTechnicals(sym) {
        const raw = await _fetch(`/v8/finance/chart/${sym}?range=1y&interval=1d`);
        if (!raw?.chart?.result?.[0]) return null;

        const r = raw.chart.result[0];
        const closes = r.indicators?.quote?.[0]?.close?.filter(c => c != null) || [];
        const volumes = r.indicators?.quote?.[0]?.volume?.filter(v => v != null) || [];
        const highs = r.indicators?.quote?.[0]?.high?.filter(h => h != null) || [];
        const lows = r.indicators?.quote?.[0]?.low?.filter(l => l != null) || [];

        if (closes.length < 20) return null;

        const current = closes[closes.length - 1];
        const sma = (arr, n) => arr.length >= n ? arr.slice(-n).reduce((s, v) => s + v, 0) / n : null;

        const sma_20 = sma(closes, 20);
        const sma_50 = sma(closes, 50);
        const sma_200 = sma(closes, 200);

        // RSI (14-period)
        let gains = 0, losses = 0;
        const period = 14;
        const recent = closes.slice(-period - 1);
        for (let i = 1; i < recent.length; i++) {
            const diff = recent[i] - recent[i - 1];
            if (diff > 0) gains += diff; else losses -= diff;
        }
        const avgGain = gains / period;
        const avgLoss = losses / period;
        const rs = avgLoss > 0 ? avgGain / avgLoss : 100;
        const rsi = 100 - (100 / (1 + rs));

        // 52-week high/low
        const yearCloses = closes.slice(-252);
        const yearHighs = highs.slice(-252);
        const yearLows = lows.slice(-252);
        const high_52w = Math.max(...(yearHighs.length ? yearHighs : yearCloses));
        const low_52w = Math.min(...(yearLows.length ? yearLows : yearCloses));
        const off_high = ((current - high_52w) / high_52w) * 100;
        const off_low = ((current - low_52w) / low_52w) * 100;

        // Volume ratio
        const avgVol = sma(volumes, 20);
        const curVol = volumes[volumes.length - 1];
        const vol_ratio = avgVol > 0 ? curVol / avgVol : null;

        // Bollinger Bands (20, 2)
        const bb_slice = closes.slice(-20);
        const bb_mean = bb_slice.reduce((s, v) => s + v, 0) / bb_slice.length;
        const bb_std = Math.sqrt(bb_slice.reduce((s, v) => s + (v - bb_mean) ** 2, 0) / bb_slice.length);
        const bb_upper = bb_mean + 2 * bb_std;
        const bb_lower = bb_mean - 2 * bb_std;

        // ATR (14-period)
        let atrSum = 0;
        const atrSlice = Math.min(period, closes.length - 1);
        for (let i = closes.length - atrSlice; i < closes.length; i++) {
            const tr = Math.max(
                (highs[i] || closes[i]) - (lows[i] || closes[i]),
                Math.abs((highs[i] || closes[i]) - closes[i - 1]),
                Math.abs((lows[i] || closes[i]) - closes[i - 1])
            );
            atrSum += tr;
        }
        const atr = atrSum / atrSlice;

        return {
            current, sma_20, sma_50, sma_200, rsi,
            high_52w, low_52w, off_high, off_low,
            vol_ratio, bb_upper, bb_lower, bb_width: bb_std * 4 / bb_mean * 100,
            atr, atr_pct: (atr / current) * 100,
        };
    }

    return { isConfigured, fetchLookup, fetchChart, fetchSparkline, fetchQuote, fetchTechnicals };
})();
