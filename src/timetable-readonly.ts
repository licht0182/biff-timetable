function isTimetableBlock(target: EventTarget | null) {
  return target instanceof Element ? target.closest('.event-block') : null
}

function stopTimetableRemoval(event: Event) {
  if (!isTimetableBlock(event.target)) return
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()
}

function stopTimetableKeyboardRemoval(event: KeyboardEvent) {
  if ((event.key !== 'Enter' && event.key !== ' ') || !isTimetableBlock(event.target)) return
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()
}

function makeTimetableBlocksReadOnly() {
  document.querySelectorAll<HTMLElement>('.event-block').forEach((block) => {
    if (block.tabIndex !== -1) block.tabIndex = -1
    const title = block.getAttribute('title')
    if (!title) return
    const cleaned = title.replace(/\n?클릭하면 시간표에서 제거됩니다\./g, '').trim()
    if (cleaned !== title) block.setAttribute('title', cleaned)
  })
}

document.addEventListener('click', stopTimetableRemoval, true)
document.addEventListener('keydown', stopTimetableKeyboardRemoval, true)

const observer = new MutationObserver(makeTimetableBlocksReadOnly)
observer.observe(document.documentElement, { childList: true, subtree: true })
makeTimetableBlocksReadOnly()
