import { BOOKING_PRIORITIES, MAX_BOOKING_PRIORITY, type BookingPlanMap, type BookingPriority, type TicketStatus } from './components/film-types'

export type BookingSelectValue = 'planned' | `priority-${BookingPriority}` | 'booked' | 'failed'

export function isBookingPriority(value: unknown): value is BookingPriority {
  return typeof value === 'number' && BOOKING_PRIORITIES.includes(value as BookingPriority)
}

function normalizeFallbackFor(value: unknown, screeningId: string) {
  if (!Array.isArray(value)) return undefined
  const fallbackFor = Array.from(new Set(value.filter((item): item is string => (
    typeof item === 'string' && item.trim().length > 0 && item !== screeningId
  ))))
  return fallbackFor.length ? fallbackFor : undefined
}

export function normalizeBookingPlan(value: unknown): BookingPlanMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  const entries = Object.entries(value).flatMap(([screeningId, raw]) => {
    if (!screeningId.trim() || !raw || typeof raw !== 'object' || Array.isArray(raw)) return []
    const priority = (raw as { priority?: unknown }).priority
    if (!isBookingPriority(priority)) return []
    const fallbackFor = normalizeFallbackFor((raw as { fallbackFor?: unknown }).fallbackFor, screeningId)
    return [[screeningId, fallbackFor ? { priority, fallbackFor } : { priority }] as const]
  })

  return Object.fromEntries(entries) as BookingPlanMap
}

export function filterBookingPlan(plan: BookingPlanMap, validScreeningIds: ReadonlySet<string>): BookingPlanMap {
  const next: BookingPlanMap = {}

  for (const [screeningId, entry] of Object.entries(plan)) {
    if (!validScreeningIds.has(screeningId)) continue
    if (!entry.fallbackFor?.length) {
      next[screeningId] = { priority: entry.priority }
      continue
    }

    const fallbackFor = entry.fallbackFor.filter((id) => validScreeningIds.has(id) && id !== screeningId)
    if (fallbackFor.length) next[screeningId] = { priority: entry.priority, fallbackFor }
  }

  return next
}

export function detachBookingPlanEntry(
  plan: BookingPlanMap,
  screeningId: string,
  preserveScreeningIds: ReadonlySet<string>,
): BookingPlanMap {
  const next: BookingPlanMap = {}

  for (const [currentId, entry] of Object.entries(plan)) {
    if (currentId === screeningId) continue
    if (!entry.fallbackFor?.length) {
      next[currentId] = entry
      continue
    }

    const fallbackFor = entry.fallbackFor.filter((id) => id !== screeningId)
    if (fallbackFor.length) {
      next[currentId] = { ...entry, fallbackFor }
    } else if (preserveScreeningIds.has(currentId)) {
      next[currentId] = { priority: entry.priority }
    }
  }

  return next
}

export function removeBookingPlanEntries(plan: BookingPlanMap, screeningIds: ReadonlySet<string>): BookingPlanMap {
  const next: BookingPlanMap = {}

  for (const [screeningId, entry] of Object.entries(plan)) {
    if (screeningIds.has(screeningId)) continue
    if (!entry.fallbackFor?.length) {
      next[screeningId] = entry
      continue
    }

    const fallbackFor = entry.fallbackFor.filter((id) => !screeningIds.has(id))
    if (fallbackFor.length) next[screeningId] = { ...entry, fallbackFor }
  }

  return next
}

export function fallbackMinimumPriority(plan: BookingPlanMap, originIds: string[]): BookingPriority | null {
  if (!originIds.length) return null
  const highestOriginPriority = originIds.reduce<BookingPriority>((highest, id) => {
    const priority = plan[id]?.priority ?? 1
    return priority > highest ? priority : highest
  }, 1)

  if (highestOriginPriority >= MAX_BOOKING_PRIORITY) return null
  return (highestOriginPriority + 1) as BookingPriority
}

export function recalculateFallbackPriorities(plan: BookingPlanMap): BookingPlanMap {
  const next: BookingPlanMap = { ...plan }
  for (const [screeningId, entry] of Object.entries(plan)) {
    if (!entry.fallbackFor?.length) continue
    const minimum = fallbackMinimumPriority(next, entry.fallbackFor)
    if (minimum) next[screeningId] = { ...entry, priority: Math.max(entry.priority, minimum) as BookingPriority }
  }
  return next
}

export function bookingSelectValue(status: Exclude<TicketStatus, 'none'>, priority?: BookingPriority): BookingSelectValue {
  if (status === 'booked' || status === 'failed') return status
  return priority ? `priority-${priority}` as BookingSelectValue : 'planned'
}

export function bookingStateFromSelectValue(
  value: BookingSelectValue,
  currentPriority?: BookingPriority,
): { status: Exclude<TicketStatus, 'none'>; priority?: BookingPriority } {
  if (value === 'booked' || value === 'failed') return { status: value, priority: currentPriority }
  if (value.startsWith('priority-')) {
    const priority = Number(value.slice('priority-'.length))
    if (isBookingPriority(priority)) return { status: 'planned', priority }
  }
  return { status: 'planned' }
}

export function bookingPrioritySymbol(priority?: BookingPriority) {
  return priority ? ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'][priority - 1] : ''
}


export function nextFallbackIds(
  plan: BookingPlanMap,
  ticketStatus: Record<string, string | undefined>,
  selectedIds: ReadonlySet<string>,
) {
  const next = new Set<string>()
  const failedOriginIds = Object.entries(ticketStatus)
    .filter(([, status]) => status === 'failed')
    .map(([screeningId]) => screeningId)

  for (const originId of failedOriginIds) {
    const chain = Object.entries(plan)
      .filter(([, entry]) => entry.fallbackFor?.includes(originId))

    const hasActiveSelection = chain.some(([screeningId]) => (
      selectedIds.has(screeningId) && ticketStatus[screeningId] !== 'failed'
    ))
    if (hasActiveSelection) continue

    const candidates = chain.filter(([screeningId]) => (
      !selectedIds.has(screeningId) && ticketStatus[screeningId] !== 'failed'
    ))
    if (!candidates.length) continue

    const nextPriority = Math.min(...candidates.map(([, entry]) => entry.priority))
    for (const [screeningId, entry] of candidates) {
      if (entry.priority === nextPriority) next.add(screeningId)
    }
  }

  return next
}


export function failedFallbackPredecessorIds(
  plan: BookingPlanMap,
  candidateId: string,
  ticketStatus: Record<string, string | undefined>,
  selectedIds: ReadonlySet<string>,
) {
  const result = new Set<string>()
  const candidate = plan[candidateId]
  if (!candidate?.fallbackFor?.length) return result

  const originIds = new Set(candidate.fallbackFor)

  for (const [screeningId, entry] of Object.entries(plan)) {
    if (screeningId === candidateId || !selectedIds.has(screeningId)) continue
    if (ticketStatus[screeningId] !== 'failed') continue

    if (originIds.has(screeningId)) {
      result.add(screeningId)
      continue
    }

    if (entry.fallbackFor?.some((originId) => originIds.has(originId))) {
      result.add(screeningId)
    }
  }

  return result
}
