import { Fragment, type ReactNode } from 'react'

/**
 * A tiny, dependency-free and XSS-safe markdown renderer for Design Studio v2
 * assistant messages. It renders fenced code blocks, inline code, bold, simple
 * lists and blockquotes into React nodes (never dangerouslySetInnerHTML), which
 * is enough for the studio's pt-BR prose without pulling in a markdown library.
 */

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  // Split on `code` and **bold** while keeping delimiters.
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*)/g
  const parts = text.split(pattern)
  parts.forEach((part, index) => {
    if (!part) return
    if (part.startsWith('`') && part.endsWith('`')) {
      nodes.push(
        <code key={`${keyPrefix}-c-${index}`} className="rounded bg-black/5 px-1 py-0.5 font-mono text-[0.82em]">
          {part.slice(1, -1)}
        </code>,
      )
    } else if (part.startsWith('**') && part.endsWith('**')) {
      nodes.push(<strong key={`${keyPrefix}-b-${index}`}>{part.slice(2, -2)}</strong>)
    } else {
      nodes.push(<Fragment key={`${keyPrefix}-t-${index}`}>{part}</Fragment>)
    }
  })
  return nodes
}

export default function StudioMarkdown({ content }: { content: string }) {
  const segments = String(content ?? '').split(/```/)
  return (
    <div className="space-y-2 text-sm leading-6 text-[var(--v2-ink-strong)]">
      {segments.map((segment, index) => {
        // Odd segments are fenced code blocks.
        if (index % 2 === 1) {
          const firstNewline = segment.indexOf('\n')
          const lang = firstNewline > 0 ? segment.slice(0, firstNewline).trim() : ''
          const code = firstNewline > 0 && lang && !lang.includes(' ') ? segment.slice(firstNewline + 1) : segment
          return (
            <pre
              key={`code-${index}`}
              className="overflow-x-auto rounded-lg border border-[var(--v2-border)] bg-[#0b0f14] p-3 text-[0.8rem] leading-5 text-[#e6edf3]"
            >
              <code className="font-mono">{code.replace(/\n$/, '')}</code>
            </pre>
          )
        }

        const lines = segment.split('\n')
        const blocks: ReactNode[] = []
        let listBuffer: string[] = []
        const flushList = (key: string) => {
          if (!listBuffer.length) return
          blocks.push(
            <ul key={key} className="list-disc space-y-0.5 pl-5">
              {listBuffer.map((item, li) => (
                <li key={li}>{renderInline(item, `${key}-${li}`)}</li>
              ))}
            </ul>,
          )
          listBuffer = []
        }
        lines.forEach((line, li) => {
          const trimmed = line.trim()
          if (/^[-*]\s+/.test(trimmed)) {
            listBuffer.push(trimmed.replace(/^[-*]\s+/, ''))
            return
          }
          flushList(`ul-${index}-${li}`)
          if (!trimmed) return
          if (trimmed.startsWith('> ')) {
            blocks.push(
              <blockquote key={`q-${index}-${li}`} className="border-l-2 border-[var(--v2-accent-warm)] pl-3 text-[var(--v2-ink-soft)]">
                {renderInline(trimmed.slice(2), `q-${index}-${li}`)}
              </blockquote>,
            )
            return
          }
          const heading = trimmed.match(/^(#{1,4})\s+(.*)$/)
          if (heading) {
            blocks.push(
              <p key={`h-${index}-${li}`} className="font-semibold text-[var(--v2-ink-strong)]">
                {renderInline(heading[2], `h-${index}-${li}`)}
              </p>,
            )
            return
          }
          blocks.push(<p key={`p-${index}-${li}`}>{renderInline(trimmed, `p-${index}-${li}`)}</p>)
        })
        flushList(`ul-${index}-end`)
        return <Fragment key={`seg-${index}`}>{blocks}</Fragment>
      })}
    </div>
  )
}
