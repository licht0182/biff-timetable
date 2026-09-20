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

test('keeps the browser dock outside Safari toolbar tint sampling', async ({ page, browserName }) => {
  const viewport = await page.locator('meta[name="viewport"]').getAttribute('content')
  expect(viewport).toContain('viewport-fit=cover')

  const metrics = await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>('.app-shell')!
    const nav = document.querySelector<HTMLElement>('.liquid-tab-bar')!
    const surface = document.querySelector<HTMLElement>('.liquid-tab-bar-surface')!
    const icon = document.querySelector<HTMLElement>('.liquid-tab-icon')!
    const surfaceStyle = getComputedStyle(surface)
    const navStyle = getComputedStyle(nav)
    const dockBackdrop = surfaceStyle.backdropFilter || surfaceStyle.webkitBackdropFilter
    const refractionLayer = surface.querySelector<HTMLElement>(':scope > .liquid-glass-refraction-layer')
    const refractionStyle = refractionLayer ? getComputedStyle(refractionLayer) : null
    const surfaceHighlight = getComputedStyle(surface, '::after')
    const dockScrim = getComputedStyle(nav, '::before')
    const iconStyle = getComputedStyle(icon)
    return {
      bottomGap: window.innerHeight - surface.getBoundingClientRect().bottom,
      navPosition: navStyle.position,
      navTimeline: navStyle.animationTimeline,
      navPaddingBottom: Number.parseFloat(navStyle.paddingBottom),
      shellPaddingBottom: Number.parseFloat(getComputedStyle(shell).paddingBottom),
      surfaceHeight: surface.getBoundingClientRect().height,
      surfaceBackground: surfaceStyle.backgroundImage,
      surfaceBackgroundColor: surfaceStyle.backgroundColor,
      surfaceBackdrop: dockBackdrop,
      surfaceFilter: surfaceStyle.filter,
      refractionDisplay: refractionStyle?.display,
      surfaceHighlightDisplay: surfaceHighlight.display,
      dockScrimContent: dockScrim.content,
      iconWidth: icon.getBoundingClientRect().width,
      iconRadius: iconStyle.borderRadius,
    }
  })

  expect(metrics.bottomGap).toBeGreaterThanOrEqual(7)
  expect(metrics.bottomGap).toBeLessThanOrEqual(9)
  expect(metrics.navPaddingBottom).toBe(0)
  expect(metrics.shellPaddingBottom).toBeGreaterThanOrEqual(metrics.surfaceHeight + 24)
  expect(metrics.surfaceBackground).not.toBe('none')
  const dockAlpha = Number(metrics.surfaceBackgroundColor.match(/[\d.]+(?=\)$)/)?.[0])
  expect(dockAlpha).toBeGreaterThan(0.2)
  expect(dockAlpha).toBeLessThan(0.95)
  expect(metrics.navPosition).toBe('fixed')
  expect(metrics.surfaceBackdrop).toContain('blur(')
  expect(metrics.surfaceBackdrop).toContain('12px')
  if (browserName === 'webkit') {
    expect(metrics.navTimeline).not.toContain('scroll(root)')
    expect(metrics.surfaceFilter).toBe('none')
    expect(metrics.refractionDisplay).toBeUndefined()
    expect(metrics.surfaceHighlightDisplay).toBe('none')
  }
  expect(metrics.dockScrimContent).toBe('none')
  expect(metrics.iconWidth).toBeGreaterThanOrEqual(54)
  expect(metrics.iconRadius).toBe('19px')

  if (browserName === 'webkit') {
    await page.setViewportSize({ width: 588, height: 1194 })
    await page.evaluate(() => window.scrollTo(0, 900))
    await expect.poll(() => page.evaluate(() => {
      const nav = document.querySelector<HTMLElement>('.liquid-tab-bar')!
      const surface = document.querySelector<HTMLElement>('.liquid-tab-bar-surface')!
      const rect = surface.getBoundingClientRect()
      return {
        position: getComputedStyle(nav).position,
        gap: Math.round(window.innerHeight - rect.bottom),
        visible: rect.top < window.innerHeight && rect.bottom > 0,
      }
    })).toEqual({ position: 'fixed', gap: 8, visible: true })
  }
})

test('keeps SVG refraction on stable glass while content avoids ghost-prone filter layers', async ({ page, browserName }) => {
  const topbar = page.locator('.topbar')
  const tabBarSurface = page.locator('.liquid-tab-bar-surface')
  const firstFilmCard = page.locator('.film-card').first()

  await expect(topbar).toHaveAttribute('data-liquid-glass', 'navigation')
  await expect(tabBarSurface).toHaveAttribute('data-liquid-glass', 'navigation')
  await expect(firstFilmCard).toHaveAttribute('data-liquid-glass', 'content')
  await expect(firstFilmCard.locator(':scope > .liquid-glass-refraction-layer')).toHaveCount(0)
  await expect(firstFilmCard).not.toHaveClass(/liquid-glass-backdrop-refraction/)

  if (browserName === 'webkit') {
    await expect.poll(() => page.locator('.liquid-glass-filter-defs filter').count()).toBe(0)
    await expect(topbar.locator(':scope > .liquid-glass-refraction-layer')).toHaveCount(0)
    await expect(tabBarSurface.locator(':scope > .liquid-glass-refraction-layer')).toHaveCount(0)
    await expect.poll(() => topbar.evaluate((element) => getComputedStyle(element).backdropFilter || getComputedStyle(element).webkitBackdropFilter)).toContain('blur(')
  } else {
    await expect.poll(() => page.locator('.liquid-glass-filter-defs filter').count()).toBeGreaterThanOrEqual(3)
    await expect(topbar.locator(':scope > .liquid-glass-refraction-layer')).toHaveCount(1)
    await expect(tabBarSurface.locator(':scope > .liquid-glass-refraction-layer')).toHaveCount(1)

    const layerCompositing = await topbar.locator(':scope > .liquid-glass-refraction-layer').evaluate((element) => {
      const style = getComputedStyle(element)
      return { mixBlendMode: style.mixBlendMode, willChange: style.willChange, filter: style.filter }
    })
    expect(layerCompositing.mixBlendMode).toBe('normal')
    expect(layerCompositing.willChange).not.toContain('filter')
    expect(layerCompositing.filter).toContain('url(')
    await expect.poll(() => topbar.evaluate((element) => getComputedStyle(element).backdropFilter)).toContain('url(')
  }

  await page.getByRole('button', { name: '상세', exact: true }).first().click()
  const modal = page.locator('.film-modal')
  await expect(modal).toHaveAttribute('data-liquid-glass', 'modal')
  await expect(modal.locator(':scope > .liquid-glass-refraction-layer')).toHaveCount(browserName === 'webkit' ? 0 : 1)
})

test('renders one rounded rim geometry with black above white everywhere', async ({ page }) => {
  const expectAlignedRim = async (selector: string) => {
    const surface = page.locator(selector).first()
    await expect(surface).toBeVisible()
    await expect(surface).toHaveClass(/liquid-glass-edge-host/)
    await expect(surface.locator(':scope > .liquid-glass-edge-layer')).toHaveCount(1)
    await expect(surface.locator(':scope > .liquid-glass-edge-highlight-layer')).toHaveCount(1)

    const metrics = await surface.evaluate((element) => {
      const hostStyle = getComputedStyle(element)
      const dark = element.querySelector<HTMLElement>(':scope > .liquid-glass-edge-layer')!
      const white = element.querySelector<HTMLElement>(':scope > .liquid-glass-edge-highlight-layer')!
      const darkStyle = getComputedStyle(dark)
      const whiteStyle = getComputedStyle(white)
      const hostRect = element.getBoundingClientRect()
      const darkRect = dark.getBoundingClientRect()
      const whiteRect = white.getBoundingClientRect()
      return {
        hostRect: { x: hostRect.x, y: hostRect.y, width: hostRect.width, height: hostRect.height },
        darkRect: { x: darkRect.x, y: darkRect.y, width: darkRect.width, height: darkRect.height },
        whiteRect: { x: whiteRect.x, y: whiteRect.y, width: whiteRect.width, height: whiteRect.height },
        hostRadius: [
          hostStyle.borderTopLeftRadius,
          hostStyle.borderTopRightRadius,
          hostStyle.borderBottomRightRadius,
          hostStyle.borderBottomLeftRadius,
        ],
        darkRadius: [
          darkStyle.borderTopLeftRadius,
          darkStyle.borderTopRightRadius,
          darkStyle.borderBottomRightRadius,
          darkStyle.borderBottomLeftRadius,
        ],
        whiteRadius: [
          whiteStyle.borderTopLeftRadius,
          whiteStyle.borderTopRightRadius,
          whiteStyle.borderBottomRightRadius,
          whiteStyle.borderBottomLeftRadius,
        ],
        hostBorderWidths: [
          hostStyle.borderTopWidth,
          hostStyle.borderRightWidth,
          hostStyle.borderBottomWidth,
          hostStyle.borderLeftWidth,
        ],
        darkPadding: [
          darkStyle.paddingTop,
          darkStyle.paddingRight,
          darkStyle.paddingBottom,
          darkStyle.paddingLeft,
        ],
        whitePadding: [
          whiteStyle.paddingTop,
          whiteStyle.paddingRight,
          whiteStyle.paddingBottom,
          whiteStyle.paddingLeft,
        ],
        darkBackground: darkStyle.backgroundImage,
        whiteBackground: whiteStyle.backgroundImage,
        darkMask: darkStyle.maskImage || darkStyle.webkitMaskImage,
        whiteMask: whiteStyle.maskImage || whiteStyle.webkitMaskImage,
        darkMaskComposite: darkStyle.maskComposite || darkStyle.webkitMaskComposite,
        whiteMaskComposite: whiteStyle.maskComposite || whiteStyle.webkitMaskComposite,
        darkZIndex: Number.parseInt(darkStyle.zIndex, 10),
        whiteZIndex: Number.parseInt(whiteStyle.zIndex, 10),
        overflow: hostStyle.overflow,
      }
    })

    const closeEnough = (left: number, right: number) => Math.abs(left - right) <= 0.2
    for (const rect of [metrics.darkRect, metrics.whiteRect]) {
      expect(closeEnough(rect.x, metrics.hostRect.x)).toBeTruthy()
      expect(closeEnough(rect.y, metrics.hostRect.y)).toBeTruthy()
      expect(closeEnough(rect.width, metrics.hostRect.width)).toBeTruthy()
      expect(closeEnough(rect.height, metrics.hostRect.height)).toBeTruthy()
    }

    expect(metrics.hostBorderWidths).toEqual(['0px', '0px', '0px', '0px'])
    expect(metrics.darkRadius).toEqual(metrics.hostRadius)
    expect(metrics.whiteRadius).toEqual(metrics.hostRadius)
    expect(metrics.darkPadding).toEqual(['1px', '1px', '1px', '1px'])
    expect(metrics.whitePadding).toEqual(['1px', '1px', '1px', '1px'])
    expect(metrics.darkZIndex).toBeGreaterThan(metrics.whiteZIndex)
    expect(metrics.darkZIndex).toBe(10)
    expect(metrics.whiteZIndex).toBe(8)

    expect(metrics.darkBackground.match(/linear-gradient/g)?.length).toBe(1)
    expect(metrics.whiteBackground.match(/linear-gradient/g)?.length).toBe(1)
    expect(metrics.darkBackground).toContain('0, 0, 0')
    expect(metrics.whiteBackground).toContain('255, 255, 255')
    expect(metrics.darkMask).toContain('linear-gradient')
    expect(metrics.whiteMask).toContain('linear-gradient')
    expect(metrics.darkMaskComposite).not.toBe('add')
    expect(metrics.whiteMaskComposite).not.toBe('add')
    return metrics
  }

  const expectControlRim = async (selector: string) => {
    const control = page.locator(selector).first()
    await expect(control).toBeVisible()
    const metrics = await control.evaluate((element) => {
      const style = getComputedStyle(element)
      const white = getComputedStyle(element, '::before')
      const dark = getComputedStyle(element, '::after')
      return {
        borderColor: style.borderColor,
        boxShadow: style.boxShadow,
        radius: style.borderRadius,
        whiteRadius: white.borderRadius,
        darkRadius: dark.borderRadius,
        whitePadding: [white.paddingTop, white.paddingRight, white.paddingBottom, white.paddingLeft],
        darkPadding: [dark.paddingTop, dark.paddingRight, dark.paddingBottom, dark.paddingLeft],
        whiteBackground: white.backgroundImage,
        darkBackground: dark.backgroundImage,
        whiteMask: white.maskImage || white.webkitMaskImage,
        darkMask: dark.maskImage || dark.webkitMaskImage,
        whiteZIndex: Number.parseInt(white.zIndex, 10),
        darkZIndex: Number.parseInt(dark.zIndex, 10),
      }
    })

    expect(metrics.borderColor).toBe('rgba(0, 0, 0, 0)')
    expect(metrics.whiteRadius).toBe(metrics.radius)
    expect(metrics.darkRadius).toBe(metrics.radius)
    expect(metrics.whitePadding).toEqual(['1px', '1px', '1px', '1px'])
    expect(metrics.darkPadding).toEqual(['1px', '1px', '1px', '1px'])
    expect(metrics.whiteBackground.match(/linear-gradient/g)?.length).toBe(1)
    expect(metrics.darkBackground.match(/linear-gradient/g)?.length).toBe(1)
    expect(metrics.whiteBackground).toContain('255, 255, 255')
    expect(metrics.darkBackground).toContain('0, 0, 0')
    expect(metrics.whiteMask).toContain('linear-gradient')
    expect(metrics.darkMask).toContain('linear-gradient')
    expect(metrics.darkZIndex).toBeGreaterThan(metrics.whiteZIndex)
    expect(metrics.darkZIndex).toBe(10)
    expect(metrics.whiteZIndex).toBe(8)
    expect(metrics.boxShadow).not.toContain('inset')
  }

  for (const selector of ['.topbar', '.liquid-tab-bar-surface', '.controls', '.film-results-toolbar', '.film-card']) {
    await expectAlignedRim(selector)
  }
  const filmCard = await expectAlignedRim('.film-card')
  expect(filmCard.overflow).toBe('hidden')

  await expectControlRim('.film-search-autocomplete')
  await expectControlRim('.mobile-advanced-filter-toggle')
  await expectControlRim('.chips button.active')
  await expectControlRim('.favorite-button')
  await expectControlRim('.detail-button')

  const tabBar = page.locator('.liquid-tab-bar')
  await tabBar.getByRole('button', { name: '설정' }).click()
  await expectAlignedRim('.settings-intro')
  await expectAlignedRim('.settings-card')
  await expectAlignedRim('.settings-card-head')
  await expectControlRim('.settings-reset-button')

  await tabBar.getByRole('button', { name: 'AI 도슨트' }).click()
  await expectAlignedRim('.curator-hero')
  await expectAlignedRim('.curator-card')
  await expectAlignedRim('.curator-featured-card')
  await expectControlRim('.curator-filter-chips button')

  await tabBar.getByRole('button', { name: '영화 찾기' }).click()
  await page.getByRole('button', { name: '상세', exact: true }).first().click()
  await expectAlignedRim('.film-modal')
  await expectAlignedRim('.film-detail-grid')
  await expectControlRim('.modal-close')

  const modalCorners = await page.locator('.film-modal').evaluate((element) => {
    const host = getComputedStyle(element)
    const dark = getComputedStyle(element.querySelector<HTMLElement>(':scope > .liquid-glass-edge-layer')!)
    const white = getComputedStyle(element.querySelector<HTMLElement>(':scope > .liquid-glass-edge-highlight-layer')!)
    return {
      hostTopLeft: host.borderTopLeftRadius,
      hostBottomLeft: host.borderBottomLeftRadius,
      darkTopLeft: dark.borderTopLeftRadius,
      darkBottomLeft: dark.borderBottomLeftRadius,
      whiteTopLeft: white.borderTopLeftRadius,
      whiteBottomLeft: white.borderBottomLeftRadius,
    }
  })
  expect(modalCorners.darkTopLeft).toBe(modalCorners.hostTopLeft)
  expect(modalCorners.whiteTopLeft).toBe(modalCorners.hostTopLeft)
  expect(modalCorners.darkBottomLeft).toBe(modalCorners.hostBottomLeft)
  expect(modalCorners.whiteBottomLeft).toBe(modalCorners.hostBottomLeft)
})

test('keeps black shadows tight to surface edges', async ({ page }) => {
  const maxBlurRadius = (value: string) => {
    const shadows: string[] = []
    let depth = 0
    let start = 0
    for (let index = 0; index < value.length; index += 1) {
      const character = value[index]
      if (character === '(') depth += 1
      else if (character === ')') depth = Math.max(0, depth - 1)
      else if (character === ',' && depth === 0) {
        shadows.push(value.slice(start, index))
        start = index + 1
      }
    }
    shadows.push(value.slice(start))
    return Math.max(0, ...shadows.map((shadow) => {
      const values = shadow.match(/-?\d+(?:\.\d+)?px/g)?.map((token) => Number.parseFloat(token)) ?? []
      return Math.abs(values[2] ?? 0)
    }))
  }

  const cardShadow = await page.locator('.film-card').first().evaluate((element) => getComputedStyle(element).boxShadow)
  const dockShadow = await page.locator('.liquid-tab-bar-surface').evaluate((element) => getComputedStyle(element).boxShadow)
  expect(maxBlurRadius(cardShadow)).toBeLessThanOrEqual(4)
  expect(maxBlurRadius(dockShadow)).toBeLessThanOrEqual(4)

  await page.getByRole('button', { name: '상세', exact: true }).first().click()
  const modalShadow = await page.locator('.film-modal').evaluate((element) => getComputedStyle(element).boxShadow)
  expect(maxBlurRadius(modalShadow)).toBeLessThanOrEqual(6)
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
    const html = getComputedStyle(document.documentElement)
    const body = getComputedStyle(document.body)
    const root = getComputedStyle(document.querySelector('#root')!)
    const shell = getComputedStyle(document.querySelector('.app-shell')!)
    const heading = getComputedStyle(document.querySelector('.film-card h2')!)
    const input = getComputedStyle(document.querySelector('.film-search-autocomplete input')!)
    return {
      themeColorCount: document.querySelectorAll('meta[name="theme-color"]').length,
      htmlBackgroundColor: html.backgroundColor,
      bodyBackgroundColor: body.backgroundColor,
      rootBackgroundColor: root.backgroundColor,
      shellBackgroundColor: shell.backgroundColor,
      bodyBeforeContent: bodyBefore.content,
      headingColor: heading.color,
      inputColor: input.color,
    }
  })
  expect(palette.themeColorCount).toBe(0)
  expect(palette.htmlBackgroundColor).toBe('rgba(0, 0, 0, 0)')
  expect(palette.bodyBackgroundColor).toBe('rgb(229, 231, 235)')
  expect(palette.rootBackgroundColor).toBe('rgba(0, 0, 0, 0)')
  expect(palette.shellBackgroundColor).toBe('rgb(229, 231, 235)')
  expect(palette.bodyBeforeContent).toBe('none')
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
    background_color: '#e5e7eb',
  })
  expect(manifest).not.toHaveProperty('theme_color')
})
