// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { closeOpenMarkdown, toCopyHtml, toPlainText } from './markdown'

describe('closeOpenMarkdown', () => {
  it('닫힌 서식 · 평문은 그대로 둔다', () => {
    expect(closeOpenMarkdown('')).toBe('')
    expect(closeOpenMarkdown('배송은 **3일** 걸립니다.')).toBe('배송은 **3일** 걸립니다.')
    expect(closeOpenMarkdown('`코드`와 **굵게**')).toBe('`코드`와 **굵게**')
    expect(closeOpenMarkdown('- 항목\n- 둘째')).toBe('- 항목\n- 둘째')
  })

  it('열린 굵게를 닫는다', () => {
    expect(closeOpenMarkdown('배송은 **3일')).toBe('배송은 **3일**')
    expect(closeOpenMarkdown('**첫째**와 **둘')).toBe('**첫째**와 **둘**')
  })

  it('공백에서 끊겼으면 끝 공백을 지우고 닫는다 (공백 뒤 **는 닫는 기호가 아님)', () => {
    expect(closeOpenMarkdown('배송 조회는 **공식 주문 ')).toBe('배송 조회는 **공식 주문**')
    expect(closeOpenMarkdown('**공식\n')).toBe('**공식**')
  })

  it('막 연 **(뒤에 글자 없음)는 지운다', () => {
    expect(closeOpenMarkdown('배송은 **')).toBe('배송은 ')
  })

  it('닫는 ** 중 * 하나만 타이핑된 상태면 그 * 를 지우고 닫는다', () => {
    expect(closeOpenMarkdown('배송은 **3일*')).toBe('배송은 **3일**')
  })

  it('열린 인라인 코드를 닫는다 (안쪽 ** 는 세지 않음)', () => {
    expect(closeOpenMarkdown('명령은 `npm ru')).toBe('명령은 `npm ru`')
    expect(closeOpenMarkdown('명령은 `a**b')).toBe('명령은 `a**b`')
    // 막 연 `는 지운다 (빈 코드 ``는 글자로 보임)
    expect(closeOpenMarkdown('명령은 `')).toBe('명령은 ')
  })

  it('코드 블록 기호를 두 글자까지만 타이핑한 ``는 지운다', () => {
    expect(closeOpenMarkdown('예시:\n``')).toBe('예시:\n')
  })

  it('열린 코드 블록을 닫고, 안쪽 기호는 건드리지 않는다', () => {
    expect(closeOpenMarkdown('예시:\n```python\nx = "**"')).toBe('예시:\n```python\nx = "**"\n```')
    expect(closeOpenMarkdown('~~~\n`a')).toBe('~~~\n`a\n~~~')
  })

  it('닫힌 코드 블록 안의 ** · ` 는 세지 않는다', () => {
    const text = '```\na ** b `c\n```\n뒤 문장'
    expect(closeOpenMarkdown(text)).toBe(text)
  })
})

function html(markup: string): HTMLElement {
  const div = document.createElement('div')
  div.innerHTML = markup
  return div
}

describe('toPlainText', () => {
  it('굵게 · 제목 기호 없이 문단을 빈 줄로 나눈다', () => {
    expect(toPlainText(html('<h3>안내</h3><p>배송은 <strong>3일</strong> 걸립니다.</p><p>감사합니다.</p>'))).toBe(
      '안내\n\n배송은 3일 걸립니다.\n\n감사합니다.',
    )
  })

  it('문단 안 줄바꿈을 살린다', () => {
    expect(toPlainText(html('<p>첫 줄\n둘째 줄</p>'))).toBe('첫 줄\n둘째 줄')
  })

  it('목록은 "- " · "1. "을 남기고, 중첩은 들여쓴다', () => {
    expect(
      toPlainText(html('<p>방법:</p><ol><li>주문 내역 확인</li><li>문의 접수<ul><li>전화</li><li>채팅</li></ul></li></ol><p>끝</p>')),
    ).toBe('방법:\n\n1. 주문 내역 확인\n2. 문의 접수\n  - 전화\n  - 채팅\n\n끝')
  })

  it('표는 칸을 탭으로 나눈다 (react-markdown이 넣는 구조용 줄바꿈은 무시)', () => {
    expect(
      toPlainText(
        html(
          '<table>\n<thead>\n<tr>\n<th>항목</th>\n<th>기간</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>배송</td>\n<td>3일</td>\n</tr>\n</tbody>\n</table>',
        ),
      ),
    ).toBe('항목\t기간\n배송\t3일')
  })

  it('목록 항목 사이의 구조용 줄바꿈으로 빈 줄을 만들지 않는다', () => {
    expect(toPlainText(html('<ul>\n<li>첫째</li>\n<li>둘째</li>\n</ul>'))).toBe('- 첫째\n- 둘째')
  })

  it('코드 블록은 그대로, data-copy-ignore(복사 버튼)는 뺀다', () => {
    expect(
      toPlainText(html('<p>예시</p><div><div data-copy-ignore>python 복사</div><pre><code>x = 1\ny = 2\n</code></pre></div>')),
    ).toBe('예시\n\nx = 1\ny = 2')
  })
})

describe('toCopyHtml', () => {
  it('class와 복사 버튼을 뺀다', () => {
    expect(toCopyHtml(html('<p class="a">글 <strong class="b">굵게</strong></p><button data-copy-ignore>복사</button>'))).toBe(
      '<p>글 <strong>굵게</strong></p>',
    )
  })
})
