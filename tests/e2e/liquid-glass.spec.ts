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

test('extends into the iPhone safe area with a transparent refractive glass dock', async ({ page }) => {
  const viewport = await page.locator('meta[name="viewport"]').getAttribute('content')
  expect(viewport).toContain('viewport-fit=cover')

  const metrics = await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>('.app-shell')!
    const nav = document.querySelector<HTMLElement>('.liquid-tab-bar')!
    const surface = document.querySelector<HTMLElement>('.liquid-tab-bar-surface')!
    const icon = document.querySelector<HTMLElement>('.liquid-tab-icon')!
    const surfaceStyle = getComputedStyle(surface)
    const iconStyle = getComputedStyle(icon)
    return {
      bottomGap: window.innerHeight - surface.getBoundingClientRect().bottom,
      shellPaddingBottom: Number.parseFloat(getComputedStyle(shell).paddingBottom),
      surfaceHeight: surface.getBoundingClientRect().height,
      surfaceBackground: surfaceStyle.backgroundImage,
      surfaceBackgroundColor: surfaceStyle.backgroundColor,
      surfaceBackdrop: surfaceStyle.backdropFilter || surfaceStyle.webkitBackdropFilter,
      iconWidth: icon.getBoundingClientRect().width,
      iconRadius: iconStyle.borderRadius,
    }
  })

  expect(metrics.bottomGap).toBeGreaterThanOrEqual(11)
  expect(metrics.shellPaddingBottom).toBeGreaterThanOrEqual(metrics.surfaceHeight + 24)
  expect(metrics.surfaceBackground).not.toBe('none')
  expect(Number(metrics.surfaceBackgroundColor.match(/[\d.]+(?=\)$)/)?.[0])).toBeLessThanOrEqual(0.2)
  expect(metrics.surfaceBackdrop).toContain('blur(')
  expect(metrics.iconWidth).toBeGreaterThanOrEqual(54)
  expect(metrics.iconRadius).toBe('19px')
})

test('progressively enhances navigation, content, and overlay surfaces with SVG refraction', async ({ page, browserName }) => {
  const topbar = page.locator('.topbar')
  const tabBarSurface = page.locator('.liquid-tab-bar-surface')
  const firstFilmCard = page.locator('.film-card').first()

  await expect(topbar).toHaveAttribute('data-liquid-glass', 'navigation')
  await expect(tabBarSurface).toHaveAttribute('data-liquid-glass', 'navigation')
  await expect(firstFilmCard).toHaveAttribute('data-liquid-glass', 'content')
  await expect.poll(() => page.locator('.liquid-glass-filter-defs filter').count()).toBeGreaterThanOrEqual(5)
  await expect(topbar.locator(':scope > .liquid-glass-refraction-layer')).toHaveCount(1)
  await expect(tabBarSurface.locator(':scope > .liquid-glass-refraction-layer')).toHaveCount(1)
  await expect(firstFilmCard.locator(':scope > .liquid-glass-refraction-layer')).toHaveCount(1)
  await expect.poll(() => firstFilmCard.locator(':scope > .liquid-glass-refraction-layer').evaluate((element) => getComputedStyle(element).filter)).toContain('url(')

  if (browserName === 'chromium') {
    await expect.poll(() => topbar.evaluate((element) => getComputedStyle(element).backdropFilter)).toContain('url(')
  } else {
    await expect.poll(() => topbar.evaluate((element) => getComputedStyle(element).backdropFilter || getComputedStyle(element).webkitBackdropFilter)).toContain('blur(')
  }

  await page.getByRole('button', { name: '상세', exact: true }).first().click()
  const modal = page.locator('.film-modal')
  await expect(modal).toHaveAttribute('data-liquid-glass', 'modal')
  await expect(modal.locator(':scope > .liquid-glass-refraction-layer')).toHaveCount(1)
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

test('keeps the light neutral palette in dark appearance and keeps motion optional', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ios-bg').trim())).toBe('#e5e7eb')
  await expect.poll(() => page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.film-card')!).transitionDuration))).toBeLessThan(0.001)
})

test('keeps content, controls, and overlays on translucent glass surfaces', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  const expectGlassSurface = async (selector: string) => {
    await expect(page.locator(selector).first(), `${selector} should be visible`).toBeVisible()
    const rgba = await page.evaluate((target) => {
      const element = document.querySelector(target)
      return element ? getComputedStyle(element).backgroundColor.match(/\d+(?:\.\d+)?/g)?.map(Number) : null
    }, selector)
    expect(rgba, `${selector} should expose a translucent background`).toBeTruthy()
    expect(rgba!.at(-1), `${selector} should keep the light-gray canvas visible`).toBeLessThan(0.5)
  }

  await expectGlassSurface('.favorite-button')
  await page.getByRole('button', { name: '상세', exact: true }).first().click()
  await expectGlassSurface('.film-detail-grid')
  await page.keyboard.press('Escape')

  const tabBar = page.locator('.liquid-tab-bar')
  await tabBar.getByRole('button', { name: '설정' }).click()
  await expectGlassSurface('.biff-settings-panel')
  await expectGlassSurface('.settings-card-head')

  await tabBar.getByRole('button', { name: 'AI 도슨트' }).click()
  await expectGlassSurface('.curator-card')

  await tabBar.getByRole('button', { name: '내 시간표' }).click()
  await page.getByRole('button', { name: /일정 추가/ }).click()
  await expectGlassSurface('.custom-event-form input[type="text"]')
  await expectGlassSurface('.custom-event-form-actions button:first-child')
})

test('uses a solid light-gray canvas with dark readable text', async ({ page }) => {
  const palette = await page.evaluate(() => {
    const bodyBefore = getComputedStyle(document.body, '::before')
    const heading = getComputedStyle(document.querySelector('.film-card h2')!)
    const input = getComputedStyle(document.querySelector('.film-search-autocomplete input')!)
    return {
      backgroundImage: bodyBefore.backgroundImage,
      backgroundColor: bodyBefore.backgroundColor,
      headingColor: heading.color,
      inputColor: input.color,
    }
  })
  expect(palette.backgroundImage).toBe('none')
  expect(palette.backgroundColor).toBe('rgb(229, 231, 235)')
  expect(palette.headingColor).toBe('rgb(17, 24, 39)')
  expect(palette.inputColor).toBe('rgb(17, 24, 39)')
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
