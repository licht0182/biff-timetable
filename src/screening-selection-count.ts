export {}

const SELECTED_SCREENINGS_KEY = 'biff-timetable:selected-screenings:v1'
const COUNT_SELECTOR = '.selection-count'

function readSelectedScreeningCount() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SELECTED_SCREENINGS_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return 0
    return new Set(parsed.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)).size
  } catch {
    return 0
  }
}

function syncSelectionCount() {
  const count = document.querySelector<HTMLElement>(COUNT_SELECTOR)
  if (!count) return

  const nextText = `총 ${readSelectedScreeningCount()}개 선택`
  if (count.textContent !== nextText) count.textContent = nextText
}

let delayedSync: number | null = null

function scheduleSelectionCountSync() {
  // React persists state to localStorage in an effect after rendering. Sync once
  // immediately and once just after that effect so custom-event renders never
  // leave their count in the header.
  queueMicrotask(syncSelectionCount)
  if (delayedSync !== null) window.clearTimeout(delayedSync)
  delayedSync = window.setTimeout(() => {
    delayedSync = null
    syncSelectionCount()
  }, 50)
}

const root = document.getElementById('root')
if (root) {
  const observer = new MutationObserver(scheduleSelectionCountSync)
  observer.observe(root, { childList: true, subtree: true, characterData: true })

  root.addEventListener('click', scheduleSelectionCountSync, true)
  root.addEventListener('change', scheduleSelectionCountSync, true)
  window.addEventListener('storage', (event) => {
    if (event.key === SELECTED_SCREENINGS_KEY) scheduleSelectionCountSync()
  })

  scheduleSelectionCountSync()
}
