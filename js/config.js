/**
 * config.js — localStorage key management.
 */
const Config = (() => {
    const KEYS = {
        anthropic: 'anthropic_key',
        google: 'google_key',
        openai: 'openai_key',
        tavily: 'tavily_key',
        profile: 'user_profile',
        proxy: 'proxy_url',
    };

    function get(name) { return localStorage.getItem(KEYS[name] || name) || ''; }

    function set(name, value) {
        if (value) localStorage.setItem(KEYS[name] || name, value);
        else localStorage.removeItem(KEYS[name] || name);
    }

    function hasKey(provider) { return !!get(provider); }

    return { get, set, hasKey };
})();
