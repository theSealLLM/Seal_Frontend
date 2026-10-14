import { useCallback, useEffect, useRef, useState } from 'react'
import { AUTO_SCROLL_THRESHOLD_PX } from '../lib/config'

const UP_KEYS = new Set(['PageUp', 'ArrowUp', 'Home'])

/**
 * 바닥에 붙어 있을 때(pinned)만 내용이 늘어나는 대로 바닥을 따라간다.
 *
 * 사용자 개입 감지: 바닥 감시 요소의 보임 여부로는 판단하지 않는다 (글이 늘어날 때 잠깐 밀려나 오판).
 * 위로 굴린 휠 · 터치 끌기 · PageUp/↑/Home · 스크롤 위치가 줄어든 scroll(스크롤바 끌기)이 있고
 * 바닥에서 threshold 이상 떨어졌을 때만 멈춘다. 자동 스크롤은 위치를 늘리기만 하므로 오판하지 않는다.
 * 바닥 근처로 돌아오면 다시 켠다.
 *
 * containerRef: 스크롤 컨테이너, contentRef: 높이가 바뀌는 안쪽 요소 (둘 다 항상 렌더링되어 있어야 한다)
 */
export function useAutoScroll(threshold = AUTO_SCROLL_THRESHOLD_PX) {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(true)
  const [pinned, setPinnedState] = useState(true)

  const setPinned = useCallback((value: boolean) => {
    pinnedRef.current = value
    setPinnedState(value)
  }, [])

  useEffect(() => {
    const el = containerRef.current
    const content = contentRef.current
    if (!el || !content) return

    let lastTop = el.scrollTop
    let userIntent = false
    const distance = () => el.scrollHeight - el.scrollTop - el.clientHeight

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) userIntent = true
    }
    const onTouchMove = () => {
      userIntent = true
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (UP_KEYS.has(e.key)) userIntent = true
    }
    const onScroll = () => {
      const top = el.scrollTop
      const wentUp = top < lastTop - 1
      lastTop = top
      if (distance() <= threshold) {
        userIntent = false
        if (!pinnedRef.current) setPinned(true)
      } else if ((userIntent || wentUp) && pinnedRef.current) {
        setPinned(false)
      }
    }

    // 내용 높이가 바뀌면(타이핑 · 새 메시지) 붙어 있을 때만 바닥으로
    const observer = new ResizeObserver(() => {
      if (pinnedRef.current) {
        el.scrollTop = el.scrollHeight
        lastTop = el.scrollTop
      }
    })
    observer.observe(content)

    el.addEventListener('wheel', onWheel, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: true })
    el.addEventListener('keydown', onKeyDown)
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      observer.disconnect()
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('keydown', onKeyDown)
      el.removeEventListener('scroll', onScroll)
    }
  }, [threshold, setPinned])

  /** 바닥으로 이동하고 다시 따라가게 한다 (새 메시지 · "맨 아래로" 버튼) */
  const scrollToBottom = useCallback(
    (smooth = true) => {
      setPinned(true)
      const el = containerRef.current
      el?.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
    },
    [setPinned],
  )

  return { containerRef, contentRef, pinned, scrollToBottom }
}
