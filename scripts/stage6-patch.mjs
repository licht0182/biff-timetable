import fs from 'node:fs'

const appPath = 'src/App.tsx'
let source = fs.readFileSync(appPath, 'utf8')

function replaceOnce(label, from, to) {
  const first = source.indexOf(from)
  if (first < 0) throw new Error(`${label}: target not found`)
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`${label}: target is not unique`)
  source = source.replace(from, to)
}

replaceOnce(
  'dialog refs',
  "  const importInputRef = useRef<HTMLInputElement>(null)\n  const filmScrollPositionRef = useRef(0)\n",
  "  const importInputRef = useRef<HTMLInputElement>(null)\n  const filmScrollPositionRef = useRef(0)\n  const detailDialogRef = useRef<HTMLElement>(null)\n  const detailCloseRef = useRef<HTMLButtonElement>(null)\n  const detailReturnFocusRef = useRef<HTMLElement | null>(null)\n",
)

replaceOnce(
  'dialog keyboard effect',
  `  useEffect(() => {\n    if (!detailFilm) return\n    const closeOnEscape = (event: KeyboardEvent) => {\n      if (event.key !== 'Escape') return\n      setDetailFilm(null)\n      setDetailScreeningId(null)\n    }\n    window.addEventListener('keydown', closeOnEscape)\n    return () => window.removeEventListener('keydown', closeOnEscape)\n  }, [detailFilm])\n`,
  `  useEffect(() => {\n    if (!detailFilm) return\n\n    const dialog = detailDialogRef.current\n    const activeBeforeOpen = document.activeElement instanceof HTMLElement ? document.activeElement : null\n    if (activeBeforeOpen && !dialog?.contains(activeBeforeOpen)) detailReturnFocusRef.current = activeBeforeOpen\n\n    detailCloseRef.current?.focus()\n\n    const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'\n    const handleDialogKeyDown = (event: KeyboardEvent) => {\n      if (event.key === 'Escape') {\n        event.preventDefault()\n        setDetailFilm(null)\n        setDetailScreeningId(null)\n        return\n      }\n      if (event.key !== 'Tab' || !dialog) return\n\n      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => (\n        element.getAttribute('aria-hidden') !== 'true' && element.offsetParent !== null\n      ))\n      if (focusable.length === 0) {\n        event.preventDefault()\n        dialog.focus()\n        return\n      }\n\n      const first = focusable[0]\n      const last = focusable[focusable.length - 1]\n      const active = document.activeElement\n      if (event.shiftKey && (active === first || !(active instanceof Node) || !dialog.contains(active))) {\n        event.preventDefault()\n        last.focus()\n      } else if (!event.shiftKey && active === last) {\n        event.preventDefault()\n        first.focus()\n      }\n    }\n\n    window.addEventListener('keydown', handleDialogKeyDown)\n    return () => {\n      window.removeEventListener('keydown', handleDialogKeyDown)\n      const returnTarget = detailReturnFocusRef.current\n      detailReturnFocusRef.current = null\n      if (returnTarget?.isConnected) window.requestAnimationFrame(() => returnTarget.focus())\n    }\n  }, [detailFilm])\n`,
)

replaceOnce(
  'dialog section ref',
  `        <section className={\`film-modal \${detailScreeningId ? 'timetable-detail-modal' : ''}\`} role="dialog" aria-modal="true" aria-labelledby="film-detail-title" onMouseDown={(event) => event.stopPropagation()}>`,
  `        <section ref={detailDialogRef} className={\`film-modal \${detailScreeningId ? 'timetable-detail-modal' : ''}\`} role="dialog" aria-modal="true" aria-labelledby="film-detail-title" tabIndex={-1} onMouseDown={(event) => event.stopPropagation()}>`,
)

replaceOnce(
  'dialog close ref',
  `<button className="modal-close" onClick={() => { setDetailFilm(null); setDetailScreeningId(null) }} aria-label="상세보기 닫기">×</button>`,
  `<button ref={detailCloseRef} className="modal-close" onClick={() => { setDetailFilm(null); setDetailScreeningId(null) }} aria-label="상세보기 닫기">×</button>`,
)

fs.writeFileSync(appPath, source)
fs.rmSync('scripts/stage6-patch.mjs')
fs.rmSync('.github/workflows/stage6-patch.yml')
