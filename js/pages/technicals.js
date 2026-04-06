/**
 * technicals.js — Per-symbol technical analysis.
 * Mirrors ticker-tape's technicals.py screen.
 * Data source: data/technicals.json. All content from trusted pipeline.
 */
App.registerPage('technicals', function(container, data, params) {
    const allTech = data['technicals.json'];
    const symbol = params.symbol;

    if (!allTech || !symbol) {
        container.innerHTML = '<div class="c-dim" style="padding:16px">No technicals data.</div>';
        return;
    }

    const t = allTech[symbol];
    if (!t) {
        container.innerHTML = `<div class="c-dim" style="padding:16px">No technicals for ${symbol}. <a href="#/">Back</a></div>`;
        return;
    }

    const row = (label, value, cls) =>
        `<div class="detail-row"><span class="label">${label}</span><span class="value ${cls || ''}">${value}</span></div>`;

    const pctDist = (current, avg) => {
        if (current == null || avg == null || avg === 0) return '\u2014';
        const d = ((current - avg) / avg) * 100;
        return `${Utils.fmtPrice(avg)} <span class="${Utils.signClass(d)}">(${d >= 0 ? '+' : ''}${d.toFixed(1)}%)</span>`;
    };

    let html = `<div class="tt-section-title">Technicals \u2014 ${Utils.symLink(symbol, 'lookup')}</div>`;
    html += '<div class="two-col">';

    // Left column
    html += '<div>';
    html += '<div class="tt-section"><div class="tt-section-title">Moving Averages</div>';
    html += row('Current', Utils.fmtPrice(t.current));
    html += row('SMA 20', pctDist(t.current, t.sma_20));
    html += row('SMA 50', pctDist(t.current, t.sma_50));
    html += row('SMA 200', pctDist(t.current, t.sma_200));
    html += '</div>';

    html += '<div class="tt-section"><div class="tt-section-title">MACD (12, 26, 9)</div>';
    html += row('MACD', t.macd != null ? t.macd.toFixed(2) : '\u2014');
    html += row('Signal', t.macd_signal != null ? t.macd_signal.toFixed(2) : '\u2014');
    html += row('Histogram', t.macd_histogram != null ? t.macd_histogram.toFixed(2) : '\u2014', Utils.signClass(t.macd_histogram));
    if (t.macd_crossover) {
        const cls = t.macd_crossover === 'bullish' ? 'positive' : 'negative';
        html += row('Crossover', `<span class="${cls}">${t.macd_crossover}</span>`);
    }
    html += '</div>';

    html += '<div class="tt-section"><div class="tt-section-title">Volatility</div>';
    html += row('ATR (14)', t.atr != null ? '$' + t.atr.toFixed(2) : '\u2014');
    html += row('ATR %', t.atr_pct != null ? t.atr_pct.toFixed(2) + '%' : '\u2014');
    html += '</div>';
    html += '</div>';

    // Right column
    html += '<div>';
    html += '<div class="tt-section"><div class="tt-section-title">Momentum</div>';
    html += row('RSI (14)', t.rsi != null
        ? `<span class="${Utils.rsiColor(t.rsi)}">${t.rsi.toFixed(1)}${t.rsi >= 70 ? ' OB' : t.rsi <= 30 ? ' OS' : ''}</span>` : '\u2014');
    html += row('RS vs QQQ', t.rs_vs_bench != null
        ? `<span class="${Utils.signClass(t.rs_vs_bench)}">${t.rs_vs_bench > 0 ? '+' : ''}${t.rs_vs_bench.toFixed(1)}%</span>` : '\u2014');
    html += '</div>';

    html += '<div class="tt-section"><div class="tt-section-title">Bollinger Bands (20, 2)</div>';
    html += row('Upper', t.bb_upper != null ? Utils.fmtPrice(t.bb_upper) : '\u2014');
    html += row('Lower', t.bb_lower != null ? Utils.fmtPrice(t.bb_lower) : '\u2014');
    html += row('Width', t.bb_width != null ? t.bb_width.toFixed(2) + '%' : '\u2014');
    html += row('%B', t.bb_pct_b != null ? t.bb_pct_b.toFixed(2) : '\u2014');
    html += '</div>';

    html += '<div class="tt-section"><div class="tt-section-title">Volume & Range</div>';
    html += row('Volume', Utils.fmtNum(t.current_vol));
    html += row('Avg Vol (20d)', Utils.fmtNum(t.avg_vol_20));
    const vrCls = t.vol_ratio > 2 ? 'negative' : t.vol_ratio > 1.5 ? 'c-amber' : '';
    html += row('Vol Ratio', t.vol_ratio != null ? `<span class="${vrCls}">${t.vol_ratio.toFixed(2)}x</span>` : '\u2014');
    html += row('52w High', t.high_52w != null ? `${Utils.fmtPrice(t.high_52w)} <span class="${Utils.signClass(t.off_high)}">(${t.off_high?.toFixed(1)}%)</span>` : '\u2014');
    html += row('52w Low', t.low_52w != null ? `${Utils.fmtPrice(t.low_52w)} <span class="positive">(+${t.off_low?.toFixed(1)}%)</span>` : '\u2014');
    html += '</div>';
    html += '</div>';
    html += '</div>';

    if (t.trend_signals && t.trend_signals.length) {
        html += '<div class="tt-section"><div class="tt-section-title">Signals</div>';
        html += '<div style="display:flex;flex-wrap:wrap;gap:6px">';
        for (const sig of t.trend_signals) {
            const cls = /above|golden|bullish/i.test(sig) ? 'positive' : /below|death|bearish/i.test(sig) ? 'negative' : 'c-dim';
            html += `<span class="tt-badge ${cls}">${sig}</span>`;
        }
        html += '</div></div>';
    }

    html += `<div style="margin-top:12px"><a href="#/charts/${symbol}" class="nav-link">Charts</a>`;
    html += `<a href="#/lookup/${symbol}" class="nav-link">Fundamentals</a></div>`;

    container.innerHTML = html;
});
