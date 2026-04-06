/**
 * journal.js — Trade journal via localStorage.
 * Stores timestamped entries with auto-extracted ticker symbols.
 * Security: innerHTML displays user-stored journal text only.
 */
const Journal = (() => {
    const KEY = 'trade_journal';
    const MAX = 200;
    const STOP = new Set(['I','A','AM','PM','AT','IN','ON','TO','DO','IF','IT','IS','OR','AN','BY','UP','US','CEO','CFO','IPO','ETF','USD','EUR','THE','AND','FOR','NOT','BUT','ALL','ARE','WAS','HAS','HAD','CAN']);

    function load() {
        try { return JSON.parse(localStorage.getItem(KEY)) || []; }
        catch { return []; }
    }

    function save(entries) { localStorage.setItem(KEY, JSON.stringify(entries)); }

    function extractSymbols(text) {
        const words = text.match(/\b[A-Z]{1,5}\b/g) || [];
        return [...new Set(words.filter(w => !STOP.has(w)))];
    }

    function handle(args) {
        const entries = load();

        if (!args || args === 'list') {
            if (!entries.length) {
                App.showOutput('<span class="c-dim">Journal empty.</span> <span class="c-green">journal add &lt;text&gt;</span>');
                return;
            }
            let html = '<pre style="font-family:var(--font-mono);line-height:1.6"><span class="c-accent">== TRADE JOURNAL ==</span> <span class="c-dim">(' + entries.length + ')</span>\n';
            for (const e of entries.slice(-15)) {
                const date = new Date(e.ts).toLocaleDateString();
                const trunc = e.text.length > 60 ? e.text.slice(0, 60) + '...' : e.text;
                const syms = e.symbols?.length ? ` <span class="c-amber">[${e.symbols.join(',')}]</span>` : '';
                html += `  <span class="c-dim">#${String(e.id).padEnd(4)} ${date}</span> ${trunc}${syms}\n`;
            }
            html += '</pre>';
            document.getElementById('main-panel').innerHTML = html;
            return;
        }

        const addMatch = args.match(/^add\s+(.+)/i);
        if (addMatch) {
            const text = addMatch[1];
            const symbols = extractSymbols(text);
            const id = entries.length ? Math.max(...entries.map(e => e.id)) + 1 : 1;
            entries.push({ id, ts: new Date().toISOString(), text, symbols });
            if (entries.length > MAX) entries.splice(0, entries.length - MAX);
            save(entries);
            App.showOutput(`<span class="c-green">Journal #${id} saved.</span>${symbols.length ? ' <span class="c-dim">' + symbols.join(', ') + '</span>' : ''}`);
            return;
        }

        const delMatch = args.match(/^delete\s+(\d+)/i);
        if (delMatch) {
            const id = parseInt(delMatch[1]);
            const idx = entries.findIndex(e => e.id === id);
            if (idx >= 0) { entries.splice(idx, 1); save(entries); App.showOutput(`<span class="c-amber">Journal #${id} deleted.</span>`); }
            else App.showOutput('<span class="c-dim">Not found.</span>');
            return;
        }

        const searchMatch = args.match(/^search\s+(.+)/i);
        if (searchMatch) {
            const term = searchMatch[1].toLowerCase();
            const results = entries.filter(e => e.text.toLowerCase().includes(term) || (e.symbols || []).some(s => s.toLowerCase() === term));
            if (!results.length) { App.showOutput(`<span class="c-dim">No matches for "${searchMatch[1]}"</span>`); return; }
            let html = `<pre style="font-family:var(--font-mono);line-height:1.6"><span class="c-accent">== SEARCH: ${searchMatch[1]} (${results.length}) ==</span>\n`;
            for (const e of results.slice(-10)) {
                html += `  <span class="c-dim">#${String(e.id).padEnd(4)} ${new Date(e.ts).toLocaleDateString()}</span> ${e.text.slice(0, 80)}\n`;
            }
            html += '</pre>';
            document.getElementById('main-panel').innerHTML = html;
            return;
        }

        const idMatch = args.match(/^(\d+)$/);
        if (idMatch) {
            const entry = entries.find(e => e.id === parseInt(idMatch[1]));
            if (entry) App.showOutput(`<span class="c-accent">[#${entry.id}]</span> <span class="c-dim">${new Date(entry.ts).toLocaleString()}</span><br>${entry.text}`);
            else App.showOutput('<span class="c-dim">Not found.</span>');
            return;
        }

        App.showOutput('<span class="c-dim">Usage: journal [list|add TEXT|delete ID|search TERM|ID]</span>');
    }

    return { load, handle };
})();
