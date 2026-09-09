import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const BASE = 'http://127.0.0.1:4173/biff-timetable/'
const keys = {
  selected: 'biff-timetable:selected-screenings:v1',
  favorites: 'biff-timetable:favorites:v1',
  ticket: 'biff-timetable:ticket-status:v1',
  version: 'biff-timetable:data-version:v1',
}

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(String(error)))
  await page.addInitScript(({ keys }) => {
    localStorage.setItem(keys.selected, JSON.stringify(['biff2025-808', 'legacy-screening']))
    localStorage.setItem(keys.favorites, JSON.stringify(['biff2025-event-808', 'legacy-film']))
    localStorage.setItem(keys.ticket, JSON.stringify({ 'biff2025-808': 'booked', 'legacy-screening': 'planned' }))
    localStorage.setItem(keys.version, JSON.stringify('legacy-2025'))
  }, { keys })

  await page.goto(BASE, { waitUntil: 'networkidle' })
  assert.equal(await page.locator('.app-shell').count(), 1)
  assert.deepEqual(pageErrors, [])

  await page.waitForFunction(({ keys }) => localStorage.getItem(keys.version)?.includes('2025-test-20260908-2'), { keys })
  const stored = await page.evaluate(({ keys }) => ({
    selected: JSON.parse(localStorage.getItem(keys.selected) ?? 'null'),
    favorites: JSON.parse(localStorage.getItem(keys.favorites) ?? 'null'),
    ticket: JSON.parse(localStorage.getItem(keys.ticket) ?? 'null'),
    version: JSON.parse(localStorage.getItem(keys.version) ?? 'null'),
  }), { keys })

  assert.deepEqual(stored.selected, ['biff2025-808'])
  assert.deepEqual(stored.favorites, ['biff2025-event-808'])
  assert.deepEqual(stored.ticket, { 'biff2025-808': 'booked' })
  assert.equal(stored.version, '2025-test-20260908-2')
  console.log('data version migration regression passed')
} finally {
  await browser.close()
}
