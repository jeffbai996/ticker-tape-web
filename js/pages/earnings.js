/**
 * earnings.js — Upcoming earnings calendar.
 * Data source: data/earnings.json. All content from trusted pipeline.
 */
App.registerPage('earnings', function(container, data) {
    const earnings = data['earnings.json'];
    const meta = data['meta.json'] || {};
    const names = meta.names || {};

    if (!earnings || !earnings.length) {
        container.innerHTML = '<div class="text-dim p-4">No upcoming earnings data.</div>';
        return;
    }

    const sorted = [...earnings].filter(e => e.date !== 'N/A').sort((a, b) => (a.days_until ?? 999) - (b.days_until ?? 999));

    let html = '<h5 class="text-accent mb-3">Earnings Calendar</h5>';
    html += '<div class="tt-section">';
    html += '<table class="tt-table"><thead><tr>';
    html += '<th>Symbol</th><th>Name</th><th>Date</th><th style="text-align:right">Days</th><th style="text-align:right">EPS Est</th>';
    html += '</tr></thead><tbody>';

    for (const e of sorted) {
        let cls = 'text-dim';
        if (e.days_until != null) {
            if (e.days_until <= 0) cls = 'negative';
            else if (e.days_until <= 7) cls = 'negative';
            else if (e.days_until <= 30) cls = 'text-amber';
        }

        html += '<tr>';
        html += `<td>${Utils.symLink(e.symbol)}</td>`;
        html += `<td class="text-dim">${names[e.symbol] || ''}</td>`;
        html += `<td>${e.date}</td>`;
        html += `<td class="${cls}">${e.days_until != null ? (e.days_until <= 0 ? 'TODAY' : e.days_until + 'd') : '\u2014'}</td>`;
        html += `<td>${e.eps_est != null ? '$' + Number(e.eps_est).toFixed(2) : '\u2014'}</td>`;
        html += '</tr>';
    }

    html += '</tbody></table></div>';
    container.innerHTML = html;
});
