import assert from 'node:assert/strict'
import fs from 'node:fs'
import { chromium } from 'playwright'

const data = JSON.parse(fs.readFileSync('public/screenings.json', 'utf8'))
const items = data.films.flatMap((film) => film.screenings.map((screening) => ({ film, screening })))
const toMinutes = (time) => { const [h, m] = time.split(':').map(Number); return h * 60 + m }
const endMinutes = (item) => {
  const start = toMinutes(item.screening.start)
  if (item.screening.end) {
    let end = toMinutes(item.screening.end)
    if (end <= start) end += 1440
    return end
  }
  return start + (item.film.runtime ?? 120)
}

let conflictPair = null
outerConflict: for (const a of items) {
  for (const b of items) {
    if (a.screening.id === b.screening.id || a.screening.date !== b.screening.date || a.film.id === b.film.id) continue
    const overlap = toMinutes(a.screening.start) < endMinutes(b) && toMinutes(b.screening.start) < endMinutes(a)
    if (overlap) { conflictPair = [a, b]; break outerConflict }
  }
}
assert.ok(conflictPair, 'No conflict pair found')

let travelPair = null
outerTravel: for (const a of items) {
  for (const b of items) {
    if (a.screening.id === b.screening.id || a.screening.date !== b.screening.date || a.film.id === b.film.id) continue
    if (a.screening.venue !== b.screening.venue) continue
    const gap = toMinutes(b.screening.start) - endMinutes(a)
    if (gap >= 0 && gap < 120) { travelPair = [a, b]; break outerTravel }
  }
}
assert.ok(travelPair, 'No same-venue travel pair found')

const browser = await chromium.launch({ headless: true })
const errors = []
try {
  async function openDetail(selectedId, targetFilm, settings = null) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await context.newPage()
    page.on('pageerror', (error) => errors.push(String(error)))
    await page.addInitScript(({ selectedId, settings }) => {
      localStorage.setItem('biff-timetable:selected-screenings:v1', JSON.stringify([selectedId]))
      localStorage.setItem('biff-timetable:ticket-status:v1', JSON.stringify({ [selectedId]: 'planned' }))
      if (settings) localStorage.setItem('biff-timetable:user-settings:v1', JSON.stringify(settings))
    }, { selectedId, settings })
    await page.goto('http://127.0.0.1:4173/biff-timetable/', { waitUntil: 'networkidle' })
    await page.locator('.controls input').fill(targetFilm.title)
    await page.locator('.detail-button').first().click()
    await page.locator('.film-modal').waitFor({ state: 'visible' })
    return { context, page }
  }

  const [conflictSelected, conflictTarget] = conflictPair
  {
    const { context, page } = await openDetail(conflictSelected.screening.id, conflictTarget.film)
    const note = page.locator('.modal-screening-note', { hasText: '선택한 회차와 시간이 겹칩니다.' })
    assert.ok(await note.count() > 0, 'Conflict warning missing from film detail modal')
    assert.ok(await note.first().locator('xpath=ancestor::div[contains(@class,"conflict")]').count() > 0, 'Conflict row style missing')
    await context.close()
  }

  const [travelSelected, travelTarget] = travelPair
  {
    const settings = {
      sameVenueMinutes: 120,
      sameClusterMinutes: 10,
      differentVenueMinutes: 30,
      showTransferWarnings: true,
      showVenueInTimetable: true,
      showBookingStatusInTimetable: true,
    }
    const { context, page } = await openDetail(travelSelected.screening.id, travelTarget.film, settings)
    const note = page.locator('.modal-screening-note', { hasText: '동일 상영관 · 이동 여유' })
    assert.ok(await note.count() > 0, 'Travel warning missing from film detail modal')
    assert.ok((await note.first().textContent())?.includes('필요 120분'), 'Travel buffer detail missing')
    await context.close()
  }

  assert.deepEqual(errors, [])
  console.log(JSON.stringify({
    conflict: `${conflictSelected.film.title} -> ${conflictTarget.film.title}`,
    travel: `${travelSelected.film.title} -> ${travelTarget.film.title}`,
    errors,
  }, null, 2))
} finally {
  await browser.close()
}
