import type { Film, Screening } from './components/film-types'

export const START_HOUR = 8
export const BASE_END_HOUR = 27
export const FALLBACK_RUNTIME = 120
const MINUTES_PER_DAY = 24 * 60

export type ScreeningWindow = {
  start: number
  end: number
}

export function clockMinutes(time: string) {
  const [hour, minute] = time.split(':').map(Number)
  return hour * 60 + minute
}

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

export function screeningDurationMinutes(film: Film, screening: Screening) {
  const start = clockMinutes(screening.start)
  if (!screening.end) return film.runtime ?? FALLBACK_RUNTIME

  let end = clockMinutes(screening.end)
  while (end <= start) end += MINUTES_PER_DAY
  return end - start
}

export function screeningStartOffsetMinutes(screening: Screening) {
  return clockMinutes(screening.start)
}

export function screeningEndOffsetMinutes(film: Film, screening: Screening) {
  return screeningStartOffsetMinutes(screening) + screeningDurationMinutes(film, screening)
}

export function screeningAbsoluteWindow(film: Film, screening: Screening): ScreeningWindow {
  const start = dateDayIndex(screening.date) * MINUTES_PER_DAY + screeningStartOffsetMinutes(screening)
  return { start, end: start + screeningDurationMinutes(film, screening) }
}

export function screeningsOverlap(firstFilm: Film, first: Screening, secondFilm: Film, second: Screening) {
  if (first.id === second.id) return false
  const a = screeningAbsoluteWindow(firstFilm, first)
  const b = screeningAbsoluteWindow(secondFilm, second)
  return a.start < b.end && b.start < a.end
}

export function timetableDate(screening: Screening) {
  const dayIndex = dateDayIndex(screening.date)
  return formatDateFromDayIndex(clockMinutes(screening.start) < START_HOUR * 60 ? dayIndex - 1 : dayIndex)
}

export function timetableStartMinutes(screening: Screening) {
  const start = clockMinutes(screening.start)
  return start < START_HOUR * 60 ? start + MINUTES_PER_DAY : start
}

export function timetableEndMinutes(film: Film, screening: Screening) {
  return timetableStartMinutes(screening) + screeningDurationMinutes(film, screening)
}

export function endLabel(film: Film, screening: Screening) {
  const end = screeningEndOffsetMinutes(film, screening)
  const normalized = ((end % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
  const hour = Math.floor(normalized / 60)
  const minute = normalized % 60
  const label = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  return screening.end ? label : `${label} 예상`
}
