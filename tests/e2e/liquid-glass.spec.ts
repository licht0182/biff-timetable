import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 })
  await page.goto('./')
  await expect(page.locator('.film-card').first()).toBeVisible()
})

test('uses an accessible floating tab bar for primary mobile navigation', async ({ page }) => {
  const tabBar = page.locator('.liquid-tab-bar')
  await expect(tabBar).toBeVisible()
  await expect(tabBar.getByRole('button', { name: '영화 찾기' })).toHaveAttribute('aria-current', 'page')

  await tabBar.getByRole('button', { name: '내 시간표' }).click()
  await expect(tabBar.getByRole('button', { name: '내 시간표' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByText('아직 시간표에 일정이 없습니다.')).toBeVisible()

  await tabBar.getByRole('button', { name: '설정' }).click()
  await expect(tabBar.getByRole('button', { name: '설정' })).toHaveAttribute('aria-current', 'page')
  await expect(page.locator('.settings-intro').getByRole('heading', { name: '설정' })).toBeVisible()
})

test('presents advanced filters as a dismissible bottom sheet', async ({ page }) => {
  await page.getByRole('button', { name: /날짜·상영관·시간대/ }).click()
  const sheet = page.locator('#film-advanced-filters')
  await expect(sheet).toBeVisible()
  await expect(page.locator('body')).toHaveClass(/filter-sheet-open/)
  await expect(page.getByRole('combobox', { name: '날짜' })).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  await expect(page.locator('body')).not.toHaveClass(/filter-sheet-open/)
})

test('adapts tokens to dark appearance and keeps motion optional', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ios-bg').trim())).toBe('#000')
  await expect.poll(() => page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.film-card')!).transitionDuration))).toBeLessThan(0.001)
})

test('publishes an installable scoped web app manifest', async ({ page, request }) => {
  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(href).toBeTruthy()
  const response = await request.get(new URL(href!, page.url()).toString())
  expect(response.ok()).toBeTruthy()
  const manifest = await response.json()
  expect(manifest).toMatchObject({
    name: 'BIFF Timetable',
    start_url: '/biff-timetable/',
    scope: '/biff-timetable/',
    display: 'standalone',
  })
})
