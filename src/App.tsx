import { useCallback, useEffect, useRef, useState } from 'react'
import type { Provider } from './api/types'
import { ChatView } from './components/ChatView'
import { Composer } from './components/Composer'
import { ProviderSelect } from './components/ProviderSelect'
import { Sidebar } from './components/Sidebar'
import { ThemeSelect } from './components/ThemeSelect'
import { useChat } from './hooks/useChat'
import { useHealth } from './hooks/useHealth'
import { useMediaQuery } from './hooks/useMediaQuery'
import { useTheme } from './hooks/useTheme'

export default function App() {
  const { health, recheck } = useHealth()
  // 답변 요청이 network 오류면 서버 상태도 바로 다시 확인한다 (사이드바 "연결 안 됨"과 맞추려고)
  const chat = useChat({ onNetworkError: recheck })
  const { theme, setTheme } = useTheme()
  const [draft, setDraft] = useState('')
  /** 사용자가 고르기 전에는 서버 기본값(default_provider)을 따른다 */
  const [chosenProvider, setChosenProvider] = useState<Provider | null>(null)

  const serverDefault = health.kind === 'ok' || health.kind === 'classifier_error' ? health.health.default_provider : null
  const provider = chosenProvider ?? serverDefault ?? 'local'
  // 요청은 한 번에 하나: 보고 있는 대화가 받는 중이면 중지 버튼, 다른 대화가 받는 중이면 전송을 막는다
  const busyHere = chat.busy && chat.activeId === chat.currentId
  const busyElsewhere = chat.busy && !busyHere

  // 좁은 화면(768px 미만): 사이드바를 덮개(drawer)로
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const drawerRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const drawer = !isDesktop

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false)
    // 덮개 안에 포커스가 있었으면 햄버거 버튼으로 돌려준다
    if (drawerRef.current?.contains(document.activeElement)) menuButtonRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!drawer || !drawerOpen) return
    drawerRef.current?.querySelector<HTMLElement>('button')?.focus()
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [drawer, drawerOpen, closeDrawer])

  // 넓은 화면으로 바뀌면 덮개 상태를 접어 둔다
  if (isDesktop && drawerOpen) setDrawerOpen(false)

  // 스크린 리더 알림 (답변 완료 · 중지를 한 번만). 같은 문장도 다시 읽도록 보이지 않는 글자를 번갈아 붙인다
  const [announcement, setAnnouncement] = useState({ text: '', n: 0 })
  const announce = useCallback((text: string) => setAnnouncement((a) => ({ text, n: a.n + 1 })), [])

  function newChat() {
    chat.newChat()
    setDraft('')
    if (drawer) closeDrawer()
    else inputRef.current?.focus()
  }

  return (
    <div className="flex h-full">
      {drawer && drawerOpen && (
        <div className="fixed inset-0 z-30 bg-black/40" onClick={closeDrawer} aria-hidden="true" />
      )}
      <div
        ref={drawerRef}
        id="sidebar"
        className={
          drawer
            ? `fixed inset-y-0 left-0 z-40 flex shadow-xl transition-transform duration-200 motion-reduce:transition-none ${drawerOpen ? 'translate-x-0' : '-translate-x-full'}`
            : 'flex'
        }
        inert={drawer && !drawerOpen}
        role={drawer ? 'dialog' : undefined}
        aria-modal={drawer && drawerOpen ? true : undefined}
        aria-label={drawer ? '메뉴' : undefined}
      >
        <Sidebar
          health={health}
          conversations={chat.conversations}
          currentId={chat.currentId}
          activeId={chat.activeId}
          onNewChat={newChat}
          onSelect={(id) => {
            chat.select(id)
            if (drawer) closeDrawer()
          }}
          onRemove={chat.remove}
          lastDeleted={chat.lastDeleted}
          onUndoRemove={chat.undoRemove}
          storageOk={chat.storageOk}
        />
      </div>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
          {drawer && (
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="메뉴 열기 (문의 내역 · 서버 상태)"
              aria-expanded={drawerOpen}
              aria-controls="sidebar"
              className="-ml-1 rounded-lg px-2 py-1 text-lg leading-none hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              ☰
            </button>
          )}
          <ProviderSelect value={provider} onChange={setChosenProvider} disabled={chat.busy} />
          <div className="ml-auto">
            <ThemeSelect value={theme} onChange={setTheme} />
          </div>
        </header>
        <ChatView
          key={chat.currentId ?? 'new'}
          messages={chat.messages}
          busy={chat.busy}
          onRetry={chat.retry}
          onRegenerate={chat.regenerate}
          onAnnounce={announce}
          onPickExample={(text) => {
            setDraft(text)
            inputRef.current?.focus()
          }}
        />
        <Composer
          value={draft}
          onChange={setDraft}
          onSend={(text) => chat.send(text, provider)}
          onStop={chat.stop}
          busy={busyHere}
          blocked={busyElsewhere}
          inputRef={inputRef}
        />
      </main>

      <div aria-live="polite" className="sr-only" data-testid="announcer">
        {announcement.text}
        {announcement.n % 2 ? '​' : ''}
      </div>
    </div>
  )
}
