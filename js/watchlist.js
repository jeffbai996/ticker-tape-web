/**
 * watchlist.js — Client-side watchlist management via localStorage.
 * On first use, seeds the list with all pipeline symbols so that
 * watch/unwatch is additive/subtractive, not an empty filter.
 * Security: innerHTML displays user-stored symbol names only (uppercase letters).
 */
const Watchlist = (() => {
    const KEY = 'custom_watchlist';

    function load() {
        try { return JSON.parse(localStorage.getItem(KEY)) || null; }
        catch { return null; }
    }

    function save(list) { localStorage.setItem(KEY, JSON.stringify(list)); }

    /** Seed the watchlist with all current pipeline symbols on first use. */
    function _seed(quotes) {
        if (!quotes || !quotes.length) return [];
        return quotes.map(q => q.symbol);
    }

    /** Add a symbol. Seeds from pipeline data on first use. */
    function add(sym, pipelineQuotes) {
        let list = load();
        sym = sym.toUpperCase();
        // First time using watchlist: seed with all pipeline symbols
        if (!list) {
            list = _seed(pipelineQuotes);
        }
        if (!list.includes(sym)) {
            list.push(sym);
            save(list);
        }
    }

    /** Remove a symbol. */
    function remove(sym) {
        let list = load();
        if (!list) return;
        sym = sym.toUpperCase();
        list = list.filter(s => s !== sym);
        list.length === 0 ? localStorage.removeItem(KEY) : save(list);
    }

    /** Filter quotes by custom watchlist. Never returns empty if quotes exist. */
    function filter(quotes) {
        const list = load();
        if (!list || !list.length || !quotes) return quotes;
        const filtered = quotes.filter(q => list.includes(q.symbol));
        // Safety: if filter would remove everything, show all pipeline symbols
        return filtered.length > 0 ? filtered : quotes;
    }

    /** Show current watchlist in main panel. */
    function show() {
        const list = load();
        const panel = document.getElementById('main-panel');
        if (!list || !list.length) {
            panel.innerHTML = '<div style="padding:8px"><span class="c-dim">No custom watchlist. Showing all pipeline symbols.</span><br><span class="c-dim">Use</span> <span class="c-green">watch SYM</span> <span class="c-dim">to add.</span></div>';
        } else {
            let html = '<div style="padding:8px"><span class="c-accent">Custom Watchlist</span> <span class="c-dim">(' + list.length + ')</span><br><br>';
            for (const sym of list) html += `<span class="c-amber">${sym}</span>  `;
            html += '<br><br><span class="c-dim">unwatch SYM to remove. Remove all to show defaults.</span></div>';
            panel.innerHTML = html;
        }
    }

    /** Reset watchlist (remove localStorage key). */
    function reset() { localStorage.removeItem(KEY); }

    return { load, add, remove, filter, show, reset };
})();
