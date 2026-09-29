import type { ReactNode } from 'react'
import { Code } from '../components/Code'

/** Inline: `code`, **bold**, *em*. */
function inline(s: string, key = 0): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)/g
  let last = 0
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m.index > last) out.push(s.slice(last, m.index))
    const k = `${key}-${m.index}`
    if (m[1]) out.push(<code key={k}>{m[1].slice(1, -1)}</code>)
    else if (m[2]) out.push(<b key={k}>{m[2].slice(2, -2)}</b>)
    else out.push(<em key={k}>{m[3].slice(1, -1)}</em>)
    last = re.lastIndex
  }
  if (last < s.length) out.push(s.slice(last))
  return out
}

/**
 * Tiny markdown subset for the question bank: paragraphs, "- " / "1. " lists,
 * ``` fences (Go-highlighted, other languages plain) and inline marks.
 */
export function Md({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  const lines = text.replace(/\r/g, '').split('\n')
  let i = 0
  while (i < lines.length) {
    const l = lines[i]
    if (l.startsWith('```')) {
      const lang = l.slice(3).trim()
      const body: string[] = []
      for (i++; i < lines.length && !lines[i].startsWith('```'); i++) body.push(lines[i])
      i++
      blocks.push(
        !lang || lang === 'go' ? (
          <Code key={i} light>
            {body.join('\n')}
          </Code>
        ) : (
          <pre key={i} className="code light">
            {body.join('\n')}
          </pre>
        ),
      )
    } else if (/^\s*([-*]|\d+\.) /.test(l)) {
      const ordered = /^\s*\d+\. /.test(l)
      const items: string[] = []
      for (; i < lines.length && /^\s*([-*]|\d+\.) /.test(lines[i]); i++) items.push(lines[i].replace(/^\s*([-*]|\d+\.) /, ''))
      const lis = items.map((t, k) => <li key={k}>{inline(t, k)}</li>)
      blocks.push(ordered ? <ol key={i}>{lis}</ol> : <ul key={i}>{lis}</ul>)
    } else if (!l.trim()) {
      i++
    } else {
      const para: string[] = []
      for (; i < lines.length && lines[i].trim() && !lines[i].startsWith('```') && !/^\s*([-*]|\d+\.) /.test(lines[i]); i++) para.push(lines[i])
      blocks.push(<p key={i}>{inline(para.join(' '), i)}</p>)
    }
  }
  return <>{blocks}</>
}
