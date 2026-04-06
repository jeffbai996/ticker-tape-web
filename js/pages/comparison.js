/**
 * comparison.js — vs command: normalized performance comparison.
 * Uses sparkline data (1mo daily closes) to compute relative performance.
 * Security: innerHTML from trusted pipeline data only (yfinance via GitHub Actions).
 */
App.registerPage('comparison', function(container, data, params) {
    const sparklines = data['sparklines.json'] || {};
    const syms = params.symbolList || [];

    if (syms.length < 2) {
        container.innerHTML = '<div style="padding:8px"><span class="c-dim">Usage: vs SYM1 SYM2 [SYM3 ...]</span></div>';
        return;
    }

    const results = [];
    for (const sym of syms) {
        const prices = sparklines[sym];
        if (!prices || prices.length < 2) continue;
        const first = prices[0];
        const last = prices[prices.length - 1];
        const pctReturn = ((last - first) / first) * 100;
        const normalized = prices.map(p => ((p - first) / first) * 100);
        results.push({ symbol: sym, pctReturn, normalized, prices });
    }

    if (!results.length) {
        container.innerHTML = '<div style="padding:8px"><span class="c-dim">No sparkline data for given symbols.</span></div>';
        return;
    }

    results.sort((a, b) => b.pctReturn - a.pctReturn);

    let html = '<div class="tt-section-title">Symbol Comparison (1 Month)</div>';

    const width = 400, height = 100;
    const maxLen = Math.max(...results.map(r => r.normalized.length));
    const allVals = results.flatMap(r => r.normalized);
    const minVal = Math.min(...allVals);
    const maxVal = Math.max(...allVals);
    const range = maxVal - minVal || 1;

    const colors = ['#00ff00', '#00c8ff', '#ffc800', '#c864ff', '#ff3232', '#ff8800', '#00ffaa', '#ff66cc'];
    html += `<svg width="${width}" height="${height}" style="margin:8px 0;background:#0a0a0a;border-radius:3px">`;
    const zeroY = height - ((0 - minVal) / range) * (height - 10) - 5;
    html += `<line x1="0" y1="${zeroY}" x2="${width}" y2="${zeroY}" stroke="#333" stroke-dasharray="4"/>`;

    for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const color = colors[i % colors.length];
        const points = r.normalized.map((v, j) => {
            const x = (j / (maxLen - 1)) * (width - 10) + 5;
            const y = height - ((v - minVal) / range) * (height - 10) - 5;
            return `${x},${y}`;
        }).join(' ');
        html += `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5"/>`;
    }
    html += '</svg>';

    html += '<div style="display:flex;gap:12px;margin-bottom:8px;font-size:12px">';
    for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const color = colors[i % colors.length];
        html += `<span><span style="color:${color}">\u25CF</span> ${r.symbol}</span>`;
    }
    html += '</div>';

    html += '<table class="tt-table"><thead><tr>';
    html += '<th>Rank</th><th>Symbol</th><th>Return</th><th>Start</th><th>End</th></tr></thead><tbody>';
    for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const cls = r.pctReturn >= 0 ? 'positive' : 'negative';
        html += '<tr>';
        html += `<td>${i + 1}</td>`;
        html += `<td>${Utils.symLink(r.symbol)}</td>`;
        html += `<td class="${cls}">${r.pctReturn >= 0 ? '+' : ''}${r.pctReturn.toFixed(2)}%</td>`;
        html += `<td>${Utils.fmtPrice(r.prices[0])}</td>`;
        html += `<td>${Utils.fmtPrice(r.prices[r.prices.length - 1])}</td>`;
        html += '</tr>';
    }
    html += '</tbody></table>';

    container.innerHTML = html;
});
