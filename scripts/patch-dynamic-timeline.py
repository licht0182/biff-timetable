from pathlib import Path

app = Path('src/App.tsx')
text = app.read_text()
text = text.replace('BASE_timetableEndHour', 'BASE_END_HOUR')
assert 'BASE_timetableEndHour' not in text
assert 'const BASE_END_HOUR = 24' in text
assert 'const timetableEndHour = useMemo' in text
app.write_text(text)

png = Path('src/png-export.ts')
png_text = png.read_text()
png_text = png_text.replace('BASE_endHour', 'BASE_END_HOUR')
assert 'BASE_endHour' not in png_text
assert 'const BASE_END_HOUR = 24' in png_text
assert 'const endHour = exportEndHour(items)' in png_text
png.write_text(png_text)

css = Path('src/png-export.css')
css_text = css.read_text()
assert 'var(--png-hours)' in css_text
