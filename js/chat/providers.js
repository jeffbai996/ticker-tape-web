/**
 * providers.js — Streaming AI chat for Anthropic, Google Gemini, and OpenAI.
 * Direct browser-to-API calls using fetch() + ReadableStream.
 * Mirrors ticker-tape's chat.py model registry and streaming backends.
 */
const Providers = (() => {

    const MODELS = {
        haiku:      { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5',     provider: 'anthropic', thinking: 0,    ctx: 200000, costIn: 1.00, costOut: 5.00 },
        sonnet:     { id: 'claude-sonnet-4-6',          label: 'Sonnet 4.6',    provider: 'anthropic', thinking: 4096, ctx: 180000, costIn: 3.00, costOut: 15.00 },
        opus:       { id: 'claude-opus-4-6',             label: 'Opus 4.6',     provider: 'anthropic', thinking: 8192, ctx: 180000, costIn: 5.00, costOut: 25.00 },
        flash:      { id: 'gemini-3-flash-preview',      label: 'Gemini Flash', provider: 'gemini',    thinking: 0,    ctx: 900000, costIn: 0.15, costOut: 0.60 },
        pro:        { id: 'gemini-3.1-pro-preview',      label: 'Gemini Pro',   provider: 'gemini',    thinking: 2048, ctx: 900000, costIn: 1.25, costOut: 5.00 },
        'gpt-mini': { id: 'gpt-5.4-mini',               label: 'GPT-5.4 mini', provider: 'openai',    thinking: 0,    ctx: 120000, costIn: 0.40, costOut: 1.60 },
        gpt:        { id: 'gpt-5.4',                     label: 'GPT-5.4',      provider: 'openai',    thinking: 0,    ctx: 120000, costIn: 2.50, costOut: 10.00 },
    };

    let activeModel = 'haiku';

    function getModels() { return MODELS; }
    function getActive() { return activeModel; }
    function setActive(key) { if (MODELS[key]) activeModel = key; }
    function getActiveConfig() { return MODELS[activeModel]; }

    /** Check if the provider's API key is configured. */
    function hasKey(modelKey) {
        const cfg = MODELS[modelKey || activeModel];
        if (!cfg) return false;
        return Config.hasKey(cfg.provider === 'anthropic' ? 'anthropic' : cfg.provider === 'gemini' ? 'google' : 'openai');
    }

    /**
     * Stream a chat message. Yields {type, text} objects:
     *   type: 'text' | 'thinking' | 'search' | 'code' | 'code_output' | 'error' | 'done'
     */
    async function* stream(systemPrompt, messages) {
        const cfg = MODELS[activeModel];
        if (!cfg) { yield { type: 'error', text: 'Unknown model' }; return; }

        try {
            if (cfg.provider === 'anthropic') {
                yield* streamAnthropic(cfg, systemPrompt, messages);
            } else if (cfg.provider === 'gemini') {
                yield* streamGemini(cfg, systemPrompt, messages);
            } else if (cfg.provider === 'openai') {
                yield* streamOpenAI(cfg, systemPrompt, messages);
            }
        } catch (e) {
            yield { type: 'error', text: e.message || String(e) };
        }
        yield { type: 'done' };
    }

    // --- Anthropic ---
    async function* streamAnthropic(cfg, systemPrompt, messages) {
        const key = Config.get('anthropic');
        if (!key) { yield { type: 'error', text: 'Anthropic API key not set. Use Settings.' }; return; }

        // Convert messages to Anthropic format
        const apiMessages = messages.map(m => ({ role: m.role, content: m.text }));

        const body = {
            model: cfg.id,
            max_tokens: 16000,
            system: systemPrompt,
            messages: apiMessages,
            stream: true,
            tools: [
                { type: 'web_search_20250305', name: 'web_search', max_uses: 5 },
                { type: 'code_execution_20250825', name: 'code_execution' },
            ],
        };
        if (cfg.thinking > 0) {
            body.thinking = { type: 'enabled', budget_tokens: cfg.thinking };
        }

        const resp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': key,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true',
                'anthropic-beta': 'web-search-2025-03-05,code-execution-2025-08-25',
            },
            body: JSON.stringify(body),
        });

        if (!resp.ok) {
            const err = await resp.text();
            yield { type: 'error', text: `Anthropic ${resp.status}: ${err.slice(0, 200)}` };
            return;
        }

        // Parse SSE stream
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let currentBlockType = null;
        let jsonBuffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split('\n');
            buffer = lines.pop(); // keep incomplete line

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const data = line.slice(6);
                if (data === '[DONE]') continue;

                let event;
                try { event = JSON.parse(data); } catch { continue; }

                switch (event.type) {
                    case 'content_block_start':
                        currentBlockType = event.content_block?.type;
                        jsonBuffer = '';
                        break;

                    case 'content_block_delta':
                        if (event.delta?.type === 'thinking_delta') {
                            yield { type: 'thinking', text: event.delta.thinking };
                        } else if (event.delta?.type === 'text_delta') {
                            yield { type: 'text', text: event.delta.text };
                        } else if (event.delta?.type === 'input_json_delta') {
                            jsonBuffer += event.delta.partial_json || '';
                        }
                        break;

                    case 'content_block_stop':
                        if (currentBlockType === 'web_search_tool_use' || currentBlockType === 'tool_use') {
                            try {
                                const args = JSON.parse(jsonBuffer);
                                if (args.query) yield { type: 'search', text: args.query };
                            } catch { /* ignore parse errors */ }
                        }
                        if (currentBlockType === 'code_execution_tool_use') {
                            try {
                                const args = JSON.parse(jsonBuffer);
                                if (args.code) yield { type: 'code', text: args.code };
                            } catch { /* ignore */ }
                        }
                        if (currentBlockType === 'code_execution_tool_result') {
                            yield { type: 'code_output', text: jsonBuffer };
                        }
                        jsonBuffer = '';
                        currentBlockType = null;
                        break;
                }
            }
        }
    }

    // --- Gemini ---
    async function* streamGemini(cfg, systemPrompt, messages) {
        const key = Config.get('google');
        if (!key) { yield { type: 'error', text: 'Google AI API key not set. Use Settings.' }; return; }

        // Convert to Gemini format
        const contents = messages.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.text }],
        }));

        const body = {
            contents,
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
            tools: [{ googleSearch: {} }, { codeExecution: {} }],
        };

        if (cfg.thinking > 0) {
            body.generationConfig.thinkingConfig = { thinkingBudget: cfg.thinking, includeThoughts: true };
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.id}:streamGenerateContent?alt=sse&key=${key}`;

        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!resp.ok) {
            const err = await resp.text();
            yield { type: 'error', text: `Gemini ${resp.status}: ${err.slice(0, 200)}` };
            return;
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                let chunk;
                try { chunk = JSON.parse(line.slice(6)); } catch { continue; }

                const parts = chunk?.candidates?.[0]?.content?.parts || [];
                for (const part of parts) {
                    if (part.thought && part.text) {
                        yield { type: 'thinking', text: part.text };
                    } else if (part.executableCode) {
                        yield { type: 'code', text: part.executableCode.code };
                    } else if (part.codeExecutionResult) {
                        yield { type: 'code_output', text: part.codeExecutionResult.output };
                    } else if (part.text) {
                        yield { type: 'text', text: part.text };
                    }
                }
            }
        }
    }

    // --- OpenAI ---
    async function* streamOpenAI(cfg, systemPrompt, messages) {
        const key = Config.get('openai');
        if (!key) { yield { type: 'error', text: 'OpenAI API key not set. Use Settings.' }; return; }

        const apiMessages = [
            { role: 'system', content: systemPrompt },
            ...messages.map(m => ({ role: m.role, content: m.text })),
        ];

        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`,
            },
            body: JSON.stringify({
                model: cfg.id,
                messages: apiMessages,
                stream: true,
            }),
        });

        if (!resp.ok) {
            const err = await resp.text();
            yield { type: 'error', text: `OpenAI ${resp.status}: ${err.slice(0, 200)}` };
            return;
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const data = line.slice(6);
                if (data === '[DONE]') continue;

                let chunk;
                try { chunk = JSON.parse(data); } catch { continue; }

                const delta = chunk?.choices?.[0]?.delta;
                if (!delta) continue;

                // Extended thinking (reasoning_content)
                if (delta.reasoning_content) {
                    yield { type: 'thinking', text: delta.reasoning_content };
                }
                if (delta.content) {
                    yield { type: 'text', text: delta.content };
                }
            }
        }
    }

    return { MODELS, getModels, getActive, setActive, getActiveConfig, hasKey, stream };
})();
