import { clockMinutes } from './screening-time'

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
const DISPLAY_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/
const STORED_END_PATTERN = /^(?:[0-3]\d|4[0-7]):[0-5]\d$/
const CATEGORY_SET = new Set<CustomEventCategory>(CUSTOM_EVENT_CATEGORIES.map(({ value }) => value))

function dateDayIndex(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000)
}

function optionalText(value: unknown) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function formatExtendedClock(minutes: number) {
  const hour = Math.floor(minutes / 60)
  const minute = minutes % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function formatDisplayClock(minutes: number) {
  const normalized = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
  return formatExtendedClock(normalized)
}

export function encodeCustomEventEnd(start: string, end: string) {
  if (!DISPLAY_TIME_PATTERN.test(start) || !DISPLAY_TIME_PATTERN.test(end)) return end
  const startMinutes = clockMinutes(start)
  let endMinutes = clockMinutes(end)
  if (endMinutes < startMinutes) endMinutes += MINUTES_PER_DAY
  return formatExtendedClock(endMinutes)
}

export function customEventDisplayEnd(end: string) {
  return formatDisplayClock(clockMinutes(end))
}

export function customEventEndsNextDay(event: Pick<CustomEvent, 'start' | 'end'>) {
  return clockMinutes(event.end) >= MINUTES_PER_DAY
}

export function customEventDisplayRange(event: Pick<CustomEvent, 'start' | 'end'>) {
  return `${event.start}–${customEventDisplayEnd(event.end)}${customEventEndsNextDay(event) ? ' (다음 날)' : ''}`
}

export function isValidCustomEventDraft(value: CustomEventDraft) {
  if (!value.title.trim()) return false
  if (!DATE_PATTERN.test(value.date) || !DISPLAY_TIME_PATTERN.test(value.start)) return false
  if (!STORED_END_PATTERN.test(value.end)) return false

  const start = clockMinutes(value.start)
  const end = clockMinutes(value.end)
  if (end === start) return false
  if (end < start) return DISPLAY_TIME_PATTERN.test(value.end)
  return end - start <= MINUTES_PER_DAY
}

function normalizeStoredEnd(start: string, end: string) {
  if (!DISPLAY_TIME_PATTERN.test(start) || !STORED_END_PATTERN.test(end)) return null
  const startMinutes = clockMinutes(start)
  let endMinutes = clockMinutes(end)

  if (endMinutes === startMinutes) return null
  if (endMinutes < startMinutes) endMinutes += MINUTES_PER_DAY
  if (endMinutes - startMinutes > MINUTES_PER_DAY) return null
  return formatExtendedClock(endMinutes)
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
    const rawEnd = typeof source.end === 'string' ? source.end : ''
    const end = normalizeStoredEnd(start, rawEnd)
    const rawCategory = typeof source.category === 'string' ? source.category : 'personal'
    const category = CATEGORY_SET.has(rawCategory as CustomEventCategory) ? rawCategory as CustomEventCategory : 'personal'

    if (!end) continue
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
  const start = clockMinutes(event.start)
  let end = clockMinutes(event.end)
  while (end < start) end += MINUTES_PER_DAY
  return end - start
}

export function customEventAbsoluteWindow(event: Pick<CustomEvent, 'date' | 'start' | 'end'>): TimeWindow {
  const start = dateDayIndex(event.date) * MINUTES_PER_DAY + clockMinutes(event.start)
  return { start, end: start + customEventDurationMinutes(event) }
}

// 사용자 일정은 영화 회차와 달리 입력한 달력 날짜 자체를 유지합니다.
export function customEventTimetableDate(event: Pick<CustomEvent, 'date'>) {
  return event.date
}

export function customEventTimetableStartMinutes(event: Pick<CustomEvent, 'start'>) {
  return clockMinutes(event.start)
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
