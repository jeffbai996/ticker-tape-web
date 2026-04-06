/**
 * short.js — Short interest detail from lookup data.
 * Security: innerHTML from trusted pipeline data only (yfinance via GitHub Actions).
 */
App.registerPage('short', function(container, data, params) {
    const sym = params.symbol;
    const info = data[`lookup/${sym}.json`];

    if (!info) {
        container.innerHTML = `<div style="padding:8px"><span class="c-dim">No lookup data for ${sym}. Run fetch_lookup.py first.</span></div>`;
        return;
    }

    let html = `<div class="tt-section-title">Short Interest: ${sym}</div>`;
    html += `<div style="font-family:var(--font-ui);color:var(--dim);margin-bottom:8px">${info.longName || info.shortName || ''}</div>`;

    const row = (label, value, cls) =>
        `<div class="detail-row"><span class="label">${label}</span><span class="value ${cls || ''}">${value}</span></div>`;

    let momChange = '\u2014';
    if (info.sharesShort != null && info.sharesShortPriorMonth != null && info.sharesShortPriorMonth > 0) {
        const pct = ((info.sharesShort - info.sharesShortPriorMonth) / info.sharesShortPriorMonth * 100);
        momChange = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
    }

    html += '<div style="max-width:400px">';
    html += row('Short Ratio', info.shortRatio != null ? info.shortRatio.toFixed(2) + ' days' : '\u2014');
    html += row('Short % of Float', info.shortPercentOfFloat != null ? (info.shortPercentOfFloat * 100).toFixed(2) + '%' : '\u2014');
    html += row('Shares Short', info.sharesShort != null ? Utils.fmtNum(info.sharesShort) : '\u2014');
    html += row('Prior Month', info.sharesShortPriorMonth != null ? Utils.fmtNum(info.sharesShortPriorMonth) : '\u2014');
    html += row('MoM Change', momChange, momChange.startsWith('+') ? 'negative' : momChange.startsWith('-') ? 'positive' : '');
    html += row('Short Date', info.dateShortInterest ? new Date(info.dateShortInterest * 1000).toLocaleDateString() : '\u2014');
    html += row('Shares Outstanding', info.sharesOutstanding != null ? Utils.fmtNum(info.sharesOutstanding) : '\u2014');
    html += row('Float', info.floatShares != null ? Utils.fmtNum(info.floatShares) : '\u2014');
    html += '</div>';

    html += `<div style="margin-top:12px"><a href="#/lookup/${sym}" class="sym-link" style="font-size:12px">Full Fundamentals</a></div>`;

    container.innerHTML = html;
});
