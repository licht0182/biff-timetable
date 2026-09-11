import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from 'react'
import CustomEventDialog from './components/CustomEventDialog'
import FilmList from './components/FilmList'
import CuratorPage from './components/CuratorPage'
import type { Film, Screening, TicketStatus, TicketStatusMap } from './components/film-types'
import { createCustomEventId, customEventAbsoluteWindow, customEventCategoryLabel, customEventTimetableDate, customEventTimetableEndMinutes, customEventTimetableStartMinutes, normalizeCustomEvents, windowsOverlap, type CustomEvent, type CustomEventDraft } from './custom-events'
import { REST_BREAK_MINUTES, VENUE_TRANSFER_SITES, getVenueSiteTransferMinutes } from './venue-travel'
import { getTransferBuffer } from './transfer-buffer'
import { exportTimetablePng } from './png-export'
import { BASE_END_HOUR, START_HOUR, clockMinutes, endLabel, screeningAbsoluteWindow, screeningEndOffsetMinutes, screeningsOverlap, timetableDate, timetableEndMinutes, timetableStartMinutes } from './screening-time'
import { hasNavigationState, pushNavigationState, readNavigationState, replaceNavigationState } from './navigation-history'

type FilmData = { films: Film[]; note?: string; source?: string }
type BackupData = {
  version: 2
  exportedAt: string
  selected: string[]
  favorites: string[]
  ticketStatus: TicketStatusMap
  customEvents: CustomEvent[]
}

type TimetableItem = { film: Film; screening: Screening }
type CustomEventDialogState = { mode: 'create' | 'detail' | 'edit'; eventId?: string }
type CalendarExportItem =
  | { kind: 'screening'; date: string; start: string; film: Film; screening: Screening }
  | { kind: 'custom'; date: string; start: string; event: CustomEvent }

type UserTimetableSettings = {
  sameClusterMinutes: number
  differentVenueMinutes: number
  showTransferWarnings: boolean
  showVenueInTimetable: boolean
  showBookingStatusInTimetable: boolean
}

const STORAGE_KEY = 'biff-timetable:selected-screenings:v1'
const FAVORITES_KEY = 'biff-timetable:favorites:v1'
const TICKET_STATUS_KEY = 'biff-timetable:ticket-status:v1'
const CUSTOM_EVENTS_KEY = 'biff-timetable:custom-events:v1'
const USER_SETTINGS_KEY = 'biff-timetable:user-settings:v1'
const DATA_VERSION_STORAGE_KEY = 'biff-timetable:data-version:v1'
const DEFAULT_USER_SETTINGS: UserTimetableSettings = {
  sameClusterMinutes: 10,
  differentVenueMinutes: 30,
  showTransferWarnings: true,
  showVenueInTimetable: true,
  showBookingStatusInTimetable: true,
}
const DATA_VERSION = '2026-official-20260911-1'

function readStorageValue(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : undefined
  } catch {
    return undefined
  }
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)))
}

function normalizeTicketStatus(value: unknown): TicketStatusMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const entries = Object.entries(value).filter(([id, status]) => (
    id.trim().length > 0 && (status === 'planned' || status === 'booked')
  ))
  return Object.fromEntries(entries) as TicketStatusMap
}

function clampSetting(value: unknown, fallback: number, max: number) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.max(0, Math.min(max, Math.round(number)))
}

function normalizeUserSettings(value: unknown): UserTimetableSettings {
  const source = value && typeof value === 'object' ? value as Partial<UserTimetableSettings> : {}
  return {
    sameClusterMinutes: clampSetting(source.sameClusterMinutes, DEFAULT_USER_SETTINGS.sameClusterMinutes, 180),
    differentVenueMinutes: clampSetting(source.differentVenueMinutes, DEFAULT_USER_SETTINGS.differentVenueMinutes, 240),
    showTransferWarnings: typeof source.showTransferWarnings === 'boolean' ? source.showTransferWarnings : DEFAULT_USER_SETTINGS.showTransferWarnings,
    showVenueInTimetable: typeof source.showVenueInTimetable === 'boolean' ? source.showVenueInTimetable : DEFAULT_USER_SETTINGS.showVenueInTimetable,
    showBookingStatusInTimetable: typeof source.showBookingStatusInTimetable === 'boolean' ? source.showBookingStatusInTimetable : DEFAULT_USER_SETTINGS.showBookingStatusInTimetable,
  }
}

function formatDate(date: string, _compact = false) {
  const value = new Date(`${date}T00:00:00`)
  const weekdays = ['일', '월', '화', '수', '목', '금', '토']
  return `${value.getMonth() + 1}월 ${value.getDate()}일 ${weekdays[value.getDay()]}`
}

function screeningMatchesTimeRange(start: string, fromTime: string, toTime: string) {
  if (!fromTime && !toTime) return true

  const startMinutes = clockMinutes(start)
  const fromMinutes = fromTime ? clockMinutes(fromTime) : null
  const toMinutes = toTime ? clockMinutes(toTime) : null

  if (fromMinutes != null && toMinutes != null && fromMinutes > toMinutes) {
    return startMinutes >= fromMinutes || startMinutes <= toMinutes
  }
  if (fromMinutes != null && startMinutes < fromMinutes) return false
  if (toMinutes != null && startMinutes > toMinutes) return false
  return true
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

function todayLocal() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
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
  const initialNavigation = useMemo(() => readNavigationState(), [])
  const importInputRef = useRef<HTMLInputElement>(null)
  const filmScrollPositionRef = useRef(0)
  const [films, setFilms] = useState<Film[]>([])
  const [dataNote, setDataNote] = useState('')
  const [dataSource, setDataSource] = useState('')
  const [selected, setSelected] = useState<string[]>(() => normalizeStringArray(readStorageValue(STORAGE_KEY)))
  const [favorites, setFavorites] = useState<string[]>(() => normalizeStringArray(readStorageValue(FAVORITES_KEY)))
  const [ticketStatus, setTicketStatus] = useState<TicketStatusMap>(() => normalizeTicketStatus(readStorageValue(TICKET_STATUS_KEY)))
  const [customEvents, setCustomEvents] = useState<CustomEvent[]>(() => normalizeCustomEvents(readStorageValue(CUSTOM_EVENTS_KEY)))
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [section, setSection] = useState('전체')
  const [dateFilter, setDateFilter] = useState('전체')
  const [venueFilter, setVenueFilter] = useState('전체')
  const [startTimeFilter, setStartTimeFilter] = useState('')
  const [endTimeFilter, setEndTimeFilter] = useState('')
  const [gvOnly, setGvOnly] = useState(false)
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [activeTab, setActiveTab] = useState<'films' | 'timetable' | 'curator'>(initialNavigation.tab)
  const [curatorPageKey, setCuratorPageKey] = useState(0)
  const [detailFilm, setDetailFilm] = useState<Film | null>(null)
  const [detailScreeningId, setDetailScreeningId] = useState<string | null>(null)
  const [customEventDialog, setCustomEventDialog] = useState<CustomEventDialogState | null>(null)
  const [loadError, setLoadError] = useState('')
  const [toast, setToast] = useState('')
  const [pngExportState, setPngExportState] = useState<'idle' | 'working' | 'ready' | 'done' | 'error'>('idle')
  const [settingsOpen, setSettingsOpen] = useState(initialNavigation.settingsOpen)
  const [userSettings, setUserSettings] = useState<UserTimetableSettings>(() => normalizeUserSettings(readStorageValue(USER_SETTINGS_KEY)))
  const [timetableSelectionMode, setTimetableSelectionMode] = useState(false)
  const [timetableDeleteSelection, setTimetableDeleteSelection] = useState<string[]>([])

  useEffect(() => {
    if (!hasNavigationState()) replaceNavigationState(initialNavigation)

    const handlePopState = (event: PopStateEvent) => {
      const navigation = readNavigationState(event.state)
      setActiveTab(navigation.tab)
      setSettingsOpen(navigation.settingsOpen)
      setDetailFilm(null)
      setDetailScreeningId(null)
      setCustomEventDialog(null)
      if (navigation.tab === 'curator' && !navigation.settingsOpen) {
        setCuratorPageKey((current) => current + 1)
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [initialNavigation])

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}screenings.json?v=${DATA_VERSION}`, { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error('상영 데이터를 불러오지 못했습니다.')
        return res.json()
      })
      .then((data: FilmData) => {
        const validFilmIds = new Set(data.films.map((film) => film.id))
        const validScreeningIds = new Set(data.films.flatMap((film) => film.screenings.map((screening) => screening.id)))

        setSelected((current) => current.filter((id) => validScreeningIds.has(id)))
        setFavorites((current) => current.filter((id) => validFilmIds.has(id)))
        setTicketStatus((current) => Object.fromEntries(
          Object.entries(current).filter(([id]) => validScreeningIds.has(id)),
        ) as TicketStatusMap)
        setTimetableDeleteSelection((current) => current.filter((id) => validScreeningIds.has(id) || id.startsWith('custom-')))
        localStorage.setItem(DATA_VERSION_STORAGE_KEY, JSON.stringify(DATA_VERSION))

        setFilms(data.films)
        setDataNote(data.note ?? '')
        setDataSource(data.source ?? '')
      })
      .catch((err: Error) => setLoadError(err.message))
  }, [])

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(selected)) }, [selected])
  useEffect(() => { localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites)) }, [favorites])
  useEffect(() => { localStorage.setItem(TICKET_STATUS_KEY, JSON.stringify(ticketStatus)) }, [ticketStatus])
  useEffect(() => { localStorage.setItem(CUSTOM_EVENTS_KEY, JSON.stringify(customEvents)) }, [customEvents])
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
      if (event.key !== 'Escape') return
      setDetailFilm(null)
      setDetailScreeningId(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [detailFilm])

  useEffect(() => {
    if (!customEventDialog) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCustomEventDialog(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [customEventDialog])

  useEffect(() => {
    if (activeTab === 'timetable' && !settingsOpen) return
    setTimetableSelectionMode(false)
    setTimetableDeleteSelection([])
  }, [activeTab, settingsOpen])

  useEffect(() => {
    const validIds = new Set([...selected, ...customEvents.map((event) => event.id)])
    setTimetableDeleteSelection((current) => {
      const next = current.filter((id) => validIds.has(id))
      return next.length === current.length ? current : next
    })
    if (validIds.size === 0) setTimetableSelectionMode(false)
  }, [selected, customEvents])

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
    if (!screeningMatchesTimeRange(screening.start, startTimeFilter, endTimeFilter)) return false
    if (gvOnly && !screening.gv) return false
    return true
  }), [dateFilter, venueFilter, startTimeFilter, endTimeFilter, gvOnly])

  const selectedSet = useMemo(() => new Set(selected), [selected])
  const favoriteSet = useMemo(() => new Set(favorites), [favorites])

  const filteredFilms = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    return films.filter((film) => {
      const haystack = [film.title, film.englishTitle, film.director, film.country, film.genre, film.section].filter(Boolean).join(' ').toLowerCase()
      if (section !== '전체' && film.section !== section) return false
      if (favoritesOnly && !favoriteSet.has(film.id)) return false
      if (q && !haystack.includes(q)) return false
      return film.screenings.some((screening) => {
        if (dateFilter !== '전체' && screening.date !== dateFilter) return false
        if (venueFilter !== '전체' && screening.venue !== venueFilter) return false
        if (!screeningMatchesTimeRange(screening.start, startTimeFilter, endTimeFilter)) return false
        if (gvOnly && !screening.gv) return false
        return true
      })
    })
  }, [films, deferredQuery, section, dateFilter, venueFilter, startTimeFilter, endTimeFilter, gvOnly, favoritesOnly, favoriteSet])

  const selectedItems = useMemo<TimetableItem[]>(
    () => films.flatMap((film) => film.screenings.filter((screening) => selectedSet.has(screening.id)).map((screening) => ({ film, screening }))),
    [films, selectedSet],
  )
  const dates = useMemo(() => Array.from(new Set([
    ...selectedItems.map(({ screening }) => timetableDate(screening)),
    ...customEvents.map((event) => customEventTimetableDate(event)),
  ])).sort(), [selectedItems, customEvents])
  const timetableEndHour = useMemo(() => {
    const screeningEnd = selectedItems.reduce(
      (latest, { film, screening }) => Math.max(latest, timetableEndMinutes(film, screening)),
      BASE_END_HOUR * 60,
    )
    const latestEndMinutes = customEvents.reduce(
      (latest, event) => Math.max(latest, customEventTimetableEndMinutes(event)),
      screeningEnd,
    )
    return Math.max(BASE_END_HOUR, Math.ceil(latestEndMinutes / 60))
  }, [selectedItems, customEvents])

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

  const conflictingSelections = useCallback((film: Film, screening: Screening) => (
    selectedItems.filter(({ film: otherFilm, screening: other }) => screeningsOverlap(film, screening, otherFilm, other))
  ), [selectedItems])

  const conflictingCustomEventsForScreening = useCallback((film: Film, screening: Screening) => {
    const current = screeningAbsoluteWindow(film, screening)
    return customEvents.filter((event) => windowsOverlap(current, customEventAbsoluteWindow(event)))
  }, [customEvents])

  const conflicts = useCallback((film: Film, screening: Screening) => (
    conflictingSelections(film, screening).length > 0 || conflictingCustomEventsForScreening(film, screening).length > 0
  ), [conflictingSelections, conflictingCustomEventsForScreening])

  const hasCustomEventConflict = useCallback((event: CustomEvent) => {
    const current = customEventAbsoluteWindow(event)
    if (selectedItems.some(({ film, screening }) => windowsOverlap(current, screeningAbsoluteWindow(film, screening)))) return true
    return customEvents.some((other) => other.id !== event.id && windowsOverlap(current, customEventAbsoluteWindow(other)))
  }, [selectedItems, customEvents])

  const transitionWarning = useCallback((film: Film, screening: Screening) => {
    if (!userSettings.showTransferWarnings) return null
    const currentWindow = screeningAbsoluteWindow(film, screening)

    for (const { film: otherFilm, screening: other } of selectedItems) {
      if (other.id === screening.id) continue
      const otherWindow = screeningAbsoluteWindow(otherFilm, other)

      if (currentWindow.end <= otherWindow.start) {
        const transfer = getTransferBuffer(screening.venue, other.venue, userSettings)
        if (transfer.minutes === 0) continue
        const gap = otherWindow.start - currentWindow.end
        if (gap < transfer.minutes) return {
          otherFilm,
          other,
          gap,
          buffer: transfer.minutes,
          routeLabel: transfer.routeLabel,
          transferDetail: transfer.transferDetail,
          precise: transfer.precise,
        }
      } else if (otherWindow.end <= currentWindow.start) {
        const transfer = getTransferBuffer(other.venue, screening.venue, userSettings)
        if (transfer.minutes === 0) continue
        const gap = currentWindow.start - otherWindow.end
        if (gap < transfer.minutes) return {
          otherFilm,
          other,
          gap,
          buffer: transfer.minutes,
          routeLabel: transfer.routeLabel,
          transferDetail: transfer.transferDetail,
          precise: transfer.precise,
        }
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

    const customOverlaps = conflictingCustomEventsForScreening(film, screening)
    if (customOverlaps.length) {
      const details = customOverlaps.map((event) => `• ${event.title} · ${formatDate(event.date)} ${event.start}–${event.end}${event.location ? ` · ${event.location}` : ''}`).join('\n')
      const confirmed = window.confirm(`내 시간표의 사용자 일정과 시간이 겹칩니다.\n${details}\n\n그래도 이 회차를 추가하시겠습니까?`)
      if (!confirmed) return
    }

    setSelected((current) => current.includes(screening.id) ? current : [...current, screening.id])
    setTicketStatus((statuses) => ({ ...statuses, [screening.id]: 'planned' }))
  }, [selectedSet, conflictingSelections, conflictingCustomEventsForScreening])

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
    setStartTimeFilter('')
    setEndTimeFilter('')
    setGvOnly(false)
    setFavoritesOnly(false)
  }

  function openCreateCustomEvent() {
    setTimetableSelectionMode(false)
    setTimetableDeleteSelection([])
    setCustomEventDialog({ mode: 'create' })
  }

  function saveCustomEvent(draft: CustomEventDraft, editingId?: string) {
    const candidate: CustomEvent = {
      id: editingId ?? 'custom-preview',
      ...draft,
      createdAt: customEvents.find((event) => event.id === editingId)?.createdAt ?? new Date().toISOString(),
    }
    const current = customEventAbsoluteWindow(candidate)
    const overlappingScreenings = selectedItems.filter(({ film, screening }) => windowsOverlap(current, screeningAbsoluteWindow(film, screening)))
    const overlappingCustom = customEvents.filter((event) => event.id !== editingId && windowsOverlap(current, customEventAbsoluteWindow(event)))

    if (overlappingScreenings.length || overlappingCustom.length) {
      const details = [
        ...overlappingScreenings.map(({ film, screening }) => `• ${film.title} · ${formatDate(screening.date)} ${screening.start}–${endLabel(film, screening)}`),
        ...overlappingCustom.map((event) => `• ${event.title} · ${formatDate(event.date)} ${event.start}–${event.end}`),
      ].join('\n')
      const confirmed = window.confirm(`다른 일정과 시간이 겹칩니다.\n${details}\n\n그래도 저장하시겠습니까?`)
      if (!confirmed) return false
    }

    if (editingId) {
      setCustomEvents((currentEvents) => currentEvents.map((event) => event.id === editingId ? { ...candidate, id: editingId } : event))
      setToast('사용자 일정을 수정했습니다.')
    } else {
      setCustomEvents((currentEvents) => [...currentEvents, { ...candidate, id: createCustomEventId() }])
      setToast('사용자 일정을 시간표에 추가했습니다.')
    }
    setCustomEventDialog(null)
    return true
  }

  function deleteCustomEvent(event: CustomEvent) {
    const confirmed = window.confirm(`“${event.title}” 일정을 삭제하시겠습니까?`)
    if (!confirmed) return
    setCustomEvents((current) => current.filter((item) => item.id !== event.id))
    setTimetableDeleteSelection((current) => current.filter((id) => id !== event.id))
    setCustomEventDialog(null)
    setToast('사용자 일정을 삭제했습니다.')
  }

  function clearSelected() {
    const total = selected.length + customEvents.length
    if (!total) return
    const confirmed = window.confirm(`시간표의 ${total}개 일정을 모두 삭제하시겠습니까?\n영화 회차의 예매 상태도 함께 제거됩니다.`)
    if (!confirmed) return

    setSelected([])
    setCustomEvents([])
    setTicketStatus({})
    setTimetableSelectionMode(false)
    setTimetableDeleteSelection([])
    setToast('시간표의 모든 일정을 삭제했습니다.')
  }

  function toggleTimetableSelectionMode() {
    if (timetableSelectionMode) {
      setTimetableSelectionMode(false)
      setTimetableDeleteSelection([])
      return
    }
    setTimetableSelectionMode(true)
  }

  function toggleTimetableDeleteSelection(itemId: string) {
    if (!timetableSelectionMode) return
    setTimetableDeleteSelection((current) => current.includes(itemId)
      ? current.filter((id) => id !== itemId)
      : [...current, itemId])
  }

  function deleteTimetableSelection() {
    const count = timetableDeleteSelection.length
    if (!count) return
    const confirmed = window.confirm(`선택한 ${count}개 일정을 정말 삭제하시겠습니까?\n영화 회차를 삭제하면 해당 예매 상태도 함께 제거됩니다.`)
    if (!confirmed) return

    const targets = new Set(timetableDeleteSelection)
    setSelected((current) => current.filter((id) => !targets.has(id)))
    setCustomEvents((current) => current.filter((event) => !targets.has(event.id)))
    setTicketStatus((current) => {
      const next = { ...current }
      for (const id of targets) delete next[id]
      return next
    })
    setTimetableDeleteSelection([])
    setTimetableSelectionMode(false)
    setToast(`${count}개 일정을 시간표에서 삭제했습니다.`)
  }

  function exportBackup() {
    const payload: BackupData = {
      version: 2,
      exportedAt: new Date().toISOString(),
      selected,
      favorites,
      ticketStatus,
      customEvents,
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
        setCustomEvents([])
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
      setCustomEvents(normalizeCustomEvents(parsed.customEvents))
      setToast('백업한 시간표를 가져왔습니다.')
    } catch {
      setToast('가져오기 파일을 확인해 주세요.')
    }
  }

  async function savePng() {
    if (pngExportState === 'working' || (!selectedItems.length && !customEvents.length)) return
    setPngExportState('working')
    try {
      const result = await exportTimetablePng(selectedItems, ticketStatus, userSettings, customEvents)
      setPngExportState(result === 'apple-ready' ? 'ready' : 'done')
      if (result === 'downloaded') setToast('시간표 PNG를 저장했습니다.')
    } catch (error) {
      console.error(error)
      setPngExportState('error')
      setToast(error instanceof Error ? error.message : 'PNG 저장에 실패했습니다.')
    } finally {
      window.setTimeout(() => setPngExportState('idle'), 1300)
    }
  }

  function exportIcs() {
    if (!selectedItems.length && !customEvents.length) return
    const sorted: CalendarExportItem[] = [
      ...selectedItems.map(({ film, screening }) => ({ kind: 'screening' as const, date: screening.date, start: screening.start, film, screening })),
      ...customEvents.map((event) => ({ kind: 'custom' as const, date: event.date, start: event.start, event })),
    ].sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`))
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//BIFF Timetable//KO',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:BIFF Timetable',
      'X-WR-TIMEZONE:Asia/Seoul',
    ]

    for (const item of sorted) {
      if (item.kind === 'screening') {
        const { film, screening } = item
        const start = clockMinutes(screening.start)
        const end = screeningEndOffsetMinutes(film, screening)
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
        continue
      }

      const customEvent = item.event
      const description = [customEventCategoryLabel(customEvent.category), customEvent.note].filter(Boolean).join(' · ')
      lines.push(
        'BEGIN:VEVENT',
        `UID:${escapeIcs(customEvent.id)}@biff-timetable`,
        `DTSTART;TZID=Asia/Seoul:${formatIcsDateTime(customEvent.date, clockMinutes(customEvent.start))}`,
        `DTEND;TZID=Asia/Seoul:${formatIcsDateTime(customEvent.date, clockMinutes(customEvent.end))}`,
        `SUMMARY:${escapeIcs(customEvent.title)}`,
        `LOCATION:${escapeIcs(customEvent.location ?? '')}`,
        `DESCRIPTION:${escapeIcs(description)}`,
        'STATUS:CONFIRMED',
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
  const totalTimetableCount = selected.length + customEvents.length
  const defaultCustomDate = dates[0] ?? allDates[0] ?? todayLocal()
  const dialogCustomEvent = customEventDialog?.eventId ? customEvents.find((event) => event.id === customEventDialog.eventId) ?? null : null
  const filmViewActive = activeTab === 'films' && !settingsOpen

  const openFilms = useCallback(() => {
    const target = filmScrollPositionRef.current
    pushNavigationState({ tab: 'films', settingsOpen: false, curatorSlug: null })
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

  const openFilmsFromMenu = useCallback(() => {
    pushNavigationState({ tab: 'films', settingsOpen: false, curatorSlug: null })
    setActiveTab('films')
    setSettingsOpen(false)
    window.setTimeout(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }), 0)
  }, [])

  const openTimetable = useCallback(() => {
    if (filmViewActive) filmScrollPositionRef.current = window.scrollY
    pushNavigationState({ tab: 'timetable', settingsOpen: false, curatorSlug: null })
    setActiveTab('timetable')
    setSettingsOpen(false)
    window.setTimeout(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }), 0)
  }, [filmViewActive])

  const openCurator = useCallback(() => {
    if (filmViewActive) filmScrollPositionRef.current = window.scrollY
    pushNavigationState({ tab: 'curator', settingsOpen: false, curatorSlug: null })
    setActiveTab('curator')
    setSettingsOpen(false)
    setCuratorPageKey((current) => current + 1)
    window.setTimeout(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }), 0)
  }, [filmViewActive])

  const openSettings = useCallback(() => {
    if (filmViewActive) filmScrollPositionRef.current = window.scrollY
    const currentNavigation = readNavigationState()
    pushNavigationState({
      tab: activeTab,
      settingsOpen: true,
      curatorSlug: activeTab === 'curator' ? currentNavigation.curatorSlug : null,
    })
    setSettingsOpen(true)
    window.setTimeout(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }), 0)
  }, [activeTab, filmViewActive])

  return (
    <div className={`app-shell ${activeTab === 'timetable' ? 'timetable-mode' : ''}`}>
      <header className="topbar">
        <div><p className="eyebrow">BUSAN INTERNATIONAL FILM FESTIVAL</p><h1>BIFF Timetable</h1><p className="subtitle">상영작을 고르고 나만의 영화제 시간표를 만드세요.</p></div>
        <div className="selection-count">총 {totalTimetableCount}개 선택</div>
      </header>

      <nav className="tabs" aria-label="주요 메뉴">
        <button className={activeTab === 'films' && !settingsOpen ? 'active' : ''} onClick={openFilmsFromMenu}>영화 찾기</button>
        <button className={activeTab === 'timetable' && !settingsOpen ? 'active' : ''} onClick={openTimetable}>내 시간표</button>
        <button className={activeTab === 'curator' && !settingsOpen ? 'active' : ''} onClick={openCurator}>AI 도슨트</button>
        <button className={`settings-tab-trigger ${settingsOpen ? 'active' : ''}`} onClick={openSettings}>설정</button>
      </nav>

      {activeTab === 'films' && !settingsOpen && dataNote && <div className="notice film-data-notice">{dataNote}{dataSource && <> <a href={dataSource} target="_blank" rel="noreferrer">공식 시간표 ↗</a></>}</div>}
      {loadError && <div className="notice error">{loadError}</div>}
      {toast && <div className="toast" role="status">{toast}</div>}

      {settingsOpen && <main className="biff-settings-panel react-settings-panel">
        <section className="settings-intro"><p className="settings-kicker">PERSONAL SETTINGS</p><h2>설정</h2><p>시간표 계산과 표시 방식을 현재 기기에 맞게 조정할 수 있습니다. 변경사항은 이 브라우저에 자동 저장됩니다.</p></section>
        <section className="settings-card">
          <div className="settings-card-head"><div><h3>이동 시간</h3><p>등록된 BIFF 센텀권 상영관은 실제 출발 → 도착 방향에 따라 정밀 이동시간을 적용합니다.</p></div></div>
          <div className="precise-transfer-panel">
            <strong>방향별 권장 이동시간</strong>
            <div className="travel-matrix-wrap">
              <table className="travel-matrix" aria-label="상영관 방향별 권장 이동시간">
                <thead><tr><th>출발 ↓ / 도착 →</th>{VENUE_TRANSFER_SITES.map((site) => <th key={site.id} title={site.label}>{site.shortLabel}</th>)}</tr></thead>
                <tbody>{VENUE_TRANSFER_SITES.map((from) => <tr key={from.id}><th title={from.label}>{from.shortLabel}</th>{VENUE_TRANSFER_SITES.map((to) => {
                  const minutes = getVenueSiteTransferMinutes(from.id, to.id)
                  return <td key={to.id} title={`${from.label} → ${to.label}`}>{minutes == null ? '—' : `${minutes}분`}</td>
                })}</tr>)}</tbody>
              </table>
            </div>
            <p className="precise-transfer-note">2026 상영시간표의 실제 시설군을 기준으로 도보시간에 휴게 {REST_BREAK_MINUTES}분을 더한 값입니다. 대각선은 같은 시설 안의 다른 관/층 이동 + 휴게 기준이며, 완전히 같은 상영관은 고정 {REST_BREAK_MINUTES}분을 적용합니다.</p>
          </div>
          <div className="settings-list">
            <label className="settings-number-row"><span><strong>미등록 같은 시설</strong><small>새 관명 등으로 정밀 매칭이 되지 않지만 같은 시설로 판단될 때</small></span><span className="settings-number-control"><input type="number" min="0" max="180" step="5" inputMode="numeric" value={userSettings.sameClusterMinutes} onChange={(event) => setUserSettings((current) => ({ ...current, sameClusterMinutes: clampSetting(event.target.value, current.sameClusterMinutes, 180) }))} /><em>분</em></span></label>
            <label className="settings-number-row"><span><strong>미등록 다른 시설</strong><small>정밀 이동시간 데이터에 없는 새로운 상영관 조합의 안전 기본값</small></span><span className="settings-number-control"><input type="number" min="0" max="240" step="5" inputMode="numeric" value={userSettings.differentVenueMinutes} onChange={(event) => setUserSettings((current) => ({ ...current, differentVenueMinutes: clampSetting(event.target.value, current.differentVenueMinutes, 240) }))} /><em>분</em></span></label>
            <label className="settings-toggle-row"><span><strong>이동 여유 경고 표시</strong><small>실제 회차 순서의 출발지 → 도착지 이동시간보다 여유가 짧으면 표시합니다.</small></span><span className="settings-switch"><input type="checkbox" checked={userSettings.showTransferWarnings} onChange={(event) => setUserSettings((current) => ({ ...current, showTransferWarnings: event.target.checked }))} /><i /></span></label>
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
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="제목, 감독, 국가, 장르 검색" aria-label="영화 검색" />
          <div className="filter-row">
            <label><span>날짜</span><select value={dateFilter} onChange={(event) => setDateFilter(event.target.value)}><option value="전체">전체 날짜</option>{allDates.map((date) => <option key={date} value={date}>{formatDate(date)}</option>)}</select></label>
            <label><span>상영관</span><select value={venueFilter} onChange={(event) => setVenueFilter(event.target.value)}><option value="전체">전체 상영관</option>{allVenues.map((venue) => <option key={venue} value={venue}>{venue}</option>)}</select></label>
            <div className="time-range-filter">
              <span>회차 시간대</span>
              <div className="time-range-inputs">
                <input type="time" step="300" value={startTimeFilter} onChange={(event) => setStartTimeFilter(event.target.value)} aria-label="회차 시작 시간부터" />
                <em>~</em>
                <input type="time" step="300" value={endTimeFilter} onChange={(event) => setEndTimeFilter(event.target.value)} aria-label="회차 시작 시간까지" />
              </div>
            </div>
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
            onDetail={(film) => { setDetailScreeningId(null); setDetailFilm(film) }}
            onToggleScreening={toggle}
            onStatusChange={setScreeningTicketStatus}
          />
        ) : !loadError && <div className="empty">조건에 맞는 상영작이 없습니다.</div>}
      </main> : activeTab === 'curator' ? <CuratorPage key={curatorPageKey} onOpenFilms={openFilms} /> : <main className="timetable-page">
        {selectedItems.length === 0 && customEvents.length === 0 ? <div className="empty timetable-empty"><strong>아직 시간표에 일정이 없습니다.</strong><span>영화 회차를 고르거나 직접 일정을 추가해 주세요.</span><div className="timetable-empty-actions"><button onClick={openFilms}>영화 찾기</button><button type="button" className="custom-event-add-button" onClick={openCreateCustomEvent}>+ 일정 추가</button></div></div> : <>
          <div className="timetable-actions enhanced-timetable-actions">
            <div><span className="booking-summary">{timetableSelectionMode ? `삭제할 일정 ${timetableDeleteSelection.length}개 선택` : `예매 완료 ${bookedCount} · 예정 ${plannedCount} · 사용자 일정 ${customEvents.length}`}</span></div>
            <div className="timetable-action-buttons">
              <button type="button" className="custom-event-add-button" onClick={openCreateCustomEvent}>+ 일정</button>
              <button
                type="button"
                className="png-export-trigger"
                title="현재 화면 크기와 무관한 고정 레이아웃으로 시간표 PNG를 저장합니다."
                onClick={() => void savePng()}
                disabled={pngExportState === 'working'}
              >{pngExportState === 'working' ? 'PNG 생성 중…' : pngExportState === 'ready' ? 'PNG 준비 완료' : pngExportState === 'done' ? '저장 완료' : pngExportState === 'error' ? '저장 실패' : 'PNG 저장'}</button>
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
                {selectedItems.filter(({ screening }) => timetableDate(screening) === date).map(({ film, screening }) => {
                  const start = timetableStartMinutes(screening)
                  const end = timetableEndMinutes(film, screening)
                  const top = ((start - START_HOUR * 60) / 60) * timetableMetrics.hourHeight
                  const height = Math.max(((end - start) / 60) * timetableMetrics.hourHeight, timetableMetrics.ultraDense ? 16 : 22)
                  const travel = transitionWarning(film, screening)
                  const timeConflict = conflictingCustomEventsForScreening(film, screening).length > 0
                  const status = ticketStatus[screening.id] ?? 'planned'
                  const statusPrefix = userSettings.showBookingStatusInTimetable ? (status === 'booked' ? '✓ ' : status === 'planned' ? '○ ' : '') : ''
                  const isMarkedForDelete = timetableDeleteSelection.includes(screening.id)
                  return <button
                    type="button"
                    className={`event-block status-${status} ${travel ? 'has-travel-warning' : ''} ${timeConflict ? 'has-time-conflict' : ''} ${timetableSelectionMode ? 'delete-selectable' : ''} ${isMarkedForDelete ? 'selected-for-delete' : ''}`}
                    key={screening.id}
                    style={{ top: `${top}px`, height: `${height}px` }}
                    title={`${film.title} · ${screening.start}–${endLabel(film, screening)} · ${screening.venue}${timeConflict ? ' · 사용자 일정과 시간 겹침' : ''}${travel ? ` · ${travel.routeLabel ? `${travel.routeLabel} · ` : ''}이동 여유 ${travel.gap}분/필요 ${travel.buffer}분${travel.transferDetail ? ` · ${travel.transferDetail}` : ''}` : ''}${timetableSelectionMode ? `\n${isMarkedForDelete ? '삭제 선택됨 · 클릭하여 선택 해제' : '삭제할 일정으로 선택하려면 클릭'}` : '\n클릭하여 상세정보 보기'}`}
                    onClick={() => {
                      if (timetableSelectionMode) {
                        toggleTimetableDeleteSelection(screening.id)
                        return
                      }
                      setDetailScreeningId(screening.id)
                      setDetailFilm(film)
                    }}
                    tabIndex={0}
                    aria-haspopup={timetableSelectionMode ? undefined : 'dialog'}
                    aria-pressed={timetableSelectionMode ? isMarkedForDelete : undefined}
                    aria-label={timetableSelectionMode ? `${film.title} 삭제 ${isMarkedForDelete ? '선택 해제' : '선택'}` : `${film.title} ${formatDate(screening.date)} ${screening.start} 상세정보 보기`}
                  >
                    {timetableSelectionMode && <span className="event-select-indicator" aria-hidden="true">{isMarkedForDelete ? '✓' : ''}</span>}
                    <strong>{statusPrefix}{film.title}</strong>
                    {!timetableMetrics.ultraDense && <span className="event-time">{screening.start}{screening.gv ? ' · GV' : ''}</span>}
                    {userSettings.showVenueInTimetable && !timetableMetrics.dense && <span className="event-venue">{screening.venue}</span>}
                  </button>
                })}
                {customEvents.filter((event) => customEventTimetableDate(event) === date).map((event) => {
                  const start = customEventTimetableStartMinutes(event)
                  const end = customEventTimetableEndMinutes(event)
                  const top = ((start - START_HOUR * 60) / 60) * timetableMetrics.hourHeight
                  const height = Math.max(((end - start) / 60) * timetableMetrics.hourHeight, timetableMetrics.ultraDense ? 16 : 22)
                  const conflict = hasCustomEventConflict(event)
                  const isMarkedForDelete = timetableDeleteSelection.includes(event.id)
                  return <button
                    type="button"
                    className={`event-block custom-event category-${event.category} ${conflict ? 'has-time-conflict' : ''} ${timetableSelectionMode ? 'delete-selectable' : ''} ${isMarkedForDelete ? 'selected-for-delete' : ''}`}
                    key={event.id}
                    style={{ top: `${top}px`, height: `${height}px` }}
                    title={`${event.title} · ${event.start}–${event.end} · ${customEventCategoryLabel(event.category)}${event.location ? ` · ${event.location}` : ''}${conflict ? ' · 다른 일정과 시간 겹침' : ''}${timetableSelectionMode ? `\n${isMarkedForDelete ? '삭제 선택됨 · 클릭하여 선택 해제' : '삭제할 일정으로 선택하려면 클릭'}` : '\n클릭하여 상세정보 보기'}`}
                    onClick={() => {
                      if (timetableSelectionMode) {
                        toggleTimetableDeleteSelection(event.id)
                        return
                      }
                      setCustomEventDialog({ mode: 'detail', eventId: event.id })
                    }}
                    aria-haspopup={timetableSelectionMode ? undefined : 'dialog'}
                    aria-pressed={timetableSelectionMode ? isMarkedForDelete : undefined}
                    aria-label={timetableSelectionMode ? `${event.title} 삭제 ${isMarkedForDelete ? '선택 해제' : '선택'}` : `${event.title} ${formatDate(event.date)} ${event.start} 사용자 일정 상세정보 보기`}
                  >
                    {timetableSelectionMode && <span className="event-select-indicator" aria-hidden="true">{isMarkedForDelete ? '✓' : ''}</span>}
                    <strong>◆ {event.title}</strong>
                    {!timetableMetrics.ultraDense && <span className="event-time">{event.start}–{event.end}</span>}
                    {!timetableMetrics.dense && event.location && <span className="event-venue">{event.location}</span>}
                  </button>
                })}
              </div>)}
            </div>
          </div>
          {userSettings.showTransferWarnings && <p className="transfer-note">이동시간은 2026 센텀권 상영관의 출발 → 도착 도보시간 + 휴게 {REST_BREAK_MINUTES}분 정밀값을 우선 사용합니다. 같은 정확한 관은 고정 {REST_BREAK_MINUTES}분 · 미등록 같은 시설 {userSettings.sameClusterMinutes}분 · 미등록 다른 시설 {userSettings.differentVenueMinutes}분. 사용자 일정은 현재 시간 충돌만 계산합니다.</p>}
        </>}
      </main>)}

      {detailFilm && <div className={`modal-backdrop ${detailScreeningId ? 'timetable-detail-backdrop' : ''}`} onMouseDown={() => { setDetailFilm(null); setDetailScreeningId(null) }}>
        <section className={`film-modal ${detailScreeningId ? 'timetable-detail-modal' : ''}`} role="dialog" aria-modal="true" aria-labelledby="film-detail-title" onMouseDown={(event) => event.stopPropagation()}>
          <div className="modal-head"><div><span className="section-label">{detailFilm.section ?? '섹션 미정'}</span><h2 id="film-detail-title">{detailFilm.title}</h2>{detailFilm.englishTitle && <p>{detailFilm.englishTitle}</p>}</div><button className="modal-close" onClick={() => { setDetailFilm(null); setDetailScreeningId(null) }} aria-label="상세보기 닫기">×</button></div>
          <dl className="film-detail-grid">
            {detailFilm.director && <><dt>감독</dt><dd>{detailFilm.director}</dd></>}
            {detailFilm.country && <><dt>국가</dt><dd>{detailFilm.country}</dd></>}
            {detailFilm.genre && <><dt>장르</dt><dd className="film-detail-genre">{detailFilm.genre}</dd></>}
            {detailFilm.year && <><dt>연도</dt><dd>{detailFilm.year}</dd></>}
            {detailFilm.runtime && <><dt>러닝타임</dt><dd>{detailFilm.runtime}분</dd></>}
            {detailFilm.language && <><dt>언어</dt><dd>{detailFilm.language}</dd></>}
            <dt>상영 회차</dt><dd>{detailFilm.screenings.length}회</dd>
          </dl>
          {detailFilm.synopsis && <p className="synopsis">{detailFilm.synopsis}</p>}
          <div className="modal-screenings">{detailFilm.screenings.map((screening) => {
            const isSelected = selected.includes(screening.id)
            const isCurrentScreening = screening.id === detailScreeningId
            const hasConflict = conflicts(detailFilm, screening)
            const travel = transitionWarning(detailFilm, screening)
            const rowNote = hasConflict
              ? '내 시간표의 다른 일정과 시간이 겹칩니다.'
              : travel
                ? `${travel.routeLabel ? `${travel.routeLabel} · ` : ''}이동 여유 ${travel.gap}분 · 필요 ${travel.buffer}분`
                : ''
            const rowNoteTitle = travel?.transferDetail ? `${rowNote}\n${travel.transferDetail}` : rowNote || undefined
            const rowClassName = [
              isCurrentScreening ? 'current-screening' : '',
              hasConflict ? 'conflict' : '',
              travel ? 'travel-warning' : '',
            ].filter(Boolean).join(' ')
            return <div className={rowClassName} key={screening.id}><div><strong>{screening.code ? `[${screening.code}] ` : ''}{formatDate(screening.date)} {screening.start}{isCurrentScreening && <em className="current-screening-badge">현재 회차</em>}</strong><span>{screening.venue} · {screening.start}–{endLabel(detailFilm, screening)}{screening.gv ? ' · GV' : ''}</span>{rowNote && <small className={`modal-screening-note ${travel ? 'travel-text' : ''}`} title={rowNoteTitle}>{rowNote}</small>}</div><div className="modal-screening-actions">{isSelected && <select className={`ticket-select ${ticketStatus[screening.id] ?? 'planned'}`} value={ticketStatus[screening.id] ?? 'planned'} onChange={(event) => setScreeningTicketStatus(screening.id, event.target.value as TicketStatus)} aria-label={`${detailFilm.title} ${formatDate(screening.date)} ${screening.start} 예매 상태`}><option value="planned">예매 예정</option><option value="booked">예매 완료</option></select>}<button className={isSelected ? 'selected' : ''} onClick={() => toggle(detailFilm, screening)}>{isSelected ? '선택됨' : '+ 추가'}</button></div></div>
          })}</div>
          <div className="modal-footer"><button className={`favorite-button wide ${favorites.includes(detailFilm.id) ? 'active' : ''}`} onClick={() => toggleFavorite(detailFilm.id)}>{favorites.includes(detailFilm.id) ? '★ 관심작 해제' : '☆ 관심작 추가'}</button>{detailFilm.url && <a href={detailFilm.url} target="_blank" rel="noreferrer">BIFF 공식 작품정보 ↗</a>}</div>
        </section>
      </div>}

      {customEventDialog && (customEventDialog.mode === 'create' || dialogCustomEvent) && <CustomEventDialog
        mode={customEventDialog.mode}
        event={dialogCustomEvent}
        defaultDate={defaultCustomDate}
        hasConflict={dialogCustomEvent ? hasCustomEventConflict(dialogCustomEvent) : false}
        onClose={() => setCustomEventDialog(null)}
        onEdit={() => dialogCustomEvent && setCustomEventDialog({ mode: 'edit', eventId: dialogCustomEvent.id })}
        onDelete={deleteCustomEvent}
        onSave={saveCustomEvent}
      />}
    </div>
  )
}
