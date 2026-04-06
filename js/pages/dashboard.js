/**
 * dashboard.js — Main thesis-style dashboard with TUI-format header + per-symbol rows.
 * Mirrors ticker-tape's thesis.py screen closely.
 *
 * Security note: innerHTML is used to render data from our own trusted JSON pipeline
 * (yfinance market data committed by GitHub Actions). No user-generated content.
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

    // Apply watchlist filter
    const filtered = typeof Watchlist !== 'undefined' ? Watchlist.filter(quotes) : quotes;

    // Merge localStorage groups with pipeline buckets
    const localGroups = typeof Groups !== 'undefined' ? Groups.load() : {};
    const mergedBuckets = Object.keys(localGroups).length ? localGroups : buckets;

    let html = '';

    // --- Thesis header (TUI-style) ---
    const count = filtered.length;
    const gainers = filtered.filter(q => q.pct > 0).length;
    const losers = filtered.filter(q => q.pct < 0).length;
    const avgPct = filtered.reduce((s, q) => s + (q.pct || 0), 0) / count;
    const sorted = [...filtered].sort((a, b) => (b.pct || 0) - (a.pct || 0));
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];

    let aboveSma50 = 0, belowSma50 = 0, aboveSma200 = 0, belowSma200 = 0;
    let oversold = 0, overbought = 0, totalRs = 0, rsCount = 0;
    let totalOffHigh = 0, offHighCount = 0, totalVol = 0, volCount = 0;
    for (const q of filtered) {
        const t = tech[q.symbol];
        if (!t) continue;
        if (t.sma_50 != null) { if (t.current > t.sma_50) aboveSma50++; else belowSma50++; }
        if (t.sma_200 != null) { if (t.current > t.sma_200) aboveSma200++; else belowSma200++; }
        if (t.rsi != null && t.rsi <= 30) oversold++;
        if (t.rsi != null && t.rsi >= 70) overbought++;
        if (t.rs_vs_bench != null) { totalRs += t.rs_vs_bench; rsCount++; }
        if (t.off_high != null) { totalOffHigh += t.off_high; offHighCount++; }
        if (t.vol_ratio != null) { totalVol += t.vol_ratio; volCount++; }
    }

    const avgCls = avgPct >= 0 ? 'positive' : 'negative';
    const avgSign = avgPct >= 0 ? '+' : '';

    html += '<div class="thesis-header">';
    html += `<div class="thesis-title">== THESIS DASHBOARD ==</div>`;
    html += `<span class="c-dim">Positions:</span> ${count}  `;
    html += `<span class="c-dim">Avg:</span> <span class="${avgCls}">${avgSign}${avgPct.toFixed(2)}%</span>  `;
    html += `<span class="positive">\u25B2${gainers}</span> <span class="negative">\u25BC${losers}</span>\n`;
    html += `<span class="c-dim">Best:</span> <span class="positive">${best.symbol} +${(best.pct||0).toFixed(2)}%</span>  `;
    html += `<span class="c-dim">Worst:</span> <span class="negative">${worst.symbol} ${(worst.pct||0).toFixed(2)}%</span>\n`;
    html += `<span class="c-dim">SMA50:</span> <span class="positive">\u25B2${aboveSma50} above</span>  <span class="negative">\u25BC${belowSma50} below</span>\n`;
    html += `<span class="c-dim">SMA200:</span> <span class="positive">\u25B2${aboveSma200} above</span>  <span class="negative">\u25BC${belowSma200} below</span>\n`;
    if (offHighCount) html += `<span class="c-dim">Avg off-high:</span> <span class="negative">${(totalOffHigh/offHighCount).toFixed(0)}%H</span>\n`;
    if (rsCount) html += `<span class="c-dim">Avg RS:</span> <span class="${totalRs/rsCount >= 0 ? 'positive' : 'negative'}">${totalRs/rsCount >= 0 ? '+' : ''}${(totalRs/rsCount).toFixed(1)}%R</span>\n`;

    // Market context row — load from market.json if available
    const market = data['market.json'] || await App.loadData('market.json');
    if (market) {
        const mLookup = {};
        for (const items of Object.values(market)) {
            if (!Array.isArray(items)) continue;
            for (const item of items) mLookup[item.symbol] = item;
        }
        const mkItems = [
            { key: '^GSPC', label: 'SP' }, { key: '^VIX', label: 'V' },
            { key: 'DX-Y.NYB', label: 'DXY' }, { key: '^TNX', label: '10Y' },
            { key: 'CL=F', label: 'W' }, { key: 'GC=F', label: 'G' },
            { key: '^SOX', label: 'SO' }, { key: 'BTC-USD', label: 'BTC' },
        ];
        let mkLine = '<span class="c-dim">Market:</span> ';
        for (const mi of mkItems) {
            const item = mLookup[mi.key];
            if (!item) continue;
            const cls = (item.pct || 0) >= 0 ? 'positive' : 'negative';
            mkLine += `<span class="c-dim">${mi.label}</span> <span class="${cls}">${item.pct >= 0 ? '+' : ''}${(item.pct||0).toFixed(1)}%</span>  `;
        }
        html += mkLine;
    }
    html += '</div>';

    // --- Per-group or flat list ---
    const bucketNames = Object.keys(mergedBuckets);
    const groups = bucketNames.length
        ? bucketNames.map(name => ({ name, symbols: mergedBuckets[name] }))
        : [{ name: null, symbols: filtered.map(q => q.symbol) }];

    const quoteMap = {};
    filtered.forEach(q => quoteMap[q.symbol] = q);

    // Load earnings for days-until column
    const earnings = data['earnings.json'] || await App.loadData('earnings.json');
    const earningsMap = {};
    if (earnings) for (const e of earnings) earningsMap[e.symbol] = e;

    for (const group of groups) {
        if (group.name) {
            html += `<div class="tt-section-title" style="margin-top:12px">${group.name}</div>`;
        }
        html += '<table class="tt-table"><thead><tr>';
        html += '<th>Symbol</th><th>Name</th><th>Price</th><th>Change</th>';
        html += '<th>Sparkline</th><th>RSI</th><th>52w</th><th>Earn</th><th>SMA</th><th>Vol</th><th>Off High</th><th>RS</th>';
        html += '</tr></thead><tbody>';

        for (const sym of group.symbols) {
            const q = quoteMap[sym];
            if (!q) continue;
            const t = tech[sym] || {};
            const sp = sparklines[sym];
            const name = names[sym] || '';
            const er = earningsMap[sym];

            let extHtml = '';
            if (q.ext_price) {
                extHtml = ` <span class="c-purple" style="font-size:11px">${q.ext_label || 'AH'} ${Utils.fmtPrice(q.ext_price)} ${Utils.fmtPct(q.ext_pct)}</span>`;
            }

            let smaHtml = '';
            if (t.sma_50 != null) {
                smaHtml += t.current > t.sma_50
                    ? '<span class="positive">&gt;50</span> '
                    : '<span class="negative">&lt;50</span> ';
            }
            if (t.sma_200 != null) {
                smaHtml += t.current > t.sma_200
                    ? '<span class="positive">&gt;200</span>'
                    : '<span class="negative">&lt;200</span>';
            }

            // Earnings days
            let erHtml = '\u2014';
            if (er && er.days_until != null) {
                const erCls = er.days_until <= 7 ? 'negative' : er.days_until <= 30 ? 'c-amber' : 'c-dim';
                erHtml = `<span class="${erCls}">${er.days_until}d</span>`;
            }

            html += '<tr>';
            html += `<td>${Utils.symLink(sym)}</td>`;
            html += `<td class="c-dim" style="max-width:140px;overflow:hidden;text-overflow:ellipsis;font-family:var(--font-ui)">${name}</td>`;
            html += `<td>${Utils.fmtPrice(q.price)}${extHtml}</td>`;
            html += `<td>${Utils.colorChange(q.change, q.pct)}</td>`;
            html += `<td>${Utils.sparklineSVG(sp, 80, 20)}</td>`;
            html += `<td class="${Utils.rsiColor(t.rsi)}" title="RSI: ${t.rsi != null ? t.rsi.toFixed(1) : 'N/A'}">R ${t.rsi != null ? t.rsi.toFixed(0) : '\u2014'}</td>`;
            html += `<td>${Utils.rangeBar(t.current, t.low_52w, t.high_52w, 60)}</td>`;
            html += `<td>${erHtml}</td>`;
            html += `<td>${smaHtml || '\u2014'}</td>`;
            html += `<td>${t.vol_ratio != null ? t.vol_ratio.toFixed(1) + 'x' : '\u2014'}</td>`;
            html += `<td class="${Utils.signClass(t.off_high)}" title="Off 52w high">${t.off_high != null ? t.off_high.toFixed(0) + '%H' : '\u2014'}</td>`;
            html += `<td class="${Utils.signClass(t.rs_vs_bench)}" title="Relative strength vs benchmark">${t.rs_vs_bench != null ? (t.rs_vs_bench > 0 ? '+' : '') + t.rs_vs_bench.toFixed(0) + '%R' : '\u2014'}</td>`;
            html += '</tr>';
        }
        html += '</tbody></table>';
    }

    container.innerHTML = html;
});
