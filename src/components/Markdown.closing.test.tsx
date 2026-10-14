// @vitest-environment jsdom
// closeOpenMarkdown 결과가 실제 react-markdown에서 굵게로 그려지는지 (문자열 비교만으로는 CommonMark 규칙을 못 잡는다)
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { closeOpenMarkdown } from '../lib/markdown'
import { Markdown } from './Markdown'

afterEach(cleanup)

const ANSWER =
  '배송 조회는 **공식 주문 내역** 또는 **배송 지원 경로**에서 확인하실 수 있습니다.\n\n' +
  '**1단계: 주문 내역 확인**\n- 우선 `주문 번호`를 확인해 주세요.\n\n' +
  '```\n코드 **안**\n```\n끝 문장 **강조**입니다.\n\n' +
  // 실제 답변(계정): 굵게 안의 인라인 코드
  '비밀번호 문제의 경우, **`/account/reset`** 경로를 통해 재설정하세요.'

describe('타이핑 중 마크다운', () => {
  it('어느 글자에서 끊겨도 ** · ` 기호가 글자로 보이지 않는다 (코드 블록 안 제외)', () => {
    const chars = Array.from(ANSWER)
    for (let i = 1; i <= chars.length; i++) {
      const { container, unmount } = render(<Markdown text={closeOpenMarkdown(chars.slice(0, i).join(''))} />)
      const outsideCode = Array.from(container.querySelectorAll('p, li'))
        .map((el) => el.textContent)
        .join('\n')
      expect(outsideCode, `${i}글자: ${chars.slice(0, i).join('')}`).not.toMatch(/\*\*|`/)
      unmount()
    }
  })
})
