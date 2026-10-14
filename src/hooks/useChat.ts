import { useCallback, useEffect, useRef, useState } from 'react'
import { answerStream, AnswerStreamError } from '../api/client'
import type { Provider } from '../api/types'
import { newConversation, newId, titleFrom, type Conversation, type Message } from '../lib/chat'
import { loadHistory, saveCurrentId, saveHistory } from '../lib/history'

/** 삭제 뒤 실행 취소를 받을 수 있는 시간 */
export const UNDO_DELETE_MS = 5000

type State = {
  /** 문의를 한 번이라도 보낸 대화 (빈 새 문의는 넣지 않는다) */
  conversations: Conversation[]
  /** 보고 있는 대화. null이면 빈 새 문의 화면 */
  currentId: string | null
}

const EMPTY: Message[] = []

/**
 * 문의 내역 전체와 전송 · 중지 · 다시 시도 · 대화 전환 · 삭제.
 * - API는 문의를 하나씩 독립적으로 처리한다 (같은 대화에서 다시 보내도 이전 맥락 없음)
 * - 요청은 한 번에 하나. 받는 도중 다른 대화로 옮겨도 답변은 원래 대화에서 계속 받는다
 * - localStorage에는 보낸 직후 · done · 오류 · 중지 · 삭제 때만 쓴다 (delta마다 쓰지 않음)
 */
export function useChat({ onNetworkError }: { onNetworkError?: () => void } = {}) {
  const [state, setState] = useState<State>(loadHistory)
  const [storageOk, setStorageOk] = useState(true)
  /** 받는 중인 대화 (null이면 쉬는 중) */
  const [activeId, setActiveId] = useState<string | null>(null)
  const [lastDeleted, setLastDeleted] = useState<{ conversation: Conversation; index: number } | null>(null)

  const controllerRef = useRef<AbortController | null>(null)
  const stateRef = useRef(state)
  /** 다음 커밋 뒤에 저장할지 (delta 같은 잦은 갱신은 저장하지 않는다) */
  const saveRef = useRef(false)
  const undoTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const onNetworkErrorRef = useRef(onNetworkError)

  useEffect(() => {
    onNetworkErrorRef.current = onNetworkError
  }, [onNetworkError])

  useEffect(() => {
    stateRef.current = state
    if (saveRef.current) {
      saveRef.current = false
      setStorageOk(saveHistory(state.conversations))
    }
  }, [state])

  useEffect(() => saveCurrentId(state.currentId), [state.currentId])

  // 정리할 때 받던 요청을 중지하지 않는다: 개발 모드 StrictMode는 이펙트를 한 번 더 정리 · 실행하는데,
  // 첫 이펙트 처리가 늦으면(숨겨진 탭에서 막 열었을 때 등) 그사이 시작된 요청이 중지되었다(7단계에서 실측).
  // 앱은 페이지를 닫을 때만 사라지고, 그때는 브라우저가 요청을 끊는다.
  useEffect(() => () => clearTimeout(undoTimerRef.current), [])

  /** 대화 하나를 바꾼다. save면 커밋 뒤 저장 */
  const updateConversation = useCallback((id: string, change: (c: Conversation) => Conversation, save = false) => {
    if (save) saveRef.current = true
    setState((s) => ({ ...s, conversations: s.conversations.map((c) => (c.id === id ? change(c) : c)) }))
  }, [])

  /** 메시지 하나만 바꾼다 (나머지 메시지 객체는 그대로 → memo된 컴포넌트는 다시 그리지 않는다) */
  const updateMessage = useCallback(
    (conversationId: string, messageId: string, change: (m: Message) => Message, save = false) =>
      updateConversation(
        conversationId,
        (c) => ({ ...c, messages: c.messages.map((m) => (m.id === messageId ? change(m) : m)) }),
        save,
      ),
    [updateConversation],
  )

  /** 대화의 assistantId 메시지에 text의 답변을 받아 채운다 */
  const run = useCallback(
    async (conversationId: string, assistantId: string, text: string, provider: Provider) => {
      const controller = new AbortController()
      controllerRef.current = controller
      setActiveId(conversationId)
      const update = (change: (m: Message) => Message, save = false) =>
        updateMessage(conversationId, assistantId, change, save)
      try {
        const res = await answerStream(
          { text, provider },
          {
            onStatus: (e) => update((m) => ({ ...m, stage: e.stage })),
            onClassification: (r) => update((m) => ({ ...m, classification: r })),
            onDelta: (t) => update((m) => ({ ...m, status: 'streaming', content: m.content + t })),
          },
          controller.signal,
        )
        update(
          (m) =>
            res.status === 'ok'
              ? {
                  ...m,
                  status: 'done',
                  finishedAt: Date.now(),
                  content: res.answer ?? m.content,
                  meta: res,
                  classification: res.classification ?? m.classification,
                }
              : {
                  ...m,
                  status: 'error',
                  finishedAt: Date.now(),
                  meta: res,
                  classification: res.classification ?? m.classification,
                  error: res.error ?? { code: 'unknown', message: '알 수 없는 오류가 발생했습니다' },
                },
          true,
        )
      } catch (e) {
        if (e instanceof AnswerStreamError && e.code === 'aborted') {
          update((m) => ({ ...m, status: 'stopped', finishedAt: Date.now() }), true)
        } else {
          const error =
            e instanceof AnswerStreamError
              ? { code: e.code, message: e.message }
              : { code: 'unknown', message: e instanceof Error ? e.message : String(e) }
          update((m) => ({ ...m, status: 'error', error, finishedAt: Date.now() }), true)
          if (error.code === 'network') onNetworkErrorRef.current?.()
        }
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null
          setActiveId(null)
        }
      }
    },
    [updateMessage],
  )

  /** 보고 있는 대화에 문의를 보낸다(새 문의 화면이면 대화를 만든다). 앞뒤 공백은 지운다. 받는 중이면 false */
  const send = useCallback(
    (text: string, provider: Provider, { regenerated = false }: { regenerated?: boolean } = {}): boolean => {
      const trimmed = text.trim()
      if (!trimmed || controllerRef.current) return false
      const now = Date.now()
      const user: Message = {
        id: newId(),
        role: 'user',
        content: trimmed,
        status: 'done',
        createdAt: now,
        ...(regenerated && { regenerated: true }),
      }
      const assistant: Message = {
        id: newId(),
        role: 'assistant',
        content: '',
        status: 'pending',
        createdAt: now,
        provider,
      }
      const { conversations, currentId } = stateRef.current
      const existing = conversations.find((c) => c.id === currentId)
      const base = existing ?? newConversation()
      const conversation: Conversation = {
        ...base,
        title: base.title || titleFrom(trimmed),
        updatedAt: now,
        messages: [...base.messages, user, assistant],
      }
      saveRef.current = true // 답변 도중 탭이 닫혀도 문의는 남도록
      setState((s) => ({
        currentId: conversation.id,
        conversations: existing
          ? s.conversations.map((c) => (c.id === conversation.id ? conversation : c))
          : [conversation, ...s.conversations],
      }))
      void run(conversation.id, assistant.id, trimmed, provider)
      return true
    },
    [run],
  )

  /** 보고 있는 대화의 오류 · 중지된 답변을 같은 자리에서 다시 받는다 (같은 문의 · 같은 모델) */
  const retry = useCallback(
    (assistantId: string) => {
      if (controllerRef.current) return
      const { conversations, currentId } = stateRef.current
      const conversation = conversations.find((c) => c.id === currentId)
      if (!conversation) return
      const index = conversation.messages.findIndex((m) => m.id === assistantId)
      const question = conversation.messages.slice(0, index).findLast((m) => m.role === 'user')
      const target = conversation.messages[index]
      if (!question || !target?.provider) return
      updateMessage(conversation.id, assistantId, (m) => ({
        id: m.id,
        role: 'assistant',
        content: '',
        status: 'pending',
        createdAt: Date.now(),
        provider: m.provider,
      }))
      void run(conversation.id, assistantId, question.content, target.provider)
    },
    [run, updateMessage],
  )

  /**
   * 완료된 답변의 문의를 같은 모델로 다시 보낸다. 결과는 대화 끝에 새 문의 + 답변 쌍으로 붙는다
   * (원래 답변은 그대로 두어 비교할 수 있게). 받는 중이면 false
   */
  const regenerate = useCallback(
    (assistantId: string): boolean => {
      const { conversations, currentId } = stateRef.current
      const conversation = conversations.find((c) => c.id === currentId)
      if (!conversation) return false
      const index = conversation.messages.findIndex((m) => m.id === assistantId)
      const question = conversation.messages.slice(0, index).findLast((m) => m.role === 'user')
      const target = conversation.messages[index]
      if (!question || !target?.provider) return false
      return send(question.content, target.provider, { regenerated: true })
    },
    [send],
  )

  const stop = useCallback(() => controllerRef.current?.abort(), [])

  /** 빈 새 문의 화면 (받던 답변은 원래 대화에서 계속 받는다) */
  const newChat = useCallback(() => setState((s) => ({ ...s, currentId: null })), [])

  const select = useCallback((id: string) => setState((s) => ({ ...s, currentId: id })), [])

  /** 대화를 지운다 (받는 중인 대화는 지울 수 없다). UNDO_DELETE_MS 동안 실행 취소할 수 있다 */
  const remove = useCallback(
    (id: string) => {
      if (id === activeId) return
      const index = stateRef.current.conversations.findIndex((c) => c.id === id)
      if (index === -1) return
      const conversation = stateRef.current.conversations[index]
      saveRef.current = true
      setState((s) => ({
        currentId: s.currentId === id ? null : s.currentId,
        conversations: s.conversations.filter((c) => c.id !== id),
      }))
      setLastDeleted({ conversation, index })
      clearTimeout(undoTimerRef.current)
      undoTimerRef.current = setTimeout(() => setLastDeleted(null), UNDO_DELETE_MS)
    },
    [activeId],
  )

  const undoRemove = useCallback(() => {
    if (!lastDeleted) return
    const { conversation, index } = lastDeleted
    saveRef.current = true
    setState((s) => {
      if (s.conversations.some((c) => c.id === conversation.id)) return s
      const conversations = [...s.conversations]
      conversations.splice(Math.min(index, conversations.length), 0, conversation)
      return { ...s, conversations }
    })
    setLastDeleted(null)
    clearTimeout(undoTimerRef.current)
  }, [lastDeleted])

  const current = state.conversations.find((c) => c.id === state.currentId) ?? null

  return {
    conversations: state.conversations,
    currentId: state.currentId,
    /** 보고 있는 대화의 메시지 (새 문의 화면이면 빈 배열) */
    messages: current?.messages ?? EMPTY,
    /** 받는 중인 대화 id (null이면 쉬는 중) */
    activeId,
    busy: activeId !== null,
    storageOk,
    lastDeleted: lastDeleted?.conversation ?? null,
    send,
    retry,
    regenerate,
    stop,
    newChat,
    select,
    remove,
    undoRemove,
  }
}
