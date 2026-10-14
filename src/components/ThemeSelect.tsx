import { THEME_NAMES, type Theme } from '../lib/labels'

const THEMES = Object.keys(THEME_NAMES) as Theme[]

/** 화면 테마 선택 (시스템 · 라이트 · 다크) */
export function ThemeSelect({ value, onChange }: { value: Theme; onChange: (theme: Theme) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Theme)}
      aria-label="화면 테마"
      className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
    >
      {THEMES.map((t) => (
        <option key={t} value={t}>
          {t === 'system' ? '테마: 시스템' : `테마: ${THEME_NAMES[t]}`}
        </option>
      ))}
    </select>
  )
}
