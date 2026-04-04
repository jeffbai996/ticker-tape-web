/**
 * sidebar.js — Watchlist + Pulse stats panel.
 * Mirrors the TUI's left sidebar exactly.
 * Data source: trusted pipeline JSON (quotes, technicals, sparklines, meta).
 * All innerHTML content is built from our own yfinance data pipeline — no user input.
 */
const Sidebar = (() => {

    async function render() {
        const [quotes, tech, sparklines, meta] = await Promise.all([
            App.loadData('quotes.json'),
            App.loadData('technicals.json'),
            App.loadData('sparklines.json'),
            App.loadData('meta.json'),
        ]);

        renderWatchlist(quotes, tech, sparklines, meta);
        renderPulse(quotes);
        renderUpdated(meta);
    }

    function renderWatchlist(quotes, tech, sparklines, meta) {
        const el = document.getElementById('watchlist');
        if (!quotes || !quotes.length) {
            el.innerHTML = '<div class="c-dim" style="padding:8px">No data</div>';
            return;
        }

        let html = '';
        for (const q of quotes) {
            const sp = sparklines?.[q.symbol];
            const changeCls = (q.pct || 0) >= 0 ? 'positive' : 'negative';
            const arrow = (q.pct || 0) >= 0 ? '\u25B2' : '\u25BC';

            html += `<div class="wl-item" onclick="location.hash='#/lookup/${q.symbol}'">`;
            html += '<div class="wl-row1">';
            html += `<span class="wl-sym">${q.symbol}</span>`;
            html += `<span class="wl-price">${Utils.fmtPrice(q.price)}</span>`;
            html += `<span class="${changeCls}">${arrow}${Math.abs(q.pct || 0).toFixed(1)}%</span>`;
            html += '</div>';
            html += '<div class="wl-row2">';
            html += Utils.sparklineSVG(sp, 50, 14);
            if (q.ext_price != null) {
                const extCls = (q.ext_pct || 0) >= 0 ? 'positive' : 'negative';
                html += `<span class="wl-ext"><span class="wl-ext-label">${q.ext_label || 'AH'}</span> <span class="${extCls}">${q.ext_pct >= 0 ? '+' : ''}${(q.ext_pct || 0).toFixed(1)}%</span></span>`;
            }
            html += '</div></div>';
        }
        el.innerHTML = html;
    }

    function renderPulse(quotes) {
        const el = document.getElementById('pulse');
        if (!quotes || !quotes.length) { el.innerHTML = ''; return; }

        const pcts = quotes.map(q => q.pct || 0);
        const gainers = pcts.filter(p => p > 0).length;
        const losers = pcts.filter(p => p < 0).length;
        const sorted = [...quotes].sort((a, b) => (b.pct || 0) - (a.pct || 0));
        const best = sorted[0];
        const worst = sorted[sorted.length - 1];
        const avg = pcts.reduce((s, p) => s + p, 0) / pcts.length;
        const spread = (best.pct || 0) - (worst.pct || 0);
        const sortedPcts = [...pcts].sort((a, b) => a - b);
        const mid = Math.floor(sortedPcts.length / 2);
        const median = sortedPcts.length % 2 ? sortedPcts[mid] : (sortedPcts[mid - 1] + sortedPcts[mid]) / 2;
        const variance = pcts.reduce((s, p) => s + (p - avg) ** 2, 0) / pcts.length;
        const sigma = Math.sqrt(variance);
        const bigDown = pcts.filter(p => p < -3).length;
        const extCount = quotes.filter(q => q.ext_price != null).length;
        const greenPct = (gainers / quotes.length * 100).toFixed(0);
        const bigMoves = pcts.filter(p => Math.abs(p) > 2).length;
        const flat = pcts.filter(p => Math.abs(p) < 1).length;

        const row = (label, value, cls) =>
            `<div class="pulse-row"><span class="pulse-label">${label}</span><span class="${cls || ''}">${value}</span></div>`;

        let html = '<div class="pulse-title">Pulse</div>';
        html += row('A/D', `${gainers} / ${losers}`);
        html += row('Avg', `${avg >= 0 ? '+' : ''}${avg.toFixed(2)}%`, avg >= 0 ? 'positive' : 'negative');
        html += row('Hi', `${best.symbol} +${(best.pct || 0).toFixed(1)}%`, 'positive');
        html += row('Lo', `${worst.symbol} ${(worst.pct || 0).toFixed(1)}%`, 'negative');
        html += row('Spd', `${spread.toFixed(1)}pp`);
        if (bigDown) html += row('\u25B3', `${bigDown} down >3%`, 'negative');
        html += row('ExtHr', `${extCount} / ${quotes.length}`);
        html += row('Median', `${median >= 0 ? '+' : ''}${median.toFixed(2)}%`, median >= 0 ? 'positive' : 'negative');
        html += row('Green', `${greenPct}% ${gainers > losers ? '\u25B2' : '\u25BC'}`, gainers > losers ? 'positive' : 'negative');
        html += row('\u03C3', sigma.toFixed(2));
        html += row('Mov >2%', `${bigMoves}/${quotes.length}`);
        html += row('Flt <1%', `${flat}`);
        el.innerHTML = html;
    }

    function renderUpdated(meta) {
        const el = document.getElementById('sidebar-updated');
        if (meta?.quotes_timestamp) el.textContent = `Updated ${meta.quotes_timestamp}`;
    }

    async function renderStatusBar() {
        const meta = await App.loadData('meta.json');
        const market = await App.loadData('market.json');

        const badgeEl = document.getElementById('market-badge');
        const state = meta?.market_state || 'closed';
        const stateMap = { 'open': ['OPEN','c-green'], 'pre': ['PRE','c-amber'], 'post': ['POST','c-blue'], 'closed': ['CLOSED','c-red'] };
        const [label, cls] = stateMap[state] || ['?','c-dim'];
        badgeEl.className = cls;
        badgeEl.textContent = label;

        const stripEl = document.getElementById('indices-strip');
        if (!market) { stripEl.textContent = ''; return; }

        const indices = [
            { key: 'ES=F', label: 'ES' }, { key: 'NQ=F', label: 'NQ' },
            { key: '^HSI', label: 'H' }, { key: '^SOX', label: 'SO' },
            { key: '^VIX', label: 'V', noArrow: true }, { key: 'CL=F', label: 'W', noArrow: true },
            { key: 'BZ=F', label: 'B', noArrow: true }, { key: 'GC=F', label: 'G', noArrow: true },
        ];

        const lookup = {};
        for (const items of Object.values(market)) {
            if (!Array.isArray(items)) continue;
            for (const item of items) lookup[item.symbol] = item;
        }

        let strip = '';
        for (const idx of indices) {
            const item = lookup[idx.key];
            if (!item) continue;
            const cls = (item.pct || 0) >= 0 ? 'c-green' : 'c-red';
            const arrow = (item.pct || 0) >= 0 ? '\u25B2' : '\u25BC';
            const price = item.price >= 10000 ? Math.round(item.price) : item.price >= 100 ? item.price.toFixed(0) : item.price.toFixed(1);
            strip += idx.noArrow
                ? `<span class="c-dim">${idx.label}</span> <span class="${cls}">${price}</span>  `
                : `<span class="c-dim">${idx.label}</span> <span class="${cls}">${price} ${arrow}${Math.abs(item.pct||0).toFixed(1)}%</span>  `;
        }
        stripEl.innerHTML = strip;

        const now = new Date();
        document.getElementById('clock').textContent = now.toLocaleTimeString('en-US', {
            hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York', hour12: false,
        }) + ' ET';
    }

    return { render, renderStatusBar };
})();
