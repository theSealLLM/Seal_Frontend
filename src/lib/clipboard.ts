// 클립보드 복사. 서식 있는 글(HTML) + 평문을 함께 넣고, 안 되면 평문만.
// navigator.clipboard는 안전한 출처(https · localhost)에서만 동작한다 → 실패하면 execCommand로 다시 시도.

/** 서식 있는 글과 평문을 함께 넣는다. 지원하지 않으면 평문만. 성공하면 true */
export async function copyRich(html: string, text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        }),
      ])
      return true
    }
  } catch {
    // 아래 평문 복사로
  }
  return copyText(text)
}

/** 평문만 넣는다. 성공하면 true */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 아래 예비 방법으로
  }
  return legacyCopy(text)
}

function legacyCopy(text: string): boolean {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    textarea.remove()
  }
}
