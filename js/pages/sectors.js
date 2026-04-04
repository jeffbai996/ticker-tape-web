/**
 * sectors.js — Sector ETF performance with visual bars.
 * Data source: data/sectors.json. All content from trusted pipeline.
 */
App.registerPage('sectors', function(container, data) {
    const sectors = data['sectors.json'];
    if (!sectors || !sectors.length) {
        container.innerHTML = '<div class="text-dim p-4">Awaiting sector data...</div>';
        return;
    }

    let html = '<h5 class="text-accent mb-3">Sector Performance</h5>';
    html += '<div class="tt-section">';
    html += '<table class="tt-table"><thead><tr>';
    html += '<th>ETF</th><th>Sector</th><th style="text-align:right">Change</th><th></th>';
    html += '</tr></thead><tbody>';

    for (const s of sectors) {
        html += '<tr>';
        html += `<td>${Utils.symLink(s.symbol)}</td>`;
        html += `<td class="text-dim">${s.name || ''}</td>`;
        html += `<td>${Utils.colorPct(s.pct)}</td>`;
        html += `<td>${Utils.barChart(s.pct, 120)}</td>`;
        html += '</tr>';
    }

    html += '</tbody></table></div>';
    container.innerHTML = html;
});
