import { memo } from 'react'
import type { Message } from '../../lib/chat'

/** 유저 문의: 오른쪽 말풍선 */
export const UserMessage = memo(function UserMessage({ message }: { message: Message }) {
  return (
    <div className="flex flex-col items-end gap-1">
      {message.regenerated && <span className="text-xs text-zinc-500">↻ 다시 생성</span>}
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-zinc-200 px-4 py-2.5 text-sm leading-6 whitespace-pre-wrap break-words dark:bg-zinc-800">
        <span className="sr-only">{message.regenerated ? '다시 생성한 문의: ' : '문의: '}</span>
        {message.content}
      </div>
    </div>
  )
})
