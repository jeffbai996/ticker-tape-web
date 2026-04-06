/**
 * intraday.js — Intraday 5-min bars with VWAP.
 * Uses charts/{SYM}.json "1d" data (5-min OHLCV bars).
 * Security: innerHTML from trusted pipeline data only (yfinance via GitHub Actions).
 */
App.registerPage('intraday', function(container, data, params) {
    const sym = params.symbol;
    const chartData = data[`charts/${sym}.json`];

    if (!chartData || !chartData['1d'] || !chartData['1d'].length) {
        container.innerHTML = `<div style="padding:8px"><span class="c-dim">No intraday data for ${sym}.</span></div>`;
        return;
    }

    const bars = chartData['1d'];
    const closes = bars.map(b => b.close);
    const volumes = bars.map(b => b.volume || 0);
    const highs = bars.map(b => b.high);
    const lows = bars.map(b => b.low);

    const vwap = [];
    let cumTPV = 0, cumVol = 0;
    for (const b of bars) {
        const tp = (b.high + b.low + b.close) / 3;
        cumTPV += tp * (b.volume || 0);
        cumVol += (b.volume || 0);
        vwap.push(cumVol > 0 ? cumTPV / cumVol : b.close);
    }

    const current = closes[closes.length - 1];
    const currentVWAP = vwap[vwap.length - 1];
    const high = Math.max(...highs);
    const low = Math.min(...lows);
    const totalVol = volumes.reduce((s, v) => s + v, 0);
    const vwapDiff = ((current - currentVWAP) / currentVWAP) * 100;

    let html = `<div class="tt-section-title">Intraday: ${sym}</div>`;

    const width = 500, height = 120;
    const allVals = [...closes, ...vwap];
    const minP = Math.min(...allVals) * 0.999;
    const maxP = Math.max(...allVals) * 1.001;
    const range = maxP - minP || 1;

    html += `<svg width="${width}" height="${height}" style="margin:8px 0;background:#0a0a0a;border-radius:3px">`;
    const pricePoints = closes.map((p, i) => {
        const x = (i / (closes.length - 1)) * (width - 10) + 5;
        const y = height - ((p - minP) / range) * (height - 10) - 5;
        return `${x},${y}`;
    }).join(' ');
    html += `<polyline points="${pricePoints}" fill="none" stroke="#00ff00" stroke-width="1.5"/>`;

    const vwapPoints = vwap.map((p, i) => {
        const x = (i / (vwap.length - 1)) * (width - 10) + 5;
        const y = height - ((p - minP) / range) * (height - 10) - 5;
        return `${x},${y}`;
    }).join(' ');
    html += `<polyline points="${vwapPoints}" fill="none" stroke="#ffc800" stroke-width="1" stroke-dasharray="4"/>`;
    html += '</svg>';

    html += '<div style="display:flex;gap:16px;margin-bottom:8px;font-size:12px">';
    html += '<span><span class="c-green">\u2501</span> Price</span>';
    html += '<span><span class="c-amber">- -</span> VWAP</span>';
    html += '</div>';

    html += '<div class="two-col" style="max-width:500px">';
    html += '<div>';
    html += `<div class="detail-row"><span class="label">Current</span><span class="value">${Utils.fmtPrice(current)}</span></div>`;
    html += `<div class="detail-row"><span class="label">VWAP</span><span class="value">${Utils.fmtPrice(currentVWAP)}</span></div>`;
    html += `<div class="detail-row"><span class="label">vs VWAP</span><span class="value ${vwapDiff >= 0 ? 'positive' : 'negative'}">${vwapDiff >= 0 ? '+' : ''}${vwapDiff.toFixed(2)}%</span></div>`;
    html += '</div><div>';
    html += `<div class="detail-row"><span class="label">High</span><span class="value">${Utils.fmtPrice(high)}</span></div>`;
    html += `<div class="detail-row"><span class="label">Low</span><span class="value">${Utils.fmtPrice(low)}</span></div>`;
    html += `<div class="detail-row"><span class="label">Volume</span><span class="value">${Utils.fmtNum(totalVol)}</span></div>`;
    html += '</div></div>';

    html += `<div style="margin-top:12px;display:flex;gap:8px">`;
    html += `<a href="#/charts/${sym}" class="sym-link" style="font-size:12px">Full Chart</a>`;
    html += `<a href="#/ta/${sym}" class="sym-link" style="font-size:12px">Technicals</a>`;
    html += `<a href="#/lookup/${sym}" class="sym-link" style="font-size:12px">Fundamentals</a>`;
    html += '</div>';

    container.innerHTML = html;
});
