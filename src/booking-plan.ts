import type { BookingPlanMap, BookingPriority, TicketStatus } from './components/film-types'

export type BookingSelectValue = 'planned' | 'priority-1' | 'priority-2' | 'priority-3' | 'booked' | 'failed'

export function normalizeBookingPlan(value: unknown): BookingPlanMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  const entries = Object.entries(value).flatMap(([screeningId, raw]) => {
    if (!screeningId.trim() || !raw || typeof raw !== 'object' || Array.isArray(raw)) return []
    const priority = (raw as { priority?: unknown }).priority
    if (priority !== 1 && priority !== 2 && priority !== 3) return []
    return [[screeningId, { priority }] as const]
  })

  return Object.fromEntries(entries) as BookingPlanMap
}

export function filterBookingPlan(plan: BookingPlanMap, validScreeningIds: ReadonlySet<string>): BookingPlanMap {
  return Object.fromEntries(
    Object.entries(plan).filter(([screeningId]) => validScreeningIds.has(screeningId)),
  ) as BookingPlanMap
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
  if (value === 'priority-1') return { status: 'planned', priority: 1 }
  if (value === 'priority-2') return { status: 'planned', priority: 2 }
  if (value === 'priority-3') return { status: 'planned', priority: 3 }
  return { status: 'planned' }
}

export function bookingPrioritySymbol(priority?: BookingPriority) {
  if (priority === 1) return '①'
  if (priority === 2) return '②'
  if (priority === 3) return '③'
  return ''
}
