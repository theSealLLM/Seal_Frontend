import type { HealthState } from '../hooks/useHealth'
import { VERIFY_MODE_NAMES } from '../lib/labels'

const DOT: Record<HealthState['kind'], string> = {
  checking: 'bg-zinc-400 animate-pulse',
  ok: 'bg-emerald-500',
  classifier_error: 'bg-amber-500',
  offline: 'bg-red-500',
}

const TEXT: Record<HealthState['kind'], string> = {
  checking: '확인 중...',
  ok: '서버 정상',
  classifier_error: '분류기 오류',
  offline: '연결 안 됨',
}

/** 사이드바 아래 서버 상태 (/health) */
export function ServerStatus({ state }: { state: HealthState }) {
  const title =
    state.kind === 'classifier_error'
      ? (state.health.classifier_error ?? undefined)
      : state.kind === 'offline'
        ? `API 서버에 연결할 수 없습니다 (${state.reason})`
        : undefined

  return (
    <div className="text-xs text-zinc-600 dark:text-zinc-400" role="status" title={title}>
      <div className="flex items-center gap-2 font-medium text-zinc-800 dark:text-zinc-200">
        <span className={`size-2 shrink-0 rounded-full ${DOT[state.kind]}`} aria-hidden="true" />
        {TEXT[state.kind]}
      </div>
      {(state.kind === 'ok' || state.kind === 'classifier_error') && (
        <dl className="mt-1 space-y-0.5 pl-4">
          <div className="flex gap-1">
            <dt className="sr-only">분류기</dt>
            <dd className="truncate">
              분류기 {state.health.classifier ?? '없음'}
              {state.health.classifier_device && ` · ${state.health.classifier_device}`}
            </dd>
          </div>
          <div className="flex gap-1">
            <dt className="sr-only">검증 모드</dt>
            <dd>{VERIFY_MODE_NAMES[state.health.verify_mode] ?? state.health.verify_mode}</dd>
          </div>
        </dl>
      )}
    </div>
  )
}
