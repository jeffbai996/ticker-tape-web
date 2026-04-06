/**
 * lookup.js — Single-stock fundamentals deep dive (two-column layout).
 * Mirrors ticker-tape's lookup.py screen.
 * Data source: data/lookup/{SYM}.json. All content from trusted pipeline.
 */
App.registerPage('lookup', function(container, data, params) {
    const symbol = params.symbol;
    const info = data[`lookup/${symbol}.json`];

    if (!info) {
        container.innerHTML = `<div class="c-dim" style="padding:16px">No data for ${symbol}. <a href="#/">Back</a></div>`;
        return;
    }

    const row = (label, value) =>
        `<div class="detail-row"><span class="label">${label}</span><span class="value">${value}</span></div>`;

    const price = info.regularMarketPrice || info.currentPrice;
    const prevClose = info.regularMarketPreviousClose;
    const change = price && prevClose ? price - prevClose : null;
    const pct = change && prevClose ? (change / prevClose) * 100 : null;

    let html = '';

    // Header
    html += '<div class="tt-section" style="padding:12px 16px">';
    html += `<div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap">`;
    html += `<span class="c-accent" style="font-size:20px;font-weight:700">${symbol}</span>`;
    html += `<span class="c-dim">${info.shortName || info.longName || ''}</span>`;
    html += '</div>';
    html += `<div style="font-size:24px;font-weight:700;margin:4px 0">${Utils.fmtPrice(price)} ${Utils.colorChange(change, pct)}</div>`;
    if (info.preMarketPrice) {
        const pc = info.preMarketPrice - price;
        const pp = price ? (pc / price) * 100 : 0;
        html += `<div class="c-purple" style="font-size:13px">Pre: ${Utils.fmtPrice(info.preMarketPrice)} ${Utils.colorPct(pp)}</div>`;
    }
    if (info.postMarketPrice) {
        const pc = info.postMarketPrice - price;
        const pp = price ? (pc / price) * 100 : 0;
        html += `<div class="c-purple" style="font-size:13px">AH: ${Utils.fmtPrice(info.postMarketPrice)} ${Utils.colorPct(pp)}</div>`;
    }
    html += '</div>';

    html += '<div class="two-col">';

    // Left column
    html += '<div>';
    html += '<div class="tt-section"><div class="tt-section-title">Price & Volume</div>';
    html += row('Day Range', `${Utils.fmtPrice(info.dayLow)} \u2014 ${Utils.fmtPrice(info.dayHigh)}`);
    html += row('52-Week Range', `${Utils.fmtPrice(info.fiftyTwoWeekLow)} \u2014 ${Utils.fmtPrice(info.fiftyTwoWeekHigh)}`);
    const offHigh = info.fiftyTwoWeekHigh && price ? ((price - info.fiftyTwoWeekHigh) / info.fiftyTwoWeekHigh * 100).toFixed(1) + '%' : '\u2014';
    html += row('Off 52w High', `<span class="${Utils.signClass(parseFloat(offHigh))}">${offHigh}</span>`);
    html += row('Volume', Utils.fmtNum(info.volume));
    html += row('Avg Volume', Utils.fmtNum(info.averageVolume));
    html += '</div>';

    html += '<div class="tt-section"><div class="tt-section-title">Earnings</div>';
    html += row('EPS (TTM)', info.trailingEps != null ? '$' + Number(info.trailingEps).toFixed(2) : '\u2014');
    html += row('EPS (Fwd)', info.forwardEps != null ? '$' + Number(info.forwardEps).toFixed(2) : '\u2014');
    html += row('Earnings Growth', info.earningsGrowth != null ? Utils.fmtPct(info.earningsGrowth * 100) : '\u2014');
    html += '</div>';

    html += '<div class="tt-section"><div class="tt-section-title">Financials</div>';
    html += row('Revenue', Utils.fmtCap(info.totalRevenue));
    html += row('Revenue Growth', info.revenueGrowth != null ? Utils.fmtPct(info.revenueGrowth * 100) : '\u2014');
    html += row('Free Cash Flow', Utils.fmtCap(info.freeCashflow));
    html += row('Debt/Equity', Utils.fmtRatio(info.debtToEquity));
    html += row('Current Ratio', Utils.fmtRatio(info.currentRatio));
    html += row('ROE', info.returnOnEquity != null ? Utils.fmtPct(info.returnOnEquity * 100) : '\u2014');
    html += '</div>';

    html += '<div class="tt-section"><div class="tt-section-title">Other</div>';
    html += row('Beta', info.beta != null ? Number(info.beta).toFixed(2) : '\u2014');
    html += row('Dividend Yield', info.dividendYield != null ? Utils.fmtPct(info.dividendYield * 100) : '\u2014');
    const recColor = { buy: 'positive', strong_buy: 'positive', hold: 'c-amber', sell: 'negative', strong_sell: 'negative' };
    html += row('Recommendation', info.recommendationKey ? `<span class="${recColor[info.recommendationKey] || ''}">${info.recommendationKey}</span>` : '\u2014');
    if (info.targetMeanPrice) {
        const upside = price ? ((info.targetMeanPrice - price) / price * 100).toFixed(1) : null;
        html += row('Target Price', `$${Utils.fmtPrice(info.targetMeanPrice)} <span class="${Utils.signClass(parseFloat(upside))}">(${upside}%)</span>`);
    }
    html += '</div>';
    html += '</div>';

    // Right column
    html += '<div>';
    html += '<div class="tt-section"><div class="tt-section-title">Valuation</div>';
    html += row('Market Cap', Utils.fmtCap(info.marketCap));
    html += row('Enterprise Value', Utils.fmtCap(info.enterpriseValue));
    html += row('P/E (TTM)', Utils.fmtRatio(info.trailingPE));
    html += row('P/E (Fwd)', Utils.fmtRatio(info.forwardPE));
    html += row('P/S', Utils.fmtRatio(info.priceToSalesTrailing12Months));
    html += row('EV/EBITDA', Utils.fmtRatio(info.enterpriseToEbitda));
    html += row('PEG', Utils.fmtRatio(info.pegRatio));
    html += '</div>';

    html += '<div class="tt-section"><div class="tt-section-title">Margins</div>';
    html += row('Gross', info.grossMargins != null ? Utils.fmtPct(info.grossMargins * 100) : '\u2014');
    html += row('Operating', info.operatingMargins != null ? Utils.fmtPct(info.operatingMargins * 100) : '\u2014');
    html += row('Net', info.profitMargins != null ? Utils.fmtPct(info.profitMargins * 100) : '\u2014');
    html += row('EBITDA', Utils.fmtCap(info.ebitda));
    html += '</div>';

    html += '<div class="tt-section"><div class="tt-section-title">Ownership</div>';
    html += row('Shares Out', Utils.fmtCap(info.sharesOutstanding));
    html += row('Short % Float', info.shortPercentOfFloat != null ? Utils.fmtPct(info.shortPercentOfFloat * 100) : '\u2014');
    html += row('Institutional', info.heldPercentInstitutions != null ? Utils.fmtPct(info.heldPercentInstitutions * 100) : '\u2014');
    html += row('Insider', info.heldPercentInsiders != null ? Utils.fmtPct(info.heldPercentInsiders * 100) : '\u2014');
    html += '</div>';

    html += '<div class="tt-section"><div class="tt-section-title">Momentum</div>';
    if (info.fiftyDayAverage) {
        const d50 = price ? ((price - info.fiftyDayAverage) / info.fiftyDayAverage * 100) : null;
        html += row('50-Day Avg', `${Utils.fmtPrice(info.fiftyDayAverage)} <span class="${Utils.signClass(d50)}">(${d50?.toFixed(1)}%)</span>`);
    }
    if (info.twoHundredDayAverage) {
        const d200 = price ? ((price - info.twoHundredDayAverage) / info.twoHundredDayAverage * 100) : null;
        html += row('200-Day Avg', `${Utils.fmtPrice(info.twoHundredDayAverage)} <span class="${Utils.signClass(d200)}">(${d200?.toFixed(1)}%)</span>`);
    }
    if (info.fiftyTwoWeekChange != null) html += row('52-Week Return', Utils.fmtPct(info.fiftyTwoWeekChange * 100));
    const volRatio = info.volume && info.averageVolume ? info.volume / info.averageVolume : null;
    html += row('Vol Ratio', volRatio != null ? volRatio.toFixed(2) + 'x' : '\u2014');
    html += '</div>';
    html += '</div>';
    html += '</div>';

    html += `<div style="margin-top:12px"><a href="#/ta/${symbol}" class="nav-link">Technicals</a>`;
    html += `<a href="#/charts/${symbol}" class="nav-link">Charts</a></div>`;

    container.innerHTML = html;
});
