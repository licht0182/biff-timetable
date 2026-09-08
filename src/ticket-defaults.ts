type StoredTicketStatus = 'planned' | 'booked'
type StoredTicketStatusMap = Record<string, StoredTicketStatus>

const SELECTED_KEY = 'biff-timetable:selected-screenings:v1'
const TICKET_STATUS_KEY = 'biff-timetable:ticket-status:v1'

function readSelectedIds() {
  try {
    const value = JSON.parse(localStorage.getItem(SELECTED_KEY) ?? '[]')
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return [] as string[]
  }
}

function readTicketStatuses() {
  try {
    const value = JSON.parse(localStorage.getItem(TICKET_STATUS_KEY) ?? '{}')
    return value && typeof value === 'object' ? value as StoredTicketStatusMap : {}
  } catch {
    return {} as StoredTicketStatusMap
  }
}

function migrateStoredTicketStatuses() {
  const selected = readSelectedIds()
  if (!selected.length) return

  const statuses = readTicketStatuses()
  let changed = false

  for (const screeningId of selected) {
    if (statuses[screeningId] !== 'planned' && statuses[screeningId] !== 'booked') {
      statuses[screeningId] = 'planned'
      changed = true
    }
  }

  if (changed) localStorage.setItem(TICKET_STATUS_KEY, JSON.stringify(statuses))
}

function normalizeTicketSelect(select: HTMLSelectElement) {
  if (select.value === 'none' || (select.value !== 'planned' && select.value !== 'booked')) {
    select.value = 'planned'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    return
  }

  select.querySelector<HTMLOptionElement>('option[value="none"]')?.remove()
}

function applyTicketDefaults() {
  document.querySelectorAll<HTMLSelectElement>('select.ticket-select').forEach(normalizeTicketSelect)
}

migrateStoredTicketStatuses()

const root = document.getElementById('root')
if (root) {
  let scheduled = false
  const scheduleApply = () => {
    if (scheduled) return
    scheduled = true
    queueMicrotask(() => {
      scheduled = false
      applyTicketDefaults()
    })
  }

  new MutationObserver(scheduleApply).observe(root, { childList: true, subtree: true })
  scheduleApply()
}
