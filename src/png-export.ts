import { toBlob } from 'html-to-image'
import type { Film, Screening, TicketStatusMap } from './components/film-types'
import { customEventAbsoluteWindow, customEventCategoryLabel, customEventTimetableDate, customEventTimetableEndMinutes, customEventTimetableStartMinutes, windowsOverlap, type CustomEvent } from './custom-events'
import { BASE_END_HOUR, START_HOUR, screeningAbsoluteWindow, timetableDate, timetableEndMinutes, timetableStartMinutes } from './screening-time'
import { getTransferBuffer, type TransferSettings } from './transfer-buffer'

type ExportItem = { film: Film; screening: Screening }
export type PngExportSettings = TransferSettings & {
  showTransferWarnings: boolean
}

const EXPORT_WIDTH = 1440
const EXPORT_AXIS_WIDTH = 72
const EXPORT_HEADER_HEIGHT = 56
const EXPORT_HOUR_HEIGHT = 58
const EXPORT_EDGE_SPACE = 16
const EXPORT_FILENAME = 'BIFF-timetable.png'

function exportEndHour(items: ExportItem[], customEvents: readonly CustomEvent[]) {
  const screeningEnd = items.reduce(
    (latest, { film, screening }) => Math.max(latest, timetableEndMinutes(film, screening)),
    BASE_END_HOUR * 60,
  )
  const customEnd = customEvents.reduce(
    (latest, event) => Math.max(latest, customEventTimetableEndMinutes(event)),
    screeningEnd,
  )
  return Math.max(BASE_END_HOUR, Math.ceil(customEnd / 60))
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

function hasTransferWarning(item: ExportItem, items: ExportItem[], settings: PngExportSettings) {
  if (!settings.showTransferWarnings) return false
  const current = screeningAbsoluteWindow(item.film, item.screening)

  return items.some((other) => {
    if (other.screening.id === item.screening.id) return false
    const otherWindow = screeningAbsoluteWindow(other.film, other.screening)

    if (current.end <= otherWindow.start) {
      const transfer = getTransferBuffer(item.screening.venue, other.screening.venue, settings)
      return transfer.minutes > 0 && otherWindow.start - current.end < transfer.minutes
    }
    if (otherWindow.end <= current.start) {
      const transfer = getTransferBuffer(other.screening.venue, item.screening.venue, settings)
      return transfer.minutes > 0 && current.start - otherWindow.end < transfer.minutes
    }
    return false
  })
}

function screeningHasCustomConflict(item: ExportItem, customEvents: readonly CustomEvent[]) {
  const current = screeningAbsoluteWindow(item.film, item.screening)
  return customEvents.some((event) => windowsOverlap(current, customEventAbsoluteWindow(event)))
}

function customEventHasConflict(event: CustomEvent, items: ExportItem[], customEvents: readonly CustomEvent[]) {
  const current = customEventAbsoluteWindow(event)
  if (items.some((item) => windowsOverlap(current, screeningAbsoluteWindow(item.film, item.screening)))) return true
  return customEvents.some((other) => other.id !== event.id && windowsOverlap(current, customEventAbsoluteWindow(other)))
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

function buildExportBoard(items: ExportItem[], ticketStatus: TicketStatusMap, settings: PngExportSettings, customEvents: readonly CustomEvent[]) {
  const dates = Array.from(new Set([
    ...items.map(({ screening }) => timetableDate(screening)),
    ...customEvents.map((event) => customEventTimetableDate(event)),
  ])).sort()
  const endHour = exportEndHour(items, customEvents)
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
  titleGroup.append(element('p', 'png-export-period', `${period} · 총 ${items.length + customEvents.length}개 일정`))
  brand.append(titleGroup)
  head.append(brand)

  const legend = element('div', 'png-export-legend')
  legend.append(element('span', 'booked', '✓ 예매 완료'))
  legend.append(element('span', 'planned', '○ 예매 예정'))
  legend.append(element('span', '', 'GV 게스트 방문'))
  legend.append(element('span', 'custom', '◆ 사용자 일정'))
  legend.append(element('span', 'warning', '! 충돌/이동 확인'))
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
      .filter(({ screening }) => timetableDate(screening) === date)
      .forEach((item) => {
        const { film, screening } = item
        const start = timetableStartMinutes(screening)
        const end = timetableEndMinutes(film, screening)
        const top = EXPORT_EDGE_SPACE + ((start - START_HOUR * 60) / 60) * EXPORT_HOUR_HEIGHT
        const height = Math.max(((end - start) / 60) * EXPORT_HOUR_HEIGHT, 34)
        const status = ticketStatus[screening.id]
        const statusPrefix = status === 'booked' ? '✓ ' : status === 'planned' ? '○ ' : ''
        const event = element('div', `png-export-event palette-${paletteIndex(film.id)}${status ? ` status-${status}` : ''}${hasTransferWarning(item, items, settings) ? ' transfer-warning' : ''}${screeningHasCustomConflict(item, customEvents) ? ' time-conflict' : ''}`)
        event.style.top = `${top}px`
        event.style.height = `${height}px`

        const title = element('strong', 'png-export-event-title', `${statusPrefix}${film.title}`)
        const time = element('span', 'png-export-event-time', `${screening.start}–${formatClock(end)}${screening.gv ? ' · GV' : ''}`)
        const venue = element('span', 'png-export-event-venue', screening.venue)
        event.append(title, time, venue)
        column.append(event)
      })

    customEvents
      .filter((customEvent) => customEventTimetableDate(customEvent) === date)
      .forEach((customEvent) => {
        const start = customEventTimetableStartMinutes(customEvent)
        const end = customEventTimetableEndMinutes(customEvent)
        const top = EXPORT_EDGE_SPACE + ((start - START_HOUR * 60) / 60) * EXPORT_HOUR_HEIGHT
        const height = Math.max(((end - start) / 60) * EXPORT_HOUR_HEIGHT, 34)
        const conflict = customEventHasConflict(customEvent, items, customEvents)
        const event = element('div', `png-export-event custom-event category-${customEvent.category}${conflict ? ' time-conflict' : ''}`)
        event.style.top = `${top}px`
        event.style.height = `${height}px`
        event.append(
          element('strong', 'png-export-event-title', `◆ ${customEvent.title}`),
          element('span', 'png-export-event-time', `${customEvent.start}–${customEvent.end} · ${customEventCategoryLabel(customEvent.category)}`),
        )
        if (customEvent.location) event.append(element('span', 'png-export-event-venue', customEvent.location))
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

export async function exportTimetablePng(
  sourceItems: readonly ExportItem[],
  ticketStatus: TicketStatusMap,
  settings: PngExportSettings,
  customEvents: readonly CustomEvent[] = [],
): Promise<'apple-ready' | 'downloaded'> {
  if (!sourceItems.length && !customEvents.length) throw new Error('저장할 시간표가 없습니다.')

  const items = [...sourceItems].sort((a, b) => (
    screeningAbsoluteWindow(a.film, a.screening).start - screeningAbsoluteWindow(b.film, b.screening).start
  ))
  const sortedCustomEvents = [...customEvents].sort((a, b) => customEventAbsoluteWindow(a).start - customEventAbsoluteWindow(b).start)
  let host: HTMLElement | null = null

  try {
    const board = buildExportBoard(items, ticketStatus, settings, sortedCustomEvents)
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
      return 'apple-ready'
    }

    downloadBlob(EXPORT_FILENAME, blob)
    return 'downloaded'
  } finally {
    host?.remove()
  }
}
