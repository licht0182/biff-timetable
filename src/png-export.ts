import { toPng } from 'html-to-image'

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

const STORAGE_KEY = 'biff-timetable:selected-screenings:v1'
const TICKET_STATUS_KEY = 'biff-timetable:ticket-status:v1'
const START_HOUR = 8
const END_HOUR = 27
const FALLBACK_RUNTIME = 120
const EXPORT_WIDTH = 1440
const EXPORT_AXIS_WIDTH = 72
const EXPORT_HEADER_HEIGHT = 56
const EXPORT_HOUR_HEIGHT = 58
const EXPORT_EDGE_SPACE = 16

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

function formatDate(date: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date(`${date}T00:00:00`))
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

function transferBufferMinutes(a: string, b: string) {
  if (a === b) return 0
  if (venueCluster(a) === venueCluster(b)) return 10
  return 30
}

function hasTransferWarning(item: ExportItem, items: ExportItem[]) {
  const start = displayStartMinutes(item.screening.start)
  const end = displayEndMinutes(item.film, item.screening)

  return items.some((other) => {
    if (other.screening.id === item.screening.id || other.screening.date !== item.screening.date) return false
    const otherStart = displayStartMinutes(other.screening.start)
    const otherEnd = displayEndMinutes(other.film, other.screening)
    const buffer = transferBufferMinutes(item.screening.venue, other.screening.venue)
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
  const board = element('section', 'png-export-board')
  board.style.setProperty('--png-days', String(Math.max(dates.length, 1)))
  board.style.setProperty('--png-axis-width', `${EXPORT_AXIS_WIDTH}px`)
  board.style.setProperty('--png-header-height', `${EXPORT_HEADER_HEIGHT}px`)
  board.style.setProperty('--png-hour-height', `${EXPORT_HOUR_HEIGHT}px`)
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
  titleGroup.append(element('p', 'png-export-period', `${period} · 선택 ${items.length}회`))
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
  for (let hour = START_HOUR; hour <= END_HOUR; hour += 1) {
    const label = element('span', '', String(hour < 24 ? hour : hour - 24).padStart(2, '0'))
    label.style.top = `${EXPORT_EDGE_SPACE + (hour - START_HOUR) * EXPORT_HOUR_HEIGHT}px`
    axis.append(label)
  }
  grid.append(axis)

  dates.forEach((date) => {
    const column = element('div', 'png-export-day')
    for (let i = 0; i <= END_HOUR - START_HOUR; i += 1) {
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

        const title = element('strong', '', `${statusPrefix}${film.title}`)
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

function downloadDataUrl(filename: string, dataUrl: string) {
  const link = document.createElement('a')
  link.download = filename
  link.href = dataUrl
  document.body.append(link)
  link.click()
  link.remove()
}

async function exportPng(button: HTMLButtonElement) {
  const originalText = button.textContent ?? 'PNG 저장'
  button.disabled = true
  button.textContent = 'PNG 생성 중…'
  let board: HTMLElement | null = null

  try {
    const { items, ticketStatus } = await loadExportItems()
    if (!items.length) throw new Error('저장할 시간표가 없습니다.')

    items.sort((a, b) => `${a.screening.date} ${a.screening.start}`.localeCompare(`${b.screening.date} ${b.screening.start}`))
    board = buildExportBoard(items, ticketStatus)
    document.body.append(board)
    await document.fonts?.ready
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

    const png = await toPng(board, {
      backgroundColor: '#ffffff',
      cacheBust: true,
      pixelRatio: 1.5,
    })
    downloadDataUrl('BIFF-timetable.png', png)
    button.textContent = '저장 완료'
  } catch (error) {
    console.error(error)
    button.textContent = '저장 실패'
  } finally {
    board?.remove()
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
