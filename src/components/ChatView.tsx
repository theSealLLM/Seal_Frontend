import { useEffect, useRef } from 'react'
import type { Message } from '../lib/chat'
import { useAutoScroll } from '../hooks/useAutoScroll'
import { AssistantMessage } from './messages/AssistantMessage'
import { UserMessage } from './messages/UserMessage'

const EXAMPLES = [
  '주문한 지 일주일이 넘었는데 계속 배송 준비 중이에요.',
  '환불 신청했는데 언제 들어오나요?',
  '서울 날씨 어때요?',
]

type Props = {
  messages: Message[]
  busy: boolean
  onRetry: (id: string) => void
  onRegenerate: (id: string) => void
  onAnnounce?: (text: string) => void
  /** 빈 대화의 예시 문의를 눌렀을 때 */
  onPickExample: (text: string) => void
}

/**
 * 메시지 목록. 한 대화가 수백 개가 되기는 어려워 가상 스크롤은 넣지 않는다
 * (필요해지면 이 컴포넌트만 @tanstack/react-virtual로 바꾼다).
 * 스크롤 컨테이너는 빈 대화일 때도 그대로 둔다 (useAutoScroll이 같은 요소를 계속 감시하도록).
 */
export function ChatView({ messages, busy, onRetry, onRegenerate, onAnnounce, onPickExample }: Props) {
  const { containerRef, contentRef, pinned, scrollToBottom } = useAutoScroll()

  // 새 메시지(보낸 문의)가 추가되면 다시 바닥에 붙인다
  const countRef = useRef(messages.length)
  useEffect(() => {
    if (messages.length > countRef.current) scrollToBottom(true)
    countRef.current = messages.length
  }, [messages.length, scrollToBottom])

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={containerRef} className="min-h-0 flex-1 overflow-y-auto" tabIndex={-1} role="region" aria-label="대화">
        <div ref={contentRef} className={messages.length === 0 ? 'flex min-h-full' : undefined}>
          {messages.length === 0 ? (
            <EmptyState onPickExample={onPickExample} />
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
              {messages.map((m) =>
                m.role === 'user' ? (
                  <UserMessage key={m.id} message={m} />
                ) : (
                  <AssistantMessage
                    key={m.id}
                    message={m}
                    onRetry={onRetry}
                    onRegenerate={onRegenerate}
                    onAnnounce={onAnnounce}
                    busy={busy}
                  />
                ),
              )}
            </div>
          )}
        </div>
      </div>

      {!pinned && messages.length > 0 && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-md hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          ↓ {busy ? '답변 작성 중 · 맨 아래로' : '맨 아래로'}
        </button>
      )}
    </div>
  )
}

function EmptyState({ onPickExample }: { onPickExample: (text: string) => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
      <div>
        <h1 className="text-xl font-semibold">Seal 상담 도우미</h1>
        <p className="mt-2 text-sm text-zinc-500">고객 문의를 입력하면 분류하고 답변 초안을 작성합니다.</p>
      </div>
      <ul className="flex w-full max-w-md flex-col gap-2">
        {EXAMPLES.map((text) => (
          <li key={text}>
            <button
              type="button"
              onClick={() => onPickExample(text)}
              className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-left text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              {text}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
