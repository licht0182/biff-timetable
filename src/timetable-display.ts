export {}

let frame = 0

function koreanDateLabel(element: HTMLElement) {
  const source = element.getAttribute('title')?.trim() || element.textContent?.trim() || ''
  const dateMatch = source.match(/(\d{1,2})\D+(\d{1,2})/)
  if (!dateMatch) return

  const weekdayMatch = source.match(/\(([월화수목금토일])\)/) ?? source.match(/([월화수목금토일])(?:요일)?\s*$/)
  const weekday = weekdayMatch?.[1]
  if (!weekday) return

  const next = `${Number(dateMatch[1])}월 ${Number(dateMatch[2])}일 ${weekday}`
  if (element.textContent !== next) element.textContent = next
}

function koreanTimeLabel(element: HTMLElement) {
  const raw = element.textContent?.trim() ?? ''
  if (!/^\d{2}$/.test(raw)) return
  element.textContent = `${raw}시`
}

function fitEventTitle(block: HTMLElement) {
  const title = block.querySelector<HTMLElement>('strong')
  if (!title) return

  title.style.removeProperty('font-size')
  block.classList.remove('title-priority')

  if (block.scrollHeight <= block.clientHeight + 1) return

  // Preserve the movie title before secondary metadata when the block is short.
  block.classList.add('title-priority')

  let size = Number.parseFloat(getComputedStyle(title).fontSize)
  const minimum = 4.8
  while (block.scrollHeight > block.clientHeight + 1 && size > minimum) {
    size = Math.max(minimum, size - 0.4)
    title.style.fontSize = `${size}px`
  }
}

function applyTimetableDisplay() {
  document.querySelectorAll<HTMLElement>('.date-head').forEach(koreanDateLabel)
  document.querySelectorAll<HTMLElement>('.time-axis > div').forEach(koreanTimeLabel)
  document.querySelectorAll<HTMLElement>('.event-block').forEach(fitEventTitle)
}

function scheduleApply() {
  if (frame) cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => {
    frame = 0
    applyTimetableDisplay()
  })
}

const root = document.getElementById('root')
if (root) {
  new MutationObserver(scheduleApply).observe(root, { childList: true, subtree: true })
  window.addEventListener('resize', scheduleApply)
  window.addEventListener('orientationchange', scheduleApply)
  window.addEventListener('biff-user-settings-changed', scheduleApply)
  scheduleApply()
}
