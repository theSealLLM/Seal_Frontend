import { useEffect, useState } from 'react'

/** 현재 시각. intervalMs마다 갱신한다 (자정이 지나면 "오늘 · 어제" 묶음이 바뀌도록) */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}
