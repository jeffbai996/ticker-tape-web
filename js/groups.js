/**
 * groups.js — Symbol group management via localStorage.
 * Groups override pipeline buckets for the thesis dashboard view.
 * Security: innerHTML displays user-stored group names/symbols only.
 */
const Groups = (() => {
    const KEY = 'symbol_groups';

    function load() {
        try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
        catch { return {}; }
    }

    function save(groups) { localStorage.setItem(KEY, JSON.stringify(groups)); }

    function set(name, symbols) {
        const groups = load();
        groups[name] = symbols;
        save(groups);
    }

    function remove(name) {
        const groups = load();
        delete groups[name];
        save(groups);
    }

    function show() {
        const groups = load();
        const panel = document.getElementById('main-panel');
        const names = Object.keys(groups);
        if (!names.length) {
            panel.innerHTML = '<div style="padding:8px"><span class="c-dim">No groups defined.</span><br><span class="c-dim">Usage:</span> <span class="c-green">group NAME SYM1 SYM2 ...</span></div>';
            return;
        }
        let html = '<pre style="font-family:var(--font-mono);line-height:1.6"><span class="c-accent">== SYMBOL GROUPS ==</span>\n';
        for (const name of names) {
            html += `  <span class="c-amber">${name.padEnd(16)}</span><span class="c-dim">${groups[name].join(', ')}</span>\n`;
        }
        html += '\n<span class="c-dim">group rm NAME to delete.</span></pre>';
        panel.innerHTML = html;
    }

    return { load, save, set, remove, show };
})();
