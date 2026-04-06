/**
 * valuation.js — screen command: side-by-side valuation comparison.
 * Uses lookup/{SYM}.json for fundamental data.
 * Security: innerHTML from trusted pipeline data only (yfinance via GitHub Actions).
 */
App.registerPage('valuation', function(container, data, params) {
    const syms = params.symbolList || [];

    if (syms.length < 1) {
        container.innerHTML = '<div style="padding:8px"><span class="c-dim">Usage: screen SYM1 SYM2 [SYM3 ...]</span></div>';
        return;
    }

    const infos = [];
    for (const sym of syms) {
        const info = data[`lookup/${sym}.json`];
        if (info) infos.push({ symbol: sym, info });
    }

    if (!infos.length) {
        container.innerHTML = '<div style="padding:8px"><span class="c-dim">No lookup data for given symbols. Run fetch_lookup.py first.</span></div>';
        return;
    }

    const fields = [
        { key: 'currentPrice', label: 'Price', fmt: Utils.fmtPrice },
        { key: null, label: 'Change %', custom: (info) => {
            const prev = info.previousClose || info.regularMarketPreviousClose;
            const curr = info.currentPrice || info.regularMarketPrice;
            if (!prev || !curr) return '\u2014';
            return Utils.fmtPct(((curr - prev) / prev) * 100);
        }},
        { key: 'marketCap', label: 'Market Cap', fmt: Utils.fmtCap },
        { key: 'trailingPE', label: 'P/E', fmt: Utils.fmtRatio },
        { key: 'forwardPE', label: 'Fwd P/E', fmt: Utils.fmtRatio },
        { key: 'enterpriseToEbitda', label: 'EV/EBITDA', fmt: Utils.fmtRatio },
        { key: 'priceToSalesTrailing12Months', label: 'P/S', fmt: Utils.fmtRatio },
        { key: 'pegRatio', label: 'PEG', fmt: Utils.fmtRatio },
        { key: 'grossMargins', label: 'Gross Margin', fmt: (v) => (v * 100).toFixed(1) + '%' },
        { key: 'operatingMargins', label: 'Op. Margin', fmt: (v) => (v * 100).toFixed(1) + '%' },
        { key: 'profitMargins', label: 'Net Margin', fmt: (v) => (v * 100).toFixed(1) + '%' },
        { key: 'revenueGrowth', label: 'Rev Growth', fmt: (v) => (v * 100).toFixed(1) + '%' },
        { key: 'earningsGrowth', label: 'EPS Growth', fmt: (v) => (v * 100).toFixed(1) + '%' },
        { key: 'returnOnEquity', label: 'ROE', fmt: (v) => (v * 100).toFixed(1) + '%' },
        { key: 'debtToEquity', label: 'D/E', fmt: Utils.fmtRatio },
        { key: 'dividendYield', label: 'Div Yield', fmt: (v) => (v * 100).toFixed(2) + '%' },
    ];

    let html = '<div class="tt-section-title">Valuation Comparison</div>';
    html += '<table class="tt-table"><thead><tr>';
    html += '<th>Metric</th>';
    for (const s of infos) html += `<th>${Utils.symLink(s.symbol)}</th>`;
    html += '</tr></thead><tbody>';

    for (const f of fields) {
        html += '<tr>';
        html += `<td style="text-align:left;font-family:var(--font-ui)">${f.label}</td>`;
        for (const s of infos) {
            let val = '\u2014';
            if (f.custom) {
                val = f.custom(s.info);
            } else if (s.info[f.key] != null) {
                val = f.fmt(s.info[f.key]);
            }
            html += `<td>${val}</td>`;
        }
        html += '</tr>';
    }
    html += '</tbody></table>';

    container.innerHTML = html;
});
