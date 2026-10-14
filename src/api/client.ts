import { API_BASE, HEALTH_TIMEOUT_MS } from '../lib/config'
import { SseParser, type SseMessage } from './sse'
import type { AnswerRequest, AnswerResponse, DeltaEvent, Health, RoutingResult, StatusEvent } from './types'

/** 서버 상태. 네트워크 실패 · 시간 초과 · 5xx(백엔드가 꺼져 Vite 프록시가 주는 응답 포함)는 예외로 던진다. */
export async function getHealth(signal?: AbortSignal): Promise<Health> {
  const timeout = AbortSignal.timeout(HEALTH_TIMEOUT_MS)
  const res = await fetch(`${API_BASE}/health`, {
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as Health
}

/**
 * done을 받지 못한 경우의 오류. 서버가 보낸 오류(입력 오류 400 · done status="error")는
 * 예외가 아니라 AnswerResponse로 돌려준다.
 * - aborted: 사용자가 중지함
 * - network: 연결 실패 · 연결 끊김 · 프록시 5xx(백엔드 꺼짐)
 * - incomplete: done 없이 스트림이 끝남
 * - bad_response: 형식이 맞지 않는 응답
 */
export class AnswerStreamError extends Error {
  readonly code: 'aborted' | 'network' | 'incomplete' | 'bad_response'

  constructor(code: AnswerStreamError['code'], message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'AnswerStreamError'
    this.code = code
  }
}

export type AnswerStreamHandlers = {
  onStatus?: (event: StatusEvent) => void
  /** 분류를 거쳤을 때만 온다 */
  onClassification?: (result: RoutingResult) => void
  /** 답변 글자 조각. adventure(범위 밖 문의)에서는 오지 않는다 */
  onDelta?: (text: string) => void
}

/**
 * POST /api/answer/stream. 이벤트를 handlers로 흘려보내고, done의 AnswerResponse를 돌려준다
 * (status가 "error"일 수 있다). done을 받지 못하면 AnswerStreamError를 던진다.
 */
export async function answerStream(
  request: AnswerRequest,
  handlers: AnswerStreamHandlers = {},
  signal?: AbortSignal,
): Promise<AnswerResponse> {
  const fail = (e: unknown, code: 'network', message: string) =>
    signal?.aborted
      ? new AnswerStreamError('aborted', '중지되었습니다', { cause: e })
      : new AnswerStreamError(code, message, { cause: e })

  let res: Response
  try {
    res = await fetch(`${API_BASE}/api/answer/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(request),
      signal,
    })
  } catch (e) {
    throw fail(e, 'network', 'API 서버에 연결할 수 없습니다')
  }

  if (!res.ok) {
    // 입력 오류는 스트림을 열기 전에 HTTP 400 + AnswerResponse(JSON)로 온다
    const body = await res.json().catch(() => null)
    if (isAnswerResponse(body)) return body
    throw new AnswerStreamError('network', `API 서버에 연결할 수 없습니다 (HTTP ${res.status})`)
  }
  if (!res.body) throw new AnswerStreamError('bad_response', '응답 본문이 없습니다')

  const reader = res.body.getReader()
  const parser = new SseParser()
  try {
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>
      try {
        chunk = await reader.read()
      } catch (e) {
        throw fail(e, 'network', 'API 서버와의 연결이 끊겼습니다')
      }
      const messages = chunk.done ? parser.end() : parser.push(chunk.value)
      for (const message of messages) {
        const done = dispatch(message, handlers)
        if (done) return done
      }
      if (chunk.done) throw new AnswerStreamError('incomplete', '답변을 끝까지 받지 못했습니다')
    }
  } finally {
    // done을 받은 뒤 · 오류로 빠져나올 때 연결을 정리한다 (이미 끝났으면 아무 일도 없다)
    reader.cancel().catch(() => {})
  }
}

/** 이벤트 하나를 처리한다. done이면 그 AnswerResponse를 돌려준다. 모르는 이벤트는 무시한다. */
function dispatch(message: SseMessage, handlers: AnswerStreamHandlers): AnswerResponse | null {
  let data: unknown
  try {
    data = JSON.parse(message.data)
  } catch (e) {
    throw new AnswerStreamError('bad_response', `${message.event} 이벤트를 읽을 수 없습니다`, { cause: e })
  }
  switch (message.event) {
    case 'status':
      handlers.onStatus?.(data as StatusEvent)
      return null
    case 'classification':
      handlers.onClassification?.(data as RoutingResult)
      return null
    case 'delta':
      handlers.onDelta?.((data as DeltaEvent).text)
      return null
    case 'done':
      if (!isAnswerResponse(data)) throw new AnswerStreamError('bad_response', 'done 이벤트 형식이 맞지 않습니다')
      return data
    default:
      return null
  }
}

function isAnswerResponse(value: unknown): value is AnswerResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    (value.status === 'ok' || value.status === 'error') &&
    'request_id' in value
  )
}
