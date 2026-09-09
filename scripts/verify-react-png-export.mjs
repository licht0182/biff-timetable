import assert from 'node:assert/strict'
import { chromium, webkit } from 'playwright'

const BASE = 'http://127.0.0.1:4173/biff-timetable/'
const SELECTED_KEY = 'biff-timetable:selected-screenings:v1'
const TICKET_KEY = 'biff-timetable:ticket-status:v1'

async function seed(page) {
  await page.addInitScript(({ selectedKey, ticketKey }) => {
    localStorage.setItem(selectedKey, JSON.stringify(['biff2025-008']))
    localStorage.setItem(ticketKey, JSON.stringify({ 'biff2025-008': 'planned' }))
  }, { selectedKey: SELECTED_KEY, ticketKey: TICKET_KEY })
}

const chromiumBrowser = await chromium.launch({ headless: true })
try {
  const page = await chromiumBrowser.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await seed(page)
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: '내 시간표' }).click()
  const trigger = page.locator('.png-export-trigger')
  assert.equal(await trigger.count(), 1, 'React should render exactly one PNG trigger')

  await page.getByRole('button', { name: '영화 찾기' }).click()
  await page.getByRole('button', { name: '내 시간표' }).click()
  assert.equal(await page.locator('.png-export-trigger').count(), 1, 'tab switching must not duplicate PNG trigger')

  const downloadPromise = page.waitForEvent('download', { timeout: 20000 })
  await page.locator('.png-export-trigger').click()
  const download = await downloadPromise
  assert.equal(download.suggestedFilename(), 'BIFF-timetable.png')
  assert.deepEqual(errors, [])
  console.log('PASS Chromium React-owned PNG download')
} finally {
  await chromiumBrowser.close()
}

const webkitBrowser = await webkit.launch({ headless: true })
try {
  const context = await webkitBrowser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await seed(page)
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: '내 시간표' }).click()
  await page.locator('.png-export-trigger').click()
  await page.locator('.png-ios-overlay').waitFor({ state: 'visible', timeout: 20000 })
  assert.equal(await page.locator('.png-ios-overlay').count(), 1)
  assert.deepEqual(errors, [])
  console.log('PASS WebKit iPhone PNG save overlay')
  await context.close()
} finally {
  await webkitBrowser.close()
}
