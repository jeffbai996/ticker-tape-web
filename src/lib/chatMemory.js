// Persistent chat memories (CLI memory.py parity, browser-resident). Facts
// the user asks the assistant to remember survive across sessions and models:
// stored here, injected into every turn's context, and mutated either by
// tools (native tool-calling path) or by [MEMORY: …] tags parsed out of the
// response text (the wire path has no tool API, tags work everywhere).

import { pushAdd, pushEdit, pushDelete } from './chatstore.js'

const KEY = 'chat_memories_v1'
const MAX_MEMORIES = 100

export function loadMemories() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY))
    if (Array.isArray(raw)) return raw.filter((m) => m && m.id != null && m.text)
  } catch { /* corrupt state = no memories */ }
  return []
}

function persist(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX_MEMORIES)))
  } catch { /* best-effort */ }
}

export function addMemory(text) {
  const t = (text || '').trim()
  if (!t) return null
  const list = loadMemories()
  const id = list.reduce((m, x) => Math.max(m, x.id), 0) + 1
  const mem = { id, text: t, ts: Date.now() }
  persist([...list, mem])
  // server ack rewrites the provisional id so later edits target the row
  pushAdd('memories', mem, (serverId) => {
    const cur = loadMemories()
    const hit = cur.find((m) => m.id === mem.id)
    if (hit && serverId !== mem.id) { hit.id = serverId; persist(cur) }
    mem.id = serverId
  })
  return mem
}

export function editMemory(id, text) {
  const t = (text || '').trim()
  const list = loadMemories()
  const hit = list.find((m) => m.id === Number(id))
  if (!hit || !t) return false
  hit.text = t
  persist(list)
  pushEdit('memories', Number(id), t)
  return true
}

export function removeMemory(id) {
  const list = loadMemories()
  const next = list.filter((m) => m.id !== Number(id))
  if (next.length === list.length) return false
  persist(next)
  pushDelete('memories', Number(id))
  return true
}

/** Context block for the system prompt; empty string when no memories. */
export function memoriesForPrompt() {
  const list = loadMemories()
  if (!list.length) return ''
  return ['MEMORIES (persistent facts from past conversations; ids for edits):',
    ...list.map((m) => `- [${m.id}] ${m.text}`)].join('\n')
}

/** Prompt instructions for the tag protocol (works on every model path). */
export const MEMORY_PROMPT =
  'MEMORY TAGS: you can persist facts across conversations with tags in your ' +
  'response — they are parsed out and never shown.\n' +
  '  Save:   [MEMORY: <text>]\n' +
  '  Edit:   [MEMORY_EDIT: <id> | <new text>]\n' +
  '  Delete: [MEMORY_DELETE: <id>]\n' +
  'ONLY use these when the user explicitly asks to remember, update, or ' +
  'forget something. Never save proactively.'

const TAG_RE = /\[MEMORY(?:_(?:DELETE|EDIT))?:\s*[^\]]+\]/g

/**
 * Apply and strip memory tags from a response. Returns
 * { text, notes } — text with tags removed, notes describing what happened.
 */
export function applyMemoryTags(text) {
  if (!text || !text.includes('[MEMORY')) return { text, notes: [] }
  const notes = []
  for (const m of text.matchAll(/\[MEMORY:\s*([^\]]+)\]/g)) {
    const mem = addMemory(m[1])
    if (mem) notes.push(`✓ memory #${mem.id} saved`)
  }
  for (const m of text.matchAll(/\[MEMORY_EDIT:\s*(\d+)\s*\|\s*([^\]]+)\]/g)) {
    notes.push(editMemory(m[1], m[2]) ? `✓ memory #${m[1]} updated` : `memory #${m[1]} not found`)
  }
  for (const m of text.matchAll(/\[MEMORY_DELETE:\s*(\d+)\s*\]/g)) {
    notes.push(removeMemory(m[1]) ? `✓ memory #${m[1]} deleted` : `memory #${m[1]} not found`)
  }
  return { text: text.replace(TAG_RE, '').replace(/[ \t]+\n/g, '\n').trim(), notes }
}
