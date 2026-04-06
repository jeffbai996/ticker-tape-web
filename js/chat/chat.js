/**
 * chat.js — Chat in the main panel. TUI-style Q:/A: format.
 * Renders into the main panel. Uses Providers for streaming.
 * ChatEngine global allows the input bar to send messages.
 * All innerHTML from AI-generated markdown + our pipeline data.
 */

// Chat history (persists across page switches within session)
if (!window._chatHistory) window._chatHistory = [];

const ChatEngine = (() => {
    let _scrollEl = null;
    let _systemPrompt = '';
    let _sending = false;

    function sendFromInput(text) {
        if (_sending) return;
        if (!_scrollEl) return;
        // Block if no API key for active model
        if (!Providers.hasKey()) {
            const div = document.createElement('div');
            div.className = 'chat-msg';
            div.innerHTML = '<span class="negative">No API key set for ' + Providers.getActiveConfig().label + '.</span> <span class="c-dim">Type</span> <span class="c-green">settings</span> <span class="c-dim">to add one.</span>';
            _scrollEl.appendChild(div);
            _scrollEl.scrollTop = _scrollEl.scrollHeight;
            return;
        }
        _doSend(text);
    }

    async function _doSend(text) {
        _sending = true;
        const history = window._chatHistory;

        // Add user message
        const userMsg = { role: 'user', text, ts: new Date().toISOString(), model: Providers.getActive() };
        history.push(userMsg);

        // Render user message
        const userDiv = document.createElement('div');
        userDiv.className = 'chat-msg';
        userDiv.innerHTML = `<span class="q-label">Q:</span> ${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}`;
        _scrollEl.appendChild(userDiv);

        // Create assistant placeholder
        const aDiv = document.createElement('div');
        aDiv.className = 'chat-msg';
        aDiv.innerHTML = '<span class="a-label">A:</span> <span class="chat-thinking">thinking...</span>';
        _scrollEl.appendChild(aDiv);
        _scroll();

        // Stream
        let fullText = '';
        const trimmed = trimForContext(history);
        const apiMessages = trimmed.map(m => ({ role: m.role, text: m.text }));

        try {
            for await (const chunk of Providers.stream(_systemPrompt, apiMessages)) {
                switch (chunk.type) {
                    case 'text':
                        fullText += chunk.text;
                        aDiv.innerHTML = '<span class="a-label">A:</span>\n' + Markdown.toHTML(fullText);
                        _scroll();
                        break;
                    case 'thinking':
                        if (!fullText) {
                            aDiv.innerHTML = '<span class="a-label">A:</span> <span class="chat-thinking">thinking...</span>';
                        }
                        break;
                    case 'search':
                        aDiv.innerHTML += `<div class="search-indicator">\uD83D\uDD0D Searching: ${chunk.text.replace(/</g, '&lt;')}</div>`;
                        _scroll();
                        break;
                    case 'code':
                        aDiv.innerHTML += `<div class="code-exec-block"><span class="c-purple">\u2699 Code</span><pre><code>${chunk.text.replace(/</g, '&lt;')}</code></pre></div>`;
                        _scroll();
                        break;
                    case 'code_output':
                        aDiv.innerHTML += `<div class="code-exec-block"><span class="c-purple">Output</span><pre>${chunk.text.replace(/</g, '&lt;')}</pre></div>`;
                        _scroll();
                        break;
                    case 'error':
                        aDiv.innerHTML += `<div class="negative">\u26A0 ${chunk.text.replace(/</g, '&lt;')}</div>`;
                        break;
                    case 'done':
                        break;
                }
            }
        } catch (e) {
            aDiv.innerHTML += `<div class="negative">\u26A0 ${(e.message||'').replace(/</g,'&lt;')}</div>`;
        }

        // Parse memory tags
        fullText = Memory.parseTags(fullText);
        aDiv.innerHTML = '<span class="a-label">A:</span>\n' + Markdown.toHTML(fullText);

        history.push({ role: 'assistant', text: fullText, ts: new Date().toISOString(), model: Providers.getActive() });
        _sending = false;
    }

    function _scroll() {
        if (_scrollEl) _scrollEl.scrollTop = _scrollEl.scrollHeight;
    }

    /** Show last N turns of history (for resume command). */
    function showRecentHistory(n) {
        if (!_scrollEl) return;
        const history = window._chatHistory;
        // Already rendered by page init — just scroll to bottom
        _scroll();
    }

    return { sendFromInput, showRecentHistory, _setScrollEl: (el) => { _scrollEl = el; }, _setPrompt: (p) => { _systemPrompt = p; } };
})();

// Register chat as a page
App.registerPage('chat', function(container, data) {
    const quotes = data['quotes.json'] || [];
    const tech = data['technicals.json'] || {};
    const meta = data['meta.json'] || {};

    const systemPrompt = buildSystemPrompt(quotes, tech, meta);
    ChatEngine._setPrompt(systemPrompt);

    // Render chat history
    const scroll = document.createElement('div');
    scroll.className = 'chat-scroll';

    const history = window._chatHistory;
    for (const msg of history) {
        const div = document.createElement('div');
        div.className = 'chat-msg';
        if (msg.role === 'user') {
            div.innerHTML = `<span class="q-label">Q:</span> ${msg.text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}`;
        } else {
            div.innerHTML = '<span class="a-label">A:</span>\n' + Markdown.toHTML(msg.text);
        }
        scroll.appendChild(div);
    }

    if (!history.length) {
        const hint = document.createElement('div');
        hint.className = 'c-dim';
        hint.style.padding = '8px 0';
        hint.textContent = 'Chat mode. Type messages below. Type "back" or press Esc to exit.';
        scroll.appendChild(hint);
    }

    container.replaceChildren(scroll);
    ChatEngine._setScrollEl(scroll);

    scroll.scrollTop = scroll.scrollHeight;
});

function buildSystemPrompt(quotes, tech, meta) {
    const now = new Date();
    const parts = [
        'You are a sharp, knowledgeable AI assistant embedded in a trading terminal.',
        'You can discuss any topic \u2014 finance, geopolitics, technology, science, coding, AI, current events.',
        '',
        `Current date/time: ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}`,
        `Market state: ${meta.market_state || 'unknown'}`,
    ];

    const profile = Config.get('profile');
    if (profile) parts.push('', 'USER PROFILE:', profile);

    parts.push(
        '', 'OUTPUT FORMAT: Use markdown. Use Unicode math (\u00B2, \u221A, \u03A3, \u03C0, \u00B1) instead of LaTeX.',
        '', 'MEMORY TOOLS: Save/edit/delete memories using tags:',
        '  [MEMORY: <text>]  [MEMORY_EDIT: <id> | <text>]  [MEMORY_DELETE: <id>]',
        'Only use when user explicitly asks.',
    );

    if (quotes?.length) {
        parts.push('', 'Current quotes:');
        for (const q of quotes) {
            let line = `  ${q.symbol}: $${Number(q.price).toFixed(2)} (${q.pct >= 0 ? '+' : ''}${Number(q.pct).toFixed(2)}%)`;
            if (q.ext_price) line += ` [${q.ext_label} $${Number(q.ext_price).toFixed(2)}]`;
            parts.push(line);
        }
    }

    if (tech && Object.keys(tech).length) {
        parts.push('', 'Technical signals:');
        for (const [sym, t] of Object.entries(tech)) {
            const s = [];
            if (t.rsi != null) s.push(`RSI ${t.rsi.toFixed(0)}`);
            if (t.sma_50 != null) s.push(t.current > t.sma_50 ? 'above 50d' : 'below 50d');
            if (t.off_high != null) s.push(`${t.off_high.toFixed(1)}% from 52w high`);
            if (s.length) parts.push(`  ${sym}: ${s.join(', ')}`);
        }
    }

    const memBlock = Memory.formatForPrompt();
    if (memBlock) parts.push('', memBlock);

    return parts.join('\n');
}

function trimForContext(history) {
    const cfg = Providers.getActiveConfig();
    const budget = (cfg?.ctx || 180000) - 20000;
    let trimmed = [...history];
    while (trimmed.length > 0) {
        const total = trimmed.reduce((s, m) => s + (m.text?.length || 0), 0) / 4;
        if (total <= budget) break;
        trimmed = trimmed.length >= 2 ? trimmed.slice(2) : trimmed.slice(1);
    }
    return trimmed;
}
