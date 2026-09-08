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
  const row = page.locator('.screening-row').first()
  await row.locator('button', { hasText: '+ 추가' }).click()
  await row.locator('button', { hasText: '선택됨' }).waitFor({ state: 'visible' })
  await page.waitForTimeout(400)
  await row.locator('button', { hasText: '선택됨' }).click()
  await page.waitForTimeout(700)

  const rootText = await page.locator('#root').innerText().catch(() => '')
  const appShellCount = await page.locator('.app-shell').count()
  const addButtonCount = await row.locator('button', { hasText: '+ 추가' }).count().catch(() => 0)

  console.log('RESULT', JSON.stringify({
    appShellCount,
    addButtonCount,
    rootTextLength: rootText.length,
    pageErrors,
    consoleErrors,
  }, null, 2))

  if (!appShellCount || rootText.length < 50 || pageErrors.length || !addButtonCount) process.exitCode = 1
} finally {
  await browser.close()
}
