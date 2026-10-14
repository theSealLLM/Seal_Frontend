import { useEffect, useState } from 'react'
import type { StatusStage } from '../../api/types'
import { STAGE_MESSAGES } from '../../lib/labels'

/** 답변 시작 전: 단계 문구 + 스켈레톤. adventure는 기다림이 길어 별도 애니메이션 + 경과 시간 */
export function StatusMessage({ stage, since }: { stage?: StatusStage; since: number }) {
  const text = stage ? STAGE_MESSAGES[stage] : '문의를 보내는 중...'

  if (stage === 'adventure') {
    return (
      <div className="flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400" role="status">
        <span className="text-xl motion-safe:animate-bounce" aria-hidden="true">
          🧭
        </span>
        <span>{text}</span>
        <Elapsed since={since} />
      </div>
    )
  }

  return (
    <div role="status" className="space-y-3">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{text}</p>
      <div className="space-y-2" aria-hidden="true">
        <div className="h-3 w-11/12 rounded bg-zinc-200 motion-safe:animate-pulse dark:bg-zinc-800" />
        <div className="h-3 w-4/5 rounded bg-zinc-200 motion-safe:animate-pulse dark:bg-zinc-800" />
        <div className="h-3 w-3/5 rounded bg-zinc-200 motion-safe:animate-pulse dark:bg-zinc-800" />
      </div>
    </div>
  )
}

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const seconds = Math.max(0, Math.floor((now - since) / 1000))
  return (
    <span className="tabular-nums text-xs text-zinc-400" aria-label={`${seconds}초 경과`}>
      {seconds}초
    </span>
  )
}
