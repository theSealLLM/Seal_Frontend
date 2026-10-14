// 설정값은 이 파일 한 곳에 모은다.

/** API 주소. 비우면 같은 주소의 상대 경로(개발 중에는 Vite 프록시)로 보낸다. */
export const API_BASE: string = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '')

/** /health 확인 주기 */
export const HEALTH_INTERVAL_MS = 30_000

/** /health 응답 대기 한도 (넘으면 연결 안 됨으로 본다) */
export const HEALTH_TIMEOUT_MS = 5_000

/** 문의 최대 글자 수 (서버 검증과 같다. 서버는 Python len 기준이라 코드 포인트로 센다) */
export const MAX_INPUT_LENGTH = 2000

/** 입력창 최대 높이 (넘으면 입력창 안에서 스크롤) */
export const COMPOSER_MAX_HEIGHT_PX = 200

/** 타이핑 효과 기본 속도 (글자/초). 밀린 글자가 적을 때의 속도 */
export const TYPEWRITER_BASE_CPS = 50

/**
 * 밀린 글자를 이 시간(초) 안에 따라잡는 속도로 올린다 (속도 = max(기본, 밀린 글자 / 이 값)).
 * 결과적으로 화면 글은 도착보다 최대 이 시간만큼 뒤처진다. (로컬 Gemma 실측 약 400자/초)
 */
export const TYPEWRITER_CATCHUP_SEC = 0.6

/** 바닥에서 이 거리 이내면 바닥에 붙은 것으로 본다 (자동 스크롤 켜짐) */
export const AUTO_SCROLL_THRESHOLD_PX = 80
