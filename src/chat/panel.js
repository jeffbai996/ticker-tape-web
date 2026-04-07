// Chat panel: AI conversation with streaming, model selection, context injection.

import { streamChat, getModelList } from './providers.js'
import { markdownToHTML } from './markdown.js'
import { formatMemoriesForPrompt } from './memory.js'
import { loadQuotes, loadMeta, loadTechnicals } from '../lib/data.js'
import { fmtPrice, fmtPct } from '../lib/format.js'
import { getState } from '../state.js'

let panelEl = null
let messagesEl = null
let inputEl = null
let currentModel = 'flash'
let chatHistory = []   // { role, content }
let isStreaming = false

export function initChatPanel(el) {
  panelEl = el
  buildPanel()
}

function buildPanel() {
  panelEl.textContent = ''
  panelEl.className = 'w-[360px] max-w-full max-xl:fixed max-xl:right-0 max-xl:top-8 max-xl:bottom-0 max-xl:z-40 bg-zinc-900 border-l border-zinc-800 flex flex-col overflow-hidden shrink-0 hidden transition-all duration-200'

  // Header
  const header = document.createElement('div')
  header.className = 'flex items-center justify-between px-3 py-2 border-b border-zinc-800 shrink-0'

  const title = document.createElement('span')
  title.className = 'text-sm font-medium text-zinc-300'
  title.textContent = 'AI Chat'

  // Model selector
  const modelSelect = document.createElement('select')
  modelSelect.className = 'bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 px-2 py-1 focus:outline-none'
  for (const m of getModelList()) {
    const opt = document.createElement('option')
    opt.value = m.key
    opt.textContent = m.label + (m.available ? '' : ' (no key)')
    opt.disabled = !m.available
    opt.selected = m.key === currentModel
    modelSelect.appendChild(opt)
  }
  modelSelect.addEventListener('change', () => { currentModel = modelSelect.value })

  const closeBtn = document.createElement('button')
  closeBtn.className = 'text-zinc-500 hover:text-zinc-300 text-lg transition-colors'
  closeBtn.textContent = '×'
  closeBtn.addEventListener('click', () => document.dispatchEvent(new Event('toggle-chat')))

  header.append(title, modelSelect, closeBtn)

  // Messages area
  messagesEl = document.createElement('div')
  messagesEl.className = 'flex-1 overflow-y-auto p-3 space-y-3'

  // Welcome message
  const welcome = document.createElement('div')
  welcome.className = 'text-xs text-zinc-500 text-center py-4'
  welcome.textContent = 'Ask about any symbol, market conditions, or trading ideas.'
  messagesEl.appendChild(welcome)

  // Input area
  const inputArea = document.createElement('div')
  inputArea.className = 'border-t border-zinc-800 p-2 shrink-0'

  const inputRow = document.createElement('div')
  inputRow.className = 'flex gap-2'

  inputEl = document.createElement('textarea')
  inputEl.className = 'flex-1 bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 resize-none focus:outline-none focus:border-zinc-500'
  inputEl.placeholder = 'Type a message...'
  inputEl.rows = 2
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  })

  const sendBtn = document.createElement('button')
  sendBtn.className = 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 rounded-md px-3 py-2 text-sm font-medium transition-colors self-end'
  sendBtn.textContent = 'Send'
  sendBtn.addEventListener('click', sendMessage)

  inputRow.append(inputEl, sendBtn)
  inputArea.appendChild(inputRow)

  panelEl.append(header, messagesEl, inputArea)
}

async function sendMessage() {
  const text = inputEl.value.trim()
  if (!text || isStreaming) return

  inputEl.value = ''
  isStreaming = true

  // Add user message
  chatHistory.push({ role: 'user', content: text })
  appendMessage('user', text)

  // Build system prompt with context
  const systemPrompt = await buildSystemPrompt()

  // Create assistant message container
  const { msgEl, contentEl, thinkingEl } = appendStreamMessage()

  let fullText = ''
  let thinkingText = ''

  try {
    for await (const chunk of streamChat(currentModel, chatHistory, systemPrompt)) {
      if (chunk.type === 'text') {
        fullText += chunk.content
        contentEl.innerHTML = markdownToHTML(fullText)
        messagesEl.scrollTop = messagesEl.scrollHeight
      } else if (chunk.type === 'thinking') {
        thinkingText += chunk.content
        thinkingEl.textContent = thinkingText
        thinkingEl.classList.remove('hidden')
        messagesEl.scrollTop = messagesEl.scrollHeight
      } else if (chunk.type === 'error') {
        contentEl.className = 'text-sm text-red-400'
        contentEl.textContent = chunk.content
      }
    }
  } catch (err) {
    contentEl.className = 'text-sm text-red-400'
    contentEl.textContent = `Error: ${err.message}`
  }

  if (fullText) {
    chatHistory.push({ role: 'assistant', content: fullText })
  }
  isStreaming = false
}

function appendMessage(role, content) {
  const wrapper = document.createElement('div')
  wrapper.className = `flex ${role === 'user' ? 'justify-end' : 'justify-start'}`

  const bubble = document.createElement('div')
  bubble.className = role === 'user'
    ? 'bg-amber-500/15 text-zinc-200 rounded-lg px-3 py-2 max-w-[85%] text-sm'
    : 'bg-zinc-800 text-zinc-300 rounded-lg px-3 py-2 max-w-[85%] text-sm'
  bubble.textContent = content

  wrapper.appendChild(bubble)
  messagesEl.appendChild(wrapper)
  messagesEl.scrollTop = messagesEl.scrollHeight
}

function appendStreamMessage() {
  const wrapper = document.createElement('div')
  wrapper.className = 'flex justify-start'

  const bubble = document.createElement('div')
  bubble.className = 'bg-zinc-800 text-zinc-300 rounded-lg px-3 py-2 max-w-[85%] text-sm space-y-2'

  const thinkingEl = document.createElement('div')
  thinkingEl.className = 'hidden text-xs text-zinc-500 italic border-l-2 border-zinc-700 pl-2 max-h-32 overflow-y-auto whitespace-pre-wrap'

  const contentEl = document.createElement('div')
  contentEl.className = 'prose-sm'

  // Streaming indicator
  const dot = document.createElement('span')
  dot.className = 'inline-block w-2 h-2 bg-amber-400 rounded-full animate-pulse'
  contentEl.appendChild(dot)

  bubble.append(thinkingEl, contentEl)
  wrapper.appendChild(bubble)
  messagesEl.appendChild(wrapper)
  messagesEl.scrollTop = messagesEl.scrollHeight

  return { msgEl: wrapper, contentEl, thinkingEl }
}

async function buildSystemPrompt() {
  const state = getState()
  let prompt = 'You are a helpful trading assistant embedded in a market dashboard. Be concise and direct. Use financial terminology naturally.'

  // Inject market context
  try {
    const [quotes, meta, technicals] = await Promise.all([
      loadQuotes(), loadMeta(), loadTechnicals()
    ])

    if (quotes?.length) {
      prompt += '\n\n## Current Quotes\n'
      for (const q of quotes) {
        const ta = technicals?.[q.symbol] || {}
        prompt += `${q.symbol}: $${fmtPrice(q.price)} (${fmtPct(q.pct)})`
        if (ta.rsi) prompt += ` RSI=${Math.round(ta.rsi)}`
        prompt += '\n'
      }
    }

    if (meta?.market_state) {
      prompt += `\nMarket state: ${meta.market_state}`
    }

    if (state.currentSymbol) {
      prompt += `\nUser is currently viewing: ${state.currentSymbol}`
    }
  } catch {}

  prompt += formatMemoriesForPrompt()
  return prompt
}

// Auto-init when chat panel becomes visible
document.addEventListener('toggle-chat', () => {
  const panel = document.getElementById('chat-panel')
  if (panel && !panel.querySelector('textarea')) {
    initChatPanel(panel)
  }
})
