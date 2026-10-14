// 마크다운 표시 보조 함수 (타이핑 중 서식 깨짐 방지 · 복사용 평문/HTML)

const FENCE = /^ {0,3}(```|~~~)/

/**
 * 타이핑 중인 글에서 아직 닫히지 않은 서식을 임시로 닫는다 (표시 전용, 저장 글은 그대로).
 * - 열린 코드 블록(```) → 닫는다 (안쪽 기호는 건드리지 않음)
 * - 열린 인라인 코드(`) → 닫는다
 * - 짝이 안 맞는 굵게(**) → 닫는다. 막 열기만 한 **(뒤에 글자 없음)는 지운다
 *   닫는 **의 첫 * 만 타이핑된 상태(끝이 * 하나)면 그 * 를 지우고 닫는다
 */
export function closeOpenMarkdown(text: string): string {
  // 코드 블록 기호(```)를 두 글자까지만 타이핑한 상태: ``는 빈 코드로 처리되어 글자로 보인다 → 지운다
  if (/(^|[^`])``$/.test(text)) text = text.slice(0, -2)
  const lines = text.split('\n')
  let fence: string | null = null
  const outside: string[] = [] // 코드 블록 밖의 줄
  for (const line of lines) {
    const match = FENCE.exec(line)
    if (match) {
      if (fence === null) fence = match[1]
      else if (match[1] === fence) fence = null
      continue
    }
    if (fence === null) outside.push(line)
  }
  if (fence !== null) return `${text}\n${fence}`

  // 인라인 코드를 먼저 닫고(굵게 안의 코드 **`/a` 를 위해), 그다음 굵게를 센다
  let result = text
  let outsideText = outside.join('\n')
  if ((outsideText.replace(/`[^`\n]*`/g, '').match(/`/g) ?? []).length % 2 === 1) {
    // 막 연 `(뒤에 글자 없음)를 닫으면 빈 코드 ``가 되어 글자로 보인다 → 지운다
    const closer = result.endsWith('`') ? -1 : 1
    result = closer === -1 ? result.slice(0, -1) : `${result}\``
    outsideText = closer === -1 ? outsideText.slice(0, -1) : `${outsideText}\``
  }

  // 완성된 인라인 코드 안의 ** 는 세지 않는다
  const withoutCode = outsideText.replace(/`[^`\n]*`/g, '')
  const bolds = (withoutCode.match(/\*\*/g) ?? []).length
  if (bolds % 2 === 1) {
    if (result.endsWith('**')) return result.slice(0, -2)
    if (result.endsWith('*')) result = result.slice(0, -1)
    // 공백 바로 뒤의 **는 닫는 기호로 인정되지 않는다(CommonMark) → 끝 공백을 지우고 닫는다
    return `${result.replace(/\s+$/, '')}**`
  }
  return result
}

/** 이 요소 바로 아래의 공백 글자는 구조용(react-markdown이 넣는 줄바꿈)이라 버린다 */
const STRUCTURAL = new Set(['UL', 'OL', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR'])

const BLOCKS = new Set([
  'P', 'DIV', 'UL', 'OL', 'LI', 'PRE', 'BLOCKQUOTE', 'TABLE', 'TR',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HR',
])

/**
 * 렌더링된 답변(DOM)을 붙여 넣기 좋은 평문으로 바꾼다.
 * 굵게 · 제목 기호는 지우고, 목록은 "- " · "1. "을 남기고, 표는 칸을 탭으로 나눈다.
 * data-copy-ignore 요소(코드 블록 복사 버튼 등)는 뺀다.
 */
export function toPlainText(root: HTMLElement): string {
  const out: string[] = []
  const newline = (count = 1) => {
    const tail = out.join('').match(/\n*$/)![0].length
    if (out.length && tail < count) out.push('\n'.repeat(count - tail))
  }

  const walk = (node: Node, depth: number) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ''
      if (!text.trim() && STRUCTURAL.has(node.parentElement?.tagName ?? '')) return
      out.push(text)
      return
    }
    if (!(node instanceof HTMLElement) || node.hasAttribute('data-copy-ignore')) return
    const tag = node.tagName
    if (tag === 'BR') return void out.push('\n')
    if (tag === 'HR') return void (newline(2), out.push('---'), newline(2))
    if (tag === 'PRE') {
      newline(2)
      out.push((node.textContent ?? '').replace(/\n$/, ''))
      newline(2)
      return
    }
    if (tag === 'LI') {
      newline()
      const parent = node.parentElement
      const index = parent ? Array.from(parent.children).indexOf(node) : 0
      const start = parent instanceof HTMLOListElement ? parent.start || 1 : 1
      out.push('  '.repeat(depth) + (parent?.tagName === 'OL' ? `${start + index}. ` : '- '))
      node.childNodes.forEach((child) => walk(child, depth + 1))
      newline()
      return
    }
    if (tag === 'TR') {
      newline()
      const cells = Array.from(node.children).map((cell) => (cell.textContent ?? '').trim())
      out.push(cells.join('\t'))
      newline()
      return
    }
    const block = BLOCKS.has(tag)
    const listLike = tag === 'UL' || tag === 'OL'
    if (block) newline(listLike && depth > 0 ? 1 : 2)
    node.childNodes.forEach((child) => walk(child, depth))
    if (block) newline(listLike && depth > 0 ? 1 : 2)
  }

  root.childNodes.forEach((child) => walk(child, 0))
  return out.join('').replace(/\n{3,}/g, '\n\n').trim()
}

/** 렌더링된 답변을 붙여 넣기용 HTML로 (class · data-copy-ignore 요소 제거) */
export function toCopyHtml(root: HTMLElement): string {
  const clone = root.cloneNode(true) as HTMLElement
  clone.querySelectorAll('[data-copy-ignore]').forEach((el) => el.remove())
  clone.querySelectorAll('[class]').forEach((el) => el.removeAttribute('class'))
  return clone.innerHTML
}
