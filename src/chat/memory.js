// Chat memories: persistent facts injected into AI system prompts.
// Stored in localStorage.

const STORAGE_KEY = 'chat_memories'
const MAX_MEMORIES = 100

export function loadMemories() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

export function saveMemory(text) {
  const memories = loadMemories()
  const entry = {
    id: memories.length ? Math.max(...memories.map(m => m.id)) + 1 : 1,
    text,
    ts: new Date().toISOString(),
  }
  memories.push(entry)
  if (memories.length > MAX_MEMORIES) memories.splice(0, memories.length - MAX_MEMORIES)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(memories))
  return entry
}

export function removeMemory(id) {
  const memories = loadMemories().filter(m => m.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(memories))
}

export function formatMemoriesForPrompt() {
  const memories = loadMemories()
  if (!memories.length) return ''
  return '\n\n## Memories\n' + memories.map(m => `- ${m.text}`).join('\n')
}
