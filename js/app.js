/**
 * app.js — Terminal-style layout controller.
 * Default view: thesis dashboard. Chat via "chat" command.
 * All commands from TUI help screen are wired.
 */
const App = (() => {
    const DATA_CACHE = {};
    let _refreshTimer = null;
    let _lastTimestamp = null;
    let _chatMode = false;

    async function loadData(path) {
        const now = Date.now();
        if (DATA_CACHE[path] && DATA_CACHE[path].ts > now - 30000) return DATA_CACHE[path].data;
        try {
            const resp = await fetch(`data/${path}?t=${now}`);
            if (!resp.ok) return null;
            const data = await resp.json();
            DATA_CACHE[path] = { data, ts: now };
            return data;
        } catch { return null; }
    }

    function invalidateCache() { for (const k of Object.keys(DATA_CACHE)) delete DATA_CACHE[k]; }

    const PAGES = {};
    function registerPage(name, renderFn) { PAGES[name] = renderFn; }

    // --- Command routing ---
    const STATIC_CMDS = {
        't':           { page: 'dashboard',   data: ['quotes.json','technicals.json','sparklines.json','meta.json'] },
        'thesis':      { page: 'dashboard',   data: ['quotes.json','technicals.json','sparklines.json','meta.json'] },
        'dashboard':   { page: 'dashboard',   data: ['quotes.json','technicals.json','sparklines.json','meta.json'] },
        'm':           { page: 'market',      data: ['market.json'] },
        'market':      { page: 'market',      data: ['market.json'] },
        's':           { page: 'sectors',      data: ['sectors.json'] },
        'sectors':     { page: 'sectors',      data: ['sectors.json'] },
        'e':           { page: 'earnings',     data: ['earnings.json','meta.json'] },
        'earnings':    { page: 'earnings',     data: ['earnings.json','meta.json'] },
        'heatmap':     { page: 'heatmap',      data: ['quotes.json'] },
        'calendar':    { page: 'econ',         data: ['econ.json'] },
        'econ':        { page: 'econ',         data: ['econ.json'] },
        'commodities': { page: 'commodities',  data: ['commodities.json'] },
        'news':        { page: 'news',         data: ['news.json','meta.json'] },
    };

    const DYN_CMDS = [
        { pattern: /^ta\s+(\S+)$/i,       page: 'technicals', data: ['technicals.json'], param: 'symbol' },
        { pattern: /^news\s+(\S+)$/i,      page: 'news',       data: ['news.json','meta.json'], param: 'symbol' },
        { pattern: /^(?:chart|c)\s+(\S+)/i, page: 'charts',    data: [], param: 'symbol' },
        { pattern: /^lookup\s+(\S+)$/i,    page: 'lookup',     data: [], param: 'symbol' },
        { pattern: /^([A-Z]{1,5})$/,       page: 'lookup',     data: [], param: 'symbol' },
    ];

    // Stubs for unimplemented commands
    const STUB_CMDS = ['vs','intra','impact','screen','insider','options','div','short','rating','corr',
                        'watch','unwatch','wl','alert','group','journal',
                        'ibkr','pos','acct','pnl','whatif','trades','dash',
                        'resume','memory','history','copy','scroll','compact','clear','lang'];

    /** Show a page view in the main panel. */
    async function showView(page, dataKeys, params) {
        const panel = document.getElementById('main-panel');
        if (!PAGES[page]) { panel.textContent = 'Unknown view: ' + page; return; }
        _chatMode = false;
        updatePrompt();
        panel.innerHTML = '<div class="loading">Loading...</div>';

        const dataMap = {};
        await Promise.all(dataKeys.map(async path => { dataMap[path] = await loadData(path); }));
        if (params?.symbol) {
            if (page === 'lookup') dataMap[`lookup/${params.symbol}.json`] = await loadData(`lookup/${params.symbol}.json`);
            if (page === 'charts') dataMap[`charts/${params.symbol}.json`] = await loadData(`charts/${params.symbol}.json`);
        }
        try { PAGES[page](panel, dataMap, params || {}); }
        catch (e) { panel.textContent = 'Error: ' + e.message; console.error(e); }
    }

    /** Show dashboard (default view). */
    function showDashboard() {
        showView('dashboard', ['quotes.json','technicals.json','sparklines.json','meta.json']);
    }

    /** Enter chat mode. */
    async function enterChat(initialMsg) {
        _chatMode = true;
        updatePrompt();
        const panel = document.getElementById('main-panel');
        const dataMap = {
            'quotes.json': await loadData('quotes.json'),
            'technicals.json': await loadData('technicals.json'),
            'meta.json': await loadData('meta.json'),
        };
        if (PAGES.chat) PAGES.chat(panel, dataMap, {});
        if (initialMsg) {
            setTimeout(() => {
                if (typeof ChatEngine !== 'undefined') ChatEngine.sendFromInput(initialMsg);
            }, 50);
        }
    }

    /** Show help screen. */
    function showHelp() {
        const panel = document.getElementById('main-panel');
        _chatMode = false;
        updatePrompt();

        const section = (title) => `\n<span class="c-blue">== ${title} ==</span>\n`;
        const cmd = (name, desc) => `  <span class="c-green">${name.padEnd(28)}</span><span class="c-dim">${desc}</span>\n`;
        const kcmd = (name, desc) => `  <span class="c-amber">${name.padEnd(28)}</span><span class="c-dim">${desc}</span>\n`;

        let html = '<pre style="line-height:1.5">';
        html += section('KEYBOARD SHORTCUTS');
        html += kcmd('t', 'Thesis dashboard (home)');
        html += kcmd('s', 'Sector heatmap');
        html += kcmd('e', 'Earnings calendar');
        html += kcmd('r', 'Refresh quotes');
        html += kcmd('?', 'This help screen');

        html += section('COMMANDS');
        html += cmd('<TICKER>', 'Stock lookup (e.g. NVDA)');
        html += cmd('m, market', 'Market overview');
        html += cmd('ta <SYM>', 'Technical analysis');
        html += cmd('news <SYM>', 'News headlines');
        html += cmd('chart <SYM> [period]', 'Price chart');
        html += cmd('heatmap', 'Portfolio heatmap');
        html += cmd('calendar', 'Economic calendar (FOMC/CPI/NFP)');
        html += cmd('commodities', 'Commodity futures');

        html += section('AI CHAT');
        html += cmd('chat <question>', 'AI chat (multi-model)');
        html += cmd('model [name]', 'Select model (flash/pro/haiku/sonnet/opus/gpt)');
        html += cmd('settings', 'API keys and profile');

        html += section('NAVIGATION');
        html += cmd('back, q', 'Return to dashboard');
        html += cmd('help, ?', 'This help screen');

        html += '</pre>';
        panel.innerHTML = html;
    }

    /** Update the input prompt indicator. */
    function updatePrompt() {
        const el = document.getElementById('input-model');
        el.textContent = _chatMode ? Providers.getActive() + '>' : 'ticker>';
    }

    /** Process typed input. */
    function processInput(text) {
        const trimmed = text.trim();
        if (!trimmed) return;
        const lower = trimmed.toLowerCase();

        // Settings
        if (lower === 'settings' || lower === 'config') { showSettings(); return; }

        // Help
        if (lower === '?' || lower === 'help') { showHelp(); return; }

        // Back to dashboard
        if (lower === 'q' || lower === 'quit' || lower === 'back') { showDashboard(); return; }

        // Refresh
        if (lower === 'r' || lower === 'refresh') {
            invalidateCache();
            Sidebar.render();
            Sidebar.renderStatusBar();
            showDashboard();
            return;
        }

        // Model switch
        const modelMatch = lower.match(/^model\s*(\S*)$/);
        if (modelMatch) {
            const name = modelMatch[1];
            if (!name) {
                // List models
                const panel = document.getElementById('main-panel');
                let html = '<pre style="line-height:1.6">\n<span class="c-accent">== MODELS ==</span>\n';
                for (const [key, cfg] of Object.entries(Providers.MODELS)) {
                    const active = key === Providers.getActive() ? ' <span class="c-green">\u25C6</span>' : '  ';
                    const hasKey = Providers.hasKey(key) ? '<span class="c-green">\u2713</span>' : '<span class="c-red">\u2717</span>';
                    html += `${active} <span class="c-amber">${key.padEnd(12)}</span>${cfg.label.padEnd(18)}${cfg.id.padEnd(34)}${hasKey}\n`;
                }
                html += '\n<span class="c-dim">Type model &lt;name&gt; to switch.</span></pre>';
                panel.innerHTML = html;
                _chatMode = false;
                updatePrompt();
                return;
            }
            if (Providers.MODELS[name]) {
                Providers.setActive(name);
                updatePrompt();
                const panel = document.getElementById('main-panel');
                panel.innerHTML = `<div style="padding:8px"><span class="c-green">Switched to ${Providers.MODELS[name].label}</span></div>`;
                return;
            }
        }

        // Chat mode entry
        const chatMatch = trimmed.match(/^chat\s*([\s\S]*)$/i);
        if (chatMatch !== null) {
            enterChat(chatMatch[1]?.trim() || null);
            return;
        }

        // Static commands
        if (STATIC_CMDS[lower]) {
            const cmd = STATIC_CMDS[lower];
            showView(cmd.page, cmd.data);
            return;
        }

        // Dynamic commands
        for (const dc of DYN_CMDS) {
            const m = trimmed.match(dc.pattern);
            if (m) {
                showView(dc.page, dc.data, { [dc.param]: m[1].toUpperCase() });
                return;
            }
        }

        // Stub commands
        const stubWord = lower.split(/\s+/)[0];
        if (STUB_CMDS.includes(stubWord)) {
            const panel = document.getElementById('main-panel');
            panel.innerHTML = `<div style="padding:8px"><span class="c-dim">${stubWord}</span> <span class="c-amber">not yet available in web version</span></div>`;
            _chatMode = false;
            updatePrompt();
            return;
        }

        // If in chat mode, send to AI
        if (_chatMode) {
            if (typeof ChatEngine !== 'undefined') ChatEngine.sendFromInput(trimmed);
            return;
        }

        // Unknown command
        const panel = document.getElementById('main-panel');
        panel.innerHTML = `<div style="padding:8px"><span class="c-dim">Unknown command:</span> ${trimmed.replace(/</g,'&lt;')}. <span class="c-dim">Type</span> <span class="c-green">?</span> <span class="c-dim">for help.</span></div>`;
    }

    // --- Settings ---
    function hideSettings() {
        const el = document.getElementById('settings-overlay');
        el.classList.add('hidden');
        el.style.display = 'none';
    }
    function showSettings() {
        const el = document.getElementById('settings-overlay');
        el.classList.remove('hidden');
        el.style.display = 'flex';
        document.getElementById('key-anthropic').value = Config.get('anthropic');
        document.getElementById('key-google').value = Config.get('google');
        document.getElementById('key-openai').value = Config.get('openai');
        document.getElementById('key-tavily').value = Config.get('tavily');
        document.getElementById('user-profile').value = Config.get('profile');
    }
    function initSettings() {
        document.getElementById('settings-close').addEventListener('click', hideSettings);
        document.getElementById('settings-overlay').addEventListener('click', (e) => {
            if (e.target.id === 'settings-overlay') hideSettings();
        });
        document.getElementById('btn-save-settings').addEventListener('click', () => {
            Config.set('anthropic', document.getElementById('key-anthropic').value.trim());
            Config.set('google', document.getElementById('key-google').value.trim());
            Config.set('openai', document.getElementById('key-openai').value.trim());
            Config.set('tavily', document.getElementById('key-tavily').value.trim());
            Config.set('profile', document.getElementById('user-profile').value.trim());
            hideSettings();
        });
    }

    // --- Sidebar resize ---
    function initResize() {
        const handle = document.getElementById('resize-handle');
        const sidebar = document.getElementById('sidebar');
        let dragging = false;
        handle.addEventListener('mousedown', () => { dragging = true; });
        document.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            const w = Math.max(140, Math.min(500, e.clientX));
            sidebar.style.width = w + 'px';
            document.getElementById('layout').style.gridTemplateColumns = w + 'px 3px 1fr';
        });
        document.addEventListener('mouseup', () => { dragging = false; });
    }

    // --- Clock ---
    function tickClock() {
        const el = document.getElementById('clock');
        if (el) {
            const now = new Date();
            el.textContent = now.toLocaleTimeString('en-US', {
                hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York', hour12: false,
            }) + ' ET';
        }
    }

    // --- Hash routing (for clickable links) ---
    async function handleHash() {
        const hash = (location.hash || '').slice(1);
        if (!hash || hash === '/') { showDashboard(); return; }

        const routes = [
            { pattern: /^\/market$/,         page: 'market',      data: ['market.json'] },
            { pattern: /^\/sectors$/,         page: 'sectors',     data: ['sectors.json'] },
            { pattern: /^\/heatmap$/,         page: 'heatmap',     data: ['quotes.json'] },
            { pattern: /^\/earnings$/,        page: 'earnings',    data: ['earnings.json','meta.json'] },
            { pattern: /^\/econ$/,            page: 'econ',        data: ['econ.json'] },
            { pattern: /^\/commodities$/,     page: 'commodities', data: ['commodities.json'] },
            { pattern: /^\/news$/,            page: 'news',        data: ['news.json','meta.json'] },
            { pattern: /^\/chat$/,            page: null,          chat: true },
            { pattern: /^\/ta\/(.+)$/,        page: 'technicals',  data: ['technicals.json'], param: 'symbol' },
            { pattern: /^\/lookup\/(.+)$/,    page: 'lookup',      data: [],                  param: 'symbol' },
            { pattern: /^\/charts\/(.+)$/,    page: 'charts',      data: [],                  param: 'symbol' },
        ];

        for (const r of routes) {
            const m = hash.match(r.pattern);
            if (m) {
                if (r.chat) { enterChat(); return; }
                const params = r.param ? { [r.param]: m[1].toUpperCase() } : {};
                showView(r.page, r.data, params);
                return;
            }
        }
        showDashboard();
    }

    // --- Auto-refresh ---
    function startRefresh() {
        if (_refreshTimer) clearInterval(_refreshTimer);
        _refreshTimer = setInterval(async () => {
            delete DATA_CACHE['meta.json'];
            const meta = await loadData('meta.json');
            if (meta && _lastTimestamp && _lastTimestamp !== meta.timestamp) {
                invalidateCache();
                Sidebar.render();
                Sidebar.renderStatusBar();
            }
            if (meta) _lastTimestamp = meta.timestamp;
        }, 60000);
    }

    // --- Init ---
    function init() {
        initSettings();
        initResize();

        const input = document.getElementById('input');
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                processInput(input.value);
                input.value = '';
            }
            // Escape exits chat mode
            if (e.key === 'Escape' && _chatMode) {
                _chatMode = false;
                updatePrompt();
                showDashboard();
            }
        });

        window.addEventListener('hashchange', handleHash);

        Sidebar.renderStatusBar();
        Sidebar.render();

        // Default: thesis dashboard
        handleHash();

        tickClock();
        setInterval(tickClock, 10000);
        startRefresh();
        input.focus();

        // Global keyboard: typing focuses input
        document.addEventListener('keydown', (e) => {
            if (e.target === input) return;
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
            if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
                input.focus();
            }
        });
    }

    document.addEventListener('DOMContentLoaded', init);

    return { loadData, registerPage, invalidateCache, showView, showDashboard, enterChat };
})();
