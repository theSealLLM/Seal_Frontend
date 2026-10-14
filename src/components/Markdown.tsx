import { memo, type Ref } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CodeBlock } from './CodeBlock'

const REMARK_PLUGINS = [remarkGfm]

// 원시 HTML은 렌더링하지 않는다 (rehype-raw를 쓰지 않음 → <script> 등은 글자 그대로). 위험한 주소(javascript: 등)는
// react-markdown의 기본 urlTransform이 비운다.
const COMPONENTS: Components = {
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
  // 외부 이미지는 불러오지 않고 링크로만 (답변에 나올 일이 거의 없고, 외부 요청을 막는다)
  img: ({ src, alt }) =>
    typeof src === 'string' && src ? (
      <a href={src} target="_blank" rel="noopener noreferrer">
        {alt || src}
      </a>
    ) : null,
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  // 넓은 표는 표 영역만 가로 스크롤
  table: ({ node: _node, ...props }) => (
    <div className="overflow-x-auto">
      <table {...props} />
    </div>
  ),
}

type Props = {
  text: string
  /** 생성 중이면 마지막 글 끝에 커서 (CSS ::after) */
  typing?: boolean
  ref?: Ref<HTMLDivElement>
}

/** 답변 마크다운 (GFM: 표 · 취소선 · 자동 링크). 줄바꿈 한 번도 줄바꿈으로 보인다 (LLM 답변이 문단 안에서 줄을 나눔) */
export const Markdown = memo(function Markdown({ text, typing = false, ref }: Props) {
  return (
    <div
      ref={ref}
      className={`prose prose-sm prose-zinc max-w-none break-words dark:prose-invert [&_li]:whitespace-pre-line [&_p]:whitespace-pre-line prose-p:my-2 prose-p:leading-7 prose-li:my-0.5 prose-code:before:content-none prose-code:after:content-none prose-code:rounded prose-code:bg-zinc-100 prose-code:px-1 prose-code:py-0.5 prose-code:font-normal dark:prose-code:bg-zinc-800 ${typing ? 'markdown-typing' : ''}`}
    >
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={COMPONENTS}>
        {text}
      </ReactMarkdown>
    </div>
  )
})
