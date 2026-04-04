/**
 * commodities.js — Commodity futures grouped by category.
 * Data source: data/commodities.json. All content from trusted pipeline.
 */
App.registerPage('commodities', function(container, data) {
    const commodities = data['commodities.json'];
    if (!commodities || !Object.keys(commodities).length) {
        container.innerHTML = '<div class="text-dim p-4">Awaiting commodities data...</div>';
        return;
    }

    let html = '<h5 class="text-accent mb-3">Commodities</h5>';

    for (const [group, items] of Object.entries(commodities)) {
        if (!items || !items.length) continue;
        html += '<div class="tt-section">';
        html += `<div class="tt-section-title">${group}</div>`;
        html += '<table class="tt-table"><thead><tr>';
        html += '<th>Symbol</th><th>Name</th><th>Unit</th><th style="text-align:right">Price</th><th style="text-align:right">Change</th>';
        html += '</tr></thead><tbody>';

        for (const item of items) {
            html += '<tr>';
            html += `<td class="text-accent">${item.symbol}</td>`;
            html += `<td class="text-dim">${item.name || ''}</td>`;
            html += `<td class="text-dim">${item.unit || ''}</td>`;
            html += `<td>${Utils.fmtPrice(item.price)}</td>`;
            html += `<td>${Utils.colorChange(item.change, item.pct)}</td>`;
            html += '</tr>';
        }
        html += '</tbody></table></div>';
    }

    container.innerHTML = html;
});
