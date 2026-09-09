from pathlib import Path

path = Path('src/App.tsx')
text = path.read_text()

needle = "const USER_SETTINGS_KEY = 'biff-timetable:user-settings:v1'\n"
replacement = needle + "const DATA_VERSION_STORAGE_KEY = 'biff-timetable:data-version:v1'\n"
if needle not in text:
    raise SystemExit('settings key anchor not found')
text = text.replace(needle, replacement, 1)

old = '''      .then((data: FilmData) => {
        setFilms(data.films)
        setDataNote(data.note ?? '')
        setDataSource(data.source ?? '')
      })
'''
new = '''      .then((data: FilmData) => {
        const validFilmIds = new Set(data.films.map((film) => film.id))
        const validScreeningIds = new Set(data.films.flatMap((film) => film.screenings.map((screening) => screening.id)))

        setSelected((current) => current.filter((id) => validScreeningIds.has(id)))
        setFavorites((current) => current.filter((id) => validFilmIds.has(id)))
        setTicketStatus((current) => Object.fromEntries(
          Object.entries(current).filter(([id]) => validScreeningIds.has(id)),
        ) as TicketStatusMap)
        setTimetableDeleteSelection((current) => current.filter((id) => validScreeningIds.has(id)))
        localStorage.setItem(DATA_VERSION_STORAGE_KEY, JSON.stringify(DATA_VERSION))

        setFilms(data.films)
        setDataNote(data.note ?? '')
        setDataSource(data.source ?? '')
      })
'''
if old not in text:
    raise SystemExit('data load block not found')
text = text.replace(old, new, 1)

path.write_text(text)
