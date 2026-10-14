// Seal_LLM API 응답 형식
// 원본: Seal_LLM src/theseal/api/schemas.py · llm/schemas.py · routing/router.py

export type Provider = 'local' | 'openai'
export type VerifyMode = 'off' | 'uncertain' | 'all'

export type Health = {
  status: 'ok'
  classifier: string | null
  classifier_device: string | null
  classifier_error: string | null
  route_rule_enabled: boolean
  verify_mode: VerifyMode
  default_provider: Provider
}

export type Label = 'shipping' | 'refund' | 'account' | 'unknown'
export type Route = 'confident' | 'low_confidence' | 'ambiguous' | 'unknown'

export type RoutingResult = {
  label: Label
  text: string
  classifier_label: string
  /** 분류기 확률 (보정 전) */
  scores: Record<string, number>
  route: { route: Route; p1: number; margin: number; reason: string } | null
  verification: {
    match: boolean
    reason: string
    final_label: string
    latency_ms: number
    error: string | null
  } | null
}

export type ErrorCode = 'invalid_input' | 'config_error' | 'llm_error' | 'llm_timeout'

export type ToolCall = {
  name: string
  args: Record<string, unknown>
  ok: boolean
  error?: string | null
  latency_ms: number
}

export type AnswerResponse = {
  request_id: string
  status: 'ok' | 'error'
  label: string
  answer: string | null
  provider: Provider
  model: string
  prompt_version: string
  tools_used: ToolCall[]
  /** 답변 생성 시간 (분류 · 검증 제외) */
  latency_ms: number
  usage: { input_tokens: number | null; output_tokens: number | null }
  error: { code: ErrorCode | string; message: string } | null
  created_at: string
  classification: RoutingResult | null
}

/** /api/answer/stream의 status 이벤트 단계. adventure = 범위 밖(unknown) 문의 (delta 없이 done에 전체 답변) */
export type StatusStage = 'classifying' | 'answering' | 'adventure'

export type StatusEvent = { stage: StatusStage; message: string }

export type DeltaEvent = { text: string }

export type AnswerRequest = {
  /** 문의 원문 (1~2000자) */
  text: string
  /** 생략 시 서버 기본값 */
  provider?: Provider
  /** 넣으면 분류를 건너뜀 (테스트용) */
  label?: Label
}
