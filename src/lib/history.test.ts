// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Conversation } from './chat'
import { CURRENT_KEY, HISTORY_KEY, loadHistory, MAX_CONVERSATIONS, saveHistory } from './history'

function conversation(id: string, updatedAt: number, overrides: Partial<Conversation> = {}): Conversation {
  return {
    id,
    title: `문의 ${id}`,
    createdAt: updatedAt,
    updatedAt,
    messages: [
      { id: `${id}-u`, role: 'user', content: '배송이 늦어요', status: 'done', createdAt: updatedAt },
      { id: `${id}-a`, role: 'assistant', content: '답변', status: 'done', createdAt: updatedAt, provider: 'local' },
    ],
    ...overrides,
  }
}

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('history', () => {
  it('저장하고 최신순으로 불러온다. 마지막으로 보던 대화도', () => {
    expect(saveHistory([conversation('a', 1), conversation('b', 3), conversation('c', 2)])).toBe(true)
    localStorage.setItem(CURRENT_KEY, 'c')
    const { conversations, currentId } = loadHistory()
    expect(conversations.map((c) => c.id)).toEqual(['b', 'c', 'a'])
    expect(currentId).toBe('c')
  })

  it('저장본이 없거나 깨졌거나 버전이 다르면 빈 내역', () => {
    expect(loadHistory()).toEqual({ conversations: [], currentId: null })
    localStorage.setItem(HISTORY_KEY, '{깨짐')
    expect(loadHistory().conversations).toEqual([])
    localStorage.setItem(HISTORY_KEY, JSON.stringify({ version: 2, conversations: [conversation('a', 1)] }))
    expect(loadHistory().conversations).toEqual([])
  })

  it('형식이 틀린 대화만 버리고 나머지는 불러온다', () => {
    const broken = { ...conversation('b', 2), messages: [{ id: 'x', role: 'robot', content: 1 }] }
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify({ version: 1, conversations: [conversation('a', 1), broken, null, 'x', conversation('c', 3)] }),
    )
    expect(loadHistory().conversations.map((c) => c.id)).toEqual(['c', 'a'])
  })

  it('없는 대화를 마지막으로 보던 대화로 가리키면 새 문의 화면', () => {
    saveHistory([conversation('a', 1)])
    localStorage.setItem(CURRENT_KEY, '지워진-대화')
    expect(loadHistory().currentId).toBeNull()
  })

  it('pending · streaming으로 남은 답변은 stopped로 불러온다', () => {
    const c = conversation('a', 1)
    c.messages[1] = { ...c.messages[1], status: 'streaming', content: '받던 중' }
    const d = conversation('b', 2)
    d.messages[1] = { ...d.messages[1], status: 'pending', content: '' }
    saveHistory([c, d])
    const loaded = loadHistory().conversations
    expect(loaded.map((x) => x.messages[1].status)).toEqual(['stopped', 'stopped'])
    expect(loaded[1].messages[1].content).toBe('받던 중')
  })

  it('updatedAt이 없는 예전 저장본은 createdAt으로 채운다', () => {
    const { updatedAt: _u, ...old } = conversation('a', 5)
    localStorage.setItem(HISTORY_KEY, JSON.stringify({ version: 1, conversations: [old] }))
    expect(loadHistory().conversations[0].updatedAt).toBe(5)
  })

  it(`최신 ${MAX_CONVERSATIONS}개까지만 저장한다`, () => {
    const many = Array.from({ length: MAX_CONVERSATIONS + 10 }, (_, i) => conversation(`c${i}`, i))
    saveHistory(many)
    const loaded = loadHistory().conversations
    expect(loaded).toHaveLength(MAX_CONVERSATIONS)
    expect(loaded.at(-1)!.id).toBe('c10')
  })

  it('용량이 넘치면 오래된 대화부터 줄여 다시 시도한다', () => {
    const real = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (value.length > 3000) throw new DOMException('full', 'QuotaExceededError')
      real.call(this, key, value)
    })
    const many = Array.from({ length: 30 }, (_, i) => conversation(`c${i}`, i))
    expect(saveHistory(many)).toBe(true)
    const loaded = loadHistory().conversations
    expect(loaded.length).toBeGreaterThan(0)
    expect(loaded.length).toBeLessThan(30)
    expect(loaded[0].id).toBe('c29') // 최신은 남는다
  })

  it('localStorage를 쓸 수 없으면 false (예외를 던지지 않는다)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    expect(saveHistory([conversation('a', 1)])).toBe(false)
    expect(loadHistory()).toEqual({ conversations: [], currentId: null })
  })
})
