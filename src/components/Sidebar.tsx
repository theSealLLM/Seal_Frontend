import type { HealthState } from '../hooks/useHealth'
import type { Conversation } from '../lib/chat'
import { HistoryList } from './HistoryList'
import { ServerStatus } from './ServerStatus'

type Props = {
  health: HealthState
  conversations: Conversation[]
  currentId: string | null
  activeId: string | null
  onNewChat: () => void
  onSelect: (id: string) => void
  onRemove: (id: string) => void
  /** 방금 지운 대화 (실행 취소 안내) */
  lastDeleted: Conversation | null
  onUndoRemove: () => void
  /** 내역 저장이 실패했는지 */
  storageOk: boolean
}

/** 왼쪽 사이드바: 새 문의 · 문의 내역 · 서버 상태 */
export function Sidebar({
  health,
  conversations,
  currentId,
  activeId,
  onNewChat,
  onSelect,
  onRemove,
  lastDeleted,
  onUndoRemove,
  storageOk,
}: Props) {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="p-3">
        <button
          type="button"
          onClick={onNewChat}
          aria-current={currentId === null ? 'page' : undefined}
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-left text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          + 새 문의
        </button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-3" aria-label="문의 내역">
        <h2 className="px-1 py-2 text-xs font-semibold text-zinc-500">문의 내역</h2>
        <HistoryList
          conversations={conversations}
          currentId={currentId}
          activeId={activeId}
          onSelect={onSelect}
          onRemove={onRemove}
        />
      </nav>

      <div className="space-y-2 border-t border-zinc-200 p-3 dark:border-zinc-800">
        {lastDeleted && (
          <div
            role="status"
            className="flex items-center justify-between gap-2 rounded-lg bg-zinc-200 px-3 py-1.5 text-xs dark:bg-zinc-800"
          >
            <span className="min-w-0 truncate">삭제됨: {lastDeleted.title}</span>
            <button type="button" onClick={onUndoRemove} className="shrink-0 font-medium underline underline-offset-2">
              실행 취소
            </button>
          </div>
        )}
        {!storageOk && (
          <p className="text-xs text-amber-700 dark:text-amber-400" role="status">
            내역을 저장하지 못했습니다 (브라우저 저장소를 쓸 수 없음)
          </p>
        )}
        <ServerStatus state={health} />
      </div>
    </aside>
  )
}
