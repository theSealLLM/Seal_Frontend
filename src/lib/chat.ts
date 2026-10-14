import type { AnswerResponse, Provider, RoutingResult, StatusStage } from '../api/types'

export type MessageStatus =
  /** 보냈고 delta가 아직 없음 (단계 문구 · 스켈레톤) */
  | 'pending'
  | 'streaming'
  | 'done'
  | 'error'
  /** 사용자가 중지함. 받은 데까지는 남긴다 */
  | 'stopped'

export type Message = {
  id: string
  role: 'user' | 'assistant'
  /** 화면에 보이는 글 */
  content: string
  status: MessageStatus
  /** 메시지를 만든 시각 (ms). adventure 경과 시간 표시에 쓴다 */
  createdAt: number
  /** pending일 때 단계 */
  stage?: StatusStage
  /** classification 이벤트 (done 전에 도착) */
  classification?: RoutingResult
  /** 보낸 모델 (다시 시도 · 비교용) */
  provider?: Provider
  /** done 응답 */
  meta?: AnswerResponse
  /** 오류 안내. code는 서버 error.code 또는 AnswerStreamError code */
  error?: { code: string; message: string }
  /** 답변이 끝난(done · 오류 · 중지) 시각. createdAt과의 차이 = 화면에서 잰 전체 시간 (분류 · 검증 포함) */
  finishedAt?: number
  /** 유저 메시지: "다시 생성"으로 다시 보낸 문의 */
  regenerated?: boolean
}

export type Conversation = {
  id: string
  /** 첫 문의 첫 줄 */
  title: string
  createdAt: number
  /** 마지막 활동 시각 (문의를 보낸 · 답변이 끝난 때). 사이드바 최신순 정렬 기준 */
  updatedAt: number
  messages: Message[]
}

export function isBusy(message: Message): boolean {
  return message.status === 'pending' || message.status === 'streaming'
}

export function newId(): string {
  return crypto.randomUUID()
}

export function newConversation(): Conversation {
  const now = Date.now()
  return { id: newId(), title: '', createdAt: now, updatedAt: now, messages: [] }
}

/** 사이드바 제목: 첫 줄, 최대 40자 */
export function titleFrom(text: string): string {
  const line = text.trim().split('\n')[0]
  const chars = Array.from(line)
  return chars.length > 40 ? `${chars.slice(0, 40).join('')}…` : line
}

/** 서버와 같은 방식(코드 포인트)으로 센 글자 수 */
export function charCount(text: string): number {
  return Array.from(text).length
}
