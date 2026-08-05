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
  currentThreadId, openThread, saveActiveHistory, startNewThread,
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
})
