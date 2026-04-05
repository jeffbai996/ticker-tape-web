/**
 * memory.js — localStorage-based memory system for AI chat.
 * Mirrors ticker-tape's memory.py with [MEMORY:] tag parsing.
 */
const Memory = (() => {
    const STORAGE_KEY = 'chat_memories';
    const MAX_ENTRIES = 100;

    function load() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        } catch {
            return [];
        }
    }

    function save(entries) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    }

    function nextId(entries) {
        return entries.length ? Math.max(...entries.map(e => e.id)) + 1 : 1;
    }

    function addMemory(text) {
        const entries = load();
        const entry = { id: nextId(entries), ts: new Date().toISOString(), text: text.trim() };
        entries.push(entry);
        // Enforce max
        while (entries.length > MAX_ENTRIES) entries.shift();
        // Resequence
        entries.forEach((e, i) => e.id = i + 1);
        save(entries);
        return entry;
    }

    function editMemory(id, text) {
        const entries = load();
        const entry = entries.find(e => e.id === id);
        if (!entry) return false;
        entry.text = text.trim();
        save(entries);
        return true;
    }

    function removeMemory(id) {
        let entries = load();
        const idx = entries.findIndex(e => e.id === id);
        if (idx === -1) return false;
        entries.splice(idx, 1);
        entries.forEach((e, i) => e.id = i + 1);
        save(entries);
        return true;
    }

    /** Format memories block for system prompt injection. */
    function formatForPrompt() {
        const entries = load();
        if (!entries.length) return '';
        const lines = ['MEMORIES (persistent facts from past conversations):'];
        for (const e of entries) {
            lines.push(`  #${e.id}  ${e.text}`);
        }
        return lines.join('\n');
    }

    /**
     * Parse AI response for memory tags and execute them.
     * Returns the response text with tags stripped.
     */
    function parseTags(text) {
        const actions = [];

        // [MEMORY: text]
        text = text.replace(/\[MEMORY:\s*(.+?)\]/g, (_, memText) => {
            actions.push({ type: 'save', text: memText.trim() });
            return '';
        });

        // [MEMORY_EDIT: id | text]
        text = text.replace(/\[MEMORY_EDIT:\s*(\d+)\s*\|\s*(.+?)\]/g, (_, id, memText) => {
            actions.push({ type: 'edit', id: parseInt(id), text: memText.trim() });
            return '';
        });

        // [MEMORY_DELETE: id]
        text = text.replace(/\[MEMORY_DELETE:\s*(\d+)\]/g, (_, id) => {
            actions.push({ type: 'delete', id: parseInt(id) });
            return '';
        });

        // Execute actions
        for (const action of actions) {
            switch (action.type) {
                case 'save': addMemory(action.text); break;
                case 'edit': editMemory(action.id, action.text); break;
                case 'delete': removeMemory(action.id); break;
            }
        }

        return text.trim();
    }

    return { load, addMemory, editMemory, removeMemory, formatForPrompt, parseTags };
})();
