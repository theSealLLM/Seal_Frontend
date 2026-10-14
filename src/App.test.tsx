// @vitest-environment jsdom
// 앱 전체: 테마 전환 · 좁은 화면 덮개(drawer). /health는 실패하게 두고(연결 안 됨) 화면 동작만 본다.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { THEME_KEY } from './hooks/useTheme'

/** matchMedia 흉내: 넓은 화면 여부 · OS 다크 설정을 바꿀 수 있다 */
function stubMatchMedia({ desktop, systemDark }: { desktop: boolean; systemDark: boolean }) {
  const listeners = new Map<string, Set<() => void>>()
  const state = { desktop, systemDark }
  const matches = (query: string) =>
    query.includes('min-width') ? state.desktop : query.includes('dark') ? state.systemDark : false
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return matches(query)
    },
    media: query,
    addEventListener: (_: string, cb: () => void) => {
      if (!listeners.has(query)) listeners.set(query, new Set())
      listeners.get(query)!.add(cb)
    },
    removeEventListener: (_: string, cb: () => void) => listeners.get(query)?.delete(cb),
  }))
  return {
    setSystemDark(value: boolean) {
      state.systemDark = value
      act(() => listeners.forEach((set, q) => q.includes('dark') && set.forEach((cb) => cb())))
    },
  }
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.className = ''
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))))
  // jsdom에는 ResizeObserver가 없다 (자동 스크롤용)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('테마', () => {
  it('시스템이면 OS 설정을 따라가고, 고르면 저장한다', () => {
    const media = stubMatchMedia({ desktop: true, systemDark: false })
    render(<App />)
    const root = document.documentElement
    const select = screen.getByLabelText<HTMLSelectElement>('화면 테마')
    expect(select.value).toBe('system')
    expect(root.classList.contains('dark')).toBe(false)

    media.setSystemDark(true)
    expect(root.classList.contains('dark')).toBe(true)
    expect(root.style.colorScheme).toBe('dark')

    fireEvent.change(select, { target: { value: 'light' } })
    expect(root.classList.contains('dark')).toBe(false)
    expect(localStorage.getItem(THEME_KEY)).toBe('light')

    fireEvent.change(select, { target: { value: 'system' } })
    expect(root.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem(THEME_KEY)).toBeNull()
  })

  it('저장된 테마로 시작한다', () => {
    localStorage.setItem(THEME_KEY, 'dark')
    stubMatchMedia({ desktop: true, systemDark: false })
    render(<App />)
    expect(screen.getByLabelText<HTMLSelectElement>('화면 테마').value).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })
})

describe('좁은 화면', () => {
  it('넓은 화면에는 햄버거 버튼이 없고 사이드바가 바로 보인다', () => {
    stubMatchMedia({ desktop: true, systemDark: false })
    render(<App />)
    expect(screen.queryByRole('button', { name: /메뉴 열기/ })).toBeNull()
    expect(document.getElementById('sidebar')!.hasAttribute('inert')).toBe(false)
  })

  it('햄버거로 덮개를 열고, Esc로 닫으면 포커스가 햄버거로 돌아온다', () => {
    stubMatchMedia({ desktop: false, systemDark: false })
    render(<App />)
    const sidebar = document.getElementById('sidebar')!
    const menu = screen.getByRole('button', { name: /메뉴 열기/ })
    expect(sidebar.hasAttribute('inert')).toBe(true) // 닫힌 덮개 안으로 Tab이 들어가지 않게
    expect(menu.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(menu)
    expect(sidebar.hasAttribute('inert')).toBe(false)
    expect(menu.getAttribute('aria-expanded')).toBe('true')
    expect(sidebar.contains(document.activeElement)).toBe(true)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(sidebar.hasAttribute('inert')).toBe(true)
    expect(document.activeElement).toBe(menu)
  })

  it('배경을 누르거나 새 문의를 누르면 닫힌다', () => {
    stubMatchMedia({ desktop: false, systemDark: false })
    render(<App />)
    const sidebar = document.getElementById('sidebar')!
    fireEvent.click(screen.getByRole('button', { name: /메뉴 열기/ }))
    fireEvent.click(document.querySelector('.bg-black\\/40')!)
    expect(sidebar.hasAttribute('inert')).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: /메뉴 열기/ }))
    fireEvent.click(screen.getByRole('button', { name: '+ 새 문의' }))
    expect(sidebar.hasAttribute('inert')).toBe(true)
  })
})
