const MOBILE_BREAKPOINT = 700
const BASE_START_HOUR = 8
const GRID_EDGE_SPACE = 16

let activeShell: HTMLElement | null = null
let resizeObserver: ResizeObserver | null = null
let frame = 0
let lastViewportWidth = window.innerWidth

function setStyleProperty(element: HTMLElement, name: string, value: string) {
  if (element.style.getPropertyValue(name) !== value) element.style.setProperty(name, value)
}

function clockMinutes(value: string) {
  const match = value.match(/(\d{1,2}):(\d{2})/)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
  return hour * 60 + minute
}

function eventRange(block: HTMLElement) {
  const sources = [
    block.querySelector<HTMLElement>('.event-time')?.textContent,
    block.getAttribute('title'),
    block.getAttribute('aria-label'),
  ]

  for (const source of sources) {
    if (!source) continue
    const match = source.match(/(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})/)
    if (!match) continue
    const start = clockMinutes(match[1])
    let end = clockMinutes(match[2])
    if (start == null || end == null) continue
    while (end <= start) end += 24 * 60
    return { start, end }
  }

  return null
}

function baseHourElements(timetable: HTMLElement) {
  return Array.from(timetable.querySelectorAll<HTMLElement>('.time-axis>div'))
    .filter((element) => !element.classList.contains('runtime-pre-hour'))
}

function baseHourLines(column: HTMLElement) {
  return Array.from(column.querySelectorAll<HTMLElement>(':scope > .hour-line'))
    .filter((element) => !element.classList.contains('runtime-pre-line'))
}

function stabilizeTimetableGeometry(scroll: HTMLElement) {
  const timetable = scroll.querySelector<HTMLElement>('.timetable')
  if (!timetable) return

  const labels = baseHourElements(timetable)
  const baseHours = Math.max(1, labels.length - 1)
  const headerHeight = Number.parseFloat(timetable.style.getPropertyValue('--header-height'))
    || Number.parseFloat(getComputedStyle(timetable).getPropertyValue('--header-height'))
    || 32
  const availableGridHeight = Math.max(96, scroll.clientHeight - headerHeight - GRID_EDGE_SPACE)
  const hourHeight = availableGridHeight / baseHours
  const gridHeight = hourHeight * baseHours
  const hourHeightCss = `${hourHeight.toFixed(4)}px`
  const gridHeightCss = `${gridHeight.toFixed(4)}px`

  setStyleProperty(timetable, '--stable-hour-height', hourHeightCss)
  setStyleProperty(timetable, '--stable-grid-height', gridHeightCss)
  if (timetable.dataset.stableViewport !== 'true') timetable.dataset.stableViewport = 'true'

  labels.forEach((label, index) => setStyleProperty(label, 'top', `${(index * hourHeight).toFixed(4)}px`))
  timetable.querySelectorAll<HTMLElement>('.day-column').forEach((column) => {
    baseHourLines(column).forEach((line, index) => setStyleProperty(line, 'top', `${(index * hourHeight).toFixed(4)}px`))

    column.querySelectorAll<HTMLElement>(':scope > .event-block').forEach((block) => {
      const range = eventRange(block)
      if (!range) return
      let start = range.start
      if (!block.classList.contains('custom-event') && start < BASE_START_HOUR * 60) start += 24 * 60
      const top = ((start - BASE_START_HOUR * 60) / 60) * hourHeight
      const duration = range.end - range.start
      const minimumHeight = scroll.classList.contains('ultra-dense') ? 16 : 22
      const height = Math.max((duration / 60) * hourHeight, minimumHeight)
      setStyleProperty(block, 'top', `${top.toFixed(4)}px`)
      setStyleProperty(block, 'height', `${height.toFixed(4)}px`)
    })
  })
}

function releaseViewportLock() {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (activeShell) activeShell.classList.remove('timetable-viewport-stable')
  activeShell = null
  document.documentElement.classList.remove('timetable-viewport-locked')
  document.body.classList.remove('timetable-viewport-locked')
}

function activateViewportLock(shell: HTMLElement, scroll: HTMLElement) {
  if (activeShell !== shell) {
    releaseViewportLock()
    window.scrollTo(0, 0)
    activeShell = shell
    lastViewportWidth = window.innerWidth
    shell.classList.add('timetable-viewport-stable')
    document.documentElement.classList.add('timetable-viewport-locked')
    document.body.classList.add('timetable-viewport-locked')
  }

  if (!resizeObserver) {
    resizeObserver = new ResizeObserver(() => scheduleStabilize())
    resizeObserver.observe(scroll)
  }
}

function applyStability() {
  const shell = document.querySelector<HTMLElement>('.app-shell.timetable-mode')
  const scroll = shell?.querySelector<HTMLElement>('.timetable-page .timetable-scroll') ?? null

  if (!shell || !scroll) {
    releaseViewportLock()
    return
  }

  activateViewportLock(shell, scroll)
  stabilizeTimetableGeometry(scroll)
}

function scheduleStabilize() {
  if (frame) cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => {
    frame = 0
    applyStability()
  })
}

/*
 * iOS Safari fires window.resize while its browser chrome expands/collapses.
 * Stop only mobile height-only resize events before App/useViewport sees them.
 * Width changes (orientation / actual responsive resize) still propagate normally.
 */
window.addEventListener('resize', (event) => {
  const width = window.innerWidth
  const isMobileTimetable = Boolean(activeShell) && width <= MOBILE_BREAKPOINT
  const widthChanged = Math.abs(width - lastViewportWidth) > 2

  if (isMobileTimetable && !widthChanged) {
    event.stopImmediatePropagation()
    scheduleStabilize()
    return
  }

  lastViewportWidth = width
  scheduleStabilize()
}, true)

window.addEventListener('orientationchange', () => {
  window.setTimeout(() => {
    lastViewportWidth = window.innerWidth
    scheduleStabilize()
  }, 0)
})

new MutationObserver(scheduleStabilize).observe(document.documentElement, {
  subtree: true,
  childList: true,
  attributes: true,
  attributeFilter: ['class', 'style'],
})

scheduleStabilize()
