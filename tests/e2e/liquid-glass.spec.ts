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

test('progressively enhances only navigation and overlay surfaces with SVG refraction', async ({ page, browserName }) => {
  const topbar = page.locator('.topbar')
  const tabBarSurface = page.locator('.liquid-tab-bar-surface')

  if (browserName === 'chromium') {
    await expect(topbar).toHaveAttribute('data-liquid-glass', 'navigation')
    await expect(tabBarSurface).toHaveAttribute('data-liquid-glass', 'navigation')
    await expect.poll(() => page.locator('.liquid-glass-filter-defs filter').count()).toBeGreaterThanOrEqual(3)
    await expect.poll(() => topbar.evaluate((element) => getComputedStyle(element).backdropFilter)).toContain('url(')
    await expect(page.locator('.film-card').first()).not.toHaveAttribute('data-liquid-glass', /.+/)

    await page.getByRole('button', { name: '상세', exact: true }).first().click()
    await expect(page.locator('.film-modal')).toHaveAttribute('data-liquid-glass', 'modal')
    await expect.poll(() => page.locator('.film-modal').evaluate((element) => getComputedStyle(element).backdropFilter)).toContain('url(')
  } else {
    await expect(topbar).not.toHaveAttribute('data-liquid-glass', /.+/)
    await expect(tabBarSurface).not.toHaveAttribute('data-liquid-glass', /.+/)
    await expect(page.locator('.liquid-glass-filter-defs')).toHaveCount(0)
    await expect.poll(() => tabBarSurface.evaluate((element) => getComputedStyle(element).backdropFilter)).toContain('blur(')
  }
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

test('keeps content, controls, and overlays on dark semantic surfaces', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  const expectDarkSurface = async (selector: string) => {
    await expect(page.locator(selector).first(), `${selector} should be visible`).toBeVisible()
    const rgb = await page.evaluate((target) => {
      const element = document.querySelector(target)
      return element ? getComputedStyle(element).backgroundColor.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number) : null
    }, selector)
    expect(rgb, `${selector} should exist and have an opaque dark surface`).toBeTruthy()
    expect(Math.max(...rgb!)).toBeLessThan(70)
  }

  await expectDarkSurface('.favorite-button')
  await page.getByRole('button', { name: '상세', exact: true }).first().click()
  await expectDarkSurface('.film-detail-grid')
  await page.keyboard.press('Escape')

  const tabBar = page.locator('.liquid-tab-bar')
  await tabBar.getByRole('button', { name: '설정' }).click()
  await expectDarkSurface('.biff-settings-panel')
  await expectDarkSurface('.settings-card-head')

  await tabBar.getByRole('button', { name: 'AI 도슨트' }).click()
  await expectDarkSurface('.curator-card')

  await tabBar.getByRole('button', { name: '내 시간표' }).click()
  await page.getByRole('button', { name: /일정 추가/ }).click()
  await expectDarkSurface('.custom-event-form input[type="text"]')
  await expectDarkSurface('.custom-event-form-actions button:first-child')
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
