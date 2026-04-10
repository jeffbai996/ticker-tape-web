// Journal page: trade journal with add, search, delete.

import { loadEntries, addEntry, removeEntry, searchEntries } from '../lib/journal.js'
import { go } from '../router.js'

let listEl = null
let searchTerm = ''

export async function render(el) {
  const container = document.createElement('div')
  container.className = 'p-4 fade-in max-w-3xl'

  // Header
  const header = document.createElement('div')
  header.className = 'flex items-center justify-between mb-4'
  const h1 = document.createElement('h1')
  h1.className = 'text-lg font-semibold text-zinc-100'
  h1.textContent = 'Trade Journal'
  const countEl = document.createElement('span')
  countEl.className = 'text-xs text-zinc-500'
  header.append(h1, countEl)

  // Add entry section
  const addSection = document.createElement('div')
  addSection.className = 'card p-3 mb-4'

  const textarea = document.createElement('textarea')
  textarea.className = 'w-full bg-transparent border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 resize-none focus:outline-none focus:border-zinc-500'
  textarea.placeholder = 'Write a journal entry... (symbols like NVDA will be auto-tagged)'
  textarea.rows = 3

  const addRow = document.createElement('div')
  addRow.className = 'flex justify-end mt-2'
  const addBtn = document.createElement('button')
  addBtn.className = 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 rounded-md px-4 py-1.5 text-sm font-medium transition-colors'
  addBtn.textContent = 'Add Entry'
  addBtn.addEventListener('click', () => {
    const text = textarea.value.trim()
    if (!text) return
    addEntry(text)
    textarea.value = ''
    searchTerm = ''
    if (searchInput) searchInput.value = ''
    refreshList(countEl)
  })

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      addBtn.click()
    }
  })

  addRow.appendChild(addBtn)
  addSection.append(textarea, addRow)

  // Search
  const searchInput = document.createElement('input')
  searchInput.type = 'text'
  searchInput.className = 'w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 mb-4 focus:outline-none focus:border-zinc-500'
  searchInput.placeholder = 'Search entries...'
  searchInput.addEventListener('input', () => {
    searchTerm = searchInput.value.trim()
    refreshList(countEl)
  })

  // Entry list
  listEl = document.createElement('div')
  listEl.className = 'space-y-2'

  container.append(header, addSection, searchInput, listEl)
  el.textContent = ''
  el.appendChild(container)

  refreshList(countEl)
}

function refreshList(countEl) {
  if (!listEl) return
  const entries = searchTerm ? searchEntries(searchTerm) : loadEntries()
  const sorted = [...entries].reverse()

  if (countEl) {
    const total = loadEntries().length
    countEl.textContent = searchTerm
      ? `${sorted.length} of ${total} entries`
      : `${total} entries`
  }

  listEl.textContent = ''

  if (!sorted.length) {
    const empty = document.createElement('div')
    empty.className = 'card p-6 text-center'
    const msg = document.createElement('p')
    msg.className = 'text-zinc-500 text-sm'
    msg.textContent = searchTerm
      ? `No entries matching "${searchTerm}".`
      : 'No journal entries yet. Start by writing your first entry above.'
    empty.appendChild(msg)
    listEl.appendChild(empty)
    return
  }

  for (const entry of sorted) {
    const card = document.createElement('div')
    card.className = 'card p-3 space-y-1.5'

    // Top row: date + delete
    const topRow = document.createElement('div')
    topRow.className = 'flex items-center justify-between'
    const dateEl = document.createElement('span')
    dateEl.className = 'text-xs text-zinc-500'
    dateEl.textContent = new Date(entry.ts).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })

    const delBtn = document.createElement('button')
    delBtn.className = 'text-zinc-600 hover:text-red-400 text-xs transition-colors px-1'
    delBtn.textContent = 'x'
    delBtn.title = 'Delete entry'
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      removeEntry(entry.id)
      refreshList(countEl)
    })

    topRow.append(dateEl, delBtn)

    // Entry text
    const textEl = document.createElement('p')
    textEl.className = 'text-sm text-zinc-200 whitespace-pre-wrap'
    textEl.textContent = entry.text

    // Symbol badges
    card.append(topRow, textEl)

    if (entry.symbols?.length) {
      const badgeRow = document.createElement('div')
      badgeRow.className = 'flex gap-1.5 flex-wrap'
      for (const sym of entry.symbols) {
        const badge = document.createElement('button')
        badge.className = 'badge bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors cursor-pointer'
        badge.textContent = sym
        badge.addEventListener('click', (e) => {
          e.stopPropagation()
          go('lookup', sym)
        })
        badgeRow.appendChild(badge)
      }
      card.appendChild(badgeRow)
    }

    listEl.appendChild(card)
  }
}
