import { errorGuide } from '../../lib/labels'

/** 오류 안내: 코드별 안내 문장 + 서버 원문(작게) + 다시 시도 (다시 보내도 같은 결과인 입력 오류는 버튼 없음) */
export function ErrorMessage({
  error,
  onRetry,
  retryDisabled,
}: {
  error: { code: string; message: string }
  onRetry?: () => void
  retryDisabled?: boolean
}) {
  const guide = errorGuide(error.code)
  const detail = error.message && error.message !== guide.text ? error.message : null

  return (
    <div
      role="alert"
      className="flex flex-wrap items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300"
    >
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium">{guide.text}</p>
        {detail && (
          <p className="text-xs break-words opacity-75">
            {detail} <span className="opacity-70">({error.code})</span>
          </p>
        )}
      </div>
      {onRetry && guide.retry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retryDisabled}
          className="shrink-0 rounded-lg border border-red-300 px-3 py-1 text-xs font-medium hover:bg-red-100 disabled:opacity-40 dark:border-red-800 dark:hover:bg-red-900/50"
        >
          다시 시도
        </button>
      )}
    </div>
  )
}
