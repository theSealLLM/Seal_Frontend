import type { Provider } from '../api/types'
import { PROVIDER_NAMES } from '../lib/labels'

const PROVIDERS = Object.keys(PROVIDER_NAMES) as Provider[]

/** 모델 선택 (로컬 / OpenAI). 실제 모델 이름은 /health에 없어 답변 메타에만 표시한다 */
export function ProviderSelect({
  value,
  onChange,
  disabled,
}: {
  value: Provider
  onChange: (value: Provider) => void
  disabled?: boolean
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Provider)}
      disabled={disabled}
      aria-label="답변 모델"
      className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
    >
      {PROVIDERS.map((p) => (
        <option key={p} value={p}>
          {PROVIDER_NAMES[p]}
        </option>
      ))}
    </select>
  )
}
