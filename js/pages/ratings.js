/**
 * ratings.js — Analyst ratings and price targets from lookup data.
 * Security: innerHTML from trusted pipeline data only (yfinance via GitHub Actions).
 */
App.registerPage('ratings', function(container, data, params) {
    const sym = params.symbol;
    const info = data[`lookup/${sym}.json`];

    if (!info) {
        container.innerHTML = `<div style="padding:8px"><span class="c-dim">No lookup data for ${sym}. Run fetch_lookup.py first.</span></div>`;
        return;
    }

    let html = `<div class="tt-section-title">Analyst Ratings: ${sym}</div>`;
    html += `<div style="font-family:var(--font-ui);color:var(--dim);margin-bottom:8px">${info.longName || info.shortName || ''}</div>`;

    const row = (label, value, cls) =>
        `<div class="detail-row"><span class="label">${label}</span><span class="value ${cls || ''}">${value}</span></div>`;

    const recKey = info.recommendationKey || '';
    const recColors = { 'strong_buy': 'positive', 'buy': 'positive', 'hold': 'c-amber', 'sell': 'negative', 'strong_sell': 'negative' };
    const recLabels = { 'strong_buy': 'Strong Buy', 'buy': 'Buy', 'hold': 'Hold', 'sell': 'Sell', 'strong_sell': 'Strong Sell' };

    const currentPrice = info.currentPrice || info.regularMarketPrice;
    let upside = '\u2014';
    if (currentPrice && info.targetMeanPrice) {
        const pct = ((info.targetMeanPrice - currentPrice) / currentPrice * 100);
        upside = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
    }

    html += '<div style="max-width:400px">';
    html += row('Recommendation', recLabels[recKey] || recKey || '\u2014', recColors[recKey] || '');
    html += row('Mean Score', info.recommendationMean != null ? info.recommendationMean.toFixed(2) + ' / 5.0' : '\u2014');
    html += row('# Analysts', info.numberOfAnalystOpinions != null ? String(info.numberOfAnalystOpinions) : '\u2014');
    html += row('Current Price', currentPrice != null ? Utils.fmtPrice(currentPrice) : '\u2014');
    html += row('Target Mean', info.targetMeanPrice != null ? Utils.fmtPrice(info.targetMeanPrice) : '\u2014');
    html += row('Target High', info.targetHighPrice != null ? Utils.fmtPrice(info.targetHighPrice) : '\u2014');
    html += row('Target Low', info.targetLowPrice != null ? Utils.fmtPrice(info.targetLowPrice) : '\u2014');
    html += row('Target Median', info.targetMedianPrice != null ? Utils.fmtPrice(info.targetMedianPrice) : '\u2014');
    html += row('Upside / Downside', upside, upside.startsWith('+') ? 'positive' : upside.startsWith('-') ? 'negative' : '');
    html += '</div>';

    html += `<div style="margin-top:12px"><a href="#/lookup/${sym}" class="sym-link" style="font-size:12px">Full Fundamentals</a></div>`;

    container.innerHTML = html;
});
