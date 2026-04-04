/**
 * econ.js — Economic calendar (FOMC, CPI, NFP, GDP, PCE).
 * Data source: data/econ.json. All content from trusted pipeline.
 */
App.registerPage('econ', function(container, data) {
    const events = data['econ.json'];
    if (!events || !events.length) {
        container.innerHTML = '<div class="text-dim p-4">No economic events data.</div>';
        return;
    }

    let html = '<h5 class="text-accent mb-3">Economic Calendar</h5>';
    html += '<div class="tt-section">';
    html += '<table class="tt-table"><thead><tr>';
    html += '<th>Event</th><th>Date</th><th style="text-align:right">Days Until</th>';
    html += '</tr></thead><tbody>';

    for (const ev of events) {
        const type = ev.type || '';
        const typeCls = `econ-${type}`;
        let daysCls = 'text-dim';
        if (ev.days_until != null) {
            if (ev.days_until <= 0) daysCls = 'negative';
            else if (ev.days_until <= 3) daysCls = 'negative';
            else if (ev.days_until <= 7) daysCls = 'text-amber';
        }

        html += '<tr>';
        html += `<td class="${typeCls}" style="font-weight:600">${type}</td>`;
        html += `<td>${ev.date || ''}</td>`;
        html += `<td class="${daysCls}">${ev.days_until != null ? (ev.days_until <= 0 ? 'TODAY' : ev.days_until + 'd') : '\u2014'}</td>`;
        html += '</tr>';
    }

    html += '</tbody></table></div>';
    container.innerHTML = html;
});
