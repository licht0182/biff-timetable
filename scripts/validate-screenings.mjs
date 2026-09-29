import { readFile } from 'node:fs/promises'

const path = new URL('../public/screenings.json', import.meta.url)
const raw = await readFile(path, 'utf8')
const data = JSON.parse(raw)

const errors = []
const filmIds = new Set()
const screeningIds = new Set()
const screeningCodes = new Map()
const datePattern = /^\d{4}-\d{2}-\d{2}$/
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/

if (!data || !Array.isArray(data.films)) {
  errors.push('top-level films must be an array')
} else {
  for (const [filmIndex, film] of data.films.entries()) {
    const prefix = `films[${filmIndex}]`
    if (!film || typeof film !== 'object') {
      errors.push(`${prefix} must be an object`)
      continue
    }
    if (typeof film.id !== 'string' || !film.id.trim()) errors.push(`${prefix}.id is required`)
    else if (filmIds.has(film.id)) errors.push(`${prefix}.id is duplicated: ${film.id}`)
    else filmIds.add(film.id)

    if (typeof film.title !== 'string' || !film.title.trim()) errors.push(`${prefix}.title is required`)
    if (film.genre != null && (typeof film.genre !== 'string' || !film.genre.trim())) errors.push(`${prefix}.genre must be a non-empty string when present`)
    if (film.runtime != null && (!Number.isFinite(film.runtime) || film.runtime <= 0)) errors.push(`${prefix}.runtime must be a positive number`)
    if (!Array.isArray(film.screenings) || film.screenings.length === 0) {
      errors.push(`${prefix}.screenings must be a non-empty array`)
      continue
    }

    for (const [screeningIndex, screening] of film.screenings.entries()) {
      const sp = `${prefix}.screenings[${screeningIndex}]`
      if (!screening || typeof screening !== 'object') {
        errors.push(`${sp} must be an object`)
        continue
      }
      if (typeof screening.id !== 'string' || !screening.id.trim()) errors.push(`${sp}.id is required`)
      else if (screeningIds.has(screening.id)) errors.push(`${sp}.id is duplicated: ${screening.id}`)
      else screeningIds.add(screening.id)

      if (typeof screening.date !== 'string' || !datePattern.test(screening.date)) errors.push(`${sp}.date must be YYYY-MM-DD`)
      if (typeof screening.start !== 'string' || !timePattern.test(screening.start)) errors.push(`${sp}.start must be HH:MM`)
      if (screening.end != null && (typeof screening.end !== 'string' || !timePattern.test(screening.end))) errors.push(`${sp}.end must be HH:MM when present`)
      if (typeof screening.venue !== 'string' || !screening.venue.trim()) errors.push(`${sp}.venue is required`)
      if (screening.gv != null && typeof screening.gv !== 'boolean') errors.push(`${sp}.gv must be boolean when present`)
      if (screening.code != null && typeof screening.code !== 'string') errors.push(`${sp}.code must be a string when present`)
      if (typeof screening.code === 'string') {
        if (screeningCodes.has(screening.code)) errors.push(`${sp}.code is duplicated: ${screening.code}`)
        else screeningCodes.set(screening.code, { film, screening })
      }
    }
  }
}

if (filmIds.size < 273 || screeningIds.size < 752) {
  errors.push(`official 2026 schedule coverage fell below the 09.29 snapshot: ${filmIds.size} entries, ${screeningIds.size} screenings`)
}

// Ticket-code checks from the official 09.29 change notice and current date schedule.
const expectedUpdates = {
  '010': { end: '17:28' },
  '065': { gv: true },
  '193': { end: '11:39' },
  '432': { end: '13:59' },
  '742': { gv: true },
  '743': { date: '2026-10-07', start: '20:20', title: '그래비티' },
  '806': { start: '16:30' },
  '815': { date: '2026-10-08', start: '12:30' },
  '827': { date: '2026-10-08', start: '13:30', title: '[씨네 클래스] 샤를로트 갱스부르, 그 고요함 속의 열정' },
}
for (const [code, expected] of Object.entries(expectedUpdates)) {
  const item = screeningCodes.get(code)
  if (!item) {
    errors.push(`official update code ${code} is missing`)
    continue
  }
  for (const [key, value] of Object.entries(expected)) {
    const actual = key === 'title' ? item.film.title : item.screening[key]
    if (actual !== value) errors.push(`official update code ${code} ${key}: expected ${value}, got ${actual}`)
  }
}

if (errors.length) {
  console.error(`screenings.json validation failed with ${errors.length} error(s):`)
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log(`screenings.json OK: ${filmIds.size} films, ${screeningIds.size} screenings`)
