import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const BASE = 'http://127.0.0.1:4173/biff-timetable/'
const keys = {
  selected: 'biff-timetable:selected-screenings:v1',
  favorites: 'biff-timetable:favorites:v1',
  ticket: 'biff-timetable:ticket-status:v1',
  settings: 'biff-timetable:user-settings:v1',
}

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(String(error)))
  await page.addInitScript(({ keys }) => {
    localStorage.setItem(keys.selected, JSON.stringify({ bad: true }))
    localStorage.setItem(keys.favorites, JSON.stringify([1, 'film-ok', 'film-ok', '', null]))
    localStorage.setItem(keys.ticket, JSON.stringify({ valid: 'planned', invalid: 'nope', booked: 'booked', blank: 1 }))
    localStorage.setItem(keys.settings, JSON.stringify({ sameVenueMinutes: 'bad', sameClusterMinutes: 14.4, showTransferWarnings: 'yes' }))
  }, { keys })
  await page.goto(BASE, { waitUntil: 'networkidle' })
  assert.equal(await page.locator('.app-shell').count(), 1, `app shell missing; errors=${JSON.stringify(pageErrors)}`)
  assert.deepEqual(pageErrors, [])

  const stored = await page.evaluate(({ keys }) => ({
    selected: JSON.parse(localStorage.getItem(keys.selected) ?? 'null'),
    favorites: JSON.parse(localStorage.getItem(keys.favorites) ?? 'null'),
    ticket: JSON.parse(localStorage.getItem(keys.ticket) ?? 'null'),
    settings: JSON.parse(localStorage.getItem(keys.settings) ?? 'null'),
  }), { keys })

  assert.deepEqual(stored.selected, [])
  assert.deepEqual(stored.favorites, ['film-ok'])
  assert.deepEqual(stored.ticket, { valid: 'planned', booked: 'booked' })
  assert.equal(stored.settings.sameVenueMinutes, 0)
  assert.equal(stored.settings.sameClusterMinutes, 14)
  assert.equal(stored.settings.differentVenueMinutes, 30)
  assert.equal(stored.settings.showTransferWarnings, true)
  assert.equal(stored.settings.showVenueInTimetable, true)
  assert.equal(stored.settings.showBookingStatusInTimetable, true)
  console.log('storage normalization regression passed')
} finally {
  await browser.close()
}
