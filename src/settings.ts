type SettingsScreening = {
  id: string
  date: string
  start: string
  end?: string
  venue: string
  code?: string
}

type SettingsFilm = {
  id: string
  title: string
  runtime?: number
  screenings: SettingsScreening[]
}

type SettingsFilmData = { films: SettingsFilm[] }
type SelectedSettingsItem = { film: SettingsFilm; screening: SettingsScreening }

type UserTimetableSettings = {
  sameVenueMinutes: number
  sameClusterMinutes: number
  differentVenueMinutes: number
  showTransferWarnings: boolean
  showVenueInTimetable: boolean
  showBookingStatusInTimetable: boolean
}

const USER_SETTINGS_KEY = 'biff-timetable:user-settings:v1'
const SELECTED_KEY = 'biff-timetable:selected-screenings:v1'
const TICKET_STATUS_KEY = 'biff-timetable:ticket-status:v1'
const SETTINGS_FALLBACK_RUNTIME = 120
const SETTINGS_START_HOUR = 8

const DEFAULT_USER_SETTINGS: UserTimetableSettings = {
  sameVenueMinutes: 0,
  sameClusterMinutes: 10,
  differentVenueMinutes: 30,
  showTransferWarnings: true,
  showVenueInTimetable: true,
  showBookingStatusInTimetable: true,
}

let settingsOpen = false
let applyTimer = 0
let dataPromise: Promise<SettingsFilmData> | null = null

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : fallback
  } catch {
    return fallback
  }
}

function clampMinutes(value: unknown, fallback: number, max: number) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.max(0, Math.min(max, Math.round(number)))
}

function normalizeSettings(value: unknown): UserTimetableSettings {
  const source = value && typeof value === 'object' ? value as Partial<UserTimetableSettings> : {}
  return {
    sameVenueMinutes: clampMinutes(source.sameVenueMinutes, DEFAULT_USER_SETTINGS.sameVenueMinutes, 120),
    sameClusterMinutes: clampMinutes(source.sameClusterMinutes, DEFAULT_USER_SETTINGS.sameClusterMinutes, 180),
    differentVenueMinutes: clampMinutes(source.differentVenueMinutes, DEFAULT_USER_SETTINGS.differentVenueMinutes, 240),
    showTransferWarnings: typeof source.showTransferWarnings === 'boolean' ? source.showTransferWarnings : DEFAULT_USER_SETTINGS.showTransferWarnings,
    showVenueInTimetable: typeof source.showVenueInTimetable === 'boolean' ? source.showVenueInTimetable : DEFAULT_USER_SETTINGS.showVenueInTimetable,
    showBookingStatusInTimetable: typeof source.showBookingStatusInTimetable === 'boolean' ? source.showBookingStatusInTimetable : DEFAULT_USER_SETTINGS.showBookingStatusInTimetable,
  }
}

function getSettings() {
  return normalizeSettings(readJson(USER_SETTINGS_KEY, DEFAULT_USER_SETTINGS))
}

function saveSettings(settings: UserTimetableSettings) {
  localStorage.setItem(USER_SETTINGS_KEY, JSON.stringify(normalizeSettings(settings)))
  syncSettingsControls()
  scheduleApply()
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

function toMinutes(time: string) {
  const [hour, minute] = time.split(':').map(Number)
  const value = hour * 60 + minute
  return value < SETTINGS_START_HOUR * 60 ? value + 24 * 60 : value
}

function endMinutes(film: SettingsFilm, screening: SettingsScreening) {
  const start = toMinutes(screening.start)
  if (!screening.end) return start + (film.runtime ?? SETTINGS_FALLBACK_RUNTIME)
  let end = toMinutes(screening.end)
  while (end <= start) end += 24 * 60
  return end
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short' }).format(new Date(`${date}T00:00:00`))
}

async function loadFilmData() {
  if (!dataPromise) {
    dataPromise = fetch(`${import.meta.env.BASE_URL}screenings.json?v=settings-${Date.now()}`, { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error('상영 데이터를 불러오지 못했습니다.')
        return response.json() as Promise<SettingsFilmData>
      })
      .catch((error) => {
        dataPromise = null
        throw error
      })
  }
  return dataPromise
}

function selectedItems(data: SettingsFilmData) {
  const selected = new Set(readJson<string[]>(SELECTED_KEY, []))
  return data.films.flatMap((film) => film.screenings
    .filter((screening) => selected.has(screening.id))
    .map((screening) => ({ film, screening })))
}

function buildWarningMap(items: SelectedSettingsItem[], settings: UserTimetableSettings) {
  const warnings = new Map<string, { gap: number; buffer: number }>()
  if (!settings.showTransferWarnings) return warnings

  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const a = items[i]
      const b = items[j]
      if (a.screening.date !== b.screening.date) continue

      const aStart = toMinutes(a.screening.start)
      const aEnd = endMinutes(a.film, a.screening)
      const bStart = toMinutes(b.screening.start)
      const bEnd = endMinutes(b.film, b.screening)
      const buffer = transferBufferMinutes(a.screening.venue, b.screening.venue, settings)
      if (buffer <= 0) continue

      let gap: number | null = null
      if (aEnd <= bStart) gap = bStart - aEnd
      else if (bEnd <= aStart) gap = aStart - bEnd
      if (gap === null || gap >= buffer) continue

      const existingA = warnings.get(a.screening.id)
      const existingB = warnings.get(b.screening.id)
      if (!existingA || gap < existingA.gap) warnings.set(a.screening.id, { gap, buffer })
      if (!existingB || gap < existingB.gap) warnings.set(b.screening.id, { gap, buffer })
    }
  }

  return warnings
}

function screeningIndexes(data: SettingsFilmData) {
  const byCode = new Map<string, string>()
  const byId = new Map<string, SelectedSettingsItem>()
  for (const film of data.films) {
    for (const screening of film.screenings) {
      if (screening.code) byCode.set(String(screening.code), screening.id)
      byId.set(screening.id, { film, screening })
    }
  }
  return { byCode, byId }
}

function resolveFilmRowId(row: Element, data: SettingsFilmData, byCode: Map<string, string>) {
  const strongText = row.querySelector('strong')?.textContent?.trim() ?? ''
  const code = strongText.match(/^\[([^\]]+)\]/)?.[1]
  if (code && byCode.has(code)) return byCode.get(code) ?? null

  const title = row.closest('.film-card')?.querySelector('h2')?.textContent?.trim()
  const detail = row.querySelector('span')?.textContent?.trim() ?? ''
  const start = strongText.match(/(\d{2}:\d{2})/)?.[1]
  const venue = detail.split(' · ')[0]?.trim()
  if (!title || !start) return null

  const film = data.films.find((candidate) => candidate.title === title)
  if (!film) return null
  const candidates = film.screenings.filter((screening) => screening.start === start && (!venue || screening.venue === venue))
  if (candidates.length === 1) return candidates[0].id
  const dated = candidates.find((screening) => strongText.includes(formatDate(screening.date)))
  return dated?.id ?? null
}

function resolveTimetableEventId(event: HTMLElement, items: SelectedSettingsItem[], dates: string[]) {
  const column = event.closest('.day-column')
  const timetable = event.closest('.timetable') as HTMLElement | null
  if (!column || !timetable) return null
  const columns = Array.from(timetable.querySelectorAll('.day-column'))
  const date = dates[columns.indexOf(column)]
  if (!date) return null

  const rawTitle = event.querySelector('strong')?.textContent?.trim() ?? ''
  const title = rawTitle.replace(/^[✓○]\s*/, '')
  let start = event.querySelector('.event-time')?.textContent?.match(/\d{2}:\d{2}/)?.[0]

  if (!start) {
    const top = parseFloat(event.style.top)
    const hourHeight = parseFloat(getComputedStyle(timetable).getPropertyValue('--hour-height'))
    if (Number.isFinite(top) && Number.isFinite(hourHeight) && hourHeight > 0) {
      const minutes = Math.round(SETTINGS_START_HOUR * 60 + (top / hourHeight) * 60)
      const normalized = minutes % (24 * 60)
      start = `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`
    }
  }

  const candidates = items.filter(({ film, screening }) => film.title === title && screening.date === date)
  if (!start) return candidates.length === 1 ? candidates[0].screening.id : null
  return candidates.find(({ screening }) => screening.start === start)?.screening.id ?? null
}

function ticketPrefix(screeningId: string) {
  const statuses = readJson<Record<string, 'planned' | 'booked'>>(TICKET_STATUS_KEY, {})
  return statuses[screeningId] === 'booked' ? '✓ ' : statuses[screeningId] === 'planned' ? '○ ' : ''
}

function updateBodyDisplayClasses(settings: UserTimetableSettings) {
  document.body.classList.toggle('biff-hide-timetable-venues', !settings.showVenueInTimetable)
}

function patchFilmRows(data: SettingsFilmData, warningMap: Map<string, { gap: number; buffer: number }>, settings: UserTimetableSettings) {
  const { byCode } = screeningIndexes(data)
  document.querySelectorAll('.screening-row').forEach((row) => {
    const screeningId = resolveFilmRowId(row, data, byCode)
    row.querySelectorAll('small.travel-text:not(.settings-travel-text)').forEach((node) => node.remove())
    const existing = row.querySelector<HTMLElement>('small.settings-travel-text')

    if (!screeningId || row.classList.contains('conflict') || !settings.showTransferWarnings) {
      row.classList.remove('travel-warning')
      existing?.remove()
      return
    }

    const warning = warningMap.get(screeningId)
    if (!warning) {
      row.classList.remove('travel-warning')
      existing?.remove()
      return
    }

    row.classList.add('travel-warning')
    const text = `이동 여유 ${warning.gap}분 · 설정 기준 ${warning.buffer}분`
    if (existing) existing.textContent = text
    else {
      const small = document.createElement('small')
      small.className = 'travel-text settings-travel-text'
      small.textContent = text
      row.querySelector('.screening-row > div')?.append(small)
    }
  })
}

function patchTimetableEvents(items: SelectedSettingsItem[], warningMap: Map<string, { gap: number; buffer: number }>, settings: UserTimetableSettings) {
  const dates = Array.from(new Set(items.map(({ screening }) => screening.date))).sort()
  document.querySelectorAll<HTMLElement>('.event-block').forEach((event) => {
    const screeningId = resolveTimetableEventId(event, items, dates)
    if (!screeningId) return
    const item = items.find(({ screening }) => screening.id === screeningId)
    if (!item) return

    const warning = warningMap.get(screeningId)
    event.classList.toggle('has-travel-warning', Boolean(settings.showTransferWarnings && warning))

    const strong = event.querySelector('strong')
    if (strong) strong.textContent = `${settings.showBookingStatusInTimetable ? ticketPrefix(screeningId) : ''}${item.film.title}`

    const cleanTitle = (event.getAttribute('title') ?? '')
      .replace(/ · 이동 여유 \d+분\/권장 \d+분/g, '')
      .replace(/ · 이동 여유 \d+분\/설정 기준 \d+분/g, '')
      .replace(/\n클릭하면 시간표에서 제거됩니다\.?/g, '')
    event.setAttribute('title', settings.showTransferWarnings && warning
      ? `${cleanTitle} · 이동 여유 ${warning.gap}분/설정 기준 ${warning.buffer}분`
      : cleanTitle)
  })
}

function patchTransferNote(settings: UserTimetableSettings) {
  document.querySelectorAll<HTMLElement>('.transfer-note').forEach((note) => {
    if (!settings.showTransferWarnings) {
      note.style.display = 'none'
      return
    }
    note.style.display = ''
    note.textContent = `이동 여유 경고 기준: 동일 상영관 ${settings.sameVenueMinutes}분 · 같은 상영관군 ${settings.sameClusterMinutes}분 · 다른 상영관 ${settings.differentVenueMinutes}분. 설정에서 변경할 수 있습니다.`
  })
}

function patchPngBoard(board: HTMLElement, items: SelectedSettingsItem[], warningMap: Map<string, { gap: number; buffer: number }>, settings: UserTimetableSettings) {
  const dates = Array.from(new Set(items.map(({ screening }) => screening.date))).sort()
  const columns = Array.from(board.querySelectorAll<HTMLElement>('.png-export-day'))
  columns.forEach((column, columnIndex) => {
    const date = dates[columnIndex]
    column.querySelectorAll<HTMLElement>('.png-export-event').forEach((event) => {
      const rawTitle = event.querySelector('strong')?.textContent?.trim() ?? ''
      const title = rawTitle.replace(/^[✓○]\s*/, '')
      const start = event.querySelector('.png-export-event-time')?.textContent?.match(/\d{2}:\d{2}/)?.[0]
      const venue = event.querySelector('.png-export-event-venue')?.textContent?.trim()
      const item = items.find(({ film, screening }) => film.title === title && screening.date === date && (!start || screening.start === start) && (!venue || screening.venue === venue))
      if (!item) return
      event.classList.toggle('transfer-warning', Boolean(settings.showTransferWarnings && warningMap.get(item.screening.id)))
    })
  })
}

async function applySettingsToApp() {
  try {
    const settings = getSettings()
    updateBodyDisplayClasses(settings)
    const data = await loadFilmData()
    const items = selectedItems(data)
    const warningMap = buildWarningMap(items, settings)
    patchFilmRows(data, warningMap, settings)
    patchTimetableEvents(items, warningMap, settings)
    patchTransferNote(settings)
    document.querySelectorAll<HTMLElement>('.png-export-board').forEach((board) => patchPngBoard(board, items, warningMap, settings))
  } catch (error) {
    console.error('BIFF settings apply failed', error)
  }
}

function scheduleApply() {
  window.clearTimeout(applyTimer)
  applyTimer = window.setTimeout(() => void applySettingsToApp(), 45)
}

function settingNumberRow(key: 'sameVenueMinutes' | 'sameClusterMinutes' | 'differentVenueMinutes', title: string, description: string, max: number) {
  const label = document.createElement('label')
  label.className = 'settings-number-row'
  label.innerHTML = `<span><strong>${title}</strong><small>${description}</small></span><span class="settings-number-control"><input type="number" min="0" max="${max}" step="5" inputmode="numeric" data-setting="${key}" aria-label="${title}"><em>분</em></span>`
  return label
}

function settingToggleRow(key: 'showTransferWarnings' | 'showVenueInTimetable' | 'showBookingStatusInTimetable', title: string, description: string) {
  const label = document.createElement('label')
  label.className = 'settings-toggle-row'
  label.innerHTML = `<span><strong>${title}</strong><small>${description}</small></span><span class="settings-switch"><input type="checkbox" data-setting="${key}" aria-label="${title}"><i></i></span>`
  return label
}

function buildSettingsPanel() {
  const panel = document.createElement('main')
  panel.className = 'biff-settings-panel'
  panel.innerHTML = `<section class="settings-intro"><p class="settings-kicker">PERSONAL SETTINGS</p><h2>설정</h2><p>시간표 계산과 표시 방식을 현재 기기에 맞게 조정할 수 있습니다. 변경사항은 이 브라우저에 자동 저장됩니다.</p></section>`

  const travelCard = document.createElement('section')
  travelCard.className = 'settings-card'
  travelCard.innerHTML = `<div class="settings-card-head"><div><h3>이동 시간</h3><p>연속 상영 사이에 필요한 최소 이동 여유를 정합니다.</p></div></div>`
  const travelList = document.createElement('div')
  travelList.className = 'settings-list'
  travelList.append(
    settingNumberRow('sameVenueMinutes', '동일 상영관', '같은 관에서 다음 상영을 볼 때 필요한 여유', 120),
    settingNumberRow('sameClusterMinutes', '같은 상영관군', '영화의전당 내부처럼 같은 건물군에서 관을 이동할 때', 180),
    settingNumberRow('differentVenueMinutes', '서로 다른 상영관', 'CGV ↔ 영화의전당처럼 상영관군이 달라질 때', 240),
    settingToggleRow('showTransferWarnings', '이동 여유 경고 표시', '설정한 시간보다 여유가 짧은 연속 상영을 표시합니다.'),
  )
  travelCard.append(travelList)

  const displayCard = document.createElement('section')
  displayCard.className = 'settings-card'
  displayCard.innerHTML = `<div class="settings-card-head"><div><h3>시간표 표시</h3><p>작은 화면에서 필요한 정보만 남길 수 있습니다.</p></div></div>`
  const displayList = document.createElement('div')
  displayList.className = 'settings-list'
  displayList.append(
    settingToggleRow('showVenueInTimetable', '상영관명 표시', '내 시간표 영화 블록 안에 상영관명을 표시합니다.'),
    settingToggleRow('showBookingStatusInTimetable', '예매 상태 기호 표시', '예매 완료 ✓, 예매 예정 ○ 기호를 영화 제목 앞에 표시합니다.'),
  )
  displayCard.append(displayList)

  const resetCard = document.createElement('section')
  resetCard.className = 'settings-card settings-reset-card'
  resetCard.innerHTML = `<div><h3>기본 설정</h3><p>이동 시간과 표시 설정을 처음 값으로 되돌립니다.</p></div><button type="button" class="settings-reset-button">기본값으로 초기화</button>`

  panel.append(travelCard, displayCard, resetCard)

  panel.addEventListener('input', (event) => {
    const input = event.target as HTMLInputElement
    const key = input.dataset.setting as keyof UserTimetableSettings | undefined
    if (!key) return
    const current = getSettings()
    if (input.type === 'checkbox') {
      ;(current[key] as boolean) = input.checked
    } else {
      const max = Number(input.max) || 240
      ;(current[key] as number) = clampMinutes(input.value, current[key] as number, max)
    }
    saveSettings(current)
  })

  panel.querySelector('.settings-reset-button')?.addEventListener('click', () => {
    saveSettings({ ...DEFAULT_USER_SETTINGS })
  })

  return panel
}

function syncSettingsControls() {
  const panel = document.querySelector<HTMLElement>('.biff-settings-panel')
  if (!panel) return
  const settings = getSettings()
  panel.querySelectorAll<HTMLInputElement>('[data-setting]').forEach((input) => {
    const key = input.dataset.setting as keyof UserTimetableSettings
    const value = settings[key]
    if (input.type === 'checkbox') input.checked = Boolean(value)
    else input.value = String(value)
  })
}

function setSettingsOpen(open: boolean) {
  settingsOpen = open
  document.body.classList.toggle('biff-settings-open', settingsOpen)
  const trigger = document.querySelector('.settings-tab-trigger')
  trigger?.classList.toggle('active', settingsOpen)
  syncSettingsControls()
}

function ensureSettingsUi() {
  const tabs = document.querySelector<HTMLElement>('.tabs')
  if (!tabs) return

  let trigger = tabs.querySelector<HTMLButtonElement>('.settings-tab-trigger')
  if (!trigger) {
    trigger = document.createElement('button')
    trigger.type = 'button'
    trigger.className = 'settings-tab-trigger'
    trigger.textContent = '설정'
    trigger.addEventListener('click', () => setSettingsOpen(true))
    tabs.append(trigger)
  }
  trigger.classList.toggle('active', settingsOpen)

  const shell = tabs.closest<HTMLElement>('.app-shell')
  if (shell && !shell.querySelector('.biff-settings-panel')) {
    const panel = buildSettingsPanel()
    tabs.insertAdjacentElement('afterend', panel)
    syncSettingsControls()
  }
}

function initSettings() {
  ensureSettingsUi()
  syncSettingsControls()
  scheduleApply()

  document.addEventListener('click', (event) => {
    const target = event.target as Element | null
    const tabButton = target?.closest('.tabs button')
    if (tabButton && !tabButton.classList.contains('settings-tab-trigger')) setSettingsOpen(false)
  }, true)

  const observer = new MutationObserver((mutations) => {
    ensureSettingsUi()
    const pngAdded = mutations.some((mutation) => Array.from(mutation.addedNodes).some((node) => node instanceof Element && (node.matches('.png-export-board, .png-export-host') || node.querySelector?.('.png-export-board'))))
    if (pngAdded) void applySettingsToApp()
    else scheduleApply()
  })
  observer.observe(document.body, { childList: true, subtree: true })

  window.addEventListener('storage', (event) => {
    if ([USER_SETTINGS_KEY, SELECTED_KEY, TICKET_STATUS_KEY].includes(event.key ?? '')) {
      syncSettingsControls()
      scheduleApply()
    }
  })
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initSettings, { once: true })
else initSettings()
