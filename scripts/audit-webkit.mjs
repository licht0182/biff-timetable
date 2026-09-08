import fs from 'node:fs'
import assert from 'node:assert/strict'
import { webkit } from 'playwright'

const BASE = 'http://127.0.0.1:4173/biff-timetable/'
const data = JSON.parse(fs.readFileSync('public/screenings.json', 'utf8'))
const item = data.films.flatMap((film) => film.screenings.map((screening) => ({ film, screening }))).find(({ screening }) => {
  const [h] = screening.start.split(':').map(Number)
  return h >= 9 && h < 18
})
assert.ok(item)

const browser = await webkit.launch({ headless: true })
const results = []
async function test(name, fn) {
  try { await fn(); results.push({ name, status: 'PASS' }); console.log('PASS', name) }
  catch (error) { results.push({ name, status: 'FAIL', error: String(error?.stack ?? error) }); console.error('FAIL', name, error) }
}

try {
  await test('WebKit mobile load/search/detail/timetable', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.goto(BASE, { waitUntil: 'networkidle' })
    await page.locator('.controls input').fill(item.film.title)
    await page.locator('.detail-button').first().click()
    const modal = page.locator('.film-modal')
    await modal.waitFor({ state: 'visible' })
    const box = await modal.boundingBox(); assert.ok(box)
    assert.ok(Math.abs((box.x + box.width / 2) - 195) < 20)
    assert.ok(Math.abs((box.y + box.height / 2) - 422) < 20)
    await page.keyboard.press('Escape')
    await page.locator('.screening-row').filter({ hasText: item.screening.start }).first().getByRole('button', { name: '+ 추가' }).click()
    await page.getByRole('button', { name: '내 시간표' }).click()
    await page.locator('.event-block').first().click()
    await page.locator('.film-modal').waitFor({ state: 'visible' })
    await page.keyboard.press('Escape')
    const overflow = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
    assert.ok(overflow.sw <= overflow.cw + 1, JSON.stringify(overflow))
    assert.deepEqual(errors, [])
    await context.close()
  })

  await test('WebKit iPhone PNG path opens save overlay', async () => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.addInitScript(({ id }) => {
      localStorage.setItem('biff-timetable:selected-screenings:v1', JSON.stringify([id]))
      localStorage.setItem('biff-timetable:ticket-status:v1', JSON.stringify({ [id]: 'planned' }))
    }, { id: item.screening.id })
    await page.goto(BASE, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: '내 시간표' }).click()
    const png = page.locator('.png-export-trigger')
    await png.waitFor()
    await png.click()
    await page.locator('.png-ios-overlay').waitFor({ state: 'visible', timeout: 30000 })
    assert.ok(await page.locator('.png-ios-preview').count() === 1)
    assert.deepEqual(errors, [])
    await context.close()
  })
} finally {
  await browser.close()
}

console.log('WEBKIT_SUMMARY=' + JSON.stringify(results))
if (results.some((r) => r.status === 'FAIL')) process.exitCode = 2
