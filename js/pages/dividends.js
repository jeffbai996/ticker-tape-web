/**
 * dividends.js — div command: dividend detail from lookup data.
 * Security: innerHTML from trusted pipeline data only (yfinance via GitHub Actions).
 */
App.registerPage('dividends', function(container, data, params) {
    const sym = params.symbol;
    const info = data[`lookup/${sym}.json`];

    if (!info) {
        container.innerHTML = `<div style="padding:8px"><span class="c-dim">No lookup data for ${sym}. Run fetch_lookup.py first.</span></div>`;
        return;
    }

    let html = `<div class="tt-section-title">Dividends: ${sym}</div>`;
    html += `<div style="font-family:var(--font-ui);color:var(--dim);margin-bottom:8px">${info.longName || info.shortName || ''}</div>`;

    const row = (label, value) =>
        `<div class="detail-row"><span class="label">${label}</span><span class="value">${value}</span></div>`;

    html += '<div style="max-width:400px">';
    html += row('Dividend Yield', info.dividendYield != null ? (info.dividendYield * 100).toFixed(2) + '%' : '\u2014');
    html += row('Dividend Rate', info.dividendRate != null ? '$' + info.dividendRate.toFixed(2) : '\u2014');
    html += row('Ex-Dividend Date', info.exDividendDate ? new Date(info.exDividendDate * 1000).toLocaleDateString() : '\u2014');
    html += row('Payout Ratio', info.payoutRatio != null ? (info.payoutRatio * 100).toFixed(1) + '%' : '\u2014');
    html += row('5Y Avg Yield', info.fiveYearAvgDividendYield != null ? info.fiveYearAvgDividendYield.toFixed(2) + '%' : '\u2014');
    html += row('Trailing Annual Rate', info.trailingAnnualDividendRate != null ? '$' + info.trailingAnnualDividendRate.toFixed(2) : '\u2014');
    html += row('Trailing Annual Yield', info.trailingAnnualDividendYield != null ? (info.trailingAnnualDividendYield * 100).toFixed(2) + '%' : '\u2014');
    html += '</div>';

    html += `<div style="margin-top:12px"><a href="#/lookup/${sym}" class="sym-link" style="font-size:12px">Full Fundamentals</a></div>`;

    container.innerHTML = html;
});
