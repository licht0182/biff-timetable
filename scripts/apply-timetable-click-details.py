from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'missing patch target: {label}')
    return text.replace(old, new, 1)

app_path = Path('src/App.tsx')
app = app_path.read_text()

app = replace_once(
    app,
    "  const [detailFilm, setDetailFilm] = useState<Film | null>(null)\n",
    "  const [detailFilm, setDetailFilm] = useState<Film | null>(null)\n  const [detailScreeningId, setDetailScreeningId] = useState<string | null>(null)\n",
    'detail screening state',
)

app = replace_once(
    app,
    """  useEffect(() => {\n    if (!detailFilm) return\n    const closeOnEscape = (event: KeyboardEvent) => {\n      if (event.key === 'Escape') setDetailFilm(null)\n    }\n    window.addEventListener('keydown', closeOnEscape)\n    return () => window.removeEventListener('keydown', closeOnEscape)\n  }, [detailFilm])\n""",
    """  useEffect(() => {\n    if (!detailFilm) return\n    const closeOnEscape = (event: KeyboardEvent) => {\n      if (event.key !== 'Escape') return\n      setDetailFilm(null)\n      setDetailScreeningId(null)\n    }\n    window.addEventListener('keydown', closeOnEscape)\n    return () => window.removeEventListener('keydown', closeOnEscape)\n  }, [detailFilm])\n""",
    'escape close',
)

app = replace_once(
    app,
    "            onDetail={setDetailFilm}\n",
    "            onDetail={(film) => { setDetailScreeningId(null); setDetailFilm(film) }}\n",
    'film list detail reset',
)

old_button = """                    title={`${film.title} · ${screening.start}–${endLabel(film, screening)} · ${screening.venue}${travel ? ` · 이동 여유 ${travel.gap}분/권장 ${travel.buffer}분` : ''}${timetableSelectionMode ? `\\n${isMarkedForDelete ? '삭제 선택됨 · 클릭하여 선택 해제' : '삭제할 회차로 선택하려면 클릭'}` : ''}`}\n                    onClick={() => toggleTimetableDeleteSelection(screening.id)}\n                    tabIndex={timetableSelectionMode ? 0 : -1}\n                    aria-pressed={timetableSelectionMode ? isMarkedForDelete : undefined}\n"""
new_button = """                    title={`${film.title} · ${screening.start}–${endLabel(film, screening)} · ${screening.venue}${travel ? ` · 이동 여유 ${travel.gap}분/권장 ${travel.buffer}분` : ''}${timetableSelectionMode ? `\\n${isMarkedForDelete ? '삭제 선택됨 · 클릭하여 선택 해제' : '삭제할 회차로 선택하려면 클릭'}` : '\\n클릭하여 상세정보 보기'}`}\n                    onClick={() => {\n                      if (timetableSelectionMode) {\n                        toggleTimetableDeleteSelection(screening.id)\n                        return\n                      }\n                      setDetailScreeningId(screening.id)\n                      setDetailFilm(film)\n                    }}\n                    tabIndex={0}\n                    aria-haspopup={timetableSelectionMode ? undefined : 'dialog'}\n                    aria-pressed={timetableSelectionMode ? isMarkedForDelete : undefined}\n                    aria-label={timetableSelectionMode ? `${film.title} 삭제 ${isMarkedForDelete ? '선택 해제' : '선택'}` : `${film.title} ${formatDate(screening.date)} ${screening.start} 상세정보 보기`}\n"""
app = replace_once(app, old_button, new_button, 'timetable event click')

app = replace_once(
    app,
    """      {detailFilm && <div className=\"modal-backdrop\" onMouseDown={() => setDetailFilm(null)}>\n        <section className=\"film-modal\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"film-detail-title\" onMouseDown={(event) => event.stopPropagation()}>\n""",
    """      {detailFilm && <div className={`modal-backdrop ${detailScreeningId ? 'timetable-detail-backdrop' : ''}`} onMouseDown={() => { setDetailFilm(null); setDetailScreeningId(null) }}>\n        <section className={`film-modal ${detailScreeningId ? 'timetable-detail-modal' : ''}`} role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"film-detail-title\" onMouseDown={(event) => event.stopPropagation()}>\n""",
    'timetable detail modal classes',
)

app = replace_once(
    app,
    "<button className=\"modal-close\" onClick={() => setDetailFilm(null)} aria-label=\"상세보기 닫기\">×</button>",
    "<button className=\"modal-close\" onClick={() => { setDetailFilm(null); setDetailScreeningId(null) }} aria-label=\"상세보기 닫기\">×</button>",
    'modal close',
)

app = replace_once(
    app,
    """            return <div key={screening.id}><div><strong>{screening.code ? `[${screening.code}] ` : ''}{formatDate(screening.date)} {screening.start}</strong><span>{screening.venue} · {screening.start}–{endLabel(detailFilm, screening)}{screening.gv ? ' · GV' : ''}</span></div><button className={isSelected ? 'selected' : ''} onClick={() => toggle(detailFilm, screening)}>{isSelected ? '선택됨' : '+ 추가'}</button></div>\n""",
    """            const isCurrentScreening = screening.id === detailScreeningId\n            return <div className={isCurrentScreening ? 'current-screening' : ''} key={screening.id}><div><strong>{screening.code ? `[${screening.code}] ` : ''}{formatDate(screening.date)} {screening.start}{isCurrentScreening && <em className=\"current-screening-badge\">현재 회차</em>}</strong><span>{screening.venue} · {screening.start}–{endLabel(detailFilm, screening)}{screening.gv ? ' · GV' : ''}</span></div><button className={isSelected ? 'selected' : ''} onClick={() => toggle(detailFilm, screening)}>{isSelected ? '선택됨' : '+ 추가'}</button></div>\n""",
    'highlight current screening',
)

app_path.write_text(app)

css_path = Path('src/timetable-readonly.css')
css = css_path.read_text()
css = css.replace(
    ".event-block{\n  cursor:default !important;\n  pointer-events:none;\n}",
    ".event-block{\n  cursor:pointer !important;\n  pointer-events:auto;\n}",
    1,
)
css = css.replace(
    ".event-block:hover{\n  filter:none !important;\n  transform:none !important;\n}",
    ".event-block:hover{\n  filter:brightness(.97) !important;\n  transform:none !important;\n}",
    1,
)
css += """

/* Quick details from a timetable block. */
.timetable-detail-backdrop{
  background:rgba(18,18,18,.18);
  place-items:end;
  padding:18px;
}
.timetable-detail-modal{
  width:min(460px,calc(100vw - 36px));
  max-height:min(720px,calc(100dvh - 36px));
}
.modal-screenings>div.current-screening{
  margin:0 -8px;
  padding-left:8px;
  padding-right:8px;
  background:var(--accent-soft);
  box-shadow:inset 3px 0 0 var(--accent);
}
.current-screening-badge{
  display:inline-block;
  margin-left:6px;
  padding:2px 5px;
  border-radius:999px;
  background:var(--accent);
  color:#fff;
  font-size:8px;
  font-style:normal;
  line-height:1.2;
  vertical-align:1px;
}
@media(max-width:700px){
  .timetable-detail-backdrop{padding:8px;align-items:end}
  .timetable-detail-modal{width:100%;max-height:76dvh}
}
"""
css_path.write_text(css)
