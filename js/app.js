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
    let _chatPanelOpen = false;
    let _chatPanelInitialized = false;

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
        'corr':        { page: 'correlation',  data: ['sparklines.json','meta.json'] },
    };

    const DYN_CMDS = [
        { pattern: /^ta\s+(\S+)$/i,            page: 'technicals', data: ['technicals.json'], param: 'symbol' },
        { pattern: /^news\s+(\S+)$/i,           page: 'news',       data: ['news.json','meta.json'], param: 'symbol' },
        { pattern: /^(?:chart|c)\s+(\S+)/i,     page: 'charts',    data: [], param: 'symbol' },
        { pattern: /^lookup\s+(\S+)$/i,         page: 'lookup',     data: [], param: 'symbol' },
        { pattern: /^(?:intra|i)\s+(\S+)$/i,    page: 'intraday',  data: [], param: 'symbol' },
        { pattern: /^div\s+(\S+)$/i,            page: 'dividends', data: [], param: 'symbol' },
        { pattern: /^(?:short|si)\s+(\S+)$/i,   page: 'short',     data: [], param: 'symbol' },
        { pattern: /^(?:rating|pt)\s+(\S+)$/i,  page: 'ratings',   data: [], param: 'symbol' },
        { pattern: /^vs\s+(.+)$/i,              page: 'comparison', data: ['sparklines.json'], param: 'symbols' },
        { pattern: /^screen\s+(.+)$/i,          page: 'valuation',  data: [], param: 'symbols' },
        { pattern: /^([A-Z]{1,5})$/,            page: 'lookup',     data: [], param: 'symbol' },
    ];

    // Deferred pipeline commands — show helpful message
    const DEFERRED_CMDS = ['impact', 'insider', 'options'];

    /** Show a page view in the main panel (appends — terminal-style scrollback). */
    async function showView(page, dataKeys, params) {
        const panel = document.getElementById('main-panel');
        if (!PAGES[page]) { _appendOutput(panel, `<span class="c-dim">Unknown view: ${page}</span>`); return; }
        _chatMode = false;
        updatePrompt();

        // Create a section for this command's output
        const section = document.createElement('div');
        section.className = 'terminal-section';
        section.innerHTML = '<div class="loading">Loading...</div>';
        panel.appendChild(section);
        panel.scrollTop = panel.scrollHeight;

        const dataMap = {};
        await Promise.all(dataKeys.map(async path => { dataMap[path] = await loadData(path); }));
        if (params?.symbol) {
            const sym = params.symbol;
            const needsLookup = page === 'lookup' || page === 'dividends' || page === 'short' || page === 'ratings';
            const needsChart = page === 'charts' || page === 'intraday';
            const needsTech = page === 'technicals';

            // Try pipeline first
            if (needsLookup) dataMap[`lookup/${sym}.json`] = await loadData(`lookup/${sym}.json`);
            if (needsChart) dataMap[`charts/${sym}.json`] = await loadData(`charts/${sym}.json`);

            // Live data fallback for missing symbols
            if (typeof LiveData !== 'undefined' && LiveData.isConfigured()) {
                if (needsLookup && !dataMap[`lookup/${sym}.json`]) {
                    section.innerHTML = '<div class="loading">Fetching live data...</div>';
                    dataMap[`lookup/${sym}.json`] = await LiveData.fetchLookup(sym);
                }
                if (needsChart && !dataMap[`charts/${sym}.json`]) {
                    section.innerHTML = '<div class="loading">Fetching live data...</div>';
                    dataMap[`charts/${sym}.json`] = await LiveData.fetchChart(sym);
                }
                if (needsTech && !dataMap['technicals.json']?.[sym]) {
                    section.innerHTML = '<div class="loading">Fetching live data...</div>';
                    const liveTech = await LiveData.fetchTechnicals(sym);
                    if (liveTech) {
                        if (!dataMap['technicals.json']) dataMap['technicals.json'] = {};
                        dataMap['technicals.json'][sym] = liveTech;
                    }
                }
            }
        }
        if (params?.symbols && (page === 'valuation')) {
            const syms = params.symbols.split(/\s+/).map(s => s.toUpperCase());
            await Promise.all(syms.map(async s => { dataMap[`lookup/${s}.json`] = await loadData(`lookup/${s}.json`); }));
            params.symbolList = syms;
        }
        if (params?.symbols && (page === 'comparison')) {
            const parts = params.symbols.split(/\s+/).map(s => s.toUpperCase());
            params.symbolList = parts;
        }
        try { PAGES[page](section, dataMap, params || {}); }
        catch (e) { section.textContent = 'Error: ' + e.message; console.error(e); }
        panel.scrollTop = panel.scrollHeight;
    }

    /** Append an HTML snippet to the main panel. */
    function _appendOutput(panel, html) {
        const section = document.createElement('div');
        section.className = 'terminal-section';
        section.innerHTML = `<div style="padding:4px 0">${html}</div>`;
        panel.appendChild(section);
        panel.scrollTop = panel.scrollHeight;
    }

    /** Show dashboard (default view). */
    function showDashboard() {
        showView('dashboard', ['quotes.json','technicals.json','sparklines.json','meta.json','market.json','earnings.json']);
    }

    /** Check if viewport is wide enough for persistent chat panel. */
    function isWideScreen() { return window.innerWidth > 1200; }

    /** Toggle the persistent desktop chat panel. */
    async function toggleChatPanel(open) {
        _chatPanelOpen = open ?? !_chatPanelOpen;
        const layout = document.getElementById('layout');
        const toggle = document.getElementById('chat-toggle');

        if (_chatPanelOpen) {
            layout.classList.add('chat-open');
            if (toggle) toggle.innerHTML = '<span class="c-accent">[chat]</span>';
            await initChatPanelContent();
        } else {
            layout.classList.remove('chat-open');
            if (toggle) toggle.innerHTML = '<span class="c-dim">[chat]</span>';
        }
    }

    /** Initialize the persistent chat panel content (once). */
    async function initChatPanelContent() {
        if (_chatPanelInitialized) return;
        _chatPanelInitialized = true;

        const dataMap = {
            'quotes.json': await loadData('quotes.json'),
            'technicals.json': await loadData('technicals.json'),
            'meta.json': await loadData('meta.json'),
        };
        // panelMode: chat.js renders into #chat-panel-scroll directly
        if (PAGES.chat) PAGES.chat(null, dataMap, { panelMode: true });
        updateChatPanelLabel();
        // Focus chat input after panel opens
        const chatInput = document.getElementById('chat-input');
        if (chatInput) chatInput.focus();
    }

    /** Rebuild the chat system prompt with current data + memories. */
    async function _refreshChatPrompt() {
        if (typeof ChatEngine === 'undefined') return;
        const dataMap = {
            'quotes.json': await loadData('quotes.json'),
            'technicals.json': await loadData('technicals.json'),
            'meta.json': await loadData('meta.json'),
        };
        // buildSystemPrompt is defined in chat.js — we re-invoke the page to rebuild
        // But simpler: just re-set the prompt via the page's builder
        if (typeof buildSystemPrompt === 'function') {
            const prompt = buildSystemPrompt(
                dataMap['quotes.json'] || [],
                dataMap['technicals.json'] || {},
                dataMap['meta.json'] || {}
            );
            ChatEngine._setPrompt(prompt);
        }
    }

    /** Update the model label shown in the chat panel header. */
    function updateChatPanelLabel() {
        const label = document.getElementById('chat-model-label');
        const inputLabel = document.getElementById('chat-input-model');
        if (label) label.textContent = Providers.getActiveConfig()?.label || '';
        if (inputLabel) inputLabel.textContent = Providers.getActive() + '>';
    }

    /** Enter chat mode. */
    async function enterChat(initialMsg) {
        // Wide screen: use persistent side panel
        if (isWideScreen()) {
            await toggleChatPanel(true);
            if (initialMsg) {
                setTimeout(() => {
                    if (typeof ChatEngine !== 'undefined') ChatEngine.sendFromInput(initialMsg);
                }, 50);
            }
            return;
        }
        // Narrow screen: chat in main panel (existing behavior)
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

    /** Show help screen — full TUI parity. */
    function showHelp() {
        const panel = document.getElementById('main-panel');
        _chatMode = false;
        updatePrompt();

        const section = (title) => `\n<span class="c-blue">== ${title} ==</span>\n`;
        const cmd = (name, desc) => `  <span class="c-green">${name.padEnd(28)}</span><span class="c-dim">${desc}</span>\n`;
        const kcmd = (name, desc) => `  <span class="c-amber">${name.padEnd(28)}</span><span class="c-dim">${desc}</span>\n`;
        const dcmd = (name, desc) => `  <span class="c-dim">${name.padEnd(28)}${desc}</span>\n`;

        let html = '<pre style="line-height:1.5;font-family:var(--font-mono)">';
        html += section('KEYBOARD SHORTCUTS');
        html += kcmd('t', 'Thesis dashboard (home)');
        html += kcmd('s', 'Sector heatmap');
        html += kcmd('e', 'Earnings calendar');
        html += kcmd('r', 'Refresh quotes');
        html += kcmd('?', 'This help screen');
        html += kcmd('/', 'Focus input bar');
        html += kcmd('Esc', 'Back to dashboard');

        html += section('COMMANDS');
        html += cmd('<TICKER>', 'Stock lookup (e.g. NVDA)');
        html += cmd('m, market', 'Market overview');
        html += cmd('ta <SYM>', 'Technical analysis');
        html += cmd('news <SYM>', 'News headlines');
        html += cmd('chart <SYM> [period]', 'Price chart (1d/5d/1mo/3mo/1y/5y)');
        html += cmd('vs <SYM> <SYM> ...', 'Compare symbols (+ optional period)');
        html += cmd('intra <SYM>', 'Intraday 5-min bars with VWAP');
        html += cmd('screen <SYM> <SYM>', 'Valuation comparison table');
        html += cmd('div <SYM>', 'Dividend yield, rate, ex-date, payout');
        html += cmd('short <SYM>', 'Short interest, days to cover');
        html += cmd('rating <SYM>', 'Analyst consensus, price targets');
        html += cmd('corr', 'Watchlist correlation matrix');
        html += cmd('heatmap', 'Portfolio heatmap');
        html += cmd('calendar', 'Economic calendar (FOMC/CPI/NFP)');
        html += cmd('commodities', 'Commodity futures');
        html += dcmd('impact <SYM>', 'Earnings impact history (coming soon)');
        html += dcmd('insider <SYM>', 'Insider transactions (coming soon)');
        html += dcmd('options <SYM> [exp]', 'Options chain with IV (coming soon)');

        html += section('PORTFOLIO');
        html += cmd('watch <SYM>', 'Add to watchlist');
        html += cmd('unwatch <SYM>', 'Remove from watchlist');
        html += cmd('wl', 'Show watchlist');
        html += cmd('alert SYM >N', 'Set price alert');
        html += cmd('alert rm N', 'Remove alert by ID');
        html += cmd('alert', 'List all alerts');
        html += cmd('group [name] [SYMs]', 'Manage symbol groups');
        html += cmd('journal [cmd]', 'Trade journal (add/search/import)');

        html += section('AI CHAT');
        html += cmd('chat <question>', 'AI chat (multi-model)');
        html += cmd('resume', 'Enter chat with last 5 turns');
        html += cmd('model [name]', 'Select model (flash/pro/haiku/sonnet/opus/gpt)');
        html += cmd('memory [cmd]', 'AI memories (list/add/edit/delete)');
        html += cmd('history [cmd]', 'Chat history (show/clear/search)');
        html += cmd('settings', 'API keys and profile');

        html += section('OTHER');
        html += cmd('clear', 'Clear console');
        html += cmd('back, q', 'Return to dashboard');
        html += cmd('help, ?', 'This help screen');

        html += '</pre>';
        _appendOutput(panel, html);
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

        // Clear
        if (lower === 'clear' || lower === 'cls') {
            document.getElementById('main-panel').innerHTML = '';
            _chatMode = false;
            updatePrompt();
            return;
        }

        // Back to dashboard (clears terminal)
        if (lower === 'q' || lower === 'quit' || lower === 'back') {
            document.getElementById('main-panel').innerHTML = '';
            showDashboard();
            return;
        }

        // Refresh — clear terminal + reload data
        if (lower === 'r' || lower === 'refresh') {
            document.getElementById('main-panel').innerHTML = '';
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
                let html = '<pre style="line-height:1.6;font-family:var(--font-mono)">\n<span class="c-accent">== MODELS ==</span>\n';
                for (const [key, cfg] of Object.entries(Providers.MODELS)) {
                    const active = key === Providers.getActive() ? ' <span class="c-green">\u25C6</span>' : '  ';
                    const hasKey = Providers.hasKey(key) ? '<span class="c-green">\u2713</span>' : '<span class="c-red">\u2717</span>';
                    html += `${active} <span class="c-amber">${key.padEnd(12)}</span>${cfg.label.padEnd(18)}${cfg.id.padEnd(34)}${hasKey}\n`;
                }
                html += '\n<span class="c-dim">Type model &lt;name&gt; to switch.</span></pre>';
                showOutput(html);
                return;
            }
            if (Providers.MODELS[name]) {
                Providers.setActive(name);
                updatePrompt();
                updateChatPanelLabel();
                showOutput(`<span class="c-green">Switched to ${Providers.MODELS[name].label}</span>`);
                return;
            }
        }

        // Resume chat
        if (lower === 'resume') {
            enterChat();
            return;
        }

        // Memory CLI
        const memMatch = trimmed.match(/^memory\s*(.*)/i);
        if (memMatch !== null && lower.startsWith('memory')) {
            handleMemoryCLI(memMatch[1]?.trim() || '');
            return;
        }

        // History CLI
        const histMatch = trimmed.match(/^history\s*(.*)/i);
        if (histMatch !== null && lower.startsWith('history')) {
            handleHistoryCLI(histMatch[1]?.trim() || '');
            return;
        }

        // Watchlist commands
        const watchMatch = trimmed.match(/^watch\s+(\S+)$/i);
        if (watchMatch && typeof Watchlist !== 'undefined') {
            const sym = watchMatch[1].toUpperCase();
            const cached = DATA_CACHE['quotes.json'];
            const pipelineQuotes = cached?.data || [];
            Watchlist.add(sym, pipelineQuotes);
            showOutput(`<span class="c-green">Added ${sym} to watchlist</span>`);

            // If symbol not in pipeline, fetch live data and inject into caches
            const inPipeline = pipelineQuotes.some(q => q.symbol === sym);
            if (!inPipeline && typeof LiveData !== 'undefined' && LiveData.isConfigured()) {
                showOutput(`<span class="c-dim">Fetching live data for ${sym}...</span>`);
                (async () => {
                    try {
                        const [quote, sp, liveTech] = await Promise.all([
                            LiveData.fetchQuote(sym),
                            LiveData.fetchSparkline(sym),
                            LiveData.fetchTechnicals(sym),
                        ]);
                        if (quote) {
                            pipelineQuotes.push(quote);
                            // Store name in meta cache
                            const metaCache = DATA_CACHE['meta.json'];
                            if (metaCache?.data) {
                                if (!metaCache.data.names) metaCache.data.names = {};
                                metaCache.data.names[sym] = quote.name || sym;
                            }
                        }
                        if (sp) {
                            const spCache = DATA_CACHE['sparklines.json'];
                            if (spCache?.data) spCache.data[sym] = sp;
                        }
                        if (liveTech) {
                            const tCache = DATA_CACHE['technicals.json'];
                            if (tCache?.data) tCache.data[sym] = liveTech;
                        }
                        if (quote) {
                            showOutput(`<span class="c-green">${sym} data loaded</span>`);
                            Sidebar.render();
                        } else {
                            showOutput(`<span class="c-amber">Could not fetch data for ${sym}</span>`);
                        }
                    } catch (e) {
                        showOutput(`<span class="negative">Error fetching ${sym}: ${e.message}</span>`);
                    }
                })();
            }
            Sidebar.render();
            return;
        }
        const unwatchMatch = trimmed.match(/^unwatch\s+(\S+)$/i);
        if (unwatchMatch && typeof Watchlist !== 'undefined') {
            Watchlist.remove(unwatchMatch[1].toUpperCase());
            showOutput(`<span class="c-amber">Removed ${unwatchMatch[1].toUpperCase()} from watchlist</span>`);
            Sidebar.render();
            return;
        }
        if ((lower === 'wl' || lower === 'watch') && typeof Watchlist !== 'undefined') {
            Watchlist.show();
            return;
        }

        // Alert commands
        const alertSetMatch = trimmed.match(/^alert\s+(\S+)\s*([><])\s*(\d+\.?\d*)$/i);
        if (alertSetMatch && typeof Alerts !== 'undefined') {
            Alerts.add(alertSetMatch[1].toUpperCase(), alertSetMatch[2], parseFloat(alertSetMatch[3]));
            return;
        }
        const alertRmMatch = trimmed.match(/^alert\s+rm\s+(\d+)$/i);
        if (alertRmMatch && typeof Alerts !== 'undefined') {
            Alerts.remove(parseInt(alertRmMatch[1]));
            return;
        }
        if (lower === 'alert' && typeof Alerts !== 'undefined') {
            Alerts.list();
            return;
        }

        // Group commands
        const groupRmMatch = trimmed.match(/^group\s+rm\s+(\S+)$/i);
        if (groupRmMatch && typeof Groups !== 'undefined') {
            Groups.remove(groupRmMatch[1]);
            showOutput(`<span class="c-amber">Removed group "${groupRmMatch[1]}"</span>`);
            return;
        }
        const groupSetMatch = trimmed.match(/^group\s+(\S+)\s+(.+)$/i);
        if (groupSetMatch && typeof Groups !== 'undefined') {
            const syms = groupSetMatch[2].split(/\s+/).map(s => s.toUpperCase());
            Groups.set(groupSetMatch[1], syms);
            showOutput(`<span class="c-green">Group "${groupSetMatch[1]}": ${syms.join(', ')}</span>`);
            return;
        }
        if (lower === 'group' && typeof Groups !== 'undefined') {
            Groups.show();
            return;
        }

        // Journal commands
        if (lower.startsWith('journal') && typeof Journal !== 'undefined') {
            Journal.handle(trimmed.replace(/^journal\s*/i, ''));
            return;
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
                const params = {};
                if (dc.param === 'symbol') params.symbol = m[1].toUpperCase();
                if (dc.param === 'symbols') params.symbols = m[1];
                showView(dc.page, dc.data, params);
                return;
            }
        }

        // Deferred pipeline commands
        const deferredWord = lower.split(/\s+/)[0];
        if (DEFERRED_CMDS.includes(deferredWord)) {
            showOutput(`<span class="c-amber">${deferredWord}</span> <span class="c-dim">requires pipeline data — coming in a future update</span>`);
            return;
        }

        // If in chat mode, send to AI
        if (_chatMode) {
            if (typeof ChatEngine !== 'undefined') ChatEngine.sendFromInput(trimmed);
            return;
        }

        // Unknown command
        showOutput(`<span class="c-dim">Unknown command:</span> ${trimmed.replace(/</g,'&lt;')}. <span class="c-dim">Type</span> <span class="c-green">?</span> <span class="c-dim">for help.</span>`);
    }

    /** Show a quick output in main panel (appends). */
    function showOutput(html) {
        const panel = document.getElementById('main-panel');
        _appendOutput(panel, html);
        _chatMode = false;
        updatePrompt();
    }

    // --- Memory CLI ---
    function handleMemoryCLI(args) {
        if (typeof Memory === 'undefined') { showOutput('<span class="c-dim">Memory module not loaded</span>'); return; }
        const mems = Memory.load();

        if (!args || args === 'list') {
            if (!mems.length) { showOutput('<span class="c-dim">No memories saved.</span>'); return; }
            let html = '<pre style="font-family:var(--font-mono);line-height:1.6"><span class="c-accent">== MEMORIES ==</span>\n';
            for (const m of mems) {
                const truncated = m.text.length > 60 ? m.text.slice(0, 60) + '...' : m.text;
                html += `  <span class="c-amber">${String(m.id).padEnd(4)}</span><span class="c-dim">${truncated}</span>\n`;
            }
            html += '</pre>';
            showOutput(html);
            return;
        }

        const addMatch = args.match(/^add\s+(.+)/i);
        if (addMatch) {
            Memory.addMemory(addMatch[1]);
            _refreshChatPrompt();
            showOutput(`<span class="c-green">Memory saved.</span>`);
            return;
        }

        const editMatch = args.match(/^edit\s+(\d+)\s+(.+)/i);
        if (editMatch) {
            Memory.editMemory(parseInt(editMatch[1]), editMatch[2]);
            _refreshChatPrompt();
            showOutput(`<span class="c-green">Memory ${editMatch[1]} updated.</span>`);
            return;
        }

        const delMatch = args.match(/^delete\s+(\d+)/i);
        if (delMatch) {
            Memory.removeMemory(parseInt(delMatch[1]));
            _refreshChatPrompt();
            showOutput(`<span class="c-amber">Memory ${delMatch[1]} deleted.</span>`);
            return;
        }

        // Show single memory
        const idMatch = args.match(/^(\d+)$/);
        if (idMatch) {
            const mem = mems.find(m => m.id === parseInt(idMatch[1]));
            if (mem) showOutput(`<span class="c-accent">[${mem.id}]</span> ${mem.text}`);
            else showOutput('<span class="c-dim">Memory not found.</span>');
            return;
        }

        showOutput('<span class="c-dim">Usage: memory [list|add|edit ID|delete ID|ID]</span>');
    }

    // --- History CLI ---
    function handleHistoryCLI(args) {
        if (typeof ChatEngine === 'undefined') { showOutput('<span class="c-dim">Chat module not loaded</span>'); return; }
        const history = window._chatHistory || [];

        if (!args || args === 'show') {
            if (!history.length) { showOutput('<span class="c-dim">No chat history.</span>'); return; }
            let html = '<pre style="font-family:var(--font-mono);line-height:1.6"><span class="c-accent">== CHAT HISTORY ==</span>\n';
            const recent = history.slice(-20);
            for (let i = 0; i < recent.length; i++) {
                const msg = recent[i];
                const truncated = (msg.text || '').slice(0, 80);
                const roleCls = msg.role === 'user' ? 'c-dim' : 'c-accent';
                html += `<span class="${roleCls}">${msg.role === 'user' ? 'Q' : 'A'}:</span> ${truncated.replace(/</g,'&lt;')}${msg.text?.length > 80 ? '...' : ''}\n`;
            }
            html += '</pre>';
            showOutput(html);
            return;
        }

        if (args === 'clear') {
            window._chatHistory = [];
            showOutput('<span class="c-amber">Chat history cleared.</span>');
            return;
        }

        const searchMatch = args.match(/^search\s+(.+)/i);
        if (searchMatch) {
            const term = searchMatch[1].toLowerCase();
            const results = history.filter(m => (m.text || '').toLowerCase().includes(term));
            if (!results.length) { showOutput(`<span class="c-dim">No matches for "${searchMatch[1]}"</span>`); return; }
            let html = `<pre style="font-family:var(--font-mono);line-height:1.6"><span class="c-accent">== SEARCH: ${searchMatch[1]} (${results.length} matches) ==</span>\n`;
            for (const msg of results.slice(-10)) {
                const roleCls = msg.role === 'user' ? 'c-dim' : 'c-accent';
                html += `<span class="${roleCls}">${msg.role === 'user' ? 'Q' : 'A'}:</span> ${(msg.text||'').slice(0,80).replace(/</g,'&lt;')}\n`;
            }
            html += '</pre>';
            showOutput(html);
            return;
        }

        const delMatch = args.match(/^delete\s+(\d+)/i);
        if (delMatch) {
            const idx = parseInt(delMatch[1]);
            if (idx >= 0 && idx < history.length) {
                history.splice(idx, 1);
                showOutput(`<span class="c-amber">Deleted history entry ${idx}.</span>`);
            } else {
                showOutput('<span class="c-dim">Invalid index.</span>');
            }
            return;
        }

        showOutput('<span class="c-dim">Usage: history [show|clear|search TERM|delete N]</span>');
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
        document.getElementById('key-proxy').value = Config.get('proxy');
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
            Config.set('proxy', document.getElementById('key-proxy').value.trim());
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

    // --- Mobile sidebar toggle ---
    function initMobileToggle() {
        const btn = document.getElementById('sidebar-toggle');
        const sidebar = document.getElementById('sidebar');
        if (btn) {
            btn.addEventListener('click', () => {
                sidebar.classList.toggle('mobile-open');
            });
        }
    }

    // --- Clock ---
    function tickClock() {
        const el = document.getElementById('clock');
        if (el) {
            const now = new Date();
            const time = now.toLocaleTimeString('en-US', {
                hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York', hour12: false,
            });
            // Green dot = data loaded, red dot = no data yet
            const hasData = !!DATA_CACHE['quotes.json']?.data;
            const dot = hasData ? '<span class="c-green">\u25CF</span>' : '<span class="c-red">\u25CF</span>';
            el.innerHTML = `${time} ET ${dot}`;
        }
        // Also check sidebar staleness
        if (typeof Sidebar !== 'undefined' && Sidebar.checkStaleness) Sidebar.checkStaleness();
    }

    // --- Context menu ---
    function initContextMenu() {
        document.addEventListener('contextmenu', (e) => {
            const link = e.target.closest('.sym-link');
            if (!link) return;
            e.preventDefault();
            const sym = link.textContent.trim();
            removeContextMenu();

            const menu = document.createElement('div');
            menu.className = 'ctx-menu';
            menu.style.left = e.clientX + 'px';
            menu.style.top = e.clientY + 'px';

            const items = [
                { label: 'Lookup', cmd: sym },
                { label: 'Technicals', cmd: `ta ${sym}` },
                { label: 'Chart', cmd: `chart ${sym}` },
                { label: 'News', cmd: `news ${sym}` },
                { label: 'Intraday', cmd: `intra ${sym}` },
                { label: 'Dividends', cmd: `div ${sym}` },
                { label: 'Short Interest', cmd: `short ${sym}` },
                { label: 'Analyst Ratings', cmd: `rating ${sym}` },
                { sep: true },
                { label: 'Add to Watchlist', cmd: `watch ${sym}` },
            ];

            for (const item of items) {
                if (item.sep) {
                    const sep = document.createElement('div');
                    sep.className = 'ctx-menu-sep';
                    menu.appendChild(sep);
                } else {
                    const el = document.createElement('div');
                    el.className = 'ctx-menu-item';
                    el.textContent = item.label;
                    el.addEventListener('click', () => { removeContextMenu(); processInput(item.cmd); });
                    menu.appendChild(el);
                }
            }
            document.body.appendChild(menu);
        });

        document.addEventListener('click', removeContextMenu);
    }

    function removeContextMenu() {
        document.querySelectorAll('.ctx-menu').forEach(m => m.remove());
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
            { pattern: /^\/corr$/,            page: 'correlation', data: ['sparklines.json','meta.json'] },
            { pattern: /^\/chat$/,            page: null,          chat: true },
            { pattern: /^\/ta\/(.+)$/,        page: 'technicals',  data: ['technicals.json'], param: 'symbol' },
            { pattern: /^\/lookup\/(.+)$/,    page: 'lookup',      data: [],                  param: 'symbol' },
            { pattern: /^\/charts\/(.+)$/,    page: 'charts',      data: [],                  param: 'symbol' },
            { pattern: /^\/intra\/(.+)$/,     page: 'intraday',    data: [],                  param: 'symbol' },
            { pattern: /^\/div\/(.+)$/,       page: 'dividends',   data: [],                  param: 'symbol' },
            { pattern: /^\/short\/(.+)$/,     page: 'short',       data: [],                  param: 'symbol' },
            { pattern: /^\/rating\/(.+)$/,    page: 'ratings',     data: [],                  param: 'symbol' },
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
                // Check alerts on data refresh
                if (typeof Alerts !== 'undefined') {
                    const quotes = await loadData('quotes.json');
                    if (quotes) Alerts.check(quotes);
                }
            }
            if (meta) _lastTimestamp = meta.timestamp;
        }, 60000);
    }

    // --- Chat panel ---
    function initChatPanel() {
        const chatInput = document.getElementById('chat-input');
        if (chatInput) {
            chatInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const text = chatInput.value.trim();
                    if (!text) return;
                    if (typeof ChatEngine !== 'undefined') ChatEngine.sendFromInput(text);
                    chatInput.value = '';
                }
            });
        }
        const closeBtn = document.getElementById('chat-panel-close');
        if (closeBtn) closeBtn.addEventListener('click', () => toggleChatPanel(false));

        const toggleBtn = document.getElementById('chat-toggle');
        if (toggleBtn) toggleBtn.addEventListener('click', () => toggleChatPanel());

        // Model cycle button — cycles through models
        const modelBtn = document.getElementById('chat-btn-model');
        if (modelBtn) {
            modelBtn.addEventListener('click', () => {
                const keys = Object.keys(Providers.MODELS);
                const idx = keys.indexOf(Providers.getActive());
                const next = keys[(idx + 1) % keys.length];
                Providers.setActive(next);
                updatePrompt();
                updateChatPanelLabel();
                _showChatNotice(`Switched to ${Providers.MODELS[next].label}`);
            });
        }

        // Memory viewer button
        const memBtn = document.getElementById('chat-btn-memory');
        if (memBtn) {
            memBtn.addEventListener('click', () => {
                if (typeof Memory === 'undefined') return;
                const mems = Memory.load();
                if (!mems.length) { _showChatNotice('No memories saved.'); return; }
                let html = '<div class="c-accent" style="font-weight:700;margin-bottom:4px">Memories</div>';
                for (const m of mems) {
                    html += `<div style="padding:2px 0;font-size:11px"><span class="c-amber">[${m.id}]</span> <span class="c-dim">${m.text.replace(/</g,'&lt;')}</span></div>`;
                }
                _showChatNotice(html);
            });
        }

        // Clear chat button
        const clearBtn = document.getElementById('chat-btn-clear');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                window._chatHistory = [];
                const scroll = document.getElementById('chat-panel-scroll');
                if (scroll) {
                    scroll.innerHTML = '';
                    const hint = document.createElement('div');
                    hint.className = 'c-dim';
                    hint.style.padding = '8px 0';
                    hint.textContent = 'Chat cleared. Type messages below.';
                    scroll.appendChild(hint);
                }
                ChatEngine._setScrollEl(scroll);
            });
        }
    }

    /** Show a transient notice in the chat panel. */
    function _showChatNotice(html) {
        const scroll = document.getElementById('chat-panel-scroll');
        if (!scroll) return;
        const notice = document.createElement('div');
        notice.className = 'chat-msg';
        notice.innerHTML = `<div style="padding:4px 0;font-size:12px">${html}</div>`;
        scroll.appendChild(notice);
        scroll.scrollTop = scroll.scrollHeight;
    }

    // --- Chat panel resize ---
    function initChatResize() {
        const handle = document.getElementById('chat-resize-handle');
        const chatPanel = document.getElementById('chat-panel');
        if (!handle || !chatPanel) return;
        let dragging = false;
        handle.addEventListener('mousedown', () => { dragging = true; });
        document.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            const w = Math.max(250, Math.min(700, window.innerWidth - e.clientX));
            chatPanel.style.width = w + 'px';
            const sidebar = document.getElementById('sidebar');
            const sideW = sidebar.getBoundingClientRect().width;
            document.getElementById('layout').style.gridTemplateColumns = `${sideW}px 3px 1fr 3px ${w}px`;
        });
        document.addEventListener('mouseup', () => { dragging = false; });
    }

    // --- Init ---
    function init() {
        initSettings();
        initResize();
        initChatResize();
        initMobileToggle();
        initChatPanel();
        initContextMenu();

        const input = document.getElementById('input');
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                processInput(input.value);
                input.value = '';
            }
            if (e.key === 'Escape' && _chatMode) {
                _chatMode = false;
                updatePrompt();
                showDashboard();
            }
        });

        window.addEventListener('hashchange', handleHash);

        Sidebar.renderStatusBar();
        Sidebar.render();

        handleHash();

        tickClock();
        setInterval(tickClock, 10000);
        startRefresh();
        input.focus();

        // Auto-open chat panel on wide screens
        if (isWideScreen()) toggleChatPanel(true);

        // Global keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.target === input) return;
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
            if (e.ctrlKey || e.metaKey || e.altKey) return;

            // Single-key shortcuts (only when not typing)
            const shortcuts = { 't': 't', 's': 's', 'e': 'e', 'r': 'r', '?': '?' };
            if (shortcuts[e.key]) {
                e.preventDefault();
                processInput(shortcuts[e.key]);
                return;
            }
            if (e.key === '/') {
                e.preventDefault();
                input.focus();
                return;
            }
            if (e.key === 'Escape') {
                if (_chatMode) {
                    _chatMode = false;
                    updatePrompt();
                }
                document.getElementById('main-panel').innerHTML = '';
                showDashboard();
                return;
            }

            // Any other printable key → focus input
            if (e.key.length === 1) {
                input.focus();
            }
        });
    }

    document.addEventListener('DOMContentLoaded', init);

    return { loadData, registerPage, invalidateCache, showView, showDashboard, enterChat, showOutput };
})();
