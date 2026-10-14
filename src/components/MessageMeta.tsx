import type { ReactNode } from 'react'
import type { AnswerResponse, RoutingResult } from '../api/types'
import { labelName, PROVIDER_NAMES, routeName, toolName } from '../lib/labels'

type Props = {
  meta: AnswerResponse
  /** done 전에 받은 classification (meta.classification이 없을 때) */
  classification?: RoutingResult
  /** 화면에서 잰 전체 시간 (보낸 때 → done, 분류 · 검증 포함) */
  totalMs?: number
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}초`
const percent = (p: number) => `${(p * 100).toFixed(1)}%`

/** 답변 아래 배지 + "처리 과정" 펼침 (분류기 확률 · 경로 규칙 · LLM 검증 · 툴 호출 · 토큰) */
export function MessageMeta({ meta, classification: early, totalMs }: Props) {
  const classification = meta.classification ?? early ?? null
  const route = classification?.route ?? null
  const verification = classification?.verification ?? null
  const modelShort = meta.model.split('/').at(-1) ?? meta.model

  return (
    <details className="group min-w-0 text-xs text-zinc-500">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-1.5 rounded-md py-0.5 select-none [&::-webkit-details-marker]:hidden">
        <Badge strong>{labelName(meta.label)}</Badge>
        {/* 범위 밖 문의는 라벨과 경로 이름이 같다 → 한 번만 */}
        {route && routeName(route.route) !== labelName(meta.label) && <Badge>{routeName(route.route)}</Badge>}
        {verification && (
          <Badge tone={verification.match ? undefined : 'warn'}>
            {verification.match ? '검증 일치' : `검증 후 변경 → ${labelName(verification.final_label)}`}
          </Badge>
        )}
        <Badge>{seconds(meta.latency_ms)}</Badge>
        {meta.tools_used.map((t, i) => (
          <Badge key={`${t.name}-${i}`} tone={t.ok ? 'tool' : 'warn'}>
            {toolName(t.name)}
            {!t.ok && ' 실패'}
          </Badge>
        ))}
        <span className="min-w-0 truncate" title={meta.model}>
          {PROVIDER_NAMES[meta.provider] ?? meta.provider} · {modelShort}
        </span>
        <span className="ml-1 text-zinc-400 group-open:hidden">처리 과정 ▸</span>
        <span className="ml-1 hidden text-zinc-400 group-open:inline">처리 과정 ▾</span>
      </summary>

      <div className="mt-2 grid gap-3 rounded-lg border border-zinc-200 p-3 text-zinc-600 sm:grid-cols-2 dark:border-zinc-800 dark:text-zinc-400">
        {classification && (
          <Section title="분류기 확률 (보정 전)">
            <Scores scores={classification.scores} label={classification.classifier_label} />
            {classification.classifier_label !== classification.label && (
              <p className="mt-1">
                분류기 {labelName(classification.classifier_label)} → 최종 {labelName(classification.label)}
              </p>
            )}
          </Section>
        )}
        {route && (
          <Section title="경로 규칙">
            <Rows
              rows={[
                ['경로', routeName(route.route)],
                ['1위 확률 (p1, 보정 후)', percent(route.p1)],
                ['1·2위 차이 (margin)', percent(route.margin)],
                ['판정 이유', route.reason || '-'],
              ]}
            />
          </Section>
        )}
        {verification && (
          <Section title="LLM 검증">
            <Rows
              rows={[
                ['결과', verification.match ? '일치' : '불일치'],
                ['최종 라벨', labelName(verification.final_label)],
                ['근거', verification.reason || '-'],
                ['시간', seconds(verification.latency_ms)],
                ...(verification.error ? ([['오류', verification.error]] as [string, string][]) : []),
              ]}
            />
          </Section>
        )}
        {meta.tools_used.length > 0 && (
          <Section title="툴 호출">
            <ul className="space-y-1.5">
              {meta.tools_used.map((t, i) => (
                <li key={`${t.name}-${i}`}>
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">{toolName(t.name)}</span>{' '}
                  <code className="text-[11px]">{t.name}</code> · {t.ok ? '성공' : '실패'} · {seconds(t.latency_ms)}
                  {Object.keys(t.args).length > 0 && (
                    <div className="font-mono text-[11px] break-all">{JSON.stringify(t.args)}</div>
                  )}
                  {t.error && <div className="text-red-600 dark:text-red-400">{t.error}</div>}
                </li>
              ))}
            </ul>
          </Section>
        )}
        <Section title="답변">
          <Rows
            rows={[
              ['답변 생성', seconds(meta.latency_ms)],
              ...(totalMs !== undefined ? ([['전체 (분류 · 검증 포함)', seconds(totalMs)]] as [string, string][]) : []),
              ['토큰 (입력 / 출력)', `${meta.usage.input_tokens ?? '-'} / ${meta.usage.output_tokens ?? '-'}`],
              ['모델', `${PROVIDER_NAMES[meta.provider] ?? meta.provider} · ${meta.model}`],
              ['프롬프트 버전', meta.prompt_version],
              ['요청 id', meta.request_id],
            ]}
          />
        </Section>
      </div>
    </details>
  )
}

function Badge({ children, strong, tone }: { children: ReactNode; strong?: boolean; tone?: 'warn' | 'tool' }) {
  const color =
    tone === 'warn'
      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
      : tone === 'tool'
        ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300'
        : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
  return <span className={`rounded px-1.5 py-0.5 ${strong ? 'font-semibold' : ''} ${color}`}>{children}</span>
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0">
      <h4 className="mb-1 font-semibold text-zinc-700 dark:text-zinc-300">{title}</h4>
      {children}
    </section>
  )
}

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-zinc-400">{k}</dt>
          <dd className="min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function Scores({ scores, label }: { scores: Record<string, number>; label: string }) {
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1])
  return (
    <ul className="space-y-1">
      {sorted.map(([name, p]) => (
        <li key={name} className="grid grid-cols-[4.5rem_1fr_3.5rem] items-center gap-2">
          <span className={name === label ? 'font-semibold text-zinc-700 dark:text-zinc-300' : ''}>{labelName(name)}</span>
          <span className="h-1.5 overflow-hidden rounded bg-zinc-200 dark:bg-zinc-800" aria-hidden="true">
            <span
              className={`block h-full rounded ${name === label ? 'bg-zinc-600 dark:bg-zinc-300' : 'bg-zinc-400 dark:bg-zinc-600'}`}
              style={{ width: `${Math.max(0, Math.min(1, p)) * 100}%` }}
            />
          </span>
          <span className="text-right tabular-nums">{percent(p)}</span>
        </li>
      ))}
    </ul>
  )
}
