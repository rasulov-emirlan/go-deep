const KW = new Set(
  'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var'.split(' '),
)
const BUILTIN = new Set('nil true false iota append cap clear close copy delete len make max min new panic print println recover'.split(' '))

type Tok = { t: 'k' | 's' | 'c' | 'n' | 'p'; v: string }

function tokenize(src: string): Tok[] {
  const out: Tok[] = []
  const re = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\\n])*"|`[^`]*`|'(?:\\.|[^'\\\n])*')|(\b\d[\d_]*(?:\.\d+)?(?:e\d+)?\b|\b0x[\da-fA-F]+\b)|([A-Za-z_]\w*)/g
  let last = 0
  for (let m = re.exec(src); m; m = re.exec(src)) {
    if (m.index > last) out.push({ t: 'p', v: src.slice(last, m.index) })
    if (m[1]) out.push({ t: 'c', v: m[1] })
    else if (m[2]) out.push({ t: 's', v: m[2] })
    else if (m[3]) out.push({ t: 'n', v: m[3] })
    else out.push({ t: KW.has(m[4]) ? 'k' : BUILTIN.has(m[4]) ? 'n' : 'p', v: m[4] })
    last = re.lastIndex
  }
  if (last < src.length) out.push({ t: 'p', v: src.slice(last) })
  return out
}

function Line({ src }: { src: string }) {
  return (
    <>
      {tokenize(src).map((tok, i) => (tok.t === 'p' ? tok.v : <span key={i} className={tok.t}>{tok.v}</span>))}
    </>
  )
}

/** Go-highlighted code block. `hl` = 1-based line numbers to highlight. */
export function Code({ children, hl = [], light = false }: { children: string; hl?: number[]; light?: boolean }) {
  const lines = children.replace(/^\n/, '').replace(/\s+$/, '').split('\n')
  return (
    <pre className={'code' + (light ? ' light' : '')}>
      {lines.map((l, i) => (
        <span key={i} className={hl.includes(i + 1) ? 'hl' : undefined}>
          <Line src={l} />
          {'\n'}
        </span>
      ))}
    </pre>
  )
}
