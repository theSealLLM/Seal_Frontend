import { memo } from 'react'
import { useNow } from '../hooks/useNow'
import type { Conversation } from '../lib/chat'
import { sortByRecent } from '../lib/history'

type Props = {
  conversations: Conversation[]
  currentId: string | null
  /** 받는 중인 대화 */
  activeId: string | null
  onSelect: (id: string) => void
  onRemove: (id: string) => void
  /** 기준 시각 (테스트용) */
  now?: number
}

const DAY = 24 * 60 * 60 * 1000

/** 문의 내역: 최신순, 오늘 · 어제 · 지난 7일 · 이전으로 묶는다 */
export const HistoryList = memo(function HistoryList({
  conversations,
  currentId,
  activeId,
  onSelect,
  onRemove,
  now: fixedNow,
}: Props) {
  const clock = useNow()
  const now = fixedNow ?? clock
  if (conversations.length === 0) return <p className="px-1 text-xs text-zinc-400">아직 문의가 없습니다.</p>

  const groups = groupByDate(sortByRecent(conversations), now)
  return (
    <div className="space-y-4">
      {groups.map(({ label, items }) => (
        <section key={label} aria-label={label}>
          <h3 className="px-1 pb-1 text-[11px] font-medium text-zinc-400">{label}</h3>
          <ul className="space-y-0.5">
            {items.map((c) => {
              const selected = c.id === currentId
              const active = c.id === activeId
              return (
                <li key={c.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => onSelect(c.id)}
                    aria-current={selected ? 'page' : undefined}
                    className={`flex w-full items-center gap-2 rounded-lg py-1.5 pr-8 pl-2 text-left text-sm ${
                      selected
                        ? 'bg-zinc-200 font-medium dark:bg-zinc-800'
                        : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800/60'
                    }`}
                  >
                    {active && (
                      <span
                        className="size-1.5 shrink-0 rounded-full bg-emerald-500 motion-safe:animate-pulse"
                        aria-label="답변 받는 중"
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate">{c.title || '제목 없음'}</span>
                    <span className="shrink-0 text-[11px] font-normal text-zinc-400 tabular-nums">
                      {timeLabel(c.updatedAt, now)}
                    </span>
                  </button>
                  {!active && (
                    <button
                      type="button"
                      onClick={() => onRemove(c.id)}
                      aria-label={`문의 삭제: ${c.title}`}
                      className="absolute top-1/2 right-1 -translate-y-1/2 rounded-md px-1.5 py-0.5 text-xs text-zinc-400 opacity-0 group-hover:opacity-100 hover:bg-zinc-200 hover:text-zinc-700 focus-visible:opacity-100 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                    >
                      ✕
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
})

function startOfDay(time: number): number {
  const d = new Date(time)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function groupByDate(conversations: Conversation[], now: number) {
  const today = startOfDay(now)
  const groups: { label: string; items: Conversation[] }[] = []
  for (const c of conversations) {
    const label =
      c.updatedAt >= today
        ? '오늘'
        : c.updatedAt >= today - DAY
          ? '어제'
          : c.updatedAt >= today - 7 * DAY
            ? '지난 7일'
            : '이전'
    const last = groups.at(-1)
    if (last?.label === label) last.items.push(c)
    else groups.push({ label, items: [c] })
  }
  return groups
}

/** 오늘이면 시:분, 올해면 월.일, 그 전이면 연.월.일 */
function timeLabel(time: number, now: number): string {
  const d = new Date(time)
  const pad = (n: number) => String(n).padStart(2, '0')
  if (time >= startOfDay(now)) return `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (d.getFullYear() === new Date(now).getFullYear()) return `${d.getMonth() + 1}.${d.getDate()}`
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`
}
