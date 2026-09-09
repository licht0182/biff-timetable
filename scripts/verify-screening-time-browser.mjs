import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const BASE = 'http://127.0.0.1:4173/biff-timetable/'
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(String(error)))
  await page.addInitScript(() => {
    localStorage.setItem('biff-timetable:selected-screenings:v1', JSON.stringify(['biff2025-008']))
    localStorage.setItem('biff-timetable:ticket-status:v1', JSON.stringify({ 'biff2025-008': 'planned' }))
  })
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: '내 시간표' }).click()
  const block = page.locator('.event-block').first()
  await block.waitFor({ state: 'visible' })
  const labels = await page.locator('.time-axis > div').allTextContents()
  assert.equal(labels.at(-1), '06시', `expected midnight timetable to extend to 06시, got ${labels.at(-1)}`)
  const metrics = await page.evaluate(() => {
    const block = document.querySelector('.event-block')
    const column = block?.closest('.day-column')
    if (!(block instanceof HTMLElement) || !(column instanceof HTMLElement)) return null
    const b = block.getBoundingClientRect()
    const c = column.getBoundingClientRect()
    return { blockTop: b.top, blockBottom: b.bottom, columnTop: c.top, columnBottom: c.bottom }
  })
  assert.ok(metrics)
  assert.ok(metrics.blockTop >= metrics.columnTop - 1, JSON.stringify(metrics))
  assert.ok(metrics.blockBottom <= metrics.columnBottom + 1, JSON.stringify(metrics))
  assert.deepEqual(pageErrors, [])
  console.log('screening time browser regression passed')
} finally {
  await browser.close()
}
