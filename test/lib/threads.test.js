import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => ({
  available: true,
  createThread: vi.fn(),
  deleteThread: vi.fn(),
  getThread: vi.fn(),
  listThreads: vi.fn(),
  updateThread: vi.fn(),
}))

vi.mock('../../src/lib/chatstore.js', () => ({
  chatstoreAvailable: () => store.available,
  createThread: store.createThread,
  deleteThread: store.deleteThread,
  getThread: store.getThread,
  listThreads: store.listThreads,
  updateThread: store.updateThread,
}))

import {
  currentThreadId, fetchThreadList, hydrateActiveThread, openThread,
  saveActiveHistory, startNewThread,
} from '../../src/lib/threads.js'

describe('chat sessions', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    store.available = true
    store.createThread.mockReset().mockResolvedValue({ id: 41 })
    store.getThread.mockReset().mockResolvedValue({ id: 52, messages: [{ role: 'user', content: 'older' }] })
    store.updateThread.mockReset().mockResolvedValue({})
    store.deleteThread.mockReset().mockResolvedValue({})
    store.listThreads.mockReset().mockResolvedValue([])
  })

  it('saves the current conversation before starting a new session', async () => {
    const messages = [{ role: 'user', content: 'do not lose me' }]
    saveActiveHistory(messages)

    await startNewThread(messages)

    expect(store.createThread).toHaveBeenCalledWith('do not lose me', messages)
    expect(currentThreadId()).toBeNull()
    expect(localStorage.getItem('chat_history_v1')).toBe('[]')
  })

  it('saves the current conversation before opening another session', async () => {
    localStorage.setItem('chat_thread_id', '41')
    const messages = [{ role: 'user', content: 'latest turn' }]
    saveActiveHistory(messages)

    const opened = await openThread(52, messages)

    expect(store.updateThread).toHaveBeenCalledWith(41, {
      messages,
      title: 'latest turn',
    })
    expect(opened).toEqual([{ role: 'user', content: 'older' }])
    expect(currentThreadId()).toBe(52)
  })

  it('keeps multiple sessions locally when no server store is configured', async () => {
    store.available = false
    const first = [{ role: 'user', content: 'first local session' }]
    saveActiveHistory(first)
    await startNewThread(first)

    const second = [{ role: 'user', content: 'second local session' }]
    saveActiveHistory(second)
    await startNewThread(second)

    const sessions = await fetchThreadList()
    expect(sessions.map((session) => session.title)).toEqual([
      'second local session', 'first local session',
    ])

    const opened = await openThread(sessions[1].id, [])
    expect(opened).toEqual(first)
  })

  it('hydrates the active session from the server instead of a device cache', async () => {
    const cached = [{ role: 'user', content: 'stale iPad cache' }]
    const shared = [{ role: 'user', content: 'latest shared session' }]
    localStorage.setItem('chat_thread_id', '52')
    localStorage.setItem('chat_history_v1', JSON.stringify(cached))
    store.getThread.mockResolvedValue({ id: 52, messages: shared })

    await expect(hydrateActiveThread()).resolves.toEqual(shared)
    expect(store.getThread).toHaveBeenCalledWith(52)
    expect(JSON.parse(localStorage.getItem('chat_history_v1'))).toEqual(shared)
  })

  it('preserves the cache but clears a pointer to a deleted server session', async () => {
    const cached = [{ role: 'user', content: 'recoverable local copy' }]
    localStorage.setItem('chat_thread_id', '99')
    localStorage.setItem('chat_history_v1', JSON.stringify(cached))
    store.getThread.mockRejectedValue(Object.assign(new Error('not found'), { status: 404 }))

    await expect(hydrateActiveThread()).resolves.toEqual(cached)
    expect(currentThreadId()).toBeNull()
    expect(JSON.parse(localStorage.getItem('chat_history_v1'))).toEqual(cached)
  })

  it('reports transport failures without discarding the active pointer', async () => {
    localStorage.setItem('chat_thread_id', '52')
    store.getThread.mockRejectedValue(new Error('network down'))

    await expect(hydrateActiveThread()).rejects.toThrow('network down')
    expect(currentThreadId()).toBe(52)
  })
})
