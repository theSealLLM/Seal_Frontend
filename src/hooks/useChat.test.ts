// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { answerStream, AnswerStreamError, type AnswerStreamHandlers } from '../api/client'
import type { AnswerRequest, AnswerResponse } from '../api/types'
import { CURRENT_KEY, HISTORY_KEY } from '../lib/history'
import { UNDO_DELETE_MS, useChat } from './useChat'

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>()
  return { ...actual, answerStream: vi.fn() }
})

const mockedStream = vi.mocked(answerStream)

function response(overrides: Partial<AnswerResponse> = {}): AnswerResponse {
  return {
    request_id: 'req-1',
    status: 'ok',
    label: 'shipping',
    answer: '확인 후 안내드리겠습니다.',
    provider: 'local',
    model: 'gemma',
    prompt_version: 'v1',
    tools_used: [],
    latency_ms: 1000,
    usage: { input_tokens: null, output_tokens: null },
    error: null,
    created_at: '2026-10-13T00:00:00Z',
    classification: null,
    ...overrides,
  }
}

/** 테스트가 이벤트를 하나씩 흘릴 수 있는 가짜 스트림 */
function controllableStream() {
  let handlers: AnswerStreamHandlers = {}
  let request: AnswerRequest | undefined
  let resolve!: (r: AnswerResponse) => void
  let reject!: (e: unknown) => void
  mockedStream.mockImplementationOnce((req, h = {}, signal) => {
    request = req
    handlers = h
    return new Promise<AnswerResponse>((res, rej) => {
      resolve = res
      reject = rej
      signal?.addEventListener('abort', () => rej(new AnswerStreamError('aborted', '중지되었습니다')))
    })
  })
  return {
    get request() {
      return request
    },
    get handlers() {
      return handlers
    },
    resolve: (r: AnswerResponse) => act(async () => resolve(r)),
    reject: (e: unknown) => act(async () => reject(e)),
  }
}

/** localStorage에 저장된 내역 */
function stored() {
  const raw = localStorage.getItem(HISTORY_KEY)
  return raw ? (JSON.parse(raw) as { conversations: { id: string; messages: { status: string; content: string }[] }[] }) : null
}

function historyWrites(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls.filter(([key]) => key === HISTORY_KEY).length
}

beforeEach(() => {
  mockedStream.mockReset()
  localStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('useChat', () => {
  it('새 문의 화면에서 보내면 대화를 만들고 pending → streaming → done', async () => {
    const stream = controllableStream()
    const { result } = renderHook(() => useChat())
    expect(result.current.currentId).toBeNull()
    expect(result.current.messages).toEqual([])

    act(() => {
      expect(result.current.send('  배송이 늦어요  ', 'openai')).toBe(true)
    })
    expect(stream.request).toEqual({ text: '배송이 늦어요', provider: 'openai' })
    expect(result.current.conversations).toHaveLength(1)
    expect(result.current.currentId).toBe(result.current.conversations[0].id)
    expect(result.current.conversations[0].title).toBe('배송이 늦어요')
    expect(result.current.activeId).toBe(result.current.currentId)
    const [user, assistant] = result.current.messages
    expect(user).toMatchObject({ role: 'user', content: '배송이 늦어요' })
    expect(assistant).toMatchObject({ status: 'pending', provider: 'openai' })

    act(() => stream.handlers.onStatus?.({ stage: 'answering', message: '' }))
    expect(result.current.messages[1]).toMatchObject({ status: 'pending', stage: 'answering' })

    act(() => {
      stream.handlers.onDelta?.('확인 후 ')
      stream.handlers.onDelta?.('안내드리겠습니다.')
    })
    expect(result.current.messages[1]).toMatchObject({ status: 'streaming', content: '확인 후 안내드리겠습니다.' })
    // 스트리밍 중 갱신은 해당 메시지만 바꾼다
    expect(result.current.messages[0]).toBe(user)

    const done = response()
    await stream.resolve(done)
    expect(result.current.messages[1]).toMatchObject({ status: 'done', content: done.answer, meta: done })
    expect(result.current.busy).toBe(false)
  })

  it('같은 대화에서 다시 보내면 메시지가 이어 붙는다 (독립 문의)', async () => {
    const first = controllableStream()
    const { result } = renderHook(() => useChat())
    act(() => {
      result.current.send('첫 문의', 'local')
    })
    await first.resolve(response())
    controllableStream()
    act(() => {
      result.current.send('둘째 문의', 'local')
    })
    expect(result.current.conversations).toHaveLength(1)
    expect(result.current.messages.map((m) => m.content.slice(0, 5))).toEqual(['첫 문의', '확인 후 ', '둘째 문의', ''])
    expect(result.current.conversations[0].title).toBe('첫 문의')
  })

  it('답변 중에는 다시 보내지 않는다', () => {
    controllableStream()
    const { result } = renderHook(() => useChat())
    act(() => {
      result.current.send('첫 문의', 'local')
    })
    let sent = true
    act(() => {
      sent = result.current.send('둘째 문의', 'local')
    })
    expect(sent).toBe(false)
    expect(result.current.messages).toHaveLength(2)
  })

  it('중지하면 stopped가 되고 받은 내용은 남는다 (저장됨)', async () => {
    const stream = controllableStream()
    const { result } = renderHook(() => useChat())
    act(() => {
      result.current.send('배송이 늦어요', 'local')
    })
    act(() => stream.handlers.onDelta?.('받은 데까지'))

    await act(async () => result.current.stop())
    await waitFor(() => expect(result.current.busy).toBe(false))
    expect(result.current.messages[1]).toMatchObject({ status: 'stopped', content: '받은 데까지' })
    expect(stored()?.conversations[0].messages[1]).toMatchObject({ status: 'stopped', content: '받은 데까지' })
  })

  it('done(status="error")는 error 상태와 서버 오류 내용', async () => {
    const stream = controllableStream()
    const { result } = renderHook(() => useChat())
    act(() => {
      result.current.send('배송이 늦어요', 'local')
    })
    await stream.resolve(response({ status: 'error', answer: null, error: { code: 'llm_error', message: 'Ollama 꺼짐' } }))
    expect(result.current.messages[1]).toMatchObject({ status: 'error', error: { code: 'llm_error', message: 'Ollama 꺼짐' } })
  })

  it('network 오류 뒤 다시 시도하면 같은 자리에서 같은 문의 · 모델로 다시 받는다', async () => {
    const first = controllableStream()
    const { result } = renderHook(() => useChat())
    act(() => {
      result.current.send('배송이 늦어요', 'openai')
    })
    await first.reject(new AnswerStreamError('network', 'API 서버에 연결할 수 없습니다'))
    const failed = result.current.messages[1]
    expect(failed).toMatchObject({ status: 'error', error: { code: 'network' } })

    const second = controllableStream()
    act(() => result.current.retry(failed.id))
    expect(second.request).toEqual({ text: '배송이 늦어요', provider: 'openai' })
    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages[1]).toMatchObject({ id: failed.id, status: 'pending', content: '' })
    expect(result.current.messages[1].error).toBeUndefined()

    await second.resolve(response())
    expect(result.current.messages[1].status).toBe('done')
  })

  it('localStorage에는 보낸 직후 · done 때만 쓰고 delta마다 쓰지 않는다', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const stream = controllableStream()
    const { result } = renderHook(() => useChat())
    act(() => {
      result.current.send('배송이 늦어요', 'local')
    })
    expect(historyWrites(setItem)).toBe(1)
    expect(stored()?.conversations[0].messages[1].status).toBe('pending')

    for (let i = 0; i < 20; i++) act(() => stream.handlers.onDelta?.('글자 '))
    act(() => stream.handlers.onStatus?.({ stage: 'answering', message: '' }))
    expect(historyWrites(setItem)).toBe(1)

    await stream.resolve(response())
    expect(historyWrites(setItem)).toBe(2)
    expect(stored()?.conversations[0].messages[1].status).toBe('done')
  })

  it('받는 도중 다른 대화 · 새 문의로 옮겨도 답변은 원래 대화에서 계속 받는다', async () => {
    const first = controllableStream()
    const { result } = renderHook(() => useChat())
    act(() => {
      result.current.send('배송이 늦어요', 'local')
    })
    const a = result.current.currentId!

    act(() => result.current.newChat())
    expect(result.current.currentId).toBeNull()
    expect(result.current.messages).toEqual([])
    expect(result.current.activeId).toBe(a)

    // 받는 동안 다른 대화(새 문의)에서는 보낼 수 없다
    let sent = true
    act(() => {
      sent = result.current.send('다른 문의', 'local')
    })
    expect(sent).toBe(false)

    act(() => first.handlers.onDelta?.('계속 '))
    await first.resolve(response({ answer: '계속 받은 답변' }))
    expect(result.current.activeId).toBeNull()
    expect(result.current.currentId).toBeNull()
    const conversation = result.current.conversations.find((c) => c.id === a)!
    expect(conversation.messages[1]).toMatchObject({ status: 'done', content: '계속 받은 답변' })

    act(() => result.current.select(a))
    expect(result.current.messages[1].content).toBe('계속 받은 답변')
  })

  it('새로고침하면 내역과 마지막으로 보던 대화를 불러오고, 받던 답변은 stopped로', async () => {
    const stream = controllableStream()
    const first = renderHook(() => useChat())
    act(() => {
      first.result.current.send('배송이 늦어요', 'local')
    })
    const id = first.result.current.currentId
    act(() => stream.handlers.onDelta?.('받던 중'))
    // 받는 도중 탭을 닫은 것처럼: 저장본에는 pending으로 남아 있다
    expect(stored()?.conversations[0].messages[1].status).toBe('pending')
    expect(localStorage.getItem(CURRENT_KEY)).toBe(id)
    first.unmount()

    const second = renderHook(() => useChat())
    expect(second.result.current.currentId).toBe(id)
    expect(second.result.current.messages[1]).toMatchObject({ status: 'stopped' })
    expect(second.result.current.busy).toBe(false)
  })

  it('삭제하면 목록에서 빠지고, 실행 취소하면 같은 자리로 돌아온다', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { result } = renderHook(() => useChat())
    for (const text of ['첫째', '둘째', '셋째']) {
      const s = controllableStream()
      act(() => {
        result.current.send(text, 'local')
      })
      await s.resolve(response())
      act(() => result.current.newChat())
    }
    const ids = result.current.conversations.map((c) => c.id)
    act(() => result.current.select(ids[1]))

    act(() => result.current.remove(ids[1]))
    expect(result.current.conversations.map((c) => c.id)).toEqual([ids[0], ids[2]])
    expect(result.current.currentId).toBeNull() // 보던 대화를 지우면 새 문의 화면
    expect(result.current.lastDeleted?.id).toBe(ids[1])
    expect(stored()?.conversations).toHaveLength(2)

    act(() => result.current.undoRemove())
    expect(result.current.conversations.map((c) => c.id)).toEqual(ids)
    expect(result.current.lastDeleted).toBeNull()
    expect(stored()?.conversations).toHaveLength(3)

    act(() => result.current.remove(ids[0]))
    act(() => vi.advanceTimersByTime(UNDO_DELETE_MS))
    expect(result.current.lastDeleted).toBeNull()
  })

  it('받는 중인 대화는 지울 수 없다', () => {
    controllableStream()
    const { result } = renderHook(() => useChat())
    act(() => {
      result.current.send('배송이 늦어요', 'local')
    })
    act(() => result.current.remove(result.current.currentId!))
    expect(result.current.conversations).toHaveLength(1)
  })

  it('localStorage를 쓸 수 없어도 동작하고 storageOk=false', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    const stream = controllableStream()
    const { result } = renderHook(() => useChat())
    act(() => {
      result.current.send('배송이 늦어요', 'local')
    })
    expect(result.current.storageOk).toBe(false)
    await stream.resolve(response())
    expect(result.current.messages[1].status).toBe('done')
  })

  it('다시 생성은 같은 문의 · 같은 모델을 대화 끝에 새 쌍으로 보낸다 (원래 답변은 그대로)', async () => {
    const first = controllableStream()
    const { result } = renderHook(() => useChat())
    act(() => {
      result.current.send('배송이 늦어요', 'openai')
    })
    await first.resolve(response({ answer: '첫 답변' }))
    const original = result.current.messages[1]

    const second = controllableStream()
    act(() => {
      expect(result.current.regenerate(original.id)).toBe(true)
    })
    expect(second.request).toEqual({ text: '배송이 늦어요', provider: 'openai' })
    expect(result.current.messages).toHaveLength(4)
    expect(result.current.messages[1]).toBe(original)
    expect(result.current.messages[2]).toMatchObject({ role: 'user', content: '배송이 늦어요', regenerated: true })
    expect(result.current.messages[3]).toMatchObject({ role: 'assistant', status: 'pending', provider: 'openai' })
    expect(result.current.conversations).toHaveLength(1)

    await second.resolve(response({ answer: '두 번째 답변' }))
    expect(result.current.messages[3]).toMatchObject({ status: 'done', content: '두 번째 답변' })
  })

  it('끝난 답변에는 finishedAt(화면에서 잰 끝 시각)이 붙는다', async () => {
    const stream = controllableStream()
    const { result } = renderHook(() => useChat())
    act(() => {
      result.current.send('배송이 늦어요', 'local')
    })
    expect(result.current.messages[1].finishedAt).toBeUndefined()
    await stream.resolve(response())
    const m = result.current.messages[1]
    expect(m.finishedAt).toBeGreaterThanOrEqual(m.createdAt)
  })

  it('network 오류면 onNetworkError를 부른다 (서버 상태 다시 확인)', async () => {
    const onNetworkError = vi.fn()
    const first = controllableStream()
    const { result } = renderHook(() => useChat({ onNetworkError }))
    act(() => {
      result.current.send('배송이 늦어요', 'local')
    })
    await first.reject(new AnswerStreamError('network', 'API 서버에 연결할 수 없습니다'))
    expect(onNetworkError).toHaveBeenCalledOnce()

    const second = controllableStream()
    act(() => {
      result.current.send('다시', 'local')
    })
    await second.resolve(response({ status: 'error', answer: null, error: { code: 'llm_error', message: '' } }))
    expect(onNetworkError).toHaveBeenCalledOnce()
  })
})
