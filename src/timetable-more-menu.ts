export {}

const MENU_SELECTOR = '.timetable-action-buttons > .backup-menu'

function updateSummary(details: HTMLDetailsElement) {
  details.classList.add('timetable-more-menu')
  const summary = details.querySelector<HTMLElement>(':scope > summary')
  if (!summary) return
  if (summary.textContent !== '더보기') summary.textContent = '더보기'
  const label = details.open ? '더보기 메뉴 닫기' : '더보기 메뉴 열기'
  if (summary.getAttribute('aria-label') !== label) summary.setAttribute('aria-label', label)
}

function enhanceMenus() {
  document.querySelectorAll<HTMLDetailsElement>(MENU_SELECTOR).forEach(updateSummary)
}

function closeOwningMenu(target: Element) {
  const actions = target.closest<HTMLElement>('.timetable-action-buttons')
  if (!actions) return
  const details = actions.querySelector<HTMLDetailsElement>(':scope > .backup-menu.timetable-more-menu')
  if (!details?.open) return

  const calendarButton = actions.querySelector<HTMLElement>(':scope > .png-export-trigger + button')
  const directButtons = Array.from(actions.children).filter((element): element is HTMLButtonElement => element instanceof HTMLButtonElement)
  const clearButton = directButtons.at(-1) ?? null
  const backupAction = target.closest('.backup-menu.timetable-more-menu > div button')

  if (target === calendarButton || target === clearButton || backupAction) details.open = false
}

function onToggle(event: Event) {
  const target = event.target
  if (target instanceof HTMLDetailsElement && target.matches(MENU_SELECTOR)) updateSummary(target)
}

const root = document.getElementById('root')
if (root) {
  const observer = new MutationObserver(enhanceMenus)
  observer.observe(root, { childList: true, subtree: true })
  root.addEventListener('toggle', onToggle, true)
  root.addEventListener('click', (event) => {
    const target = event.target
    if (target instanceof Element) queueMicrotask(() => closeOwningMenu(target))
  })
  enhanceMenus()
}
