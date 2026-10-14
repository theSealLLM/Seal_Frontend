// 화면 표시 이름은 이 파일 한 곳에 모은다.
// (분류기 라벨이 나중에 enum 숫자로 바뀌어도 여기만 고친다)

import type { Provider, StatusStage, VerifyMode } from '../api/types'

export const PROVIDER_NAMES: Record<Provider, string> = {
  local: '로컬',
  openai: 'OpenAI',
}

export const VERIFY_MODE_NAMES: Record<VerifyMode, string> = {
  off: '검증 끔',
  uncertain: '불확실할 때 검증',
  all: '항상 검증',
}

export const LABEL_NAMES: Record<string, string> = {
  shipping: '배송',
  refund: '환불/반품',
  account: '계정',
  unknown: '범위 밖',
}

export function labelName(label: string): string {
  return LABEL_NAMES[label] ?? label
}

/** 서버 STAGE_MESSAGES와 같은 문구 (status 이벤트 전 · 저장본 표시에 쓴다) */
export const STAGE_MESSAGES: Record<StatusStage, string> = {
  classifying: '문의를 분류하는 중...',
  answering: '답변을 작성하는 중...',
  adventure: '챗봇이 알 수 없는 것을 찾아 모험을 떠나는 중...',
}

export const ROUTE_NAMES: Record<string, string> = {
  confident: '확신',
  low_confidence: '확신 부족',
  ambiguous: '애매함',
  unknown: '범위 밖',
}

export function routeName(route: string): string {
  return ROUTE_NAMES[route] ?? route
}

/** 서버 툴 이름 (Seal_LLM llm/answer/tools) */
export const TOOL_NAMES: Record<string, string> = {
  get_today: '오늘 날짜',
  get_weekday: '요일 계산',
  get_date_of_weekday: '요일의 날짜',
  get_weather: '날씨',
  web_search: '웹 검색',
}

export function toolName(name: string): string {
  return TOOL_NAMES[name] ?? name
}

/** 오류 코드별 안내 (서버 error.code + 화면 쪽 AnswerStreamError code). retry=false면 다시 시도 버튼을 숨긴다 */
export const ERROR_GUIDES: Record<string, { text: string; retry: boolean }> = {
  config_error: { text: '서버 설정을 확인하세요 (분류 모델이나 API 키가 없습니다).', retry: true },
  llm_error: { text: '모델 서버(Ollama)가 꺼져 있을 수 있습니다.', retry: true },
  llm_timeout: { text: '응답 시간이 초과되었습니다.', retry: true },
  invalid_input: { text: '문의 내용을 확인하세요 (빈 문장이거나 2000자를 넘었습니다).', retry: false },
  network: { text: 'API 서버에 연결할 수 없습니다.', retry: true },
  incomplete: { text: '답변을 끝까지 받지 못했습니다 (연결이 끊겼습니다).', retry: true },
  bad_response: { text: '서버 응답 형식이 올바르지 않습니다.', retry: true },
}

export function errorGuide(code: string): { text: string; retry: boolean } {
  return ERROR_GUIDES[code] ?? { text: '알 수 없는 오류가 발생했습니다.', retry: true }
}

/** 화면 테마 */
export type Theme = 'system' | 'light' | 'dark'

export const THEME_NAMES: Record<Theme, string> = {
  system: '시스템',
  light: '라이트',
  dark: '다크',
}
