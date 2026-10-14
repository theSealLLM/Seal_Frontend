import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { isBusy, type Message } from '../../lib/chat'
import { copyRich } from '../../lib/clipboard'
import { closeOpenMarkdown, toCopyHtml, toPlainText } from '../../lib/markdown'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { useTypewriter } from '../../hooks/useTypewriter'
import { CopyButton } from '../CopyButton'
import { Markdown } from '../Markdown'
import { MessageMeta } from '../MessageMeta'
import { ErrorMessage } from './ErrorMessage'
import { StatusMessage } from './StatusMessage'

type Props = {
  message: Message
  onRetry: (id: string) => void
  /** 같은 문의를 같은 모델로 다시 보낸다 (대화 끝에 새 쌍으로) */
  onRegenerate: (id: string) => void
  /** 다른 답변을 받는 중이면 다시 시도 · 다시 생성을 막는다 */
  busy: boolean
  /** 스크린 리더에 한 번 알린다 (답변 완료 · 중지) */
  onAnnounce?: (text: string) => void
}

const smallButton =
  'rounded-md px-2 py-0.5 text-xs font-medium text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'

/** AI 답변: 왼쪽 전체 폭. 마크다운 본문 + 복사 · 다시 생성 + 처리 과정 배지 */
export const AssistantMessage = memo(function AssistantMessage({
  message,
  onRetry,
  onRegenerate,
  busy,
  onAnnounce,
}: Props) {
  const reducedMotion = useReducedMotion()
  // 화면에 있는 동안 답변을 받은 메시지만 흘려 보여 준다 (처음부터 완료 상태로 올라온 내역은 바로)
  const [live, setLive] = useState(() => isBusy(message))
  if (!live && isBusy(message)) setLive(true)
  const instant =
    !live || reducedMotion || message.status === 'stopped' || message.status === 'error'
  const { text, caughtUp } = useTypewriter(message.content, instant, message.id)
  const bodyRef = useRef<HTMLDivElement>(null)

  // 받는 중이거나, 다 받았어도 아직 흘리는 중이면 커서
  const typing = message.status === 'streaming' || (message.status === 'done' && !caughtUp)
  // 타이핑 중에는 닫히지 않은 서식(**, `, ```)을 임시로 닫아 그린다
  const shown = useMemo(() => (typing ? closeOpenMarkdown(text) : text), [typing, text])
  const done = message.status === 'done' && caughtUp

  // 화면에서 받은 답변이 끝나면 한 번만 알린다 (오류는 ErrorMessage의 role="alert"가 알린다)
  const announcedRef = useRef(false)
  useEffect(() => {
    if (!live || announcedRef.current || !onAnnounce) return
    if (done) {
      announcedRef.current = true
      const preview = Array.from(message.content).slice(0, 80).join('')
      onAnnounce(`답변 완료: ${preview}`)
    } else if (message.status === 'stopped') {
      announcedRef.current = true
      onAnnounce('답변을 중지했습니다')
    }
  }, [live, done, message.status, message.content, onAnnounce])
  useEffect(() => {
    if (isBusy(message)) announcedRef.current = false // 다시 시도하면 다시 알린다
  }, [message])

  if (message.status === 'pending') return <StatusMessage stage={message.stage} since={message.createdAt} />

  const canCopy = (done || message.status === 'stopped') && message.content.length > 0
  const totalMs = message.finishedAt !== undefined ? message.finishedAt - message.createdAt : undefined

  return (
    <div className="space-y-2" aria-busy={typing || undefined}>
      <span className="sr-only">답변: </span>
      {shown ? (
        <Markdown ref={bodyRef} text={shown} typing={typing} />
      ) : (
        typing && <span className="typing-cursor" aria-hidden="true" />
      )}
      {message.status === 'stopped' && (
        <p className="flex items-center gap-2 text-xs text-zinc-500">
          <span>중지됨</span>
          <button
            type="button"
            onClick={() => onRetry(message.id)}
            disabled={busy}
            className="underline underline-offset-2 hover:text-zinc-800 disabled:opacity-40 dark:hover:text-zinc-200"
          >
            다시 받기
          </button>
        </p>
      )}
      {message.status === 'error' && message.error && (
        <ErrorMessage error={message.error} onRetry={() => onRetry(message.id)} retryDisabled={busy} />
      )}
      {(canCopy || done) && (
        <div className="-ml-2 flex flex-wrap items-center gap-1">
          {canCopy && (
            <CopyButton
              ariaLabel="답변 복사"
              onCopy={() => {
                const el = bodyRef.current
                return el ? copyRich(toCopyHtml(el), toPlainText(el)) : Promise.resolve(false)
              }}
            />
          )}
          {done && (
            <button
              type="button"
              onClick={() => onRegenerate(message.id)}
              disabled={busy}
              aria-label="같은 문의로 답변 다시 생성"
              className={smallButton}
            >
              다시 생성
            </button>
          )}
        </div>
      )}
      {done && message.meta && (
        <MessageMeta meta={message.meta} classification={message.classification} totalMs={totalMs} />
      )}
    </div>
  )
})
