// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { AnswerResponse, RoutingResult } from '../api/types'
import { ErrorMessage } from './messages/ErrorMessage'
import { MessageMeta } from './MessageMeta'

afterEach(cleanup)

const CLASSIFICATION: RoutingResult = {
  label: 'shipping',
  text: '오늘 날씨가 안좋아서 배송이 안되려나?',
  classifier_label: 'unknown',
  scores: { shipping: 0.41, unknown: 0.45, refund: 0.1, account: 0.04 },
  route: { route: 'low_confidence', p1: 0.45, margin: 0.04, reason: 'p1 < 0.6' },
  verification: { match: false, reason: '배송 지연 문의', final_label: 'shipping', latency_ms: 820, error: null },
}

const META: AnswerResponse = {
  request_id: 'req-123',
  status: 'ok',
  label: 'shipping',
  answer: '답변',
  provider: 'local',
  model: 'hf.co/unsloth/gemma-4-E4B-it-GGUF:Q4_K_M',
  prompt_version: 'shipping-v2',
  tools_used: [{ name: 'get_weather', args: { location: '서울' }, ok: true, latency_ms: 300 }],
  latency_ms: 1600,
  usage: { input_tokens: 512, output_tokens: 128 },
  error: null,
  created_at: '2026-10-13T00:00:00Z',
  classification: CLASSIFICATION,
}

describe('MessageMeta', () => {
  it('배지: 라벨 · 경로 · 검증 결과 · 답변 시간 · 툴 · 모델', () => {
    render(<MessageMeta meta={META} totalMs={3200} />)
    const summary = document.querySelector('summary')!
    expect(summary.textContent).toContain('배송')
    expect(summary.textContent).toContain('확신 부족')
    expect(summary.textContent).toContain('검증 후 변경 → 배송')
    expect(summary.textContent).toContain('1.6초')
    expect(summary.textContent).toContain('날씨')
    expect(summary.textContent).toContain('로컬 · gemma-4-E4B-it-GGUF:Q4_K_M')
  })

  it('펼치면 분류기 확률 · 경로 규칙 · LLM 검증 · 툴 호출 · 토큰 · 전체 시간', () => {
    render(<MessageMeta meta={META} totalMs={3200} />)
    const details = document.querySelector('details')!
    expect(details.open).toBe(false)
    fireEvent.click(document.querySelector('summary')!)
    expect(details.open).toBe(true)

    const text = details.textContent!
    expect(text).toContain('45.0%') // 분류기 확률 · p1
    expect(text).toContain('분류기 범위 밖 → 최종 배송')
    expect(text).toContain('4.0%') // margin
    expect(text).toContain('p1 < 0.6')
    expect(text).toContain('배송 지연 문의') // 검증 근거
    expect(text).toContain('0.8초')
    expect(text).toContain('{"location":"서울"}')
    expect(text).toContain('512 / 128')
    expect(text).toContain('3.2초') // 화면에서 잰 전체 시간
    expect(text).toContain('shipping-v2')
    expect(text).toContain('req-123')
  })

  it('분류를 거치지 않은 답변은 분류 · 경로 · 검증을 숨긴다', () => {
    render(<MessageMeta meta={{ ...META, classification: null, tools_used: [] }} />)
    const text = document.querySelector('details')!.textContent!
    expect(text).not.toContain('분류기 확률')
    expect(text).not.toContain('경로 규칙')
    expect(text).not.toContain('LLM 검증')
    expect(text).not.toContain('툴 호출')
    expect(text).not.toContain('전체 (분류')
  })

  it('범위 밖 문의는 라벨과 경로 배지가 겹치지 않는다', () => {
    const unknown: RoutingResult = {
      ...CLASSIFICATION,
      label: 'unknown',
      route: { route: 'unknown', p1: 0.43, margin: 0.06, reason: 'p1 < tau_low' },
      verification: null,
    }
    render(<MessageMeta meta={{ ...META, label: 'unknown', classification: unknown }} />)
    expect(document.querySelector('summary')!.textContent!.match(/범위 밖/g)).toHaveLength(1)
  })

  it('done 전에 받은 classification을 쓸 수 있다', () => {
    render(<MessageMeta meta={{ ...META, classification: null }} classification={CLASSIFICATION} />)
    expect(document.querySelector('summary')!.textContent).toContain('확신 부족')
  })
})

describe('ErrorMessage', () => {
  it.each([
    ['llm_error', '모델 서버(Ollama)가 꺼져 있을 수 있습니다.'],
    ['config_error', '서버 설정을 확인하세요'],
    ['llm_timeout', '응답 시간이 초과되었습니다.'],
    ['network', 'API 서버에 연결할 수 없습니다.'],
    ['incomplete', '답변을 끝까지 받지 못했습니다'],
    ['처음 보는 코드', '알 수 없는 오류가 발생했습니다.'],
  ])('%s 안내 + 다시 시도', (code, guide) => {
    render(<ErrorMessage error={{ code, message: 'ConnectError: [Errno 111]' }} onRetry={() => {}} />)
    expect(screen.getByRole('alert').textContent).toContain(guide)
    expect(screen.getByRole('alert').textContent).toContain('ConnectError: [Errno 111]')
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeTruthy()
  })

  it('입력 오류는 다시 보내도 같아서 다시 시도 버튼이 없다', () => {
    render(<ErrorMessage error={{ code: 'invalid_input', message: 'text: 빈 문장' }} onRetry={() => {}} />)
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull()
  })
})
