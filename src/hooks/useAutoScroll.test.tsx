// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAutoScroll } from './useAutoScroll'

// jsdom에는 레이아웃과 ResizeObserver가 없다 → 높이 · 스크롤 위치를 직접 정하고, 높이 변화는 손으로 알린다
let resizeCallbacks: (() => void)[] = []

beforeEach(() => {
  resizeCallbacks = []
  vi.stubGlobal(
    'ResizeObserver',
    class {
      callback: () => void
      constructor(callback: () => void) {
        this.callback = callback
      }
      observe() {
        resizeCallbacks.push(this.callback)
      }
      disconnect() {}
      unobserve() {}
    },
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const CLIENT_HEIGHT = 500

function setup() {
  const state = { pinned: true, scrollToBottom: (_smooth?: boolean) => {} }
  function Harness() {
    const { containerRef, contentRef, pinned, scrollToBottom } = useAutoScroll(80)
    useEffect(() => {
      state.pinned = pinned
      state.scrollToBottom = scrollToBottom
    })
    return (
      <div ref={containerRef} data-testid="container">
        <div ref={contentRef} />
      </div>
    )
  }
  const { getByTestId } = render(<Harness />)
  const el = getByTestId('container')

  let scrollHeight = 1000
  let scrollTop = 500 // 바닥
  Object.defineProperty(el, 'clientHeight', { get: () => CLIENT_HEIGHT })
  Object.defineProperty(el, 'scrollHeight', { get: () => scrollHeight })
  Object.defineProperty(el, 'scrollTop', {
    get: () => scrollTop,
    set: (v: number) => {
      scrollTop = Math.max(0, Math.min(v, scrollHeight - CLIENT_HEIGHT))
    },
  })
  el.scrollTo = ((options: ScrollToOptions) => {
    el.scrollTop = options.top ?? 0
  }) as typeof el.scrollTo
  // Hook이 처음 읽은 위치(jsdom 기본 0)를 위에서 정한 바닥 위치로 맞춘다
  act(() => {
    fireEvent.scroll(el)
  })

  return {
    el,
    state,
    get scrollTop() {
      return scrollTop
    },
    /** 내용이 늘어남 (타이핑 · 새 메시지) */
    grow(by: number) {
      scrollHeight += by
      act(() => resizeCallbacks.forEach((cb) => cb()))
    },
    /** 내용만 늘어남 (ResizeObserver가 아직 알리기 전) */
    growSilently(by: number) {
      scrollHeight += by
    },
    /** 사용자가 스크롤 위치를 옮김 */
    scrollTo(top: number) {
      el.scrollTop = top
      act(() => {
        fireEvent.scroll(el)
      })
    },
  }
}

const bottom = (t: { el: HTMLElement }) => t.el.scrollHeight - CLIENT_HEIGHT

describe('useAutoScroll', () => {
  it('바닥에 붙어 있으면 내용이 늘어나는 대로 따라간다', () => {
    const t = setup()
    t.grow(300)
    expect(t.scrollTop).toBe(bottom(t))
    expect(t.state.pinned).toBe(true)
  })

  it('휠을 위로 굴려 80px 넘게 떨어지면 멈추고, 내용이 늘어도 그 자리에 있다', () => {
    const t = setup()
    fireEvent.wheel(t.el, { deltaY: -100 })
    t.scrollTo(bottom(t) - 200)
    expect(t.state.pinned).toBe(false)

    const before = t.scrollTop
    t.grow(300)
    expect(t.scrollTop).toBe(before)
  })

  it('조금만(80px 이내) 올리면 계속 따라간다', () => {
    const t = setup()
    fireEvent.wheel(t.el, { deltaY: -30 })
    t.scrollTo(bottom(t) - 50)
    expect(t.state.pinned).toBe(true)
  })

  it('스크롤바 끌기처럼 입력 이벤트 없이 위치가 줄어도 멈춘다', () => {
    const t = setup()
    t.scrollTo(bottom(t) - 300)
    expect(t.state.pinned).toBe(false)
  })

  it('PageUp 키로 올려도 멈춘다', () => {
    const t = setup()
    fireEvent.keyDown(t.el, { key: 'PageUp' })
    t.scrollTo(bottom(t) - 300)
    expect(t.state.pinned).toBe(false)
  })

  it('바닥 근처로 돌아오면 다시 따라간다', () => {
    const t = setup()
    t.scrollTo(bottom(t) - 300)
    expect(t.state.pinned).toBe(false)
    t.scrollTo(bottom(t) - 40)
    expect(t.state.pinned).toBe(true)
    t.grow(200)
    expect(t.scrollTop).toBe(bottom(t))
  })

  it('"맨 아래로"(scrollToBottom)는 바닥으로 옮기고 다시 따라가게 한다', () => {
    const t = setup()
    t.scrollTo(100)
    expect(t.state.pinned).toBe(false)
    act(() => t.state.scrollToBottom(false))
    expect(t.state.pinned).toBe(true)
    expect(t.scrollTop).toBe(bottom(t))
  })

  it('자동 스크롤로 위치가 늘어나는 것은 사용자 개입으로 보지 않는다', () => {
    const t = setup()
    for (let i = 0; i < 5; i++) {
      t.grow(150)
      act(() => {
        fireEvent.scroll(t.el)
      })
    }
    expect(t.state.pinned).toBe(true)
    expect(t.scrollTop).toBe(bottom(t))
  })

  it('글이 늘어나 바닥에서 멀어져도 사용자 개입이 없으면 멈추지 않는다 (따라가기 전에 scroll이 먼저 온 경우)', () => {
    const t = setup()
    t.growSilently(400)
    act(() => {
      fireEvent.scroll(t.el)
    })
    expect(t.state.pinned).toBe(true)
    t.grow(0)
    expect(t.scrollTop).toBe(bottom(t))
  })
})
