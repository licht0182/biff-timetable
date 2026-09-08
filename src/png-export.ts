import { toBlob } from 'html-to-image'

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
  runtime?: number
  screenings: Screening[]
}

type FilmData = { films: Film[] }
type TicketStatusMap = Record<string, 'planned' | 'booked'>
type ExportItem = { film: Film; screening: Screening }
type UserTimetableSettings = {
  sameVenueMinutes: number
  sameClusterMinutes: number
  differentVenueMinutes: number
  showTransferWarnings: boolean
}

const STORAGE_KEY = 'biff-timetable:selected-screenings:v1'
const TICKET_STATUS_KEY = 'biff-timetable:ticket-status:v1'
const USER_SETTINGS_KEY = 'biff-timetable:user-settings:v1'
const DEFAULT_USER_SETTINGS: UserTimetableSettings = {
  sameVenueMinutes: 0,
  sameClusterMinutes: 10,
  differentVenueMinutes: 30,
  showTransferWarnings: true,
}
const START_HOUR = 8
const BASE_endHour = 24
const FALLBACK_RUNTIME = 120
const EXPORT_WIDTH = 1440
const EXPORT_AXIS_WIDTH = 72
const EXPORT_HEADER_HEIGHT = 56
const EXPORT_HOUR_HEIGHT = 58
const EXPORT_EDGE_SPACE = 16
const EXPORT_FILENAME = 'BIFF-timetable.png'

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

function displayStartMinutes(time: string) {
  const minutes = toMinutes(time)
  return minutes < START_HOUR * 60 ? minutes + 24 * 60 : minutes
}

function displayEndMinutes(film: Film, screening: Screening) {
  const start = displayStartMinutes(screening.start)
  if (!screening.end) return start + (film.runtime ?? FALLBACK_RUNTIME)

  let end = toMinutes(screening.end)
  while (end <= start) end += 24 * 60
  return end
}

function exportEndHour(items: ExportItem[]) {
  const latestEndMinutes = items.reduce(
    (latest, { film, screening }) => Math.max(latest, displayEndMinutes(film, screening)),
    BASE_endHour * 60,
  )
  return Math.max(BASE_endHour, Math.ceil(latestEndMinutes / 60))
}

function formatDate(date: string) {
  const value = new Date(`${date}T00:00:00`)
  const weekdays = ['일', '월', '화', '수', '목', '금', '토']
  return `${value.getMonth() + 1}월 ${value.getDate()}일 ${weekdays[value.getDay()]}`
}

function formatHourLabel(hour: number) {
  const normalized = hour < 24 ? hour : hour - 24
  return `${String(normalized).padStart(2, '0')}시`
}

function formatClock(minutes: number) {
  const normalized = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60)
  const h = Math.floor(normalized / 60)
  const m = normalized % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function venueCluster(venue: string) {
  if (venue.startsWith('영화의전당')) return '영화의전당'
  if (venue.startsWith('CGV 센텀시티')) return 'CGV 센텀시티'
  if (venue.startsWith('롯데시네마 센텀')) return '롯데시네마 센텀시티'
  if (venue.includes('소향씨어터')) return '소향씨어터'
  return venue
}

function exportUserSettings() {
  const stored = readStorage<Partial<UserTimetableSettings>>(USER_SETTINGS_KEY, DEFAULT_USER_SETTINGS)
  return {
    sameVenueMinutes: Number.isFinite(Number(stored.sameVenueMinutes)) ? Math.max(0, Number(stored.sameVenueMinutes)) : DEFAULT_USER_SETTINGS.sameVenueMinutes,
    sameClusterMinutes: Number.isFinite(Number(stored.sameClusterMinutes)) ? Math.max(0, Number(stored.sameClusterMinutes)) : DEFAULT_USER_SETTINGS.sameClusterMinutes,
    differentVenueMinutes: Number.isFinite(Number(stored.differentVenueMinutes)) ? Math.max(0, Number(stored.differentVenueMinutes)) : DEFAULT_USER_SETTINGS.differentVenueMinutes,
    showTransferWarnings: typeof stored.showTransferWarnings === 'boolean' ? stored.showTransferWarnings : true,
  }
}

function transferBufferMinutes(a: string, b: string, settings: UserTimetableSettings) {
  if (a === b) return settings.sameVenueMinutes
  if (venueCluster(a) === venueCluster(b)) return settings.sameClusterMinutes
  return settings.differentVenueMinutes
}

function hasTransferWarning(item: ExportItem, items: ExportItem[]) {
  const settings = exportUserSettings()
  if (!settings.showTransferWarnings) return false
  const start = displayStartMinutes(item.screening.start)
  const end = displayEndMinutes(item.film, item.screening)

  return items.some((other) => {
    if (other.screening.id === item.screening.id || other.screening.date !== item.screening.date) return false
    const otherStart = displayStartMinutes(other.screening.start)
    const otherEnd = displayEndMinutes(other.film, other.screening)
    const buffer = transferBufferMinutes(item.screening.venue, other.screening.venue, settings)
    if (!buffer) return false

    if (end <= otherStart) return otherStart - end < buffer
    if (otherEnd <= start) return start - otherEnd < buffer
    return false
  })
}

function paletteIndex(id: string) {
  let hash = 0
  for (let i = 0; i < id.length; i += 1) hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0
  return Math.abs(hash) % 8
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function buildExportBoard(items: ExportItem[], ticketStatus: TicketStatusMap) {
  const dates = Array.from(new Set(items.map(({ screening }) => screening.date))).sort()
  const endHour = exportEndHour(items)
  const board = element('section', 'png-export-board')
  board.style.setProperty('--png-days', String(Math.max(dates.length, 1)))
  board.style.setProperty('--png-axis-width', `${EXPORT_AXIS_WIDTH}px`)
  board.style.setProperty('--png-header-height', `${EXPORT_HEADER_HEIGHT}px`)
  board.style.setProperty('--png-hour-height', `${EXPORT_HOUR_HEIGHT}px`)
  board.style.setProperty('--png-hours', String(endHour - START_HOUR))
  board.style.setProperty('--png-edge-space', `${EXPORT_EDGE_SPACE}px`)
  board.style.width = `${EXPORT_WIDTH}px`

  const head = element('header', 'png-export-head')
  const brand = element('div', 'png-export-brand')
  brand.append(element('span', 'png-export-mark', 'BIFF'))
  const titleGroup = element('div', 'png-export-title-group')
  titleGroup.append(element('p', 'png-export-eyebrow', 'BUSAN INTERNATIONAL FILM FESTIVAL'))
  titleGroup.append(element('h1', '', 'MY BIFF TIMETABLE'))
  const period = dates.length
    ? `${formatDate(dates[0])}${dates.length > 1 ? ` – ${formatDate(dates[dates.length - 1])}` : ''}`
    : ''
  titleGroup.append(element('p', 'png-export-period', `${period} · 총 ${items.length}개 선택`))
  brand.append(titleGroup)
  head.append(brand)

  const legend = element('div', 'png-export-legend')
  legend.append(element('span', 'booked', '✓ 예매 완료'))
  legend.append(element('span', 'planned', '○ 예매 예정'))
  legend.append(element('span', '', 'GV 게스트 방문'))
  legend.append(element('span', 'warning', '! 이동 여유 확인'))
  head.append(legend)
  board.append(head)

  const grid = element('div', 'png-export-grid')
  grid.append(element('div', 'png-export-corner'))
  dates.forEach((date) => grid.append(element('div', 'png-export-date', formatDate(date))))

  const axis = element('div', 'png-export-axis')
  for (let hour = START_HOUR; hour <= endHour; hour += 1) {
    const label = element('span', '', formatHourLabel(hour))
    label.style.top = `${EXPORT_EDGE_SPACE + (hour - START_HOUR) * EXPORT_HOUR_HEIGHT}px`
    axis.append(label)
  }
  grid.append(axis)

  dates.forEach((date) => {
    const column = element('div', 'png-export-day')
    for (let i = 0; i <= endHour - START_HOUR; i += 1) {
      const line = element('div', 'png-export-hour-line')
      line.style.top = `${EXPORT_EDGE_SPACE + i * EXPORT_HOUR_HEIGHT}px`
      column.append(line)
    }

    items
      .filter(({ screening }) => screening.date === date)
      .forEach((item) => {
        const { film, screening } = item
        const start = displayStartMinutes(screening.start)
        const end = displayEndMinutes(film, screening)
        const top = EXPORT_EDGE_SPACE + ((start - START_HOUR * 60) / 60) * EXPORT_HOUR_HEIGHT
        const height = Math.max(((end - start) / 60) * EXPORT_HOUR_HEIGHT, 34)
        const status = ticketStatus[screening.id]
        const statusPrefix = status === 'booked' ? '✓ ' : status === 'planned' ? '○ ' : ''
        const event = element('div', `png-export-event palette-${paletteIndex(film.id)}${status ? ` status-${status}` : ''}${hasTransferWarning(item, items) ? ' transfer-warning' : ''}`)
        event.style.top = `${top}px`
        event.style.height = `${height}px`

        const title = element('strong', 'png-export-event-title', `${statusPrefix}${film.title}`)
        const time = element('span', 'png-export-event-time', `${screening.start}–${formatClock(end)}${screening.gv ? ' · GV' : ''}`)
        const venue = element('span', 'png-export-event-venue', screening.venue)
        event.append(title, time, venue)
        column.append(event)
      })

    grid.append(column)
  })

  board.append(grid)

  const footer = element('footer', 'png-export-footer')
  footer.append(element('span', '', 'BIFF Timetable'))
  footer.append(element('span', '', '종료시간이 공식 데이터에 없는 회차는 러닝타임 또는 임시 기준으로 계산될 수 있습니다.'))
  board.append(footer)
  return board
}

function stabilizeExportEventWidths(board: HTMLElement) {
  board.querySelectorAll<HTMLElement>('.png-export-event').forEach((event) => {
    const column = event.parentElement
    if (!column) return
    const width = Math.max(1, column.getBoundingClientRect().width - 10)
    event.style.left = '5px'
    event.style.right = 'auto'
    event.style.width = `${width}px`
  })
}

function fitExportEventTitle(event: HTMLElement) {
  const title = event.querySelector<HTMLElement>('.png-export-event-title')
  if (!title) return

  title.style.removeProperty('font-size')
  event.classList.remove('title-priority')
  if (event.scrollHeight <= event.clientHeight + 1) return

  event.classList.add('title-priority')
  let size = Number.parseFloat(getComputedStyle(title).fontSize)
  const minimum = 5.5

  while (event.scrollHeight > event.clientHeight + 1 && size > minimum) {
    size = Math.max(minimum, size - 0.4)
    title.style.fontSize = `${size}px`
  }
}

function prepareExportBoard(board: HTMLElement) {
  stabilizeExportEventWidths(board)
  board.querySelectorAll<HTMLElement>('.png-export-event').forEach(fitExportEventTitle)
}

async function nextPaint() {
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
}

async function loadExportItems() {
  const selectedIds = readStorage<string[]>(STORAGE_KEY, [])
  if (!selectedIds.length) return { items: [] as ExportItem[], ticketStatus: {} as TicketStatusMap }

  const response = await fetch(`${import.meta.env.BASE_URL}screenings.json?v=png-${Date.now()}`, { cache: 'no-store' })
  if (!response.ok) throw new Error('상영 데이터를 불러오지 못했습니다.')
  const data = await response.json() as FilmData
  const selectedSet = new Set(selectedIds)
  const items = data.films.flatMap((film) => film.screenings
    .filter((screening) => selectedSet.has(screening.id))
    .map((screening) => ({ film, screening })))
  const ticketStatus = readStorage<TicketStatusMap>(TICKET_STATUS_KEY, {})
  return { items, ticketStatus }
}

function isAppleMobile() {
  const userAgent = navigator.userAgent
  const classicIOS = /iPad|iPhone|iPod/.test(userAgent)
  const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  return classicIOS || iPadOS
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.download = filename
  link.href = url
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}

function showAppleSaveSheet(blob: Blob) {
  document.querySelector('.png-ios-overlay')?.remove()

  const url = URL.createObjectURL(blob)
  const file = new File([blob], EXPORT_FILENAME, { type: 'image/png' })
  const overlay = element('div', 'png-ios-overlay')
  const panel = element('section', 'png-ios-panel')
  const head = element('div', 'png-ios-head')
  const titleWrap = element('div')
  titleWrap.append(element('strong', '', 'PNG가 준비되었습니다'))
  titleWrap.append(element('span', '', '아이폰에서는 아래 버튼으로 공유하거나 사진 앱에 저장할 수 있습니다.'))
  const close = element('button', 'png-ios-close', '×') as HTMLButtonElement
  close.type = 'button'
  close.setAttribute('aria-label', 'PNG 저장 창 닫기')
  head.append(titleWrap, close)

  const preview = element('img', 'png-ios-preview') as HTMLImageElement
  preview.src = url
  preview.alt = '내 BIFF 시간표 PNG 미리보기'

  const actions = element('div', 'png-ios-actions')
  const shareButton = element('button', 'png-ios-share', '공유 / 저장') as HTMLButtonElement
  shareButton.type = 'button'
  const tip = element('p', 'png-ios-tip', '공유 메뉴에서 “이미지 저장” 또는 “파일에 저장”을 선택하세요. 이미지를 길게 눌러 저장할 수도 있습니다.')
  actions.append(shareButton)
  panel.append(head, preview, actions, tip)
  overlay.append(panel)
  document.body.append(overlay)

  const closeOverlay = () => {
    overlay.remove()
    URL.revokeObjectURL(url)
  }

  close.addEventListener('click', closeOverlay)
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeOverlay()
  })

  const shareData: ShareData = { files: [file], title: 'BIFF Timetable' }
  const canShareFile = typeof navigator.share === 'function'
    && typeof navigator.canShare === 'function'
    && navigator.canShare(shareData)

  if (canShareFile) {
    shareButton.addEventListener('click', async () => {
      try {
        await navigator.share(shareData)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        console.error(error)
      }
    })
  } else {
    shareButton.textContent = '이미지 크게 보기'
    shareButton.addEventListener('click', () => {
      window.open(url, '_blank')
    })
    tip.textContent = '이미지를 길게 누른 뒤 “사진에 저장”을 선택하세요.'
  }
}

async function exportPng(button: HTMLButtonElement) {
  const originalText = button.textContent ?? 'PNG 저장'
  button.disabled = true
  button.textContent = 'PNG 생성 중…'
  let host: HTMLElement | null = null

  try {
    const { items, ticketStatus } = await loadExportItems()
    if (!items.length) throw new Error('저장할 시간표가 없습니다.')

    items.sort((a, b) => `${a.screening.date} ${a.screening.start}`.localeCompare(`${b.screening.date} ${b.screening.start}`))
    const board = buildExportBoard(items, ticketStatus)
    host = element('div', 'png-export-host')
    host.append(board)
    document.body.append(host)

    await document.fonts?.ready
    await nextPaint()
    prepareExportBoard(board)
    await nextPaint()

    const blob = await toBlob(board, {
      backgroundColor: '#ffffff',
      cacheBust: true,
      pixelRatio: 1.5,
      width: board.scrollWidth,
      height: board.scrollHeight,
    })
    if (!blob) throw new Error('PNG 이미지를 만들지 못했습니다.')

    if (isAppleMobile()) {
      showAppleSaveSheet(blob)
      button.textContent = 'PNG 준비 완료'
    } else {
      downloadBlob(EXPORT_FILENAME, blob)
      button.textContent = '저장 완료'
    }
  } catch (error) {
    console.error(error)
    button.textContent = '저장 실패'
  } finally {
    host?.remove()
    window.setTimeout(() => {
      button.disabled = false
      button.textContent = originalText
    }, 1300)
  }
}

function ensurePngButton() {
  const actions = document.querySelector<HTMLElement>('.timetable-action-buttons')
  if (!actions || actions.querySelector('.png-export-trigger')) return

  const button = element('button', 'png-export-trigger', 'PNG 저장') as HTMLButtonElement
  button.type = 'button'
  button.title = '현재 화면 크기와 무관한 고정 레이아웃으로 시간표 PNG를 저장합니다.'
  button.addEventListener('click', () => void exportPng(button))
  actions.prepend(button)
}

function initPngExport() {
  ensurePngButton()
  const observer = new MutationObserver(ensurePngButton)
  observer.observe(document.body, { childList: true, subtree: true })
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initPngExport, { once: true })
else initPngExport()
