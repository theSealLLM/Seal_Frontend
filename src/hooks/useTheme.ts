import { useEffect, useState, useSyncExternalStore } from 'react'
import type { Theme } from '../lib/labels'

export const THEME_KEY = 'seal-frontend:theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

function readTheme(): Theme {
  try {
    const value = localStorage.getItem(THEME_KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

function subscribeSystem(onChange: () => void) {
  if (typeof window.matchMedia !== 'function') return () => {}
  const media = window.matchMedia(DARK_QUERY)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

function systemDark() {
  return typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches
}

/**
 * 화면 테마 (시스템 · 라이트 · 다크). 선택은 localStorage에 남긴다.
 * <html>에 dark 클래스와 color-scheme(스크롤바 · 폼 요소 색)을 맞춘다. "시스템"이면 OS 설정이 바뀌는 대로 따라간다.
 * (처음 그리기 전에는 index.html 스크립트가 같은 규칙으로 붙인다)
 */
export function useTheme(): { theme: Theme; setTheme: (theme: Theme) => void; dark: boolean } {
  const [theme, setThemeState] = useState<Theme>(readTheme)
  const prefersDark = useSyncExternalStore(subscribeSystem, systemDark, () => false)
  const dark = theme === 'dark' || (theme === 'system' && prefersDark)

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', dark)
    root.style.colorScheme = dark ? 'dark' : 'light'
  }, [dark])

  function setTheme(next: Theme) {
    setThemeState(next)
    try {
      if (next === 'system') localStorage.removeItem(THEME_KEY)
      else localStorage.setItem(THEME_KEY, next)
    } catch {
      // 저장이 안 되어도 지금 화면에는 적용된다
    }
  }

  return { theme, setTheme, dark }
}
