/**
 * news.js — Recent news headlines per symbol.
 * Data source: data/news.json. All content from trusted pipeline.
 */
App.registerPage('news', function(container, data) {
    const news = data['news.json'];
    const meta = data['meta.json'] || {};
    const names = meta.names || {};

    if (!news || !Object.keys(news).length) {
        container.innerHTML = '<div class="c-dim" style="padding:16px">No news data available.</div>';
        return;
    }

    let html = '<div class="tt-section-title">News</div>';

    for (const [symbol, items] of Object.entries(news)) {
        if (!items || !items.length) continue;
        html += '<div class="tt-section">';
        html += `<div class="tt-section-title">${Utils.symLink(symbol)} <span class="c-dim" style="font-weight:400">${names[symbol] || ''}</span></div>`;
        for (const item of items) {
            // Sanitize: news titles are plain text from yfinance, links are URLs
            const safeTitle = item.title.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            html += '<div style="padding:4px 0;border-bottom:1px solid #1a1a1a">';
            html += `<a href="${encodeURI(item.link)}" target="_blank" rel="noopener" style="color:var(--white)">${safeTitle}</a>`;
            html += ` <span class="c-dim" style="font-size:11px">${(item.publisher || '').replace(/</g, '&lt;')} \u2022 ${item.age || ''}</span>`;
            html += '</div>';
        }
        html += '</div>';
    }

    container.innerHTML = html;
});
