from pathlib import Path

app = Path('src/App.tsx')
text = app.read_text()

text = text.replace("const START_HOUR = 8\nconst END_HOUR = 27\nconst FALLBACK_RUNTIME = 120", "const START_HOUR = 8\nconst BASE_END_HOUR = 24\nconst FALLBACK_RUNTIME = 120", 1)

old = """  const dates = useMemo(() => Array.from(new Set(selectedItems.map(({ screening }) => screening.date))).sort(), [selectedItems])

  const timetableMetrics = useMemo(() => {
"""
new = """  const dates = useMemo(() => Array.from(new Set(selectedItems.map(({ screening }) => screening.date))).sort(), [selectedItems])
  const timetableEndHour = useMemo(() => {
    const latestEndMinutes = selectedItems.reduce(
      (latest, { film, screening }) => Math.max(latest, endMinutes(film, screening)),
      BASE_END_HOUR * 60,
    )
    return Math.max(BASE_END_HOUR, Math.ceil(latestEndMinutes / 60))
  }, [selectedItems])

  const timetableMetrics = useMemo(() => {
"""
assert old in text
text = text.replace(old, new, 1)

text = text.replace("usableGridHeight / (END_HOUR - START_HOUR)", "usableGridHeight / (timetableEndHour - START_HOUR)", 1)
text = text.replace("hourHeight * (END_HOUR - START_HOUR)", "hourHeight * (timetableEndHour - START_HOUR)", 1)
text = text.replace("}, [viewport, dates.length])", "}, [viewport, dates.length, timetableEndHour])", 1)

text = text.replace("브라우저 크기에 맞춰 전체 시간표를 자동 조정합니다.", "선택한 회차의 종료시간과 브라우저 크기에 맞춰 시간표 범위를 자동 조정합니다.", 1)
text = text.replace("Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i)", "Array.from({ length: timetableEndHour - START_HOUR + 1 }, (_, i) => START_HOUR + i)", 1)
text = text.replace("Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => <div className=\"hour-line\"", "Array.from({ length: timetableEndHour - START_HOUR + 1 }, (_, i) => <div className=\"hour-line\"", 1)

assert 'END_HOUR' not in text
app.write_text(text)

png = Path('src/png-export.ts')
png_text = png.read_text()
png_text = png_text.replace("const START_HOUR = 8\nconst END_HOUR = 27\nconst FALLBACK_RUNTIME = 120", "const START_HOUR = 8\nconst BASE_END_HOUR = 24\nconst FALLBACK_RUNTIME = 120", 1)

marker = """function formatDate(date: string) {
"""
helper = """function exportEndHour(items: ExportItem[]) {
  const latestEndMinutes = items.reduce(
    (latest, { film, screening }) => Math.max(latest, displayEndMinutes(film, screening)),
    BASE_END_HOUR * 60,
  )
  return Math.max(BASE_END_HOUR, Math.ceil(latestEndMinutes / 60))
}

"""
assert marker in png_text
png_text = png_text.replace(marker, helper + marker, 1)

old_build = """function buildExportBoard(items: ExportItem[], ticketStatus: TicketStatusMap) {
  const dates = Array.from(new Set(items.map(({ screening }) => screening.date))).sort()
  const board = element('section', 'png-export-board')
"""
new_build = """function buildExportBoard(items: ExportItem[], ticketStatus: TicketStatusMap) {
  const dates = Array.from(new Set(items.map(({ screening }) => screening.date))).sort()
  const endHour = exportEndHour(items)
  const board = element('section', 'png-export-board')
"""
assert old_build in png_text
png_text = png_text.replace(old_build, new_build, 1)

png_text = png_text.replace("board.style.setProperty('--png-hour-height', `${EXPORT_HOUR_HEIGHT}px`)", "board.style.setProperty('--png-hour-height', `${EXPORT_HOUR_HEIGHT}px`)\n  board.style.setProperty('--png-hours', String(endHour - START_HOUR))", 1)
png_text = png_text.replace("for (let hour = START_HOUR; hour <= END_HOUR; hour += 1)", "for (let hour = START_HOUR; hour <= endHour; hour += 1)", 1)
png_text = png_text.replace("for (let i = 0; i <= END_HOUR - START_HOUR; i += 1)", "for (let i = 0; i <= endHour - START_HOUR; i += 1)", 1)
assert 'END_HOUR' not in png_text
png.write_text(png_text)

css = Path('src/png-export.css')
css_text = css.read_text()
old_css = "--png-body-height:calc(var(--png-edge-space) * 2 + var(--png-hour-height) * 19);"
new_css = "--png-body-height:calc(var(--png-edge-space) * 2 + var(--png-hour-height) * var(--png-hours));"
assert old_css in css_text
css.write_text(css_text.replace(old_css, new_css, 1))
