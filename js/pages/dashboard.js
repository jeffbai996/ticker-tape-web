/**
 * dashboard.js — Main thesis-style dashboard with summary header + per-symbol rows.
 * Mirrors ticker-tape's thesis.py screen.
 *
 * Security note: innerHTML is used to render data from our own trusted JSON pipeline
 * (yfinance market data committed by GitHub Actions). No user-generated content.
 */
App.registerPage('dashboard', function(container, data) {
    const quotes = data['quotes.json'];
    const tech = data['technicals.json'] || {};
    const sparklines = data['sparklines.json'] || {};
    const meta = data['meta.json'] || {};
    const names = meta.names || {};
    const buckets = meta.buckets || {};

    if (!quotes || !quotes.length) {
        container.innerHTML = '<div class="text-dim p-4">Awaiting first data fetch...</div>';
        return;
    }

    let html = '';

    // --- Summary header ---
    const count = quotes.length;
    const gainers = quotes.filter(q => q.pct > 0).length;
    const losers = quotes.filter(q => q.pct < 0).length;
    const avgPct = quotes.reduce((s, q) => s + (q.pct || 0), 0) / count;
    const sorted = [...quotes].sort((a, b) => (b.pct || 0) - (a.pct || 0));
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];

    let aboveSma50 = 0, aboveSma200 = 0, oversold = 0, overbought = 0;
    let totalRs = 0, rsCount = 0;
    for (const q of quotes) {
        const t = tech[q.symbol];
        if (!t) continue;
        if (t.sma_50 && t.current > t.sma_50) aboveSma50++;
        if (t.sma_200 && t.current > t.sma_200) aboveSma200++;
        if (t.rsi != null && t.rsi <= 30) oversold++;
        if (t.rsi != null && t.rsi >= 70) overbought++;
        if (t.rs_vs_bench != null) { totalRs += t.rs_vs_bench; rsCount++; }
    }

    html += '<div class="summary-bar">';
    html += `<div class="summary-item"><span class="summary-label">Symbols</span><span class="summary-value">${count}</span></div>`;
    html += `<div class="summary-item"><span class="summary-label">Avg Change</span><span class="summary-value ${Utils.signClass(avgPct)}">${Utils.fmtPct(avgPct)}</span></div>`;
    html += `<div class="summary-item"><span class="summary-label">Gainers</span><span class="summary-value positive">${gainers} \u25B2</span></div>`;
    html += `<div class="summary-item"><span class="summary-label">Losers</span><span class="summary-value negative">${losers} \u25BC</span></div>`;
    html += `<div class="summary-item"><span class="summary-label">Best</span><span class="summary-value positive">${best.symbol} ${Utils.fmtPct(best.pct)}</span></div>`;
    html += `<div class="summary-item"><span class="summary-label">Worst</span><span class="summary-value negative">${worst.symbol} ${Utils.fmtPct(worst.pct)}</span></div>`;
    html += `<div class="summary-item"><span class="summary-label">&gt;50d</span><span class="summary-value">${aboveSma50}/${count}</span></div>`;
    html += `<div class="summary-item"><span class="summary-label">&gt;200d</span><span class="summary-value">${aboveSma200}/${count}</span></div>`;
    if (oversold) html += `<div class="summary-item"><span class="summary-label">Oversold</span><span class="summary-value positive">${oversold}</span></div>`;
    if (overbought) html += `<div class="summary-item"><span class="summary-label">Overbought</span><span class="summary-value negative">${overbought}</span></div>`;
    if (rsCount) html += `<div class="summary-item"><span class="summary-label">Avg RS</span><span class="summary-value ${Utils.signClass(totalRs/rsCount)}">${(totalRs/rsCount).toFixed(1)}%</span></div>`;
    html += '</div>';

    // --- Per-group or flat list ---
    const bucketNames = Object.keys(buckets);
    const groups = bucketNames.length
        ? bucketNames.map(name => ({ name, symbols: buckets[name] }))
        : [{ name: null, symbols: quotes.map(q => q.symbol) }];

    const quoteMap = {};
    quotes.forEach(q => quoteMap[q.symbol] = q);

    for (const group of groups) {
        if (group.name) {
            html += `<div class="tt-section-title" style="margin-top:12px">${group.name}</div>`;
        }
        html += '<table class="tt-table"><thead><tr>';
        html += '<th>Symbol</th><th>Name</th><th>Price</th><th>Change</th>';
        html += '<th>Sparkline</th><th>RSI</th><th>52w</th><th>SMA</th><th>Vol</th><th>Off High</th><th>RS</th>';
        html += '</tr></thead><tbody>';

        for (const sym of group.symbols) {
            const q = quoteMap[sym];
            if (!q) continue;
            const t = tech[sym] || {};
            const sp = sparklines[sym];
            const name = names[sym] || '';

            let extHtml = '';
            if (q.ext_price) {
                extHtml = ` <span class="text-purple text-dim" style="font-size:11px">${q.ext_label} ${Utils.fmtPrice(q.ext_price)} ${Utils.fmtPct(q.ext_pct)}</span>`;
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

            html += '<tr>';
            html += `<td>${Utils.symLink(sym)}</td>`;
            html += `<td class="text-dim" style="max-width:140px;overflow:hidden;text-overflow:ellipsis">${name}</td>`;
            html += `<td>${Utils.fmtPrice(q.price)}${extHtml}</td>`;
            html += `<td>${Utils.colorChange(q.change, q.pct)}</td>`;
            html += `<td>${Utils.sparklineSVG(sp, 80, 20)}</td>`;
            html += `<td class="${Utils.rsiColor(t.rsi)}">${t.rsi != null ? t.rsi.toFixed(0) : '\u2014'}</td>`;
            html += `<td>${Utils.rangeBar(t.current, t.low_52w, t.high_52w, 60)}</td>`;
            html += `<td>${smaHtml || '\u2014'}</td>`;
            html += `<td>${t.vol_ratio != null ? t.vol_ratio.toFixed(1) + 'x' : '\u2014'}</td>`;
            html += `<td class="${Utils.signClass(t.off_high)}">${t.off_high != null ? t.off_high.toFixed(1) + '%' : '\u2014'}</td>`;
            html += `<td class="${Utils.signClass(t.rs_vs_bench)}">${t.rs_vs_bench != null ? (t.rs_vs_bench > 0 ? '+' : '') + t.rs_vs_bench.toFixed(1) + '%' : '\u2014'}</td>`;
            html += '</tr>';
        }
        html += '</tbody></table>';
    }

    container.innerHTML = html;
});
