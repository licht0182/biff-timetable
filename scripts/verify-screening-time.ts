import assert from 'node:assert/strict'
import type { Film, Screening } from '../src/components/film-types'
import {
  screeningAbsoluteWindow,
  screeningEndOffsetMinutes,
  screeningsOverlap,
  timetableDate,
  timetableEndMinutes,
  timetableStartMinutes,
} from '../src/screening-time'

function screening(id: string, date: string, start: string, end?: string): Screening {
  return { id, date, start, end, venue: 'test venue' }
}

function film(id: string, runtime: number, item: Screening): Film {
  return { id, title: id, runtime, screenings: [item] }
}

const late = screening('late', '2026-10-10', '23:59')
const lateFilm = film('late-film', 180, late)
const earlyOverlap = screening('early-overlap', '2026-10-11', '01:00', '03:00')
const earlyOverlapFilm = film('early-overlap-film', 120, earlyOverlap)
assert.equal(screeningsOverlap(lateFilm, late, earlyOverlapFilm, earlyOverlap), true, 'cross-date overlap must be detected')

const shortLate = screening('short-late', '2026-10-10', '23:59')
const shortLateFilm = film('short-late-film', 31, shortLate)
assert.equal(screeningsOverlap(shortLateFilm, shortLate, earlyOverlapFilm, earlyOverlap), false, 'non-overlap across midnight must stay allowed')

const early = screening('early', '2026-10-11', '01:00', '03:00')
const earlyFilm = film('early-film', 120, early)
assert.equal(timetableDate(early), '2026-10-10', '01:00 session belongs to previous 08:00-based timetable day')
assert.equal(timetableStartMinutes(early), 25 * 60)
assert.equal(timetableEndMinutes(earlyFilm, early), 27 * 60)
assert.equal(screeningEndOffsetMinutes(earlyFilm, early), 3 * 60)

const midnight = screening('midnight', '2026-10-10', '23:59')
const midnightFilm = film('midnight-film', 340, midnight)
assert.equal(timetableEndMinutes(midnightFilm, midnight), 29 * 60 + 39, '23:59 + 340m should end at display 05:39')
const midnightWindow = screeningAbsoluteWindow(midnightFilm, midnight)
assert.equal(midnightWindow.end - midnightWindow.start, 340)

console.log('screening time engine regressions passed')
