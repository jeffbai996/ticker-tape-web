/**
 * alerts.js — Price alert management via localStorage.
 * Evaluates on each data refresh, fires browser notifications.
 * Security: innerHTML displays user-stored alert data only (symbol + price).
 */
const Alerts = (() => {
    const KEY = 'price_alerts';
    let _nextId = 1;

    function load() {
        try {
            const alerts = JSON.parse(localStorage.getItem(KEY)) || [];
            if (alerts.length) _nextId = Math.max(...alerts.map(a => a.id)) + 1;
            return alerts;
        } catch { return []; }
    }

    function save(alerts) { localStorage.setItem(KEY, JSON.stringify(alerts)); }

    function add(sym, op, price) {
        const alerts = load();
        alerts.push({ id: _nextId++, symbol: sym, op, price, created: new Date().toISOString() });
        save(alerts);
        App.showOutput(`<span class="c-green">Alert #${_nextId - 1}: ${sym} ${op} ${price}</span>`);
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }

    function remove(id) {
        let alerts = load();
        const before = alerts.length;
        alerts = alerts.filter(a => a.id !== id);
        save(alerts);
        App.showOutput(alerts.length < before
            ? `<span class="c-amber">Alert #${id} removed.</span>`
            : `<span class="c-dim">Alert #${id} not found.</span>`);
    }

    function list() {
        const alerts = load();
        const panel = document.getElementById('main-panel');
        if (!alerts.length) {
            panel.innerHTML = '<div style="padding:8px"><span class="c-dim">No active alerts.</span><br><span class="c-dim">Usage:</span> <span class="c-green">alert SYM &gt;PRICE</span></div>';
            return;
        }
        let html = '<pre style="font-family:var(--font-mono);line-height:1.6"><span class="c-accent">== ACTIVE ALERTS ==</span>\n';
        for (const a of alerts) {
            html += `  <span class="c-amber">#${String(a.id).padEnd(4)}</span><span class="c-white">${a.symbol.padEnd(6)}</span> ${a.op} <span class="c-green">${a.price}</span>\n`;
        }
        html += '\n<span class="c-dim">alert rm N to remove.</span></pre>';
        panel.innerHTML = html;
    }

    function check(quotes) {
        const alerts = load();
        if (!alerts.length) return;
        const priceMap = {};
        for (const q of quotes) priceMap[q.symbol] = q.price;

        const remaining = [];
        for (const a of alerts) {
            const price = priceMap[a.symbol];
            if (price == null) { remaining.push(a); continue; }
            const hit = (a.op === '>' && price > a.price) || (a.op === '<' && price < a.price);
            if (hit) {
                if ('Notification' in window && Notification.permission === 'granted') {
                    new Notification(`Alert: ${a.symbol}`, {
                        body: `${a.symbol} $${price.toFixed(2)} (${a.op} $${a.price})`
                    });
                }
            } else {
                remaining.push(a);
            }
        }
        if (remaining.length !== alerts.length) save(remaining);
    }

    return { add, remove, list, check };
})();
