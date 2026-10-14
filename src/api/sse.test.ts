import { describe, expect, it } from 'vitest'
import { SseParser, type SseMessage } from './sse'

const encoder = new TextEncoder()

/** 문자열을 바이트로 바꿔 주어진 위치(바이트 단위)에서 잘라 넣는다. */
function parseChunks(text: string, cuts: number[] = []): SseMessage[] {
  const bytes = encoder.encode(text)
  const parser = new SseParser()
  const out: SseMessage[] = []
  let start = 0
  for (const cut of [...cuts, bytes.length]) {
    out.push(...parser.push(bytes.slice(start, cut)))
    start = cut
  }
  out.push(...parser.end())
  return out
}

const STREAM =
  'event: status\ndata: {"stage": "answering", "message": "답변을 작성하는 중..."}\n\n' +
  'event: delta\ndata: {"text": "배송 지연"}\n\n' +
  'event: delta\ndata: {"text": "은 확인 후"}\n\n'

const EXPECTED: SseMessage[] = [
  { event: 'status', data: '{"stage": "answering", "message": "답변을 작성하는 중..."}' },
  { event: 'delta', data: '{"text": "배송 지연"}' },
  { event: 'delta', data: '{"text": "은 확인 후"}' },
]

describe('SseParser', () => {
  it('한 번에 온 여러 이벤트를 나눈다', () => {
    expect(parseChunks(STREAM)).toEqual(EXPECTED)
  })

  it('모든 바이트 위치에서 잘려 와도 결과가 같다 (이벤트 경계 · 한글 바이트 중간 포함)', () => {
    const length = encoder.encode(STREAM).length
    for (let cut = 1; cut < length; cut++) {
      expect(parseChunks(STREAM, [cut])).toEqual(EXPECTED)
    }
  })

  it('한 바이트씩 와도 결과가 같다', () => {
    const length = encoder.encode(STREAM).length
    const cuts = Array.from({ length: length - 1 }, (_, i) => i + 1)
    expect(parseChunks(STREAM, cuts)).toEqual(EXPECTED)
  })

  it('완성된 이벤트는 다음 조각을 기다리지 않고 바로 내보낸다', () => {
    const parser = new SseParser()
    expect(parser.push(encoder.encode('event: delta\ndata: {"text": "가"}\n\nevent: del'))).toEqual([
      { event: 'delta', data: '{"text": "가"}' },
    ])
    expect(parser.push(encoder.encode('ta\ndata: {"text": "나"}\n'))).toEqual([])
    expect(parser.push(encoder.encode('\n'))).toEqual([{ event: 'delta', data: '{"text": "나"}' }])
  })

  it('\\r\\n 줄 끝을 받는다 (\\r과 \\n 사이에서 잘려도)', () => {
    const text = STREAM.replaceAll('\n', '\r\n')
    expect(parseChunks(text)).toEqual(EXPECTED)
    const firstCr = encoder.encode(text).indexOf(13)
    expect(parseChunks(text, [firstCr + 1])).toEqual(EXPECTED)
  })

  it('\\r만 있는 줄 끝도 받는다', () => {
    expect(parseChunks(STREAM.replaceAll('\n', '\r'))).toEqual(EXPECTED)
  })

  it('끝에 빈 줄 없이 끝난 마지막 이벤트도 처리한다', () => {
    expect(parseChunks('event: done\ndata: {"status": "ok"}')).toEqual([
      { event: 'done', data: '{"status": "ok"}' },
    ])
    expect(parseChunks('event: done\ndata: {"status": "ok"}\n')).toEqual([
      { event: 'done', data: '{"status": "ok"}' },
    ])
  })

  it('data 줄이 여러 개면 \\n으로 잇는다', () => {
    expect(parseChunks('event: delta\ndata: 첫 줄\ndata: 둘째 줄\n\n')).toEqual([
      { event: 'delta', data: '첫 줄\n둘째 줄' },
    ])
  })

  it('event가 없으면 message, 콜론 뒤 공백은 하나만 뗀다', () => {
    expect(parseChunks('data:  두 칸\n\ndata:붙음\n\n')).toEqual([
      { event: 'message', data: ' 두 칸' },
      { event: 'message', data: '붙음' },
    ])
  })

  it('주석 줄 · data 없는 이벤트 · 모르는 필드는 버린다', () => {
    expect(parseChunks(': ping\n\nevent: status\n\nid: 1\nretry: 10\nevent: delta\ndata: x\n\n')).toEqual([
      { event: 'delta', data: 'x' },
    ])
  })

  it('빈 스트림은 이벤트가 없다', () => {
    expect(parseChunks('')).toEqual([])
  })
})
