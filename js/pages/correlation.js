/**
 * correlation.js — Correlation matrix from sparkline data.
 * Computes Pearson correlation between all watchlist symbols' daily returns.
 * Security: innerHTML from trusted pipeline data only (yfinance via GitHub Actions).
 */
App.registerPage('correlation', function(container, data) {
    const sparklines = data['sparklines.json'] || {};

    const symbols = Object.keys(sparklines).filter(s => sparklines[s] && sparklines[s].length >= 5);
    if (symbols.length < 2) {
        container.innerHTML = '<div style="padding:8px"><span class="c-dim">Need at least 2 symbols with price data for correlation.</span></div>';
        return;
    }

    // Limit to 12 symbols
    const syms = symbols.slice(0, 12);

    // Daily returns
    const returns = {};
    for (const sym of syms) {
        const prices = sparklines[sym];
        const ret = [];
        for (let i = 1; i < prices.length; i++) {
            ret.push((prices[i] - prices[i-1]) / prices[i-1]);
        }
        returns[sym] = ret;
    }

    // Pearson correlation
    function pearson(a, b) {
        const n = Math.min(a.length, b.length);
        if (n < 3) return 0;
        let sumA = 0, sumB = 0, sumAB = 0, sumA2 = 0, sumB2 = 0;
        for (let i = 0; i < n; i++) {
            sumA += a[i]; sumB += b[i];
            sumAB += a[i] * b[i];
            sumA2 += a[i] * a[i]; sumB2 += b[i] * b[i];
        }
        const num = n * sumAB - sumA * sumB;
        const den = Math.sqrt((n * sumA2 - sumA * sumA) * (n * sumB2 - sumB * sumB));
        return den === 0 ? 0 : num / den;
    }

    const matrix = [];
    for (const s1 of syms) {
        const row = [];
        for (const s2 of syms) {
            row.push(s1 === s2 ? 1.0 : pearson(returns[s1], returns[s2]));
        }
        matrix.push(row);
    }

    function corrColor(val) {
        if (val >= 0.7) return '#00cc44';
        if (val >= 0.3) return '#2a6630';
        if (val >= 0) return '#1a2a1a';
        if (val >= -0.3) return '#2a1a1a';
        return '#662a2a';
    }

    let html = '<div class="tt-section-title">Correlation Matrix (1 Month Daily Returns)</div>';
    html += `<div class="corr-grid" style="grid-template-columns: 50px repeat(${syms.length}, 1fr);max-width:${50 + syms.length * 50}px">`;

    html += '<div></div>';
    for (const sym of syms) {
        html += `<div class="corr-header">${sym}</div>`;
    }

    for (let i = 0; i < syms.length; i++) {
        html += `<div class="corr-header" style="text-align:right">${syms[i]}</div>`;
        for (let j = 0; j < syms.length; j++) {
            const val = matrix[i][j];
            const bg = corrColor(val);
            const textColor = Math.abs(val) > 0.5 ? '#000' : '#ccc';
            html += `<div class="corr-cell" style="background:${bg};color:${textColor}" title="${syms[i]} vs ${syms[j]}: ${val.toFixed(3)}">${val.toFixed(2)}</div>`;
        }
    }
    html += '</div>';

    html += '<div style="margin-top:12px;font-size:11px;color:var(--dim)">';
    html += '<span style="color:#00cc44">\u25A0</span> Strong positive (>0.7)  ';
    html += '<span style="color:#2a6630">\u25A0</span> Moderate (0.3-0.7)  ';
    html += '<span style="color:#666">\u25A0</span> Weak  ';
    html += '<span style="color:#662a2a">\u25A0</span> Negative (<-0.3)';
    html += '</div>';

    container.innerHTML = html;
});
