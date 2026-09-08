import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from 'react'
import FilmList from './components/FilmList'
import type { Film, Screening, TicketStatus, TicketStatusMap } from './components/film-types'

type FilmData = { films: Film[]; note?: string; source?: string }
type BackupData = {
  version: 1
  exportedAt: string
  selected: string[]
  favorites: string[]
  ticketStatus: TicketStatusMap
}

type TimetableItem = { film: Film; screening: Screening }
type UserTimetableSettings = {
  sameVenueMinutes: number
  sameClusterMinutes: number
  differentVenueMinutes: number
  showTransferWarnings: boolean
  showVenueInTimetable: boolean
  showBookingStatusInTimetable: boolean
}

const STORAGE_KEY = 'biff-timetable:selected-screenings:v1'
const FAVORITES_KEY = 'biff-timetable:favorites:v1'
const TICKET_STATUS_KEY = 'biff-timetable:ticket-status:v1'
const USER_SETTINGS_KEY = 'biff-timetable:user-settings:v1'
const DEFAULT_USER_SETTINGS: UserTimetableSettings = {
  sameVenueMinutes: 0,
  sameClusterMinutes: 10,
  differentVenueMinutes: 30,
  showTransferWarnings: true,
  showVenueInTimetable: true,
  showBookingStatusInTimetable: true,
}
const START_HOUR = 8
const BASE_END_HOUR = 24
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

function clampSetting(value: unknown, fallback: number, max: number) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.max(0, Math.min(max, Math.round(number)))
}

function normalizeUserSettings(value: unknown): UserTimetableSettings {
  const source = value && typeof value === 'object' ? value as Partial<UserTimetableSettings> : {}
  return {
    sameVenueMinutes: clampSetting(source.sameVenueMinutes, DEFAULT_USER_SETTINGS.sameVenueMinutes, 120),
    sameClusterMinutes: clampSetting(source.sameClusterMinutes, DEFAULT_USER_SETTINGS.sameClusterMinutes, 180),
    differentVenueMinutes: clampSetting(source.differentVenueMinutes, DEFAULT_USER_SETTINGS.differentVenueMinutes, 240),
    showTransferWarnings: typeof source.showTransferWarnings === 'boolean' ? source.showTransferWarnings : DEFAULT_USER_SETTINGS.showTransferWarnings,
    showVenueInTimetable: typeof source.showVenueInTimetable === 'boolean' ? source.showVenueInTimetable : DEFAULT_USER_SETTINGS.showVenueInTimetable,
    showBookingStatusInTimetable: typeof source.showBookingStatusInTimetable === 'boolean' ? source.showBookingStatusInTimetable : DEFAULT_USER_SETTINGS.showBookingStatusInTimetable,
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

function formatDate(date: string, _compact = false) {
  const value = new Date(`${date}T00:00:00`)
  const weekdays = ['일', '월', '화', '수', '목', '금', '토']
  return `${value.getMonth() + 1}월 ${value.getDate()}일 ${weekdays[value.getDay()]}`
}

function venueCluster(venue: string) {
  if (venue.startsWith('영화의전당')) return '영화의전당'
  if (venue.startsWith('CGV 센텀시티')) return 'CGV 센텀시티'
  if (venue.startsWith('롯데시네마 센텀')) return '롯데시네마 센텀시티'
  if (venue.includes('소향씨어터')) return '소향씨어터'
  return venue
}

function transferBufferMinutes(a: string, b: string, settings: UserTimetableSettings) {
  if (a === b) return settings.sameVenueMinutes
  if (venueCluster(a) === venueCluster(b)) return settings.sameClusterMinutes
  return settings.differentVenueMinutes
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
  const filmScrollPositionRef = useRef(0)
  const [films, setFilms] = useState<Film[]>([])
  const [dataNote, setDataNote] = useState('')
  const [dataSource, setDataSource] = useState('')
  const [selected, setSelected] = useState<string[]>(() => readStorage(STORAGE_KEY, [] as string[]))
  const [favorites, setFavorites] = useState<string[]>(() => readStorage(FAVORITES_KEY, [] as string[]))
  const [ticketStatus, setTicketStatus] = useState<TicketStatusMap>(() => readStorage(TICKET_STATUS_KEY, {} as TicketStatusMap))
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [section, setSection] = useState('전체')
  const [dateFilter, setDateFilter] = useState('전체')
  const [venueFilter, setVenueFilter] = useState('전체')
  const [gvOnly, setGvOnly] = useState(false)
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [activeTab, setActiveTab] = useState<'films' | 'timetable'>('films')
  const [detailFilm, setDetailFilm] = useState<Film | null>(null)
  const [loadError, setLoadError] = useState('')
  const [toast, setToast] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [userSettings, setUserSettings] = useState<UserTimetableSettings>(() => normalizeUserSettings(readStorage(USER_SETTINGS_KEY, DEFAULT_USER_SETTINGS)))
  const [timetableSelectionMode, setTimetableSelectionMode] = useState(false)
  const [timetableDeleteSelection, setTimetableDeleteSelection] = useState<string[]>([])

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
  useEffect(() => { localStorage.setItem(USER_SETTINGS_KEY, JSON.stringify(userSettings)) }, [userSettings])

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

  useEffect(() => {
    if (activeTab === 'timetable' && !settingsOpen) return
    setTimetableSelectionMode(false)
    setTimetableDeleteSelection([])
  }, [activeTab, settingsOpen])

  useEffect(() => {
    setTimetableDeleteSelection((current) => {
      const next = current.filter((id) => selected.includes(id))
      return next.length === current.length ? current : next
    })
    if (selected.length === 0) setTimetableSelectionMode(false)
  }, [selected])

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

  const visibleScreenings = useCallback((film: Film) => film.screenings.filter((screening) => {
    if (dateFilter !== '전체' && screening.date !== dateFilter) return false
    if (venueFilter !== '전체' && screening.venue !== venueFilter) return false
    if (gvOnly && !screening.gv) return false
    return true
  }), [dateFilter, venueFilter, gvOnly])

  const selectedSet = useMemo(() => new Set(selected), [selected])
  const favoriteSet = useMemo(() => new Set(favorites), [favorites])

  const filteredFilms = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    return films.filter((film) => {
      const haystack = [film.title, film.englishTitle, film.director, film.country, film.section].filter(Boolean).join(' ').toLowerCase()
      if (section !== '전체' && film.section !== section) return false
      if (favoritesOnly && !favoriteSet.has(film.id)) return false
      if (q && !haystack.includes(q)) return false
      return film.screenings.some((screening) => {
        if (dateFilter !== '전체' && screening.date !== dateFilter) return false
        if (venueFilter !== '전체' && screening.venue !== venueFilter) return false
        if (gvOnly && !screening.gv) return false
        return true
      })
    })
  }, [films, deferredQuery, section, dateFilter, venueFilter, gvOnly, favoritesOnly, favoriteSet])

  const selectedItems = useMemo<TimetableItem[]>(
    () => films.flatMap((film) => film.screenings.filter((screening) => selectedSet.has(screening.id)).map((screening) => ({ film, screening }))),
    [films, selectedSet],
  )
  const dates = useMemo(() => Array.from(new Set(selectedItems.map(({ screening }) => screening.date))).sort(), [selectedItems])
  const timetableEndHour = useMemo(() => {
    const latestEndMinutes = selectedItems.reduce(
      (latest, { film, screening }) => Math.max(latest, endMinutes(film, screening)),
      BASE_END_HOUR * 60,
    )
    return Math.max(BASE_END_HOUR, Math.ceil(latestEndMinutes / 60))
  }, [selectedItems])

  const timetableMetrics = useMemo(() => {
    const isMobile = viewport.width <= 700
    const shellPadding = isMobile ? 32 : 48
    const contentWidth = Math.max(280, Math.min(1180, viewport.width - shellPadding))
    const axisWidth = isMobile ? 38 : 50
    const headerHeight = isMobile ? 32 : 38
    const chromeHeight = 245
    const usableGridHeight = Math.max(180, viewport.height - chromeHeight - headerHeight)
    const hourHeight = Math.max(9.5, usableGridHeight / (timetableEndHour - START_HOUR))
    const gridHeight = hourHeight * (timetableEndHour - START_HOUR)
    const dayWidth = dates.length > 0 ? Math.max(1, (contentWidth - axisWidth) / dates.length) : contentWidth - axisWidth
    const dense = dayWidth < 76
    const ultraDense = dayWidth < 48

    return { axisWidth, headerHeight, hourHeight, gridHeight, dayWidth, dense, ultraDense }
  }, [viewport, dates.length, timetableEndHour])

  const conflictingSelections = useCallback((film: Film, screening: Screening) => {
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
      }).join('\n')
      window.alert(`이미 선택한 다음 회차와 시간이 겹칩니다.\n${conflictDetails}\n\n겹치는 기존 회차를 먼저 제거한 뒤 추가해 주세요.`)
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

  function resetFilters() {
    setQuery('')
    setSection('전체')
    setDateFilter('전체')
    setVenueFilter('전체')
    setGvOnly(false)
    setFavoritesOnly(false)
  }

  function clearSelected() {
    if (!selected.length) return
    const confirmed = window.confirm(`선택한 ${selected.length}개 회차를 모두 삭제하시겠습니까?\n예매 상태도 함께 제거됩니다.`)
    if (!confirmed) return

    setSelected([])
    setTicketStatus({})
    setTimetableSelectionMode(false)
    setTimetableDeleteSelection([])
    setToast('선택한 모든 회차를 시간표에서 삭제했습니다.')
  }

  function toggleTimetableSelectionMode() {
    if (timetableSelectionMode) {
      setTimetableSelectionMode(false)
      setTimetableDeleteSelection([])
      return
    }
    setTimetableSelectionMode(true)
  }

  function toggleTimetableDeleteSelection(screeningId: string) {
    if (!timetableSelectionMode) return
    setTimetableDeleteSelection((current) => current.includes(screeningId)
      ? current.filter((id) => id !== screeningId)
      : [...current, screeningId])
  }

  function deleteTimetableSelection() {
    const count = timetableDeleteSelection.length
    if (!count) return
    const confirmed = window.confirm(`선택한 ${count}개 회차를 정말 삭제하시겠습니까?\n삭제하면 해당 회차의 예매 상태도 함께 제거됩니다.`)
    if (!confirmed) return

    const targets = new Set(timetableDeleteSelection)
    setSelected((current) => current.filter((id) => !targets.has(id)))
    setTicketStatus((current) => {
      const next = { ...current }
      for (const id of targets) delete next[id]
      return next
    })
    setTimetableDeleteSelection([])
    setTimetableSelectionMode(false)
    setToast(`${count}개 회차를 시간표에서 삭제했습니다.`)
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
  const filmViewActive = activeTab === 'films' && !settingsOpen

  const openFilms = useCallback(() => {
    const target = filmScrollPositionRef.current
    setActiveTab('films')
    setSettingsOpen(false)

    let attempts = 0
    const restore = () => {
      attempts += 1
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
      const canReachTarget = maxScroll >= target - 2
      if (canReachTarget || attempts >= 40) {
        window.scrollTo(0, Math.min(target, maxScroll))
        if (Math.abs(window.scrollY - target) > 120 && attempts < 40) window.setTimeout(restore, 16)
        return
      }
      window.setTimeout(restore, 16)
    }

    window.setTimeout(restore, 0)
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

  return (
    <div className={`app-shell ${activeTab === 'timetable' ? 'timetable-mode' : ''}`}>
      <header className="topbar">
        <div><p className="eyebrow">BUSAN INTERNATIONAL FILM FESTIVAL</p><h1>BIFF Timetable</h1><p className="subtitle">상영작을 고르고 나만의 영화제 시간표를 만드세요.</p></div>
        <div className="selection-count">총 {selected.length}개 선택</div>
      </header>

      <nav className="tabs" aria-label="주요 메뉴">
        <button className={activeTab === 'films' && !settingsOpen ? 'active' : ''} onClick={openFilms}>영화 찾기</button>
        <button className={activeTab === 'timetable' && !settingsOpen ? 'active' : ''} onClick={openTimetable}>내 시간표</button>
        <button className={`settings-tab-trigger ${settingsOpen ? 'active' : ''}`} onClick={openSettings}>설정</button>
      </nav>

      {activeTab === 'films' && !settingsOpen && dataNote && <div className="notice film-data-notice">{dataNote}{dataSource && <> <a href={dataSource} target="_blank" rel="noreferrer">공식 시간표 ↗</a></>}</div>}
      {loadError && <div className="notice error">{loadError}</div>}
      {toast && <div className="toast" role="status">{toast}</div>}


      {settingsOpen && <main className="biff-settings-panel react-settings-panel">
        <section className="settings-intro"><p className="settings-kicker">PERSONAL SETTINGS</p><h2>설정</h2><p>시간표 계산과 표시 방식을 현재 기기에 맞게 조정할 수 있습니다. 변경사항은 이 브라우저에 자동 저장됩니다.</p></section>
        <section className="settings-card">
          <div className="settings-card-head"><div><h3>이동 시간</h3><p>연속 상영 사이에 필요한 최소 이동 여유를 정합니다.</p></div></div>
          <div className="settings-list">
            <label className="settings-number-row"><span><strong>동일 상영관</strong><small>같은 관에서 다음 상영을 볼 때 필요한 여유</small></span><span className="settings-number-control"><input type="number" min="0" max="120" step="5" inputMode="numeric" value={userSettings.sameVenueMinutes} onChange={(event) => setUserSettings((current) => ({ ...current, sameVenueMinutes: clampSetting(event.target.value, current.sameVenueMinutes, 120) }))} /><em>분</em></span></label>
            <label className="settings-number-row"><span><strong>같은 상영관군</strong><small>영화의전당 내부처럼 같은 건물군에서 관을 이동할 때</small></span><span className="settings-number-control"><input type="number" min="0" max="180" step="5" inputMode="numeric" value={userSettings.sameClusterMinutes} onChange={(event) => setUserSettings((current) => ({ ...current, sameClusterMinutes: clampSetting(event.target.value, current.sameClusterMinutes, 180) }))} /><em>분</em></span></label>
            <label className="settings-number-row"><span><strong>서로 다른 상영관</strong><small>CGV ↔ 영화의전당처럼 상영관군이 달라질 때</small></span><span className="settings-number-control"><input type="number" min="0" max="240" step="5" inputMode="numeric" value={userSettings.differentVenueMinutes} onChange={(event) => setUserSettings((current) => ({ ...current, differentVenueMinutes: clampSetting(event.target.value, current.differentVenueMinutes, 240) }))} /><em>분</em></span></label>
            <label className="settings-toggle-row"><span><strong>이동 여유 경고 표시</strong><small>설정한 시간보다 여유가 짧은 연속 상영을 표시합니다.</small></span><span className="settings-switch"><input type="checkbox" checked={userSettings.showTransferWarnings} onChange={(event) => setUserSettings((current) => ({ ...current, showTransferWarnings: event.target.checked }))} /><i /></span></label>
          </div>
        </section>
        <section className="settings-card">
          <div className="settings-card-head"><div><h3>시간표 표시</h3><p>작은 화면에서 필요한 정보만 남길 수 있습니다.</p></div></div>
          <div className="settings-list">
            <label className="settings-toggle-row"><span><strong>상영관명 표시</strong><small>내 시간표 영화 블록 안에 상영관명을 표시합니다.</small></span><span className="settings-switch"><input type="checkbox" checked={userSettings.showVenueInTimetable} onChange={(event) => setUserSettings((current) => ({ ...current, showVenueInTimetable: event.target.checked }))} /><i /></span></label>
            <label className="settings-toggle-row"><span><strong>예매 상태 기호 표시</strong><small>예매 완료 ✓, 예매 예정 ○ 기호를 영화 제목 앞에 표시합니다.</small></span><span className="settings-switch"><input type="checkbox" checked={userSettings.showBookingStatusInTimetable} onChange={(event) => setUserSettings((current) => ({ ...current, showBookingStatusInTimetable: event.target.checked }))} /><i /></span></label>
          </div>
        </section>
        <section className="settings-card settings-reset-card"><div><h3>기본 설정</h3><p>이동 시간과 표시 설정을 처음 값으로 되돌립니다.</p></div><button type="button" className="settings-reset-button" onClick={() => setUserSettings({ ...DEFAULT_USER_SETTINGS })}>기본값으로 초기화</button></section>
      </main>}

      {!settingsOpen && (activeTab === 'films' ? <main>
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
      </main> : <main className="timetable-page">
        {selectedItems.length === 0 ? <div className="empty timetable-empty"><strong>아직 선택한 상영 회차가 없습니다.</strong><span>영화 찾기에서 원하는 회차를 추가해 주세요.</span><button onClick={openFilms}>영화 찾기</button></div> : <>
          <div className="timetable-actions enhanced-timetable-actions">
            <div><span className="booking-summary">{timetableSelectionMode ? `삭제할 회차 ${timetableDeleteSelection.length}개 선택` : `예매 완료 ${bookedCount} · 예정 ${plannedCount}`}</span></div>
            <div className="timetable-action-buttons">
              <button onClick={exportIcs}>캘린더</button>
              <details className="backup-menu"><summary>백업</summary><div><button onClick={exportBackup}>JSON 저장</button><button onClick={() => importInputRef.current?.click()}>가져오기</button></div></details>
              <button type="button" className={`timetable-selection-button ${timetableSelectionMode ? 'active' : ''}`} onClick={toggleTimetableSelectionMode}>{timetableSelectionMode ? '선택 취소' : '선택'}</button>
              {timetableSelectionMode && <button type="button" className="timetable-delete-button" onClick={deleteTimetableSelection} disabled={timetableDeleteSelection.length === 0}>삭제 {timetableDeleteSelection.length}</button>}
              <button onClick={clearSelected}>전체 비우기</button>
            </div>
            <input ref={importInputRef} type="file" accept="application/json,.json" className="visually-hidden" onChange={importBackup} />
          </div>
          <div className={`timetable-scroll ${timetableMetrics.dense ? 'dense' : ''} ${timetableMetrics.ultraDense ? 'ultra-dense' : ''} ${timetableSelectionMode ? 'timetable-selection-mode' : ''}`}>
            <div className="timetable" style={timetableStyle}>
              <div className="corner" />
              {dates.map((date) => <div className="date-head" key={date} title={formatDate(date)}>{formatDate(date, timetableMetrics.dense)}</div>)}
              <div className="time-axis">{Array.from({ length: timetableEndHour - START_HOUR + 1 }, (_, i) => START_HOUR + i).map((hour) => <div key={hour} style={{ top: `${(hour - START_HOUR) * timetableMetrics.hourHeight}px` }}>{`${hour < 24 ? String(hour).padStart(2, '0') : String(hour - 24).padStart(2, '0')}시`}</div>)}</div>
              {dates.map((date) => <div className="day-column" key={date}>
                {Array.from({ length: timetableEndHour - START_HOUR + 1 }, (_, i) => <div className="hour-line" key={i} style={{ top: `${i * timetableMetrics.hourHeight}px` }} />)}
                {selectedItems.filter(({ screening }) => screening.date === date).map(({ film, screening }) => {
                  const start = toMinutes(screening.start)
                  const end = endMinutes(film, screening)
                  const top = ((start - START_HOUR * 60) / 60) * timetableMetrics.hourHeight
                  const height = Math.max(((end - start) / 60) * timetableMetrics.hourHeight, timetableMetrics.ultraDense ? 16 : 22)
                  const travel = transitionWarning(film, screening)
                  const status = ticketStatus[screening.id] ?? 'planned'
                  const statusPrefix = userSettings.showBookingStatusInTimetable ? (status === 'booked' ? '✓ ' : status === 'planned' ? '○ ' : '') : ''
                  const isMarkedForDelete = timetableDeleteSelection.includes(screening.id)
                  return <button
                    type="button"
                    className={`event-block status-${status} ${travel ? 'has-travel-warning' : ''} ${timetableSelectionMode ? 'delete-selectable' : ''} ${isMarkedForDelete ? 'selected-for-delete' : ''}`}
                    key={screening.id}
                    style={{ top: `${top}px`, height: `${height}px` }}
                    title={`${film.title} · ${screening.start}–${endLabel(film, screening)} · ${screening.venue}${travel ? ` · 이동 여유 ${travel.gap}분/권장 ${travel.buffer}분` : ''}${timetableSelectionMode ? `\n${isMarkedForDelete ? '삭제 선택됨 · 클릭하여 선택 해제' : '삭제할 회차로 선택하려면 클릭'}` : ''}`}
                    onClick={() => toggleTimetableDeleteSelection(screening.id)}
                    tabIndex={timetableSelectionMode ? 0 : -1}
                    aria-pressed={timetableSelectionMode ? isMarkedForDelete : undefined}
                  >
                    {timetableSelectionMode && <span className="event-select-indicator" aria-hidden="true">{isMarkedForDelete ? '✓' : ''}</span>}
                    <strong>{statusPrefix}{film.title}</strong>
                    {!timetableMetrics.ultraDense && <span className="event-time">{screening.start}{screening.gv ? ' · GV' : ''}</span>}
                    {userSettings.showVenueInTimetable && !timetableMetrics.dense && <span className="event-venue">{screening.venue}</span>}
                  </button>
                })}
              </div>)}
            </div>
          </div>
          {userSettings.showTransferWarnings && <p className="transfer-note">이동 여유 경고 기준: 동일 상영관 {userSettings.sameVenueMinutes}분 · 같은 상영관군 {userSettings.sameClusterMinutes}분 · 다른 상영관 {userSettings.differentVenueMinutes}분.</p>}
        </>}
      </main>)}

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
            return <div key={screening.id}><div><strong>{screening.code ? `[${screening.code}] ` : ''}{formatDate(screening.date)} {screening.start}</strong><span>{screening.venue} · {screening.start}–{endLabel(detailFilm, screening)}{screening.gv ? ' · GV' : ''}</span></div><button className={isSelected ? 'selected' : ''} onClick={() => toggle(detailFilm, screening)}>{isSelected ? '선택됨' : '+ 추가'}</button></div>
          })}</div>
          <div className="modal-footer"><button className={`favorite-button wide ${favorites.includes(detailFilm.id) ? 'active' : ''}`} onClick={() => toggleFavorite(detailFilm.id)}>{favorites.includes(detailFilm.id) ? '★ 관심작 해제' : '☆ 관심작 추가'}</button>{detailFilm.url && <a href={detailFilm.url} target="_blank" rel="noreferrer">BIFF 공식 작품정보 ↗</a>}</div>
        </section>
      </div>}
    </div>
  )
}
