import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const pageErrors = []
const consoleErrors = []
page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)))
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text())
})

try {
  await page.goto('http://127.0.0.1:4173/biff-timetable/', { waitUntil: 'networkidle' })
  await page.locator('.film-card').first().waitFor({ state: 'visible' })

  await page.locator('.settings-tab-trigger').click()
  await page.locator('.react-settings-panel').waitFor({ state: 'visible' })
  const clusterInput = page.locator('.settings-number-control input').nth(1)
  await clusterInput.fill('15')
  await page.locator('.tabs button', { hasText: '영화 찾기' }).click()
  await page.locator('.film-card').first().waitFor({ state: 'visible' })

  const row = page.locator('.screening-row').first()
  await row.locator('button', { hasText: '+ 추가' }).click()
  await row.locator('button', { hasText: '선택됨' }).waitFor({ state: 'visible' })
  await page.waitForTimeout(400)
  await row.locator('button', { hasText: '선택됨' }).click()
  await page.waitForTimeout(700)

  const rootText = await page.locator('#root').innerText().catch(() => '')
  const appShellCount = await page.locator('.app-shell').count()
  const addButtonCount = await row.locator('button', { hasText: '+ 추가' }).count().catch(() => 0)
  const storedSettings = await page.evaluate(() => localStorage.getItem('biff-timetable:user-settings:v1'))

  console.log('RESULT', JSON.stringify({
    appShellCount,
    addButtonCount,
    rootTextLength: rootText.length,
    storedSettings,
    pageErrors,
    consoleErrors,
  }, null, 2))

  if (!appShellCount || rootText.length < 50 || pageErrors.length || !addButtonCount || !storedSettings?.includes('15')) process.exitCode = 1
} finally {
  await browser.close()
}
