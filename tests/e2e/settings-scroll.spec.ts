import { expect, test, type Page } from '@playwright/test'

async function expectSettingsPageToScroll(page: Page) {
  await page.setViewportSize({ width: 390, height: 700 })
  await page.getByRole('button', { name: '설정' }).click()
  await expect(page.getByRole('heading', { name: '설정', exact: true })).toBeVisible()

  const metrics = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    viewportHeight: window.innerHeight,
    scrollY: window.scrollY,
  }))
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.viewportHeight + 20)
  expect(metrics.scrollY).toBe(0)

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
  await expect(page.getByRole('button', { name: '기본값으로 초기화' })).toBeInViewport()
}

test('settings can scroll when opened immediately after first load', async ({ page }) => {
  await page.goto('./')
  await expectSettingsPageToScroll(page)
})

test('settings releases the timetable viewport lock before scrolling', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: '내 시간표' }).click()
  await expect(page.locator('.app-shell')).toHaveClass(/timetable-mode/)
  await expectSettingsPageToScroll(page)

  const shell = page.locator('.app-shell')
  const overflow = await shell.evaluate((element) => getComputedStyle(element).overflow)
  expect(overflow).not.toBe('hidden')
})
