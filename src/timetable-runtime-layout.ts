import { assignTimetableLanes } from './timetable-layout'

const BASE_START_HOUR = 8
const MINUTES_PER_DAY = 24 * 60

function setStyleProperty(element: HTMLElement, name: string, value: string) {
  if (element.style.getPropertyValue(name) !== value) element.style.setProperty(name, value)
}

function removeStyleProperty(element: HTMLElement, name: string) {
  if (element.style.getPropertyValue(name)) element.style.removeProperty(name)
}

function setDataset(element: HTMLElement, key: string, value: string) {
  if (element.dataset[key] !== value) element.dataset[key] = value
}

function setText(element: HTMLElement, value: string) {
  if (element.textContent !== value) element.textContent = value
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

function eventTimeSource(element: HTMLElement, timeSelector: string) {
  return element.querySelector<HTMLElement>(timeSelector)?.textContent
    ?? element.getAttribute('title')
    ?? element.getAttribute('aria-label')
    ?? ''
}

function displayExtendedRange(element: HTMLElement, timeSelector: string) {
  const time = element.querySelector<HTMLElement>(timeSelector)
  const source = eventTimeSource(element, timeSelector)
  const match = source.match(/(\d{2}:\d{2})–(\d{2,}:\d{2})/)
  if (!match) return

  const [rawHour, rawMinute] = match[2].split(':').map(Number)
  if (!Number.isFinite(rawHour) || rawHour < 24) return
  const normalizedHour = rawHour % 24
  const normalizedEnd = `${String(normalizedHour).padStart(2, '0')}:${String(rawMinute).padStart(2, '0')}`
  const displayRange = `${match[1]}–${normalizedEnd} (다음 날)`

  if (time) setText(time, (time.textContent ?? '').replace(match[0], displayRange))
  const title = element.getAttribute('title')
  if (title?.includes(match[0])) element.setAttribute('title', title.replace(match[0], displayRange))
  const ariaLabel = element.getAttribute('aria-label')
  if (ariaLabel?.includes(match[0])) element.setAttribute('aria-label', ariaLabel.replace(match[0], displayRange))
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
    removeStyleProperty(block, '--runtime-lane-start')
    removeStyleProperty(block, '--runtime-lane-width')
  }
}

function earliestCustomStart(root: ParentNode, blockSelector: string, timeSelector: string) {
  let earliest = MINUTES_PER_DAY
  for (const block of root.querySelectorAll<HTMLElement>(blockSelector)) {
    const minutes = parseClock(eventTimeSource(block, timeSelector))
    if (minutes != null) earliest = Math.min(earliest, minutes)
  }
  return earliest === MINUTES_PER_DAY ? null : earliest
}

function existingAxisChildren(axis: HTMLElement, childSelector: string) {
  return Array.from(axis.querySelectorAll<HTMLElement>(childSelector))
    .filter((element) => !element.classList.contains('runtime-pre-hour'))
}

function updateExistingHourLabels(axis: HTMLElement, childSelector: string) {
  existingAxisChildren(axis, childSelector).forEach((element, index) => {
    setText(element, formatHour(BASE_START_HOUR + index))
  })
}

function clearScreenVerticalLayout(timetable: HTMLElement) {
  if (timetable.classList.contains('runtime-early-start')) timetable.classList.remove('runtime-early-start')
  if (timetable.dataset.runtimeStartHour) delete timetable.dataset.runtimeStartHour
  timetable.querySelectorAll('.runtime-pre-hour,.runtime-pre-line').forEach((element) => element.remove())
  timetable.querySelectorAll<HTMLElement>('.time-axis>div,.day-column>.hour-line,.day-column>.event-block').forEach((element) => {
    removeStyleProperty(element, '--runtime-vertical-top')
    removeStyleProperty(element, '--runtime-vertical-height')
  })
}

function ensureScreenPreHours(timetable: HTMLElement, startHour: number, hourHeight: number) {
  const axis = timetable.querySelector<HTMLElement>('.time-axis')
  if (!axis) return

  const requiredHours = new Set(Array.from({ length: BASE_START_HOUR - startHour }, (_, index) => startHour + index))
  axis.querySelectorAll<HTMLElement>(':scope > .runtime-pre-hour').forEach((label) => {
    const hour = Number(label.dataset.runtimeHour)
    if (!requiredHours.has(hour)) label.remove()
  })

  for (let hour = startHour; hour < BASE_START_HOUR; hour += 1) {
    let label = axis.querySelector<HTMLElement>(`:scope > .runtime-pre-hour[data-runtime-hour="${hour}"]`)
    if (!label) {
      label = document.createElement('div')
      label.className = 'runtime-pre-hour'
      label.dataset.runtimeHour = String(hour)
      axis.append(label)
    }
    setText(label, formatHour(hour))
    setStyleProperty(label, 'top', `${(hour - startHour) * hourHeight}px`)
  }

  for (const column of timetable.querySelectorAll<HTMLElement>('.day-column')) {
    column.querySelectorAll<HTMLElement>(':scope > .runtime-pre-line').forEach((line) => {
      const hour = Number(line.dataset.runtimeHour)
      if (!requiredHours.has(hour)) line.remove()
    })
    for (let hour = startHour; hour < BASE_START_HOUR; hour += 1) {
      let line = column.querySelector<HTMLElement>(`:scope > .runtime-pre-line[data-runtime-hour="${hour}"]`)
      if (!line) {
        line = document.createElement('div')
        line.className = 'hour-line runtime-pre-line'
        line.dataset.runtimeHour = String(hour)
        column.append(line)
      }
      setStyleProperty(line, 'top', `${(hour - startHour) * hourHeight}px`)
    }
  }
}

function applyScreenEarlyStart(timetable: HTMLElement) {
  const computed = getComputedStyle(timetable)
  const originalHourHeight = Number.parseFloat(computed.getPropertyValue('--hour-height'))
  const gridHeight = Number.parseFloat(computed.getPropertyValue('--grid-height'))
  if (!Number.isFinite(originalHourHeight) || originalHourHeight <= 0 || !Number.isFinite(gridHeight) || gridHeight <= 0) return

  const earliest = earliestCustomStart(timetable, '.event-block.custom-event', '.event-time')
  const axis = timetable.querySelector<HTMLElement>('.time-axis')
  if (!axis) return
  updateExistingHourLabels(axis, ':scope > div')

  if (earliest == null || earliest >= BASE_START_HOUR * 60) {
    clearScreenVerticalLayout(timetable)
    return
  }

  const startHour = Math.max(0, Math.floor(earliest / 60))
  const extraHours = BASE_START_HOUR - startHour
  const originalHours = gridHeight / originalHourHeight
  const fittedHourHeight = gridHeight / (originalHours + extraHours)
  const scale = fittedHourHeight / originalHourHeight

  if (!timetable.classList.contains('runtime-early-start')) timetable.classList.add('runtime-early-start')
  setDataset(timetable, 'runtimeStartHour', String(startHour))
  ensureScreenPreHours(timetable, startHour, fittedHourHeight)

  existingAxisChildren(axis, ':scope > div').forEach((label, index) => {
    setStyleProperty(label, '--runtime-vertical-top', `${(extraHours + index) * fittedHourHeight}px`)
  })

  for (const column of timetable.querySelectorAll<HTMLElement>('.day-column')) {
    const lines = Array.from(column.querySelectorAll<HTMLElement>(':scope > .hour-line'))
      .filter((line) => !line.classList.contains('runtime-pre-line'))
    lines.forEach((line, index) => {
      setStyleProperty(line, '--runtime-vertical-top', `${(extraHours + index) * fittedHourHeight}px`)
    })

    for (const block of column.querySelectorAll<HTMLElement>(':scope > .event-block')) {
      const rawTop = Number.parseFloat(block.style.top)
      const rawHeight = Number.parseFloat(block.style.height)
      if (!Number.isFinite(rawTop) || !Number.isFinite(rawHeight)) continue
      const topHoursFromBase = rawTop / originalHourHeight
      setStyleProperty(block, '--runtime-vertical-top', `${(extraHours + topHoursFromBase) * fittedHourHeight}px`)
      setStyleProperty(block, '--runtime-vertical-height', `${Math.max(1, rawHeight * scale)}px`)
    }
  }
}

function clearPngEarlyStart(board: HTMLElement) {
  if (board.classList.contains('runtime-early-start')) board.classList.remove('runtime-early-start')
  removeStyleProperty(board, '--runtime-timeline-shift')
  if (board.dataset.runtimeStartHour) delete board.dataset.runtimeStartHour
  board.querySelectorAll('.runtime-pre-hour,.runtime-pre-line').forEach((element) => element.remove())
}

function ensurePngPreHours(board: HTMLElement, startHour: number, hourHeight: number, edgeSpace: number) {
  const axis = board.querySelector<HTMLElement>('.png-export-axis')
  if (!axis) return
  const requiredHours = new Set(Array.from({ length: BASE_START_HOUR - startHour }, (_, index) => startHour + index))

  axis.querySelectorAll<HTMLElement>(':scope > .runtime-pre-hour').forEach((label) => {
    const hour = Number(label.dataset.runtimeHour)
    if (!requiredHours.has(hour)) label.remove()
  })
  for (let hour = startHour; hour < BASE_START_HOUR; hour += 1) {
    let label = axis.querySelector<HTMLElement>(`:scope > .runtime-pre-hour[data-runtime-hour="${hour}"]`)
    if (!label) {
      label = document.createElement('span')
      label.className = 'runtime-pre-hour'
      label.dataset.runtimeHour = String(hour)
      axis.append(label)
    }
    setText(label, formatHour(hour))
    setStyleProperty(label, 'top', `${edgeSpace + (hour - startHour) * hourHeight}px`)
  }

  for (const column of board.querySelectorAll<HTMLElement>('.png-export-day')) {
    column.querySelectorAll<HTMLElement>(':scope > .runtime-pre-line').forEach((line) => {
      const hour = Number(line.dataset.runtimeHour)
      if (!requiredHours.has(hour)) line.remove()
    })
    for (let hour = startHour; hour < BASE_START_HOUR; hour += 1) {
      let line = column.querySelector<HTMLElement>(`:scope > .runtime-pre-line[data-runtime-hour="${hour}"]`)
      if (!line) {
        line = document.createElement('div')
        line.className = 'png-export-hour-line runtime-pre-line'
        line.dataset.runtimeHour = String(hour)
        column.append(line)
      }
      setStyleProperty(line, 'top', `${edgeSpace + (hour - startHour) * hourHeight}px`)
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
    clearPngEarlyStart(board)
    return
  }

  const startHour = Math.max(0, Math.floor(earliest / 60))
  const shift = (BASE_START_HOUR - startHour) * hourHeight
  if (!board.classList.contains('runtime-early-start')) board.classList.add('runtime-early-start')
  setStyleProperty(board, '--runtime-timeline-shift', `${shift}px`)
  setDataset(board, 'runtimeStartHour', String(startHour))
  ensurePngPreHours(board, startHour, hourHeight, edgeSpace)
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
  attributeFilter: ['style', 'title', 'aria-label'],
})

scheduleLayout()
