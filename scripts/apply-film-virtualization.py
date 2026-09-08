from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'missing patch target: {label}')
    return text.replace(old, new, 1)


app_path = Path('src/App.tsx')
app = app_path.read_text()

app = replace_once(
    app,
    "import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from 'react'\n",
    "import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from 'react'\nimport FilmList from './components/FilmList'\nimport type { Film, Screening, TicketStatus, TicketStatusMap } from './components/film-types'\n",
    'react imports',
)

old_types = """type Screening = {
  id: string
  date: string
  start: string
  end?: string
  venue: string
  gv?: boolean
  code?: string
}

type Film = {
  id: string
  title: string
  englishTitle?: string
  director?: string
  country?: string
  section?: string
  runtime?: number
  url?: string
  synopsis?: string
  language?: string
  year?: number
  screenings: Screening[]
}

type FilmData = { films: Film[]; note?: string; source?: string }
type TicketStatus = 'none' | 'planned' | 'booked'
type TicketStatusMap = Record<string, Exclude<TicketStatus, 'none'>>
"""
new_types = """type FilmData = { films: Film[]; note?: string; source?: string }
"""
app = replace_once(app, old_types, new_types, 'shared film types')

app = replace_once(
    app,
    "  const importInputRef = useRef<HTMLInputElement>(null)\n",
    "  const importInputRef = useRef<HTMLInputElement>(null)\n  const filmScrollPositionRef = useRef(0)\n",
    'film scroll ref',
)

app = replace_once(
    app,
    "  const [query, setQuery] = useState('')\n",
    "  const [query, setQuery] = useState('')\n  const deferredQuery = useDeferredValue(query)\n",
    'deferred query',
)

old_filter_helpers = """  function screeningMatchesFilters(screening: Screening) {
    if (dateFilter !== '전체' && screening.date !== dateFilter) return false
    if (venueFilter !== '전체' && screening.venue !== venueFilter) return false
    if (gvOnly && !screening.gv) return false
    return true
  }

  function visibleScreenings(film: Film) {
    return film.screenings.filter(screeningMatchesFilters)
  }

"""
new_filter_helpers = """  const visibleScreenings = useCallback((film: Film) => film.screenings.filter((screening) => {
    if (dateFilter !== '전체' && screening.date !== dateFilter) return false
    if (venueFilter !== '전체' && screening.venue !== venueFilter) return false
    if (gvOnly && !screening.gv) return false
    return true
  }), [dateFilter, venueFilter, gvOnly])

  const selectedSet = useMemo(() => new Set(selected), [selected])
  const favoriteSet = useMemo(() => new Set(favorites), [favorites])

"""
app = replace_once(app, old_filter_helpers, new_filter_helpers, 'filter helpers and sets')

app = replace_once(app, "    const q = query.trim().toLowerCase()", "    const q = deferredQuery.trim().toLowerCase()", 'deferred filter query')
app = replace_once(app, "      if (favoritesOnly && !favorites.includes(film.id)) return false", "      if (favoritesOnly && !favoriteSet.has(film.id)) return false", 'favorite set filtering')
app = replace_once(
    app,
    "  }, [films, query, section, dateFilter, venueFilter, gvOnly, favoritesOnly, favorites])",
    "  }, [films, deferredQuery, section, dateFilter, venueFilter, gvOnly, favoritesOnly, favoriteSet])",
    'filtered film dependencies',
)

app = replace_once(
    app,
    "    () => films.flatMap((film) => film.screenings.filter((screening) => selected.includes(screening.id)).map((screening) => ({ film, screening }))),\n    [films, selected],",
    "    () => films.flatMap((film) => film.screenings.filter((screening) => selectedSet.has(screening.id)).map((screening) => ({ film, screening }))),\n    [films, selectedSet],",
    'selected set items',
)

old_conflicts = """  function conflictingSelections(film: Film, screening: Screening) {
    const start = toMinutes(screening.start)
    const end = endMinutes(film, screening)
    return selectedItems.filter(({ film: otherFilm, screening: other }) => {
      if (other.id === screening.id || other.date !== screening.date) return false
      return start < endMinutes(otherFilm, other) && toMinutes(other.start) < end
    })
  }

  function conflicts(film: Film, screening: Screening) {
    return conflictingSelections(film, screening).length > 0
  }

  function transitionWarning(film: Film, screening: Screening) {
    if (!userSettings.showTransferWarnings) return null
    const start = toMinutes(screening.start)
    const end = endMinutes(film, screening)

    for (const { film: otherFilm, screening: other } of selectedItems) {
      if (other.id === screening.id || other.date !== screening.date) continue
      const otherStart = toMinutes(other.start)
      const otherEnd = endMinutes(otherFilm, other)
      const buffer = transferBufferMinutes(screening.venue, other.venue, userSettings)
      if (buffer === 0) continue

      if (end <= otherStart) {
        const gap = otherStart - end
        if (gap < buffer) return { otherFilm, other, gap, buffer }
      } else if (otherEnd <= start) {
        const gap = start - otherEnd
        if (gap < buffer) return { otherFilm, other, gap, buffer }
      }
    }
    return null
  }

  function toggle(film: Film, screening: Screening) {
    const isSelected = selected.includes(screening.id)

    if (isSelected) {
      setSelected((current) => current.filter((id) => id !== screening.id))
      setTicketStatus((statuses) => {
        const next = { ...statuses }
        delete next[screening.id]
        return next
      })
      return
    }

    const overlapping = conflictingSelections(film, screening)
    if (overlapping.length) {
      const conflictDetails = overlapping.map(({ film: otherFilm, screening: other }) => {
        const code = other.code ? `[${other.code}] ` : ''
        return `• ${code}${otherFilm.title} · ${formatDate(other.date)} ${other.start}–${endLabel(otherFilm, other)} · ${other.venue}`
      }).join('\\n')
      window.alert(`이미 선택한 다음 회차와 시간이 겹칩니다.\\n${conflictDetails}\\n\\n겹치는 기존 회차를 먼저 제거한 뒤 추가해 주세요.`)
      return
    }

    setSelected((current) => current.includes(screening.id) ? current : [...current, screening.id])
    setTicketStatus((statuses) => ({ ...statuses, [screening.id]: 'planned' }))
  }

  function toggleFavorite(filmId: string) {
    setFavorites((current) => current.includes(filmId) ? current.filter((id) => id !== filmId) : [...current, filmId])
  }

  function setScreeningTicketStatus(screeningId: string, status: TicketStatus) {
    setTicketStatus((current) => {
      const next = { ...current }
      if (status === 'none') delete next[screeningId]
      else next[screeningId] = status
      return next
    })
  }
"""
new_conflicts = """  const conflictingSelections = useCallback((film: Film, screening: Screening) => {
    const start = toMinutes(screening.start)
    const end = endMinutes(film, screening)
    return selectedItems.filter(({ film: otherFilm, screening: other }) => {
      if (other.id === screening.id || other.date !== screening.date) return false
      return start < endMinutes(otherFilm, other) && toMinutes(other.start) < end
    })
  }, [selectedItems])

  const conflicts = useCallback((film: Film, screening: Screening) => (
    conflictingSelections(film, screening).length > 0
  ), [conflictingSelections])

  const transitionWarning = useCallback((film: Film, screening: Screening) => {
    if (!userSettings.showTransferWarnings) return null
    const start = toMinutes(screening.start)
    const end = endMinutes(film, screening)

    for (const { film: otherFilm, screening: other } of selectedItems) {
      if (other.id === screening.id || other.date !== screening.date) continue
      const otherStart = toMinutes(other.start)
      const otherEnd = endMinutes(otherFilm, other)
      const buffer = transferBufferMinutes(screening.venue, other.venue, userSettings)
      if (buffer === 0) continue

      if (end <= otherStart) {
        const gap = otherStart - end
        if (gap < buffer) return { otherFilm, other, gap, buffer }
      } else if (otherEnd <= start) {
        const gap = start - otherEnd
        if (gap < buffer) return { otherFilm, other, gap, buffer }
      }
    }
    return null
  }, [selectedItems, userSettings])

  const toggle = useCallback((film: Film, screening: Screening) => {
    const isSelected = selectedSet.has(screening.id)

    if (isSelected) {
      setSelected((current) => current.filter((id) => id !== screening.id))
      setTicketStatus((statuses) => {
        const next = { ...statuses }
        delete next[screening.id]
        return next
      })
      return
    }

    const overlapping = conflictingSelections(film, screening)
    if (overlapping.length) {
      const conflictDetails = overlapping.map(({ film: otherFilm, screening: other }) => {
        const code = other.code ? `[${other.code}] ` : ''
        return `• ${code}${otherFilm.title} · ${formatDate(other.date)} ${other.start}–${endLabel(otherFilm, other)} · ${other.venue}`
      }).join('\\n')
      window.alert(`이미 선택한 다음 회차와 시간이 겹칩니다.\\n${conflictDetails}\\n\\n겹치는 기존 회차를 먼저 제거한 뒤 추가해 주세요.`)
      return
    }

    setSelected((current) => current.includes(screening.id) ? current : [...current, screening.id])
    setTicketStatus((statuses) => ({ ...statuses, [screening.id]: 'planned' }))
  }, [selectedSet, conflictingSelections])

  const toggleFavorite = useCallback((filmId: string) => {
    setFavorites((current) => current.includes(filmId) ? current.filter((id) => id !== filmId) : [...current, filmId])
  }, [])

  const setScreeningTicketStatus = useCallback((screeningId: string, status: TicketStatus) => {
    setTicketStatus((current) => {
      const next = { ...current }
      if (status === 'none') delete next[screeningId]
      else next[screeningId] = status
      return next
    })
  }, [])
"""
app = replace_once(app, old_conflicts, new_conflicts, 'memoized film list callbacks')

app = replace_once(
    app,
    "  const bookedCount = selected.filter((id) => ticketStatus[id] === 'booked').length\n  const plannedCount = selected.filter((id) => ticketStatus[id] !== 'booked').length\n\n  return (",
    """  const bookedCount = selected.filter((id) => ticketStatus[id] === 'booked').length
  const plannedCount = selected.filter((id) => ticketStatus[id] !== 'booked').length
  const filmViewActive = activeTab === 'films' && !settingsOpen

  const openFilms = useCallback(() => {
    setActiveTab('films')
    setSettingsOpen(false)
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => window.scrollTo(0, filmScrollPositionRef.current))
    })
  }, [])

  const openTimetable = useCallback(() => {
    if (filmViewActive) filmScrollPositionRef.current = window.scrollY
    setActiveTab('timetable')
    setSettingsOpen(false)
  }, [filmViewActive])

  const openSettings = useCallback(() => {
    if (filmViewActive) filmScrollPositionRef.current = window.scrollY
    setSettingsOpen(true)
  }, [filmViewActive])

  return (""",
    'navigation callbacks',
)

app = replace_once(
    app,
    "        <button className={activeTab === 'films' && !settingsOpen ? 'active' : ''} onClick={() => { setActiveTab('films'); setSettingsOpen(false) }}>영화 찾기</button>\n        <button className={activeTab === 'timetable' && !settingsOpen ? 'active' : ''} onClick={() => { setActiveTab('timetable'); setSettingsOpen(false) }}>내 시간표</button>\n        <button className={`settings-tab-trigger ${settingsOpen ? 'active' : ''}`} onClick={() => setSettingsOpen(true)}>설정</button>",
    "        <button className={activeTab === 'films' && !settingsOpen ? 'active' : ''} onClick={openFilms}>영화 찾기</button>\n        <button className={activeTab === 'timetable' && !settingsOpen ? 'active' : ''} onClick={openTimetable}>내 시간표</button>\n        <button className={`settings-tab-trigger ${settingsOpen ? 'active' : ''}`} onClick={openSettings}>설정</button>",
    'tab navigation',
)

film_list_pattern = re.compile(r'''\n        <section className="film-list">\n.*?\n        </section>\n      </main> : <main className="timetable-page">''', re.S)
film_list_replacement = """
        {filteredFilms.length > 0 ? (
          <FilmList
            films={filteredFilms}
            favoriteSet={favoriteSet}
            selectedSet={selectedSet}
            ticketStatus={ticketStatus}
            visibleScreenings={visibleScreenings}
            hasConflict={conflicts}
            transitionWarning={transitionWarning}
            formatDate={formatDate}
            endLabel={endLabel}
            onFavorite={toggleFavorite}
            onDetail={setDetailFilm}
            onToggleScreening={toggle}
            onStatusChange={setScreeningTicketStatus}
          />
        ) : !loadError && <div className="empty">조건에 맞는 상영작이 없습니다.</div>}
      </main> : <main className="timetable-page">"""
app, count = film_list_pattern.subn(film_list_replacement, app, count=1)
if count != 1:
    raise SystemExit(f'film list block replacement count: {count}')

app = app.replace("<button onClick={() => setActiveTab('films')}>영화 찾기</button>", "<button onClick={openFilms}>영화 찾기</button>")

app_path.write_text(app)

styles_path = Path('src/styles.css')
styles = styles_path.read_text()
append_css = """

/* Keep the page-scroll UX while limiting mounted film cards through Virtuoso. */
.film-list-shell{width:100%;min-width:0}
.virtual-film-list{display:block!important;width:100%}
.film-list-item{padding-bottom:8px}
.film-list-item:last-child{padding-bottom:0}
"""
if '.film-list-shell{' not in styles:
    styles += append_css
styles_path.write_text(styles)
