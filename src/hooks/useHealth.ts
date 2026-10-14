import { useCallback, useEffect, useRef, useState } from 'react'
import { getHealth } from '../api/client'
import type { Health } from '../api/types'
import { HEALTH_INTERVAL_MS } from '../lib/config'

export type HealthState =
  | { kind: 'checking' }
  | { kind: 'ok'; health: Health }
  /** 서버는 떴지만 분류 모델을 불러오지 못함 (/health는 이때도 status "ok"를 준다) */
  | { kind: 'classifier_error'; health: Health }
  | { kind: 'offline'; reason: string }

/**
 * /health를 주기적으로 확인한다. 탭이 다시 보이면 바로 한 번 더 확인한다.
 * recheck: 지금 바로 확인 (답변 요청이 network 오류로 실패했을 때 서버 상태를 맞추려고)
 */
export function useHealth(): { health: HealthState; recheck: () => void } {
  const [health, setHealth] = useState<HealthState>({ kind: 'checking' })
  const checkRef = useRef<() => void>(() => {})

  useEffect(() => {
    const controller = new AbortController()

    async function check() {
      try {
        const result = await getHealth(controller.signal)
        setHealth(result.classifier_error ? { kind: 'classifier_error', health: result } : { kind: 'ok', health: result })
      } catch (e) {
        if (controller.signal.aborted) return
        setHealth({ kind: 'offline', reason: e instanceof Error ? e.message : String(e) })
      }
    }
    checkRef.current = () => void check()

    function onVisible() {
      if (document.visibilityState === 'visible') void check()
    }

    void check()
    const timer = setInterval(check, HEALTH_INTERVAL_MS)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      controller.abort()
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const recheck = useCallback(() => checkRef.current(), [])
  return { health, recheck }
}
