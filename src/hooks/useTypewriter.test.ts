// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTypewriter } from './useTypewriter'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'performance', 'Date'] })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function setup(target: string, instant = false) {
  return renderHook(({ target, instant }) => useTypewriter(target, instant), { initialProps: { target, instant } })
}

const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms))
const length = (text: string) => Array.from(text).length

describe('useTypewriter', () => {
  it('밀린 글자가 적으면 기본 속도(초당 50자)로 흘린다', () => {
    const { result } = setup('가'.repeat(20))
    expect(result.current).toEqual({ text: '', caughtUp: false })
    advance(200)
    expect(length(result.current.text)).toBeGreaterThanOrEqual(7)
    expect(length(result.current.text)).toBeLessThanOrEqual(11)
    advance(1000)
    expect(result.current).toEqual({ text: '가'.repeat(20), caughtUp: true })
  })

  it('밀린 글자가 많으면 빨라져서 따라잡는다', () => {
    const { result } = setup('가'.repeat(600))
    advance(600)
    // 기본 속도였다면 30자. 0.6초 안에 따라잡는 속도로 시작하므로 훨씬 많다
    expect(length(result.current.text)).toBeGreaterThan(300)
    expect(result.current.caughtUp).toBe(false)
    advance(3000)
    expect(result.current.caughtUp).toBe(true)
  })

  it('조각이 10ms마다 계속 붙어도 멈추지 않고 흘러간다 (delta마다 루프를 새로 시작하지 않음)', () => {
    const { result, rerender } = setup('')
    let target = ''
    for (let i = 0; i < 100; i++) {
      target += '가나다라'
      rerender({ target, instant: false })
      advance(10)
    }
    // 1초 동안 400자 도착 → 0.6초 정도 뒤처지는 속도로 따라간다
    expect(length(result.current.text)).toBeGreaterThan(150)
    advance(3000)
    expect(result.current).toEqual({ text: target, caughtUp: true })
  })

  it('instant면 바로 전부 보여 준다', () => {
    const { result } = setup('처음부터 완료된 답변', true)
    expect(result.current).toEqual({ text: '처음부터 완료된 답변', caughtUp: true })
  })

  it('흘리는 중에 instant가 되면(중지 · 오류) 남은 글을 바로 보여 준다', () => {
    const { result, rerender } = setup('가'.repeat(100))
    advance(100)
    expect(result.current.caughtUp).toBe(false)
    rerender({ target: '가'.repeat(100), instant: true })
    expect(result.current).toEqual({ text: '가'.repeat(100), caughtUp: true })
  })

  it('이모지를 반으로 자르지 않는다', () => {
    const { result } = setup('😀'.repeat(30))
    for (let i = 0; i < 10; i++) {
      advance(50)
      expect(result.current.text).toBe('😀'.repeat(length(result.current.text)))
    }
  })

  it('내용이 비워지면(다시 시도) 처음부터, 짧아지면(앞뒤 공백 제거) 끝 위치만 맞춘다', () => {
    const { result, rerender } = setup(' 답변입니다 ')
    advance(1000)
    expect(result.current.caughtUp).toBe(true)

    rerender({ target: '답변입니다', instant: false })
    expect(result.current).toEqual({ text: '답변입니다', caughtUp: true })

    rerender({ target: '', instant: false })
    expect(result.current.text).toBe('')
    rerender({ target: '새 답변', instant: false })
    expect(result.current.text).toBe('')
    advance(1000)
    expect(result.current).toEqual({ text: '새 답변', caughtUp: true })
  })

  it('memoryKey가 같으면 새로 만들어져도 보여 준 데부터 이어서 흘린다 (받는 중인 대화로 돌아왔을 때)', () => {
    const target = '가'.repeat(300)
    const first = renderHook(() => useTypewriter(target, false, 'msg-1'))
    advance(500)
    const before = length(first.result.current.text)
    expect(before).toBeGreaterThan(50)
    first.unmount()

    const second = renderHook(() => useTypewriter(target, false, 'msg-1'))
    expect(length(second.result.current.text)).toBe(before)

    const other = renderHook(() => useTypewriter(target, false, 'msg-2'))
    expect(other.result.current.text).toBe('')
  })
})
