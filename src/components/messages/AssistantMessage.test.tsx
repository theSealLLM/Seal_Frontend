// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnswerResponse } from '../../api/types'
import type { Message } from '../../lib/chat'
import { AssistantMessage } from './AssistantMessage'

const META: AnswerResponse = {
  request_id: 'req-1',
  status: 'ok',
  label: 'shipping',
  answer: '',
  provider: 'local',
  model: 'hf.co/unsloth/gemma',
  prompt_version: 'v1',
  tools_used: [],
  latency_ms: 1600,
  usage: { input_tokens: null, output_tokens: null },
  error: null,
  created_at: '2026-10-13T00:00:00Z',
  classification: null,
}

function message(overrides: Partial<Message>): Message {
  return { id: 'm1', role: 'assistant', content: '', status: 'done', createdAt: 0, ...overrides }
}

let write: ReturnType<typeof vi.fn>
let writeText: ReturnType<typeof vi.fn>

beforeEach(() => {
  write = vi.fn(() => Promise.resolve())
  writeText = vi.fn(() => Promise.resolve())
  vi.stubGlobal('navigator', { ...navigator, clipboard: { write, writeText } })
  vi.stubGlobal(
    'ClipboardItem',
    class {
      items: Record<string, Blob>
      constructor(items: Record<string, Blob>) {
        this.items = items
      }
    },
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const ANSWER = '배송은 **3일** 걸립니다.\n\n- 주문 내역 확인\n- 문의 접수'

describe('AssistantMessage', () => {
  it('완료된 답변은 마크다운으로 그리고, 복사 버튼과 메타를 보여 준다', () => {
    render(<AssistantMessage message={message({ content: ANSWER, meta: META })} onRetry={() => {}} onRegenerate={() => {}} busy={false} />)
    expect(document.querySelector('strong')?.textContent).toBe('3일')
    expect(screen.getByRole('button', { name: '답변 복사' })).toBeTruthy()
    // 처리 과정 배지 (라벨 · 답변 시간 · 모델)
    expect(screen.getByText('배송')).toBeTruthy()
    expect(screen.getAllByText('1.6초').length).toBeGreaterThan(0)
    expect(screen.getByText('로컬 · gemma')).toBeTruthy()
    expect(screen.getByRole('button', { name: '같은 문의로 답변 다시 생성' })).toBeTruthy()
  })

  it('받는 중에는 aria-busy, 다시 생성 버튼은 완료 뒤에만', () => {
    const { container } = render(
      <AssistantMessage
        message={message({ content: '받는 중', status: 'streaming' })}
        onRetry={() => {}}
        onRegenerate={() => {}}
        busy={true}
      />,
    )
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(screen.queryByRole('button', { name: '같은 문의로 답변 다시 생성' })).toBeNull()
  })

  it('다시 생성을 누르면 메시지 id로 알린다. 다른 답변을 받는 중이면 막힌다', () => {
    const onRegenerate = vi.fn()
    const { rerender } = render(
      <AssistantMessage message={message({ content: ANSWER, meta: META })} onRetry={() => {}} onRegenerate={onRegenerate} busy={false} />,
    )
    fireEvent.click(screen.getByRole('button', { name: '같은 문의로 답변 다시 생성' }))
    expect(onRegenerate).toHaveBeenCalledWith('m1')
    rerender(
      <AssistantMessage message={message({ content: ANSWER, meta: META })} onRetry={() => {}} onRegenerate={onRegenerate} busy={true} />,
    )
    expect(screen.getByRole<HTMLButtonElement>('button', { name: '같은 문의로 답변 다시 생성' }).disabled).toBe(true)
  })

  it('화면에서 받은 답변은 다 흘린 뒤 한 번만 알린다', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout'] })
    const onAnnounce = vi.fn()
    const props = { onRetry: () => {}, onRegenerate: () => {}, busy: false, onAnnounce }
    const { rerender } = render(<AssistantMessage message={message({ id: 'live-1', status: 'pending' })} {...props} />)
    rerender(
      <AssistantMessage message={message({ id: 'live-1', content: '짧은 답변', status: 'done', meta: META })} {...props} />,
    )
    expect(onAnnounce).not.toHaveBeenCalled() // 아직 흘리는 중
    act(() => vi.advanceTimersByTime(2000))
    expect(onAnnounce).toHaveBeenCalledOnce()
    expect(onAnnounce).toHaveBeenCalledWith('답변 완료: 짧은 답변')
    rerender(
      <AssistantMessage message={message({ id: 'live-1', content: '짧은 답변', status: 'done', meta: META })} {...props} />,
    )
    expect(onAnnounce).toHaveBeenCalledOnce()
  })

  it('처음부터 완료 상태로 올라온 내역은 알리지 않는다', () => {
    const onAnnounce = vi.fn()
    render(
      <AssistantMessage
        message={message({ content: '내역', status: 'done', meta: META })}
        onRetry={() => {}}
        onRegenerate={() => {}}
        busy={false}
        onAnnounce={onAnnounce}
      />,
    )
    expect(onAnnounce).not.toHaveBeenCalled()
  })

  it('받는 중에는 복사 버튼이 없고, 닫히지 않은 굵게도 굵게로 보인다', () => {
    render(
      <AssistantMessage
        message={message({ content: '배송은 **3일', status: 'streaming' })}
        onRetry={() => {}}
        onRegenerate={() => {}}
        busy={true}
      />,
    )
    expect(screen.queryByRole('button', { name: '답변 복사' })).toBeNull()
    expect(document.body.textContent).not.toContain('**')
  })

  it('중지된 답변은 받은 데까지 복사할 수 있다', () => {
    render(
      <AssistantMessage message={message({ content: '받은 데까지', status: 'stopped' })} onRetry={() => {}} onRegenerate={() => {}} busy={false} />,
    )
    expect(screen.getByRole('button', { name: '답변 복사' })).toBeTruthy()
  })

  it('복사는 서식 있는 글(HTML)과 평문을 함께 넣고, 2초 동안 "복사됨"', async () => {
    vi.useFakeTimers()
    render(<AssistantMessage message={message({ content: ANSWER, meta: META })} onRetry={() => {}} onRegenerate={() => {}} busy={false} />)
    const button = screen.getByRole('button', { name: '답변 복사' })
    await act(async () => {
      fireEvent.click(button)
    })

    expect(write).toHaveBeenCalledOnce()
    const item = write.mock.calls[0][0][0] as { items: Record<string, Blob> }
    expect(await item.items['text/plain'].text()).toBe('배송은 3일 걸립니다.\n\n- 주문 내역 확인\n- 문의 접수')
    const copiedHtml = await item.items['text/html'].text()
    expect(copiedHtml).toContain('<strong>3일</strong>')
    expect(copiedHtml).not.toContain('class=')
    expect(button.textContent).toBe('복사됨 ✓')

    act(() => vi.advanceTimersByTime(2000))
    expect(button.textContent).toBe('복사')
  })

  it('서식 복사가 안 되면 평문만 복사한다', async () => {
    write.mockRejectedValueOnce(new Error('NotAllowedError'))
    render(<AssistantMessage message={message({ content: ANSWER, meta: META })} onRetry={() => {}} onRegenerate={() => {}} busy={false} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '답변 복사' }))
    })
    expect(writeText).toHaveBeenCalledWith('배송은 3일 걸립니다.\n\n- 주문 내역 확인\n- 문의 접수')
  })

  it('clipboard API가 모두 안 되면 execCommand로 복사한다', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined })
    const execCommand = vi.fn(() => true)
    document.execCommand = execCommand
    render(<AssistantMessage message={message({ content: ANSWER, meta: META })} onRetry={() => {}} onRegenerate={() => {}} busy={false} />)
    const button = screen.getByRole('button', { name: '답변 복사' })
    await act(async () => {
      fireEvent.click(button)
    })
    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(button.textContent).toBe('복사됨 ✓')
  })
})
