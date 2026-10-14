// SSE(text/event-stream) 파서. 네트워크와 분리해 바이트 조각만 받는다 (테스트 대상).
//
// - 조각은 이벤트 중간 · 한글 바이트 중간에서 끊겨 올 수 있다 → TextDecoder(stream: true) + 빈 줄 단위 버퍼링
// - 줄 끝은 \n · \r\n · \r 모두 받는다
// - data 줄이 여러 개면 \n으로 잇는다. data가 없는 이벤트와 주석(":" 줄)은 버린다

export type SseMessage = {
  /** event 필드. 없으면 "message" */
  event: string
  /** data 줄을 \n으로 이은 원문 (JSON 파싱은 호출하는 쪽에서) */
  data: string
}

export class SseParser {
  private decoder = new TextDecoder()
  private buffer = ''

  /** 바이트 조각을 넣고, 이번 조각으로 완성된 이벤트를 돌려준다. */
  push(chunk: Uint8Array): SseMessage[] {
    return this.feed(this.decoder.decode(chunk, { stream: true }), false)
  }

  /** 스트림 끝. decoder에 남은 바이트를 비우고, 빈 줄 없이 끝난 마지막 이벤트도 돌려준다. */
  end(): SseMessage[] {
    return this.feed(this.decoder.decode(), true)
  }

  private feed(text: string, final: boolean): SseMessage[] {
    this.buffer += text
    // 끝의 \r은 다음 조각의 \n과 짝일 수 있으니 스트림이 끝날 때까지 남겨 둔다
    const hold = !final && this.buffer.endsWith('\r')
    const body = (hold ? this.buffer.slice(0, -1) : this.buffer).replace(/\r\n?/g, '\n')

    const blocks = body.split('\n\n')
    const rest = final ? '' : blocks.pop()!
    this.buffer = rest + (hold ? '\r' : '')

    const messages: SseMessage[] = []
    for (const block of blocks) {
      const message = parseBlock(block)
      if (message) messages.push(message)
    }
    return messages
  }
}

function parseBlock(block: string): SseMessage | null {
  let event = 'message'
  const data: string[] = []
  for (const line of block.split('\n')) {
    if (line === '' || line.startsWith(':')) continue
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') event = value
    else if (field === 'data') data.push(value)
  }
  return data.length ? { event, data: data.join('\n') } : null
}
