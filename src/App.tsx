import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from 'react'

type Screening = {
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
type BackupData = {
  version: 1
  exportedAt: string
  selected: string[]
  favorites: string[]
  ticketStatus: TicketStatusMap
}

type TimetableItem = { film: Film; screening: Screening }

const STORAGE_KEY = 'biff-timetable:selected-screenings:v1'
const FAVORITES_KEY = 'biff-timetable:favorites:v1'
const TICKET_STATUS_KEY = 'biff-timetable:ticket-status:v1'
const START_HOUR = 8
const END_HOUR = 27
const FALLBACK_RUNTIME = 120
const DATA_VERSION = '2025-test-20260908-2'

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : fallback
  } catch {
    return fallback
  }
}

function toMinutes(time: string) {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function endMinutes(film: Film, screening: Screening) {
  const start = toMinutes(screening.start)
  if (screening.end) {
    let end = toMinutes(screening.end)
    if (end <= start) end += 24 * 60
    return end
  }
  return start + (film.runtime ?? FALLBACK_RUNTIME)
}

function endLabel(film: Film, screening: Screening) {
  const end = endMinutes(film, screening)
  const normalized = end % (24 * 60)
  const h = Math.floor(normalized / 60)
  const m = normalized % 60
  const label = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  return screening.end ? label : `${label} 예상`
}

function formatDate(date: string, compact = false) {
  if (compact) {
    return new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' }).format(new Date(`${date}T00:00:00`))
  }
  return new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short' }).format(new Date(`${date}T00:00:00`))
}

function venueCluster(venue: string) {
  if (venue.startsWith('영화의전당')) return '영화의전당'
  if (venue.startsWith('CGV 센텀시티')) return 'CGV 센텀시티'
  if (venue.startsWith('롯데시네마 센텀')) return '롯데시네마 센텀시티'
  if (venue.includes('소향씨어터')) return '소향씨어터'
  return venue
}

function transferBufferMinutes(a: string, b: string) {
  if (a === b) return 0
  if (venueCluster(a) === venueCluster(b)) return 10
  return 30
}

function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function escapeIcs(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
}

function formatIcsDateTime(date: string, minutes: number) {
  const dayOffset = Math.floor(minutes / (24 * 60))
  const normalized = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60)
  const base = new Date(`${date}T00:00:00Z`)
  base.setUTCDate(base.getUTCDate() + dayOffset)
  const y = base.getUTCFullYear()
  const m = String(base.getUTCMonth() + 1).padStart(2, '0')
  const d = String(base.getUTCDate()).padStart(2, '0')
  const hh = String(Math.floor(normalized / 60)).padStart(2, '0')
  const mm = String(normalized % 60).padStart(2, '0')
  return `${y}${m}${d}T${hh}${mm}00`
}

function useViewport() {
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 1200 : window.innerWidth,
    height: typeof window === 'undefined' ? 800 : window.innerHeight,
  }))

  useEffect(() => {
    const update = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
    update()
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])

  return viewport
}

export default function App() {
  const viewport = useViewport()
  const importInputRef = useRef<HTMLInputElement>(null)
  const [films, setFilms] = useState<Film[]>([])
  const [dataNote, setDataNote] = useState('')
  const [dataSource, setDataSource] = useState('')
  const [selected, setSelected] = useState<string[]>(() => readStorage(STORAGE_KEY, [] as string[]))
  const [favorites, setFavorites] = useState<string[]>(() => readStorage(FAVORITES_KEY, [] as string[]))
  const [ticketStatus, setTicketStatus] = useState<TicketStatusMap>(() => readStorage(TICKET_STATUS_KEY, {} as TicketStatusMap))
  const [query, setQuery] = useState('')
  const [section, setSection] = useState('전체')
  const [dateFilter, setDateFilter] = useState('전체')
  const [venueFilter, setVenueFilter] = useState('전체')
  const [gvOnly, setGvOnly] = useState(false)
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [activeTab, setActiveTab] = useState<'films' | 'timetable'>('films')
  const [detailFilm, setDetailFilm] = useState<Film | null>(null)
  const [loadError, setLoadError] = useState('')
  const [toast, setToast] = useState('')

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}screenings.json?v=${DATA_VERSION}`, { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error('상영 데이터를 불러오지 못했습니다.')
        return res.json()
      })
      .then((data: FilmData) => {
        setFilms(data.films)
        setDataNote(data.note ?? '')
        setDataSource(data.source ?? '')
      })
      .catch((err: Error) => setLoadError(err.message))
  }, [])

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(selected)) }, [selected])
  useEffect(() => { localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites)) }, [favorites])
  useEffect(() => { localStorage.setItem(TICKET_STATUS_KEY, JSON.stringify(ticketStatus)) }, [ticketStatus])

  useEffect(() => {
    setTicketStatus((current) => {
      let changed = false
      const next = { ...current }
      for (const id of selected) {
        if (next[id] !== 'planned' && next[id] !== 'booked') {
          next[id] = 'planned'
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [selected])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 2800)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (!detailFilm) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDetailFilm(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [detailFilm])

  const allDates = useMemo(
    () => Array.from(new Set(films.flatMap((film) => film.screenings.map((screening) => screening.date)))).sort(),
    [films],
  )
  const allVenues = useMemo(
    () => Array.from(new Set(films.flatMap((film) => film.screenings.map((screening) => screening.venue)))).sort((a, b) => a.localeCompare(b, 'ko')),
    [films],
  )
  const sections = useMemo(
    () => ['전체', ...Array.from(new Set(films.map((film) => film.section).filter(Boolean) as string[]))],
    [films],
  )

  function screeningMatchesFilters(screening: Screening) {
    if (dateFilter !== '전체' && screening.date !== dateFilter) return false
    if (venueFilter !== '전체' && screening.venue !== venueFilter) return false
    if (gvOnly && !screening.gv) return false
    return true
  }

  function visibleScreenings(film: Film) {
    return film.screenings.filter(screeningMatchesFilters)
  }

  const filteredFilms = useMemo(() => {
    const q = query.trim().toLowerCase()
    return films.filter((film) => {
      const haystack = [film.title, film.englishTitle, film.director, film.country, film.section].filter(Boolean).join(' ').toLowerCase()
      if (section !== '전체' && film.section !== section) return false
      if (favoritesOnly && !favorites.includes(film.id)) return false
      if (q && !haystack.includes(q)) return false
      return film.screenings.some((screening) => {
        if (dateFilter !== '전체' && screening.date !== dateFilter) return false
        if (venueFilter !== '전체' && screening.venue !== venueFilter) return false
        if (gvOnly && !screening.gv) return false
        return true
      })
    })
  }, [films, query, section, dateFilter, venueFilter, gvOnly, favoritesOnly, favorites])

  const selectedItems = useMemo<TimetableItem[]>(
    () => films.flatMap((film) => film.screenings.filter((screening) => selected.includes(screening.id)).map((screening) => ({ film, screening }))),
    [films, selected],
  )
  const dates = useMemo(() => Array.from(new Set(selectedItems.map(({ screening }) => screening.date))).sort(), [selectedItems])

  const timetableMetrics = useMemo(() => {
    const isMobile = viewport.width <= 700
    const shellPadding = isMobile ? 32 : 48
    const contentWidth = Math.max(280, Math.min(1180, viewport.width - shellPadding))
    const axisWidth = isMobile ? 38 : 50
    const headerHeight = isMobile ? 32 : 38
    const chromeHeight = 245
    const usableGridHeight = Math.max(180, viewport.height - chromeHeight - headerHeight)
    const hourHeight = Math.max(9.5, usableGridHeight / (END_HOUR - START_HOUR))
    const gridHeight = hourHeight * (END_HOUR - START_HOUR)
    const dayWidth = dates.length > 0 ? Math.max(1, (contentWidth - axisWidth) / dates.length) : contentWidth - axisWidth
    const dense = dayWidth < 76
    const ultraDense = dayWidth < 48

    return { axisWidth, headerHeight, hourHeight, gridHeight, dayWidth, dense, ultraDense }
  }, [viewport, dates.length])

  function conflicts(film: Film, screening: Screening) {
    const start = toMinutes(screening.start)
    const end = endMinutes(film, screening)
    return selectedItems.some(({ film: otherFilm, screening: other }) => {
      if (other.id === screening.id || other.date !== screening.date) return false
      return start < endMinutes(otherFilm, other) && toMinutes(other.start) < end
    })
  }

  function transitionWarning(film: Film, screening: Screening) {
    const start = toMinutes(screening.start)
    const end = endMinutes(film, screening)

    for (const { film: otherFilm, screening: other } of selectedItems) {
      if (other.id === screening.id || other.date !== screening.date) continue
      const otherStart = toMinutes(other.start)
      const otherEnd = endMinutes(otherFilm, other)
      const buffer = transferBufferMinutes(screening.venue, other.venue)
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

  function toggle(screening: Screening) {
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

  function resetFilters() {
    setQuery('')
    setSection('전체')
    setDateFilter('전체')
    setVenueFilter('전체')
    setGvOnly(false)
    setFavoritesOnly(false)
  }

  function clearSelected() {
    setSelected([])
    setTicketStatus({})
  }

  function exportBackup() {
    const payload: BackupData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      selected,
      favorites,
      ticketStatus,
    }
    downloadText('biff-timetable-backup.json', JSON.stringify(payload, null, 2), 'application/json;charset=utf-8')
    setToast('시간표 백업 파일을 만들었습니다.')
  }

  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      const parsed = JSON.parse(await file.text()) as Partial<BackupData> | string[]
      const validScreeningIds = new Set(films.flatMap((film) => film.screenings.map((screening) => screening.id)))
      const validFilmIds = new Set(films.map((film) => film.id))

      if (Array.isArray(parsed)) {
        const nextSelected = parsed.filter((id): id is string => typeof id === 'string' && validScreeningIds.has(id))
        setSelected(nextSelected)
        setTicketStatus(Object.fromEntries(nextSelected.map((id) => [id, 'planned'])) as TicketStatusMap)
        setToast('기존 형식의 선택 회차를 가져왔습니다.')
        return
      }

      const nextSelected = Array.isArray(parsed.selected)
        ? parsed.selected.filter((id): id is string => typeof id === 'string' && validScreeningIds.has(id))
        : []
      const nextFavorites = Array.isArray(parsed.favorites)
        ? parsed.favorites.filter((id): id is string => typeof id === 'string' && validFilmIds.has(id))
        : []
      const nextStatuses: TicketStatusMap = {}

      if (parsed.ticketStatus && typeof parsed.ticketStatus === 'object') {
        for (const [id, status] of Object.entries(parsed.ticketStatus)) {
          if (validScreeningIds.has(id) && (status === 'planned' || status === 'booked')) nextStatuses[id] = status
        }
      }
      for (const id of nextSelected) {
        if (!nextStatuses[id]) nextStatuses[id] = 'planned'
      }

      setSelected(nextSelected)
      setFavorites(nextFavorites)
      setTicketStatus(nextStatuses)
      setToast('백업한 시간표를 가져왔습니다.')
    } catch {
      setToast('가져오기 파일을 확인해 주세요.')
    }
  }

  function exportIcs() {
    if (!selectedItems.length) return
    const sorted = [...selectedItems].sort((a, b) => `${a.screening.date} ${a.screening.start}`.localeCompare(`${b.screening.date} ${b.screening.start}`))
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//BIFF Timetable//KO',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:BIFF Timetable',
      'X-WR-TIMEZONE:Asia/Seoul',
    ]

    for (const { film, screening } of sorted) {
      const start = toMinutes(screening.start)
      const end = endMinutes(film, screening)
      const status = ticketStatus[screening.id]
      const description = [screening.code ? `상영코드 ${screening.code}` : '', screening.gv ? 'GV' : '', screening.end ? '' : '종료시간은 예상값'].filter(Boolean).join(' · ')
      lines.push(
        'BEGIN:VEVENT',
        `UID:${escapeIcs(screening.id)}@biff-timetable`,
        `DTSTART;TZID=Asia/Seoul:${formatIcsDateTime(screening.date, start)}`,
        `DTEND;TZID=Asia/Seoul:${formatIcsDateTime(screening.date, end)}`,
        `SUMMARY:${escapeIcs(film.title)}`,
        `LOCATION:${escapeIcs(screening.venue)}`,
        `DESCRIPTION:${escapeIcs(description)}`,
        `STATUS:${status === 'booked' ? 'CONFIRMED' : 'TENTATIVE'}`,
        'END:VEVENT',
      )
    }
    lines.push('END:VCALENDAR')
    downloadText('BIFF-timetable.ics', lines.join('\r\n'), 'text/calendar;charset=utf-8')
    setToast('캘린더(.ics) 파일을 만들었습니다.')
  }

  const timetableStyle = {
    '--axis-width': `${timetableMetrics.axisWidth}px`,
    '--header-height': `${timetableMetrics.headerHeight}px`,
    '--hour-height': `${timetableMetrics.hourHeight}px`,
    '--grid-height': `${timetableMetrics.gridHeight}px`,
    gridTemplateColumns: `${timetableMetrics.axisWidth}px repeat(${dates.length}, minmax(0, 1fr))`,
  } as CSSProperties

  const bookedCount = selected.filter((id) => ticketStatus[id] === 'booked').length
  const plannedCount = selected.filter((id) => ticketStatus[id] !== 'booked').length

  return (
    <div className={`app-shell ${activeTab === 'timetable' ? 'timetable-mode' : ''}`}>
      <header className="topbar">
        <div><p className="eyebrow">BUSAN INTERNATIONAL FILM FESTIVAL</p><h1>BIFF Timetable</h1><p className="subtitle">상영작을 고르고 나만의 영화제 시간표를 만드세요.</p></div>
        <div className="selection-count">총 {selected.length}개 선택</div>
      </header>

      <nav className="tabs" aria-label="주요 메뉴">
        <button className={activeTab === 'films' ? 'active' : ''} onClick={() => setActiveTab('films')}>영화 찾기</button>
        <button className={activeTab === 'timetable' ? 'active' : ''} onClick={() => setActiveTab('timetable')}>내 시간표</button>
      </nav>

      {activeTab === 'films' && dataNote && <div className="notice">{dataNote}{dataSource && <> <a href={dataSource} target="_blank" rel="noreferrer">공식 시간표 ↗</a></>}</div>}
      {loadError && <div className="notice error">{loadError}</div>}
      {toast && <div className="toast" role="status">{toast}</div>}

      {activeTab === 'films' ? <main>
        <section className="controls enhanced-controls">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="제목, 감독, 국가 검색" aria-label="영화 검색" />
          <div className="filter-row">
            <label><span>날짜</span><select value={dateFilter} onChange={(event) => setDateFilter(event.target.value)}><option value="전체">전체 날짜</option>{allDates.map((date) => <option key={date} value={date}>{formatDate(date)}</option>)}</select></label>
            <label><span>상영관</span><select value={venueFilter} onChange={(event) => setVenueFilter(event.target.value)}><option value="전체">전체 상영관</option>{allVenues.map((venue) => <option key={venue} value={venue}>{venue}</option>)}</select></label>
            <button className={`filter-toggle ${gvOnly ? 'active' : ''}`} onClick={() => setGvOnly((value) => !value)} aria-pressed={gvOnly}>GV만</button>
            <button className={`filter-toggle ${favoritesOnly ? 'active' : ''}`} onClick={() => setFavoritesOnly((value) => !value)} aria-pressed={favoritesOnly}>★ 관심작</button>
            <button className="filter-reset" onClick={resetFilters}>초기화</button>
          </div>
          <div className="chips">{sections.map((item) => <button key={item} className={section === item ? 'active' : ''} onClick={() => setSection(item)}>{item}</button>)}</div>
        </section>

        <section className="film-list">
          {filteredFilms.map((film) => <article className="film-card" key={film.id}>
            <div className="film-heading">
              <div><span className="section-label">{film.section ?? '섹션 미정'}</span><h2>{film.title}</h2>{film.englishTitle && <p className="english-title">{film.englishTitle}</p>}<p className="meta">{[film.director, film.country, film.runtime ? `${film.runtime}분` : undefined].filter(Boolean).join(' · ')}</p></div>
              <div className="film-actions">
                <button className={`favorite-button ${favorites.includes(film.id) ? 'active' : ''}`} onClick={() => toggleFavorite(film.id)} aria-label={`${film.title} 관심작 ${favorites.includes(film.id) ? '해제' : '추가'}`}>{favorites.includes(film.id) ? '★' : '☆'}</button>
                <button className="detail-button" onClick={() => setDetailFilm(film)}>상세</button>
                {film.url && <a className="detail-link" href={film.url} target="_blank" rel="noreferrer">공식정보 ↗</a>}
              </div>
            </div>
            <div className="screenings">{visibleScreenings(film).map((screening) => {
              const isSelected = selected.includes(screening.id)
              const hasConflict = !isSelected && conflicts(film, screening)
              const travel = !hasConflict ? transitionWarning(film, screening) : null
              const status = ticketStatus[screening.id] ?? 'planned'
              return <div className={`screening-row ${hasConflict ? 'conflict' : ''} ${travel ? 'travel-warning' : ''}`} key={screening.id}>
                <div><strong>{screening.code ? `[${screening.code}] ` : ''}{formatDate(screening.date)} {screening.start}</strong><span>{screening.venue} · {screening.start}–{endLabel(film, screening)}{screening.gv ? ' · GV' : ''}</span>{hasConflict && <small>선택한 회차와 시간이 겹칩니다.</small>}{travel && <small className="travel-text">이동 여유 {travel.gap}분 · 권장 {travel.buffer}분</small>}</div>
                <div className="screening-actions">
                  {isSelected && <select className={`ticket-select ${status}`} value={status} onChange={(event) => setScreeningTicketStatus(screening.id, event.target.value as TicketStatus)} aria-label={`${film.title} 예매 상태`}><option value="planned">예매 예정</option><option value="booked">예매 완료</option></select>}
                  <button className={isSelected ? 'selected' : ''} onClick={() => toggle(screening)}>{isSelected ? '선택됨' : '+ 추가'}</button>
                </div>
              </div>
            })}</div>
          </article>)}
          {!filteredFilms.length && !loadError && <div className="empty">조건에 맞는 상영작이 없습니다.</div>}
        </section>
      </main> : <main className="timetable-page">
        {selectedItems.length === 0 ? <div className="empty timetable-empty"><strong>아직 선택한 상영 회차가 없습니다.</strong><span>영화 찾기에서 원하는 회차를 추가해 주세요.</span><button onClick={() => setActiveTab('films')}>영화 찾기</button></div> : <>
          <div className="timetable-actions enhanced-timetable-actions">
            <div><p>브라우저 크기에 맞춰 전체 시간표를 자동 조정합니다.</p><span className="booking-summary">예매 완료 {bookedCount} · 예정 {plannedCount}</span></div>
            <div className="timetable-action-buttons">
              <button onClick={exportIcs}>캘린더</button>
              <details className="backup-menu"><summary>백업</summary><div><button onClick={exportBackup}>JSON 저장</button><button onClick={() => importInputRef.current?.click()}>가져오기</button></div></details>
              <button onClick={clearSelected}>전체 비우기</button>
            </div>
            <input ref={importInputRef} type="file" accept="application/json,.json" className="visually-hidden" onChange={importBackup} />
          </div>
          <div className={`timetable-scroll ${timetableMetrics.dense ? 'dense' : ''} ${timetableMetrics.ultraDense ? 'ultra-dense' : ''}`}>
            <div className="timetable" style={timetableStyle}>
              <div className="corner" />
              {dates.map((date) => <div className="date-head" key={date} title={formatDate(date)}>{formatDate(date, timetableMetrics.dense)}</div>)}
              <div className="time-axis">{Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i).map((hour) => <div key={hour} style={{ top: `${(hour - START_HOUR) * timetableMetrics.hourHeight}px` }}>{hour < 24 ? String(hour).padStart(2, '0') : String(hour - 24).padStart(2, '0')}</div>)}</div>
              {dates.map((date) => <div className="day-column" key={date}>
                {Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => <div className="hour-line" key={i} style={{ top: `${i * timetableMetrics.hourHeight}px` }} />)}
                {selectedItems.filter(({ screening }) => screening.date === date).map(({ film, screening }) => {
                  const start = toMinutes(screening.start)
                  const end = endMinutes(film, screening)
                  const top = ((start - START_HOUR * 60) / 60) * timetableMetrics.hourHeight
                  const height = Math.max(((end - start) / 60) * timetableMetrics.hourHeight, timetableMetrics.ultraDense ? 16 : 22)
                  const travel = transitionWarning(film, screening)
                  const status = ticketStatus[screening.id] ?? 'planned'
                  const statusPrefix = status === 'booked' ? '✓ ' : status === 'planned' ? '○ ' : ''
                  return <button
                    className={`event-block status-${status} ${travel ? 'has-travel-warning' : ''}`}
                    key={screening.id}
                    style={{ top: `${top}px`, height: `${height}px` }}
                    title={`${film.title} · ${screening.start}–${endLabel(film, screening)} · ${screening.venue}${travel ? ` · 이동 여유 ${travel.gap}분/권장 ${travel.buffer}분` : ''}\n클릭하면 시간표에서 제거됩니다.`}
                    onClick={() => toggle(screening)}
                  >
                    <strong>{statusPrefix}{film.title}</strong>
                    {!timetableMetrics.ultraDense && <span className="event-time">{screening.start}{screening.gv ? ' · GV' : ''}</span>}
                    {!timetableMetrics.dense && <span className="event-venue">{screening.venue}</span>}
                  </button>
                })}
              </div>)}
            </div>
          </div>
          <p className="transfer-note">이동 여유 경고는 같은 건물군 10분, 서로 다른 상영관군 30분을 기본 기준으로 계산합니다.</p>
        </>}
      </main>}

      {detailFilm && <div className="modal-backdrop" onMouseDown={() => setDetailFilm(null)}>
        <section className="film-modal" role="dialog" aria-modal="true" aria-labelledby="film-detail-title" onMouseDown={(event) => event.stopPropagation()}>
          <div className="modal-head"><div><span className="section-label">{detailFilm.section ?? '섹션 미정'}</span><h2 id="film-detail-title">{detailFilm.title}</h2>{detailFilm.englishTitle && <p>{detailFilm.englishTitle}</p>}</div><button className="modal-close" onClick={() => setDetailFilm(null)} aria-label="상세보기 닫기">×</button></div>
          <dl className="film-detail-grid">
            {detailFilm.director && <><dt>감독</dt><dd>{detailFilm.director}</dd></>}
            {detailFilm.country && <><dt>국가</dt><dd>{detailFilm.country}</dd></>}
            {detailFilm.year && <><dt>연도</dt><dd>{detailFilm.year}</dd></>}
            {detailFilm.runtime && <><dt>러닝타임</dt><dd>{detailFilm.runtime}분</dd></>}
            {detailFilm.language && <><dt>언어</dt><dd>{detailFilm.language}</dd></>}
            <dt>상영 회차</dt><dd>{detailFilm.screenings.length}회</dd>
          </dl>
          {detailFilm.synopsis && <p className="synopsis">{detailFilm.synopsis}</p>}
          <div className="modal-screenings">{detailFilm.screenings.map((screening) => {
            const isSelected = selected.includes(screening.id)
            return <div key={screening.id}><div><strong>{screening.code ? `[${screening.code}] ` : ''}{formatDate(screening.date)} {screening.start}</strong><span>{screening.venue} · {screening.start}–{endLabel(detailFilm, screening)}{screening.gv ? ' · GV' : ''}</span></div><button className={isSelected ? 'selected' : ''} onClick={() => toggle(screening)}>{isSelected ? '선택됨' : '+ 추가'}</button></div>
          })}</div>
          <div className="modal-footer"><button className={`favorite-button wide ${favorites.includes(detailFilm.id) ? 'active' : ''}`} onClick={() => toggleFavorite(detailFilm.id)}>{favorites.includes(detailFilm.id) ? '★ 관심작 해제' : '☆ 관심작 추가'}</button>{detailFilm.url && <a href={detailFilm.url} target="_blank" rel="noreferrer">BIFF 공식 작품정보 ↗</a>}</div>
        </section>
      </div>}
    </div>
  )
}
