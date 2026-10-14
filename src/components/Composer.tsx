import { useImperativeHandle, useLayoutEffect, useRef, type KeyboardEvent, type Ref } from 'react'
import { charCount } from '../lib/chat'
import { COMPOSER_MAX_HEIGHT_PX, MAX_INPUT_LENGTH } from '../lib/config'

type Props = {
  value: string
  onChange: (value: string) => void
  /** 보낸다. 실제로 보냈으면 true (입력창을 비운다) */
  onSend: (text: string) => boolean
  onStop: () => void
  /** 이 대화에서 답변을 받는 중 (전송 버튼 → 중지 버튼) */
  busy: boolean
  /** 다른 대화에서 답변을 받는 중 (요청은 한 번에 하나 → 전송을 막고 안내) */
  blocked?: boolean
  /** 입력창 (보낸 뒤 · 새 문의 때 포커스용) */
  inputRef?: Ref<HTMLTextAreaElement>
}

/** 자동 높이 textarea · Enter 전송(한글 IME 합성 중 제외) · 전송/중지 */
export function Composer({ value, onChange, onSend, onStop, busy, blocked = false, inputRef }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  /** Safari는 compositionend가 keydown보다 먼저 와서 합성을 끝낸 Enter가 isComposing=false로 들어온다 */
  const justComposedRef = useRef(false)
  useImperativeHandle(inputRef, () => textareaRef.current as HTMLTextAreaElement, [])

  const count = charCount(value.trim())
  const tooLong = count > MAX_INPUT_LENGTH
  const canSend = !busy && !blocked && count > 0 && !tooLong

  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT_PX)}px`
    el.style.overflowY = el.scrollHeight > COMPOSER_MAX_HEIGHT_PX ? 'auto' : 'hidden'
  }, [value])

  function submit() {
    if (canSend && onSend(value)) onChange('')
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter' || e.shiftKey) return
    if (e.nativeEvent.isComposing || e.keyCode === 229 || justComposedRef.current) return
    e.preventDefault()
    submit()
  }

  function onCompositionEnd() {
    justComposedRef.current = true
    setTimeout(() => {
      justComposedRef.current = false
    }, 0)
  }

  return (
    <form
      className="mx-auto w-full max-w-3xl px-4 pb-4"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <div className="flex items-end gap-2 rounded-2xl border border-zinc-300 bg-white p-2 shadow-sm focus-within:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:focus-within:border-zinc-500">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onCompositionEnd={onCompositionEnd}
          rows={1}
          placeholder="문의를 입력하세요"
          aria-label="문의 입력"
          className="min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-6 outline-none placeholder:text-zinc-400"
        />
        {busy ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="답변 중지"
            className="shrink-0 rounded-xl bg-zinc-200 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-600"
          >
            ■ 중지
          </button>
        ) : (
          <button
            type="submit"
            disabled={!canSend}
            aria-label="문의 전송"
            className="shrink-0 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            전송
          </button>
        )}
      </div>
      <div className="mt-1.5 flex justify-between gap-4 px-2 text-xs text-zinc-500">
        {blocked ? (
          <span className="text-amber-700 dark:text-amber-400" role="status">
            다른 문의의 답변을 받는 중입니다. 끝나면 보낼 수 있습니다.
          </span>
        ) : (
          <span>
            문의는 하나씩 따로 처리됩니다
            <span className="hidden sm:inline"> (이전 문의 내용은 이어지지 않음) · Shift+Enter 줄바꿈</span>
          </span>
        )}
        <span className={`shrink-0 tabular-nums ${tooLong ? 'font-medium text-red-600 dark:text-red-400' : ''}`}>
          {count.toLocaleString()} / {MAX_INPUT_LENGTH.toLocaleString()}
          {tooLong && <span role="alert"> · 너무 깁니다</span>}
        </span>
      </div>
    </form>
  )
}
