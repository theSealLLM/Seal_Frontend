// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Markdown } from './Markdown'

afterEach(cleanup)

function renderMarkdown(text: string) {
  return render(<Markdown text={text} />).container
}

describe('Markdown', () => {
  it('굵게 · 목록 · 표를 그린다', () => {
    const el = renderMarkdown('**중요** 안내\n\n- 첫째\n- 둘째\n\n| 항목 | 기간 |\n|---|---|\n| 배송 | 3일 |')
    expect(el.querySelector('strong')?.textContent).toBe('중요')
    expect(el.querySelectorAll('li')).toHaveLength(2)
    expect(el.querySelector('table td')?.textContent).toBe('배송')
    // 넓은 표는 표 영역만 가로 스크롤
    expect(el.querySelector('table')?.parentElement?.className).toContain('overflow-x-auto')
  })

  it('원시 HTML은 렌더링하지 않는다 (글자로도 실행되지도 않음)', () => {
    const el = renderMarkdown('<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\n<b>굵게</b>')
    expect(el.querySelector('script')).toBeNull()
    expect(el.querySelector('img')).toBeNull()
    expect(el.querySelector('b')).toBeNull()
    expect(el.querySelector('[onerror]')).toBeNull()
  })

  it('javascript: 링크는 주소를 비운다', () => {
    const el = renderMarkdown('[눌러 보세요](javascript:alert(1))')
    const a = el.querySelector('a')
    expect(a?.textContent).toBe('눌러 보세요')
    expect(a?.getAttribute('href') ?? '').not.toContain('javascript')
  })

  it('링크는 새 탭에서 열고 opener를 넘기지 않는다', () => {
    const a = renderMarkdown('[배송 조회](https://example.com/track)').querySelector('a')!
    expect(a.getAttribute('href')).toBe('https://example.com/track')
    expect(a.getAttribute('target')).toBe('_blank')
    expect(a.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('이미지는 불러오지 않고 링크로만 보여 준다', () => {
    const el = renderMarkdown('![택배 상자](https://example.com/box.png)')
    expect(el.querySelector('img')).toBeNull()
    expect(el.querySelector('a')?.textContent).toBe('택배 상자')
  })

  it('코드 블록에 언어 이름과 복사 버튼을 붙이고, 인라인 코드는 그대로', () => {
    const el = renderMarkdown('`npm` 명령:\n\n```bash\nnpm run dev\n```')
    expect(el.querySelector('p code')?.textContent).toBe('npm')
    expect(el.querySelector('pre')?.textContent).toBe('npm run dev\n')
    expect(el.textContent).toContain('bash')
    expect(el.querySelector('button[aria-label="코드 복사"]')).not.toBeNull()
  })
})
