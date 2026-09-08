export {}

let frame = 0

function fitEventTitle(block: HTMLElement) {
  const title = block.querySelector<HTMLElement>('strong')
  if (!title) return
  title.style.removeProperty('font-size')
  block.classList.remove('title-priority')
  if (block.scrollHeight <= block.clientHeight + 1) return
  block.classList.add('title-priority')
  let size = Number.parseFloat(getComputedStyle(title).fontSize)
  const minimum = 4.8
  while (block.scrollHeight > block.clientHeight + 1 && size > minimum) {
    size = Math.max(minimum, size - 0.4)
    title.style.fontSize = `${size}px`
  }
}

function applyTimetableDisplay() {
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
  scheduleApply()
}
