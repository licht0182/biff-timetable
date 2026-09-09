import { START_HOUR, clockMinutes } from './screening-time'

export type CustomEventCategory = 'personal' | 'meal' | 'travel' | 'rest' | 'other'

export type CustomEvent = {
  id: string
  title: string
  date: string
  start: string
  end: string
  location?: string
  note?: string
  category: CustomEventCategory
  createdAt: string
}

export type CustomEventDraft = Omit<CustomEvent, 'id' | 'createdAt'>
export type TimeWindow = { start: number; end: number }

export const CUSTOM_EVENT_CATEGORIES: Array<{ value: CustomEventCategory; label: string }> = [
  { value: 'personal', label: '개인 일정' },
  { value: 'meal', label: '식사' },
  { value: 'travel', label: '이동' },
  { value: 'rest', label: '휴식' },
  { value: 'other', label: '기타' },
]

const MINUTES_PER_DAY = 24 * 60
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/
const CATEGORY_SET = new Set<CustomEventCategory>(CUSTOM_EVENT_CATEGORIES.map(({ value }) => value))

function dateDayIndex(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000)
}

function formatDateFromDayIndex(dayIndex: number) {
  const value = new Date(dayIndex * 86_400_000)
  const year = value.getUTCFullYear()
  const month = String(value.getUTCMonth() + 1).padStart(2, '0')
  const day = String(value.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function optionalText(value: unknown) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

export function isValidCustomEventDraft(value: CustomEventDraft) {
  if (!value.title.trim()) return false
  if (!DATE_PATTERN.test(value.date) || !TIME_PATTERN.test(value.start) || !TIME_PATTERN.test(value.end)) return false
  return clockMinutes(value.end) > clockMinutes(value.start)
}

export function normalizeCustomEvents(value: unknown): CustomEvent[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const result: CustomEvent[] = []

  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const source = item as Partial<Record<keyof CustomEvent, unknown>>
    const id = typeof source.id === 'string' ? source.id.trim() : ''
    const title = typeof source.title === 'string' ? source.title.trim() : ''
    const date = typeof source.date === 'string' ? source.date : ''
    const start = typeof source.start === 'string' ? source.start : ''
    const end = typeof source.end === 'string' ? source.end : ''
    const rawCategory = typeof source.category === 'string' ? source.category : 'personal'
    const category = CATEGORY_SET.has(rawCategory as CustomEventCategory) ? rawCategory as CustomEventCategory : 'personal'
    const draft: CustomEventDraft = {
      title,
      date,
      start,
      end,
      location: optionalText(source.location),
      note: optionalText(source.note),
      category,
    }

    if (!id || seen.has(id) || !id.startsWith('custom-') || !isValidCustomEventDraft(draft)) continue
    seen.add(id)
    result.push({
      id,
      ...draft,
      createdAt: typeof source.createdAt === 'string' && source.createdAt.trim() ? source.createdAt : new Date().toISOString(),
    })
  }

  return result
}

export function createCustomEventId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `custom-${crypto.randomUUID()}`
  return `custom-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function customEventDurationMinutes(event: Pick<CustomEvent, 'start' | 'end'>) {
  return clockMinutes(event.end) - clockMinutes(event.start)
}

export function customEventAbsoluteWindow(event: Pick<CustomEvent, 'date' | 'start' | 'end'>): TimeWindow {
  const start = dateDayIndex(event.date) * MINUTES_PER_DAY + clockMinutes(event.start)
  return { start, end: start + customEventDurationMinutes(event) }
}

export function customEventTimetableDate(event: Pick<CustomEvent, 'date' | 'start'>) {
  const dayIndex = dateDayIndex(event.date)
  return formatDateFromDayIndex(clockMinutes(event.start) < START_HOUR * 60 ? dayIndex - 1 : dayIndex)
}

export function customEventTimetableStartMinutes(event: Pick<CustomEvent, 'start'>) {
  const start = clockMinutes(event.start)
  return start < START_HOUR * 60 ? start + MINUTES_PER_DAY : start
}

export function customEventTimetableEndMinutes(event: Pick<CustomEvent, 'start' | 'end'>) {
  return customEventTimetableStartMinutes(event) + customEventDurationMinutes(event)
}

export function windowsOverlap(first: TimeWindow, second: TimeWindow) {
  return first.start < second.end && second.start < first.end
}

export function customEventCategoryLabel(category: CustomEventCategory) {
  return CUSTOM_EVENT_CATEGORIES.find((item) => item.value === category)?.label ?? '개인 일정'
}
