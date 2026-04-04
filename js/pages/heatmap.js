/**
 * heatmap.js — Color-coded performance grid.
 * Data source: data/quotes.json. All content from trusted pipeline.
 */
App.registerPage('heatmap', function(container, data) {
    const quotes = data['quotes.json'];
    if (!quotes || !quotes.length) {
        container.innerHTML = '<div class="text-dim p-4">Awaiting quote data...</div>';
        return;
    }

    const sorted = [...quotes].sort((a, b) => (b.pct || 0) - (a.pct || 0));

    let html = '<h5 class="text-accent mb-3">Heatmap</h5>';
    html += '<div class="heatmap-grid">';

    for (const q of sorted) {
        const pct = q.pct || 0;
        const intensity = Math.min(Math.abs(pct) / 5, 1);
        const r = pct < 0 ? 255 : Math.round(40 * (1 - intensity));
        const g = pct >= 0 ? Math.round(200 * intensity) : Math.round(40 * (1 - intensity));
        const b = Math.round(40 * (1 - intensity));
        const bg = `rgb(${r},${g},${b})`;
        const textColor = intensity > 0.3 ? '#fff' : '#ccc';

        html += `<a href="#/lookup/${q.symbol}" class="heatmap-cell" style="background:${bg};color:${textColor}">`;
        html += `<div class="sym">${q.symbol}</div>`;
        html += `<div class="pct">${Utils.fmtPct(pct)}</div>`;
        html += '</a>';
    }

    html += '</div>';
    container.innerHTML = html;
});
