/**
 * dashboard.js — Thesis dashboard mirroring ticker-tape's thesis.py.
 * Two-line-per-symbol layout: line1 = sym/name/price/change/AH, line2 = indicators.
 * Security: innerHTML from trusted pipeline data only (yfinance via GitHub Actions).
 */
App.registerPage('dashboard', async function(container, data) {
    const quotes = data['quotes.json'];
    const tech = data['technicals.json'] || {};
    const sparklines = data['sparklines.json'] || {};
    const meta = data['meta.json'] || {};
    const names = meta.names || {};
    const buckets = meta.buckets || {};

    if (!quotes || !quotes.length) {
        container.innerHTML = '<div class="c-dim" style="padding:20px">Awaiting first data fetch...</div>';
        return;
    }

    const filtered = typeof Watchlist !== 'undefined' ? Watchlist.filter(quotes) : quotes;
    const localGroups = typeof Groups !== 'undefined' ? Groups.load() : {};
    const mergedBuckets = Object.keys(localGroups).length ? localGroups : buckets;

    let html = '';

    // --- Thesis header ---
    const count = filtered.length;
    const gainers = filtered.filter(q => (q.pct || 0) > 0).length;
    const losers = filtered.filter(q => (q.pct || 0) < 0).length;
    const avgPct = filtered.reduce((s, q) => s + (q.pct || 0), 0) / count;
    const sorted = [...filtered].sort((a, b) => (b.pct || 0) - (a.pct || 0));
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];

    let a50 = 0, b50 = 0, a200 = 0, b200 = 0, os = 0, ob = 0;
    let sumRs = 0, nRs = 0, sumOh = 0, nOh = 0, sumVol = 0, nVol = 0;
    for (const q of filtered) {
        const t = tech[q.symbol]; if (!t) continue;
        if (t.sma_50 != null) { t.current > t.sma_50 ? a50++ : b50++; }
        if (t.sma_200 != null) { t.current > t.sma_200 ? a200++ : b200++; }
        if (t.rsi != null && t.rsi <= 30) os++;
        if (t.rsi != null && t.rsi >= 70) ob++;
        if (t.rs_vs_bench != null) { sumRs += t.rs_vs_bench; nRs++; }
        if (t.off_high != null) { sumOh += t.off_high; nOh++; }
        if (t.vol_ratio != null) { sumVol += t.vol_ratio; nVol++; }
    }

    const ac = avgPct >= 0 ? 'positive' : 'negative';
    html += '<div class="thesis-header">';
    html += '<div class="thesis-title">== THESIS DASHBOARD ==</div>';
    html += `<span class="c-dim">Positions:</span> ${count}  <span class="c-dim">Avg:</span> <span class="${ac}">${avgPct >= 0 ? '+' : ''}${avgPct.toFixed(2)}%</span>  <span class="positive">\u25B2${gainers}</span> <span class="negative">\u25BC${losers}</span>\n`;
    html += `<span class="c-dim">Best:</span> <span class="positive">${best.symbol} +${(best.pct||0).toFixed(2)}%</span>  <span class="c-dim">Worst:</span> <span class="negative">${worst.symbol} ${(worst.pct||0).toFixed(2)}%</span>\n`;
    html += `<span class="c-dim">SMA50:</span> <span class="positive">\u25B2${a50} above</span>  <span class="negative">\u25BC${b50} below</span>  `;
    html += `<span class="c-dim">SMA200:</span> <span class="positive">\u25B2${a200} above</span>  <span class="negative">\u25BC${b200} below</span>\n`;
    if (os || ob) html += `<span class="c-dim">RSI:</span> ${os ? `<span class="positive">${os} oversold</span>  ` : ''}${ob ? `<span class="negative">${ob} overbought</span>` : ''}\n`;
    if (nVol) html += `<span class="c-dim">Vol:</span> ${(sumVol/nVol).toFixed(1)}x avg  `;
    if (nOh) html += `<span class="c-dim">Avg off-high:</span> <span class="negative">${(sumOh/nOh).toFixed(0)}%H</span>  `;
    if (nRs) html += `<span class="c-dim">Avg RS:</span> <span class="${sumRs/nRs >= 0 ? 'positive' : 'negative'}">${sumRs/nRs >= 0 ? '+' : ''}${(sumRs/nRs).toFixed(1)}%R</span>`;
    html += '\n';

    // Market context
    const market = data['market.json'] || await App.loadData('market.json');
    if (market) {
        const ml = {};
        for (const items of Object.values(market)) {
            if (!Array.isArray(items)) continue;
            for (const it of items) ml[it.symbol] = it;
        }
        const mk = [
            { key: '^GSPC', label: 'SP' }, { key: '^IXIC', label: 'ND' },
            { key: '^SOX', label: 'SOX' }, { key: '^VIX', label: 'V' },
            { key: 'DX-Y.NYB', label: 'DXY' }, { key: '^TNX', label: '10Y' },
            { key: 'CL=F', label: 'W' }, { key: 'GC=F', label: 'G' },
            { key: 'BTC-USD', label: 'BTC' },
        ];
        let line = '<span class="c-dim">Market:</span> ';
        for (const m of mk) {
            const it = ml[m.key]; if (!it) continue;
            const c = (it.pct || 0) >= 0 ? 'positive' : 'negative';
            // VIX/10Y show price not %, others show %
            if (m.key === '^VIX' || m.key === '^TNX') {
                line += `<span class="c-dim">${m.label}</span> <span class="${c}">${it.price?.toFixed(1)}</span>  `;
            } else {
                line += `<span class="c-dim">${m.label}</span> <span class="${c}">${(it.pct||0) >= 0 ? '+' : ''}${(it.pct||0).toFixed(1)}%</span>  `;
            }
        }
        html += line;
    }
    html += '</div>';

    // --- Per-symbol rows (TUI two-line layout) ---
    const bucketNames = Object.keys(mergedBuckets);
    const groups = bucketNames.length
        ? bucketNames.map(name => ({ name, symbols: mergedBuckets[name] }))
        : [{ name: null, symbols: filtered.map(q => q.symbol) }];

    const quoteMap = {};
    filtered.forEach(q => quoteMap[q.symbol] = q);

    const earnings = data['earnings.json'] || await App.loadData('earnings.json');
    const erMap = {};
    if (earnings) for (const e of earnings) erMap[e.symbol] = e;

    for (const group of groups) {
        if (group.name) {
            html += `<div class="tt-section-title" style="margin-top:8px">${group.name}</div>`;
        }

        for (const sym of group.symbols) {
            const q = quoteMap[sym];
            if (!q) continue;
            const t = tech[sym] || {};
            const sp = sparklines[sym];
            const name = (names[sym] || '').slice(0, 19);
            const er = erMap[sym];

            // --- Line 1: Symbol  Name  Price  Change  AH ---
            const arrow = (q.pct || 0) >= 0 ? '\u25B2' : '\u25BC';
            const chgCls = (q.pct || 0) >= 0 ? 'positive' : 'negative';

            let line1 = `<span class="c-accent" style="font-weight:700">${sym}</span>`;
            line1 += `  <span class="c-dim" style="font-family:var(--font-ui)">${name}</span>`;
            line1 += `  <span style="color:#fff;font-weight:700">${Utils.fmtPrice(q.price)}</span>`;
            line1 += `  <span class="${chgCls}">${arrow}${Math.abs(q.change||0).toFixed(2)}</span>`;
            line1 += `  <span class="${chgCls}" style="opacity:0.7">(${(q.pct||0) >= 0 ? '+' : ''}${(q.pct||0).toFixed(2)}%)</span>`;

            if (q.ext_price != null) {
                const eCls = (q.ext_pct || 0) >= 0 ? 'positive' : 'negative';
                line1 += `  <span class="c-purple" style="font-weight:700">${q.ext_label || 'AH'}</span>`;
                line1 += `  <span style="color:#fff">${Utils.fmtPrice(q.ext_price)}</span>`;
                line1 += `  <span class="${eCls}">${(q.ext_pct||0) >= 0 ? '+' : ''}${(q.ext_pct||0).toFixed(1)}%</span>`;
            }

            // --- Line 2: Sparkline  RSI  52w  Earn  SMA  Vol  %H  %R ---
            const parts = [];

            // Sparkline
            parts.push(Utils.sparklineSVG(sp, 60, 14));

            // RSI — "R ##" format
            if (t.rsi != null) {
                const rc = t.rsi >= 70 ? 'negative' : t.rsi <= 30 ? 'positive' : '';
                parts.push(`<span class="${rc}">R ${t.rsi.toFixed(0)}</span>`);
            }

            // 52w range bar
            parts.push(Utils.rangeBar(t.current, t.low_52w, t.high_52w, 40));

            // Earnings countdown
            if (er && er.days_until != null) {
                const d = er.days_until;
                if (d === 0) parts.push('<span class="negative" style="font-weight:700">TODAY</span>');
                else if (d <= 7) parts.push(`<span class="negative" style="font-weight:700">${d}d</span>`);
                else if (d <= 30) parts.push(`<span class="c-amber">${d}d</span>`);
                else parts.push(`<span class="c-dim">${d}d</span>`);
            }

            // SMA crosses
            if (t.sma_50 != null) {
                parts.push(t.current > t.sma_50
                    ? '<span class="positive">&gt;50</span>'
                    : '<span class="negative">&lt;50</span>');
            }
            if (t.sma_200 != null) {
                parts.push(t.current > t.sma_200
                    ? '<span class="positive">&gt;200</span>'
                    : '<span class="negative">&lt;200</span>');
            }

            // Vol ratio
            if (t.vol_ratio != null) {
                const vc = t.vol_ratio > 2 ? 'negative' : t.vol_ratio > 1.3 ? 'c-amber' : 'c-dim';
                parts.push(`<span class="${vc}">${t.vol_ratio.toFixed(1)}xv</span>`);
            }

            // Off high
            if (t.off_high != null) {
                const hc = t.off_high > -5 ? 'positive' : t.off_high > -20 ? 'c-amber' : 'negative';
                parts.push(`<span class="${hc}">${t.off_high > 0 ? '+' : ''}${t.off_high.toFixed(0)}%H</span>`);
            }

            // RS vs bench
            if (t.rs_vs_bench != null) {
                const rsc = t.rs_vs_bench > 0 ? 'positive' : 'negative';
                parts.push(`<span class="${rsc}">${t.rs_vs_bench > 0 ? '+' : ''}${t.rs_vs_bench.toFixed(0)}%R</span>`);
            }

            let line2 = parts.filter(Boolean).join('&nbsp;&nbsp;');

            html += `<div class="dash-row"><div class="dash-line1">${line1}</div><div class="dash-line2">${line2}</div></div>`;
        }
    }

    container.innerHTML = html;
});
