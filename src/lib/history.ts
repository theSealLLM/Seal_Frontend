// 문의 내역 저장 (localStorage). 저장 API가 없어 브라우저에만 남는다.
// 모든 읽기 · 쓰기는 try/catch — 저장이 안 되는 환경(시크릿 창 · 차단 · 용량 초과)에서도 화면은 동작한다.

import type { Conversation, Message, MessageStatus } from './chat'

export const HISTORY_KEY = 'seal-frontend:conversations:v1'
export const CURRENT_KEY = 'seal-frontend:current:v1'

/** 보관 한도 (최신순). 대화 하나는 메타까지 수 KB → localStorage 한도(약 5MB) 안에 넉넉하다 */
export const MAX_CONVERSATIONS = 200

type Stored = { version: 1; conversations: Conversation[] }

const STATUSES = new Set<MessageStatus>(['pending', 'streaming', 'done', 'error', 'stopped'])

/**
 * 저장된 내역을 불러온다. 깨진 대화는 버리고 나머지는 살린다.
 * 저장 도중 탭이 닫혀 pending · streaming으로 남은 답변은 stopped로 바꾼다.
 */
export function loadHistory(): { conversations: Conversation[]; currentId: string | null } {
  let raw: string | null = null
  let current: string | null = null
  try {
    raw = localStorage.getItem(HISTORY_KEY)
    current = localStorage.getItem(CURRENT_KEY)
  } catch {
    return { conversations: [], currentId: null }
  }

  let parsed: unknown
  try {
    parsed = raw ? JSON.parse(raw) : null
  } catch {
    parsed = null
  }
  const list =
    isObject(parsed) && parsed.version === 1 && Array.isArray(parsed.conversations) ? parsed.conversations : []
  const conversations = sortByRecent(list.map(normalizeConversation).filter((c): c is Conversation => c !== null))
  const currentId = conversations.some((c) => c.id === current) ? current : null
  return { conversations, currentId }
}

/**
 * 내역을 저장한다 (최신순 최대 MAX_CONVERSATIONS개). 용량이 넘치면 오래된 대화부터 줄여 다시 시도한다.
 * 저장했으면 true (일부를 줄였어도 true), 저장할 수 없으면 false.
 */
export function saveHistory(conversations: Conversation[]): boolean {
  let keep = sortByRecent(conversations).slice(0, MAX_CONVERSATIONS)
  for (;;) {
    try {
      const stored: Stored = { version: 1, conversations: keep }
      localStorage.setItem(HISTORY_KEY, JSON.stringify(stored))
      return true
    } catch (e) {
      if (!isQuotaError(e) || keep.length <= 1) return false
      keep = keep.slice(0, Math.floor(keep.length * 0.8)) // 오래된 20%를 버리고 다시
    }
  }
}

/** 마지막으로 보던 대화 (새로고침하면 다시 연다). null이면 새 문의 화면 */
export function saveCurrentId(id: string | null): void {
  try {
    if (id) localStorage.setItem(CURRENT_KEY, id)
    else localStorage.removeItem(CURRENT_KEY)
  } catch {
    // 저장이 안 되어도 화면은 동작한다
  }
}

export function sortByRecent(conversations: Conversation[]): Conversation[] {
  return [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)
}

function isQuotaError(e: unknown): boolean {
  return e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeConversation(value: unknown): Conversation | null {
  if (!isObject(value)) return null
  const { id, title, createdAt, updatedAt, messages } = value
  if (typeof id !== 'string' || typeof title !== 'string' || typeof createdAt !== 'number') return null
  if (!Array.isArray(messages)) return null
  const normalized = messages.map(normalizeMessage)
  if (normalized.some((m) => m === null)) return null
  return {
    id,
    title,
    createdAt,
    updatedAt: typeof updatedAt === 'number' ? updatedAt : createdAt,
    messages: normalized as Message[],
  }
}

function normalizeMessage(value: unknown): Message | null {
  if (!isObject(value)) return null
  const { id, role, content, status, createdAt } = value
  if (typeof id !== 'string' || (role !== 'user' && role !== 'assistant')) return null
  if (typeof content !== 'string' || typeof createdAt !== 'number') return null
  if (typeof status !== 'string' || !STATUSES.has(status as MessageStatus)) return null
  const message = value as Message
  return status === 'pending' || status === 'streaming' ? { ...message, status: 'stopped' } : message
}
