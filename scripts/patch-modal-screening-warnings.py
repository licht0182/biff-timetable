from pathlib import Path

app_path = Path('src/App.tsx')
app = app_path.read_text()
start_marker = '          <div className="modal-screenings">{detailFilm.screenings.map((screening) => {'
end_marker = '          <div className="modal-footer">'
start = app.find(start_marker)
end = app.find(end_marker, start)
if start < 0 or end < 0:
    raise SystemExit('modal screenings markers not found')

new = '''          <div className="modal-screenings">{detailFilm.screenings.map((screening) => {
            const isSelected = selected.includes(screening.id)
            const isCurrentScreening = screening.id === detailScreeningId
            const hasConflict = conflicts(detailFilm, screening)
            const travel = transitionWarning(detailFilm, screening)
            const rowNote = hasConflict
              ? '선택한 회차와 시간이 겹칩니다.'
              : travel
                ? `${travel.routeLabel ? `${travel.routeLabel} · ` : ''}이동 여유 ${travel.gap}분 · 필요 ${travel.buffer}분`
                : ''
            const rowNoteTitle = travel?.transferDetail ? `${rowNote}\\n${travel.transferDetail}` : rowNote || undefined
            const rowClassName = [
              isCurrentScreening ? 'current-screening' : '',
              hasConflict ? 'conflict' : '',
              travel ? 'travel-warning' : '',
            ].filter(Boolean).join(' ')
            return <div className={rowClassName} key={screening.id}><div><strong>{screening.code ? `[${screening.code}] ` : ''}{formatDate(screening.date)} {screening.start}{isCurrentScreening && <em className="current-screening-badge">현재 회차</em>}</strong><span>{screening.venue} · {screening.start}–{endLabel(detailFilm, screening)}{screening.gv ? ' · GV' : ''}</span>{rowNote && <small className={`modal-screening-note ${travel ? 'travel-text' : ''}`} title={rowNoteTitle}>{rowNote}</small>}</div><button className={isSelected ? 'selected' : ''} onClick={() => toggle(detailFilm, screening)}>{isSelected ? '선택됨' : '+ 추가'}</button></div>
          })}</div>
'''
app_path.write_text(app[:start] + new + app[end:])

css_path = Path('src/features.css')
css = css_path.read_text()
marker = '/* modal-screening-warnings */'
addition = '''
/* modal-screening-warnings */
.modal-screenings>div.conflict{background:#fff8f7;box-shadow:inset 3px 0 0 var(--accent);padding-left:8px;padding-right:8px}
.modal-screenings>div.travel-warning:not(.conflict){box-shadow:inset 3px 0 0 #e3a321;padding-left:8px;padding-right:8px}
.modal-screening-note{display:block;margin-top:2px;font-size:9px!important;font-weight:700;line-height:1.35;color:var(--accent);white-space:normal!important;overflow:visible!important;text-overflow:clip!important}
.modal-screening-note.travel-text{color:#9a6b10}
'''
if marker not in css:
    css_path.write_text(css + addition)
