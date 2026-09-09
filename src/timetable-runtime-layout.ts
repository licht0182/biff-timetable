import { assignTimetableLanes } from './timetable-layout'

const BASE_START_HOUR = 8
const MINUTES_PER_DAY = 24 * 60

function setStyleProperty(element: HTMLElement, name: string, value: string) {
  if (element.style.getPropertyValue(name) !== value) element.style.setProperty(name, value)
}

function setDataset(element: HTMLElement, key: string, value: string) {
  if (element.dataset[key] !== value) element.dataset[key] = value
}

function formatHour(hour: number) {
  const normalized = ((hour % 24) + 24) % 24
  return `${String(normalized).padStart(2, '0')}시`
}

function parseClock(text: string) {
  const match = text.match(/(\d{2}):(\d{2})/)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
  return hour * 60 + minute
}

function displayExtendedRange(element: HTMLElement, timeSelector: string) {
  const time = element.querySelector<HTMLElement>(timeSelector)
  if (!time) return
  const text = time.textContent ?? ''
  const match = text.match(/(\d{2}:\d{2})–(\d{2,}:\d{2})/)
  if (!match) return

  const [rawHour, rawMinute] = match[2].split(':').map(Number)
  if (!Number.isFinite(rawHour) || rawHour < 24) return
  const normalizedHour = rawHour % 24
  const normalizedEnd = `${String(normalizedHour).padStart(2, '0')}:${String(rawMinute).padStart(2, '0')}`
  const displayRange = `${match[1]}–${normalizedEnd} (다음 날)`
  const nextText = text.replace(match[0], displayRange)
  if (time.textContent !== nextText) time.textContent = nextText

  const title = element.getAttribute('title')
  if (title?.includes(match[0])) element.setAttribute('title', title.replace(match[0], displayRange))
}

function applyLanes(container: ParentNode, blockSelector: string) {
  const blocks = Array.from(container.querySelectorAll<HTMLElement>(blockSelector))
  const intervals = blocks.map((block) => {
    const start = Number.parseFloat(block.style.top)
    const height = Number.parseFloat(block.style.height)
    return { value: block, start, end: start + height }
  })
  const placements = assignTimetableLanes(intervals)
  const placed = new Set(placements.map(({ value }) => value))

  for (const placement of placements) {
    const { value: block, lane, laneCount } = placement
    setDataset(block, 'runtimeLane', `${lane + 1}/${laneCount}`)
    setStyleProperty(block, '--runtime-lane-start', `${(lane / laneCount) * 100}%`)
    setStyleProperty(block, '--runtime-lane-width', `${100 / laneCount}%`)
  }

  for (const block of blocks) {
    if (placed.has(block)) continue
    if (block.dataset.runtimeLane) delete block.dataset.runtimeLane
    block.style.removeProperty('--runtime-lane-start')
    block.style.removeProperty('--runtime-lane-width')
  }
}

function earliestCustomStart(root: ParentNode, blockSelector: string, timeSelector: string) {
  let earliest = MINUTES_PER_DAY
  for (const block of root.querySelectorAll<HTMLElement>(blockSelector)) {
    const text = block.querySelector<HTMLElement>(timeSelector)?.textContent ?? ''
    const minutes = parseClock(text)
    if (minutes != null) earliest = Math.min(earliest, minutes)
  }
  return earliest === MINUTES_PER_DAY ? null : earliest
}

function updateExistingHourLabels(axis: HTMLElement, childSelector: string) {
  const existing = Array.from(axis.querySelectorAll<HTMLElement>(childSelector))
    .filter((element) => !element.classList.contains('runtime-pre-hour'))
  existing.forEach((element, index) => {
    const label = formatHour(BASE_START_HOUR + index)
    if (element.textContent !== label) element.textContent = label
  })
}

function clearEarlyStart(root: HTMLElement) {
  if (!root.classList.contains('runtime-early-start')) return
  root.classList.remove('runtime-early-start')
  root.style.removeProperty('--runtime-timeline-shift')
  delete root.dataset.runtimeStartHour
  root.querySelectorAll('.runtime-pre-hour,.runtime-pre-line').forEach((element) => element.remove())
}

function applyScreenEarlyStart(timetable: HTMLElement) {
  const hourHeight = Number.parseFloat(getComputedStyle(timetable).getPropertyValue('--hour-height'))
  if (!Number.isFinite(hourHeight) || hourHeight <= 0) return
  const earliest = earliestCustomStart(timetable, '.event-block.custom-event', '.event-time')
  const axis = timetable.querySelector<HTMLElement>('.time-axis')
  if (!axis) return
  updateExistingHourLabels(axis, ':scope > div')

  if (earliest == null || earliest >= BASE_START_HOUR * 60) {
    clearEarlyStart(timetable)
    return
  }

  const startHour = Math.max(0, Math.floor(earliest / 60))
  const shift = (BASE_START_HOUR - startHour) * hourHeight
  timetable.classList.add('runtime-early-start')
  setStyleProperty(timetable, '--runtime-timeline-shift', `${shift}px`)

  if (timetable.dataset.runtimeStartHour !== String(startHour)) {
    timetable.querySelectorAll('.runtime-pre-hour,.runtime-pre-line').forEach((element) => element.remove())
    setDataset(timetable, 'runtimeStartHour', String(startHour))

    for (let hour = startHour; hour < BASE_START_HOUR; hour += 1) {
      const label = document.createElement('div')
      label.className = 'runtime-pre-hour'
      label.style.top = `${(hour - startHour) * hourHeight}px`
      label.textContent = formatHour(hour)
      axis.append(label)
    }

    for (const column of timetable.querySelectorAll<HTMLElement>('.day-column')) {
      for (let hour = startHour; hour < BASE_START_HOUR; hour += 1) {
        const line = document.createElement('div')
        line.className = 'hour-line runtime-pre-line'
        line.style.top = `${(hour - startHour) * hourHeight}px`
        column.append(line)
      }
    }
  }
}

function applyPngEarlyStart(board: HTMLElement) {
  const hourHeight = Number.parseFloat(getComputedStyle(board).getPropertyValue('--png-hour-height'))
  const edgeSpace = Number.parseFloat(getComputedStyle(board).getPropertyValue('--png-edge-space')) || 0
  if (!Number.isFinite(hourHeight) || hourHeight <= 0) return
  const earliest = earliestCustomStart(board, '.png-export-event.custom-event', '.png-export-event-time')
  const axis = board.querySelector<HTMLElement>('.png-export-axis')
  if (!axis) return
  updateExistingHourLabels(axis, ':scope > span')

  if (earliest == null || earliest >= BASE_START_HOUR * 60) {
    clearEarlyStart(board)
    return
  }

  const startHour = Math.max(0, Math.floor(earliest / 60))
  const shift = (BASE_START_HOUR - startHour) * hourHeight
  board.classList.add('runtime-early-start')
  setStyleProperty(board, '--runtime-timeline-shift', `${shift}px`)

  if (board.dataset.runtimeStartHour !== String(startHour)) {
    board.querySelectorAll('.runtime-pre-hour,.runtime-pre-line').forEach((element) => element.remove())
    setDataset(board, 'runtimeStartHour', String(startHour))

    for (let hour = startHour; hour < BASE_START_HOUR; hour += 1) {
      const label = document.createElement('span')
      label.className = 'runtime-pre-hour'
      label.style.top = `${edgeSpace + (hour - startHour) * hourHeight}px`
      label.textContent = formatHour(hour)
      axis.append(label)
    }

    for (const column of board.querySelectorAll<HTMLElement>('.png-export-day')) {
      for (let hour = startHour; hour < BASE_START_HOUR; hour += 1) {
        const line = document.createElement('div')
        line.className = 'png-export-hour-line runtime-pre-line'
        line.style.top = `${edgeSpace + (hour - startHour) * hourHeight}px`
        column.append(line)
      }
    }
  }
}

function applyScreenLayout(timetable: HTMLElement) {
  timetable.querySelectorAll<HTMLElement>('.event-block.custom-event').forEach((block) => displayExtendedRange(block, '.event-time'))
  applyScreenEarlyStart(timetable)
  timetable.querySelectorAll<HTMLElement>('.day-column').forEach((column) => applyLanes(column, ':scope > .event-block'))
}

function applyPngLayout(board: HTMLElement) {
  board.querySelectorAll<HTMLElement>('.png-export-event.custom-event').forEach((block) => displayExtendedRange(block, '.png-export-event-time'))
  applyPngEarlyStart(board)
  board.querySelectorAll<HTMLElement>('.png-export-day').forEach((column) => applyLanes(column, ':scope > .png-export-event'))
}

let scheduled = false
function applyAll() {
  document.querySelectorAll<HTMLElement>('.timetable').forEach(applyScreenLayout)
  document.querySelectorAll<HTMLElement>('.png-export-board').forEach(applyPngLayout)
}

function scheduleLayout() {
  if (scheduled) return
  scheduled = true
  queueMicrotask(() => {
    scheduled = false
    applyAll()
  })
}

const observer = new MutationObserver(scheduleLayout)
observer.observe(document.documentElement, {
  subtree: true,
  childList: true,
  attributes: true,
  attributeFilter: ['class', 'style', 'title'],
})

scheduleLayout()
