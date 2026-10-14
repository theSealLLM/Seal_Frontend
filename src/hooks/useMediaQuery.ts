import { useCallback, useSyncExternalStore } from 'react'

/** CSS 미디어 쿼리가 맞는지. matchMedia가 없는 환경(테스트 등)에서는 fallback */
export function useMediaQuery(query: string, fallback = true): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window.matchMedia !== 'function') return () => {}
      const media = window.matchMedia(query)
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    },
    [query],
  )
  const get = () => (typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : fallback)
  return useSyncExternalStore(subscribe, get, () => fallback)
}
