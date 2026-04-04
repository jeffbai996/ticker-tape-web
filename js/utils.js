/**
 * utils.js — Formatting helpers, ported from ticker-tape's formatters.py.
 */
const Utils = (() => {

    /** Format market cap: 1.23T, 456B, 12.3M */
    function fmtCap(n) {
        if (n == null) return '\u2014';
        const abs = Math.abs(n);
        if (abs >= 1e12) return (n / 1e12).toFixed(2) + 'T';
        if (abs >= 1e9)  return (n / 1e9).toFixed(1) + 'B';
        if (abs >= 1e6)  return (n / 1e6).toFixed(1) + 'M';
        return fmtNum(n);
    }

    /** Format number with commas */
    function fmtNum(n) {
        if (n == null) return '\u2014';
        return Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
    }

    /** Format price with 2 decimals */
    function fmtPrice(n) {
        if (n == null) return '\u2014';
        return Number(n).toFixed(2);
    }

    /** Format percentage: +1.23% */
    function fmtPct(n) {
        if (n == null) return '\u2014';
        const sign = n >= 0 ? '+' : '';
        return sign + Number(n).toFixed(2) + '%';
    }

    /** Format ratio: 1.23x */
    function fmtRatio(n) {
        if (n == null) return '\u2014';
        return Number(n).toFixed(2);
    }

    /** Return CSS class for positive/negative */
    function signClass(n) {
        if (n == null || n === 0) return 'text-dim';
        return n > 0 ? 'positive' : 'negative';
    }

    /** Color-coded change span: +5.23 (+1.20%) */
    function colorChange(change, pct) {
        if (change == null) return '<span class="text-dim">\u2014</span>';
        const cls = signClass(change);
        const arrow = change >= 0 ? '\u25B2' : '\u25BC';
        const sign = change >= 0 ? '+' : '';
        return `<span class="${cls}">${arrow} ${sign}${Number(change).toFixed(2)} (${sign}${Number(pct).toFixed(2)}%)</span>`;
    }

    /** Color-coded percentage only */
    function colorPct(pct) {
        if (pct == null) return '<span class="text-dim">\u2014</span>';
        const cls = signClass(pct);
        const sign = pct >= 0 ? '+' : '';
        return `<span class="${cls}">${sign}${Number(pct).toFixed(2)}%</span>`;
    }

    /** Inline SVG sparkline */
    function sparklineSVG(prices, width = 100, height = 24) {
        if (!prices || prices.length < 2) return '';
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const range = max - min || 1;
        const step = width / (prices.length - 1);

        const points = prices.map((p, i) =>
            `${(i * step).toFixed(1)},${(height - ((p - min) / range) * height).toFixed(1)}`
        ).join(' ');

        const color = prices[prices.length - 1] >= prices[0] ? 'var(--green)' : 'var(--red)';

        return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" class="sparkline">
            <polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5"/>
        </svg>`;
    }

    /** RSI color class */
    function rsiColor(rsi) {
        if (rsi == null) return 'text-dim';
        if (rsi >= 70) return 'negative';
        if (rsi <= 30) return 'positive';
        return 'text-light';
    }

    /** Horizontal bar chart div */
    function barChart(pct, maxWidth = 120) {
        if (pct == null) return '';
        const abs = Math.min(Math.abs(pct), 10);
        const w = (abs / 10) * maxWidth;
        const cls = pct >= 0 ? 'positive' : 'negative';
        const bgCls = pct >= 0 ? 'bg-green' : 'bg-red';
        return `<div class="bar-container" style="width:${maxWidth}px">
            <div class="${bgCls}" style="width:${w}px;height:14px;border-radius:2px"></div>
        </div>`;
    }

    /** Time ago string from ISO timestamp */
    function timeAgo(isoStr) {
        if (!isoStr) return '';
        const diff = (Date.now() - new Date(isoStr).getTime()) / 1000;
        if (diff < 60) return 'just now';
        if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
        if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
        return Math.floor(diff / 86400) + 'd ago';
    }

    /** Market state badge */
    function stateBadge(state) {
        const map = {
            'open': ['Open', 'bg-success'],
            'pre': ['Pre-Market', 'bg-warning text-dark'],
            'post': ['After Hours', 'bg-info text-dark'],
            'closed': ['Closed', 'bg-secondary'],
        };
        const [label, cls] = map[state] || ['Unknown', 'bg-secondary'];
        return `<span class="badge ${cls}">${label}</span>`;
    }

    /** Create a clickable symbol link */
    function symLink(symbol, page = 'lookup') {
        return `<a href="#/${page}/${symbol}" class="sym-link">${symbol}</a>`;
    }

    /** 52-week range bar */
    function rangeBar(current, low, high, width = 80) {
        if (current == null || low == null || high == null) return '';
        const range = high - low || 1;
        const pos = Math.max(0, Math.min(1, (current - low) / range));
        const px = pos * width;
        return `<div class="range-bar" style="width:${width}px">
            <div class="range-track"></div>
            <div class="range-marker" style="left:${px}px"></div>
        </div>`;
    }

    return {
        fmtCap, fmtNum, fmtPrice, fmtPct, fmtRatio,
        signClass, colorChange, colorPct,
        sparklineSVG, rsiColor, barChart,
        timeAgo, stateBadge, symLink, rangeBar,
    };
})();
