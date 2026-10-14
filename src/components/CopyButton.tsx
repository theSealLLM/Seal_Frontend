import { useEffect, useRef, useState } from 'react'

/** 복사 버튼. 누르면 2초 동안 "복사됨 ✓" (스크린 리더에도 알림) */
export function CopyButton({
  onCopy,
  label = '복사',
  ariaLabel,
  className = '',
}: {
  /** 복사한다. 성공하면 true */
  onCopy: () => Promise<boolean>
  label?: string
  ariaLabel: string
  className?: string
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(timerRef.current), [])

  async function copy() {
    const ok = await onCopy()
    setState(ok ? 'copied' : 'failed')
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setState('idle'), 2000)
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={ariaLabel}
      data-copy-ignore=""
      className={`rounded-md px-2 py-0.5 text-xs font-medium text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 ${className}`}
    >
      <span aria-live="polite">{state === 'copied' ? '복사됨 ✓' : state === 'failed' ? '복사 실패' : label}</span>
    </button>
  )
}
