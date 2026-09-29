import { useEffect, useRef } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { keymap } from '@codemirror/view'
import { indentWithTab } from '@codemirror/commands'
import { EditorState } from '@codemirror/state'
import { go } from '@codemirror/lang-go'

const theme = EditorView.theme({
  '&': { fontSize: '14px', border: '2px solid var(--ink)', background: '#fff' },
  '.cm-content': { fontFamily: 'var(--mono)', padding: '10px 0' },
  '.cm-gutters': { background: 'var(--paper)', borderRight: '1px solid var(--g300)', color: 'var(--g500)' },
  '&.cm-focused': { outline: '2px solid var(--red)', outlineOffset: '2px' },
  '.cm-activeLine': { background: '#f4f4f4' },
  '.cm-activeLineGutter': { background: '#ececec' },
  '.cm-scroller': { minHeight: '220px' },
})

/** A small Go editor. `onRun` fires on Ctrl/Cmd+Enter. Remount with a new key to replace the text. */
export default function GoEditor({ value, onChange, onRun, label }: { value: string; onChange: (s: string) => void; onRun?: () => void; label: string }) {
  const host = useRef<HTMLDivElement>(null)
  const cb = useRef({ onChange, onRun })
  useEffect(() => {
    cb.current = { onChange, onRun }
  })
  useEffect(() => {
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          go(),
          theme,
          EditorState.tabSize.of(4),
          keymap.of([{ key: 'Mod-Enter', run: () => (cb.current.onRun?.(), true) }, indentWithTab]),
          EditorView.updateListener.of((u) => u.docChanged && cb.current.onChange(u.state.doc.toString())),
          EditorView.contentAttributes.of({ 'aria-label': label }),
        ],
      }),
    })
    return () => view.destroy()
    // the editor owns the text after mount; parents remount it to reset
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return <div ref={host} className="goeditor" />
}
