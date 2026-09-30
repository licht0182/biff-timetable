import { expect, test } from '@playwright/test'

const dockNaNErrors = new WeakMap<object, string[]>()

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error' && /NaN/i.test(message.text())) errors.push(message.text())
  })
  dockNaNErrors.set(page, errors)
  await page.setViewportSize({ width: 393, height: 852 })
  await page.goto('./')
  await expect(page.locator('.film-card').first()).toBeVisible()
})

test('initializes rim geometry before exposing new surface layers', async ({ page }) => {
  await page.addInitScript(() => {
    const audit = { checked: 0, failures: [] as string[] }
    ;(window as Window & { glassRimAudit?: typeof audit }).glassRimAudit = audit
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof HTMLElement) || !node.classList.contains('liquid-glass-edge-layer')) continue
          const host = node.parentElement
          if (!host) continue
          audit.checked += 1
          const rim = getComputedStyle(node)
          const hostRect = host.getBoundingClientRect()
          const rimRect = node.getBoundingClientRect()
          if (!host.dataset.liquidGlass || rim.paddingTop !== '1px'
            || Math.abs(hostRect.width - rimRect.width) > .5
            || Math.abs(hostRect.height - rimRect.height) > .5) {
            audit.failures.push(`${host.className}: padding=${rim.paddingTop}, host=${hostRect.width}x${hostRect.height}, rim=${rimRect.width}x${rimRect.height}`)
          }
        }
      }
    }).observe(document, { childList: true, subtree: true })
  })
  await page.reload()
  await expect(page.locator('.film-card').first()).toBeVisible()
  const audit = await page.evaluate(() => (window as Window & { glassRimAudit?: { checked: number; failures: string[] } }).glassRimAudit)
  expect(audit?.checked).toBeGreaterThan(0)
  expect(audit?.failures).toEqual([])
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

test('keeps the fixed dock material outside Safari toolbar tint sampling', async ({ page, browserName }) => {
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
    const activeButton = surface.querySelector<HTMLButtonElement>('button[aria-current="page"]')!
    const inactiveButton = surface.querySelectorAll<HTMLButtonElement>('button')[1]!
    const label = activeButton.lastElementChild as HTMLElement
    const buttonRect = activeButton.getBoundingClientRect()
    return {
      bottomGap: window.innerHeight - surface.getBoundingClientRect().bottom,
      navPosition: navStyle.position,
      navTimeline: navStyle.animationTimeline,
      navPaddingBottom: Number.parseFloat(navStyle.paddingBottom),
      shellPaddingBottom: Number.parseFloat(getComputedStyle(shell).paddingBottom),
      surfaceHeight: surface.getBoundingClientRect().height,
      surfaceWidth: surface.getBoundingClientRect().width,
      surfaceRadius: surfaceStyle.borderRadius,
      surfaceBackground: surfaceStyle.backgroundImage,
      surfaceBackgroundColor: surfaceStyle.backgroundColor,
      surfaceBackdrop: dockBackdrop,
      surfaceFilter: surfaceStyle.filter,
      refractionDisplay: refractionStyle?.display,
      surfaceHighlightDisplay: surfaceHighlight.display,
      dockScrimContent: dockScrim.content,
      iconWidth: icon.getBoundingClientRect().width,
      iconRadius: iconStyle.borderRadius,
      buttonWidth: buttonRect.width,
      buttonHeight: buttonRect.height,
      activeColor: getComputedStyle(activeButton).color,
      inactiveColor: getComputedStyle(inactiveButton).color,
      labelFontSize: getComputedStyle(label).fontSize,
      labelFontWeight: getComputedStyle(label).fontWeight,
    }
  })

  expect(metrics.bottomGap).toBeGreaterThanOrEqual(18)
  expect(metrics.bottomGap).toBeLessThanOrEqual(20)
  expect(metrics.navPaddingBottom).toBe(0)
  expect(metrics.shellPaddingBottom).toBeGreaterThanOrEqual(metrics.surfaceHeight + 24)
  expect(metrics.surfaceBackground).not.toBe('none')
  const dockAlpha = Number(metrics.surfaceBackgroundColor.match(/[\d.]+(?=\)$)/)?.[0])
  expect(dockAlpha).toBeGreaterThan(0.1)
  expect(dockAlpha).toBeLessThan(0.2)
  expect(metrics.surfaceHeight).toBeGreaterThanOrEqual(62)
  expect(metrics.surfaceHeight).toBeLessThanOrEqual(64)
  expect(metrics.surfaceWidth).toBeGreaterThanOrEqual(351)
  expect(metrics.surfaceWidth).toBeLessThanOrEqual(352)
  expect(metrics.surfaceRadius).toBe('31px')
  expect(metrics.navPosition).toBe('fixed')
  expect(metrics.surfaceBackdrop).toContain('blur(')
  expect(metrics.surfaceBackdrop).toContain('30px')
  if (browserName === 'webkit') {
    expect(metrics.navTimeline).not.toContain('scroll(root)')
    expect(metrics.surfaceFilter).toBe('none')
    expect(metrics.refractionDisplay).toBeUndefined()
    expect(metrics.surfaceHighlightDisplay).not.toBe('none')
  }
  expect(metrics.dockScrimContent).toBe('none')
  expect(metrics.iconWidth).toBeGreaterThanOrEqual(25)
  expect(metrics.iconWidth).toBeLessThanOrEqual(27)
  expect(metrics.iconRadius).toBe('0px')
  expect(metrics.buttonWidth).toBeGreaterThanOrEqual(86)
  expect(metrics.buttonWidth).toBeLessThanOrEqual(87)
  expect(metrics.buttonHeight).toBeGreaterThanOrEqual(58)
  expect(metrics.buttonHeight).toBeLessThanOrEqual(60)
  expect(metrics.activeColor).toBe('rgb(217, 45, 32)')
  expect(metrics.inactiveColor).toBe('rgba(17, 24, 39, 0.72)')
  expect(metrics.labelFontSize).toBe('11px')
  expect(metrics.labelFontWeight).toBe('600')

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
    })).toEqual({ position: 'fixed', gap: 19, visible: true })
  }
})

test('uses two package lenses for the tab dock in Chromium and iPhone WebKit', async ({ page, browserName }) => {
  dockNaNErrors.get(page)?.splice(0)
  await page.setViewportSize({ width: 390, height: 852 })
  await page.reload()
  await expect(page.locator('.film-card').first()).toBeVisible()

  const tabBar = page.locator('.liquid-tab-bar')
  const material = tabBar.locator('[data-dock-material-host="true"]')
  const selection = tabBar.locator('[data-tab-lens-host="true"]')
  const actions = tabBar.locator(':scope .liquid-tab-bar-surface > .liquid-tab-actions')

  await expect(material).toHaveCount(1)
  await expect(selection).toHaveCount(1)
  await expect(material).toHaveAttribute('data-liquid-glass', 'dock-material')
  await expect(selection).toHaveAttribute('data-liquid-glass', 'tab-selection')
  await expect.poll(() => tabBar.getAttribute('data-liquid-ready')).toBe('true')
  expect(dockNaNErrors.get(page) ?? []).toEqual([])
  await expect(material.locator('svg filter')).toHaveCount(1)
  await expect(selection.locator('svg filter')).toHaveCount(1)
  const invalidFilterGeometry = await selection.locator('feImage, feDisplacementMap').evaluateAll((filters) => (
    filters.flatMap((filter) => ['x', 'y'].flatMap((attribute) => {
      const value = filter.getAttribute(attribute)
      return value !== null && !Number.isFinite(Number.parseFloat(value))
        ? [`${filter.tagName}.${attribute}=${value}`]
        : []
    }))
  ))
  expect(invalidFilterGeometry).toEqual([])
  await expect(selection.locator('button')).toHaveCount(0)
  await expect(selection.locator(':scope > div > .liquid-tab-selection-scene[aria-hidden="true"]')).toHaveCount(1)
  await expect(actions).toHaveCount(1)
  await expect(tabBar.getByRole('button')).toHaveCount(4)

  const iconFilters = await tabBar.locator('.liquid-tab-icon').evaluateAll((icons) => icons.map((icon) => {
    const style = getComputedStyle(icon)
    return { filter: style.filter, backdrop: style.backdropFilter || style.webkitBackdropFilter }
  }))
  expect(iconFilters).toEqual(Array.from({ length: 4 }, () => ({ filter: 'none', backdrop: 'none' })))
  await expect(tabBar.locator('.liquid-tab-lens-clip, .liquid-tab-lens-paint, .liquid-tab-lens-rim')).toHaveCount(0)

  if (browserName === 'webkit') {
    const visibleActions = await actions.getByRole('button').evaluateAll((buttons) => buttons.map((button) => {
      const icon = button.querySelector<HTMLElement>('.liquid-tab-icon')!
      const label = button.lastElementChild as HTMLElement
      const buttonRect = button.getBoundingClientRect()
      const iconRect = icon.getBoundingClientRect()
      const labelRect = label.getBoundingClientRect()
      const iconStyle = getComputedStyle(icon)
      const labelStyle = getComputedStyle(label)
      return {
        button: buttonRect.width > 0 && buttonRect.height > 0,
        icon: iconRect.width > 0 && iconRect.height > 0 && iconStyle.visibility === 'visible' && Number.parseFloat(iconStyle.opacity) > .9,
        label: labelRect.width > 0 && labelRect.height > 0 && labelStyle.visibility === 'visible' && Number.parseFloat(labelStyle.opacity) > .9,
      }
    }))
    expect(visibleActions).toEqual(Array.from({ length: 4 }, () => ({ button: true, icon: true, label: true })))
  }

  await tabBar.getByRole('button', { name: 'AI 도슨트' }).click()
  await expect(tabBar.getByRole('button', { name: 'AI 도슨트' })).toHaveAttribute('aria-current', 'page')
})

test('keeps the four-slot dock track aligned without painted inactive lenses', async ({ page }) => {
  const tabBar = page.locator('.liquid-tab-bar')
  const surface = tabBar.locator('.liquid-tab-bar-surface')
  const scene = tabBar.locator('.liquid-tab-selection-scene')
  const opticalLens = tabBar.locator('.liquid-dock-optical-lens')
  const tabNames = ['영화 찾기', '내 시간표', 'AI 도슨트', '설정'] as const

  await expect(tabBar.getByRole('button')).toHaveCount(4)
  await expect(scene.locator('span')).toHaveCount(0)
  const scenePaint = await scene.evaluate((element) => {
    const style = getComputedStyle(element)
    const alpha = Number(style.backgroundColor.match(/[\d.]+(?=\)$)/)?.[0] ?? '1')
    return { alpha, image: style.backgroundImage, opacity: Number(style.opacity) }
  })
  expect(scenePaint.alpha).toBeLessThanOrEqual(.01)
  expect(scenePaint.image).toBe('none')
  expect(scenePaint.opacity).toBe(1)

  const initialCenters = await tabBar.getByRole('button').evaluateAll((buttons) => buttons.map((button) => {
    const rect = button.getBoundingClientRect()
    return rect.left + rect.width / 2
  }))
  const gaps = initialCenters.slice(1).map((center, index) => center - initialCenters[index])
  expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(.01)

  const measureAlignment = () => surface.evaluate((element) => {
    const surfaceRect = element.getBoundingClientRect()
    const active = element.querySelector<HTMLButtonElement>('button[aria-current="page"]')!
    const buttonRect = active.getBoundingClientRect()
    const lens = element.querySelector<HTMLElement>('.liquid-dock-optical-lens')!
    const lensRect = lens.getBoundingClientRect()
    const lensX = Number.parseFloat(getComputedStyle(element).getPropertyValue('--dock-lens-x'))
    const packageHost = element.querySelector<HTMLElement>('[data-tab-lens-host="true"]')!
    const packageHostRect = packageHost.getBoundingClientRect()
    const packageFilter = packageHost.querySelector<SVGFilterElement>('svg filter')!
    const packageLens = packageFilter.querySelector<SVGElement>('[data-lens]')
    const packageX = Number.parseFloat(packageLens?.getAttribute('x') ?? 'NaN')
    const packageWidth = Number.parseFloat(packageLens?.getAttribute('width') ?? 'NaN')
    const packageUsesPixels = packageFilter.getAttribute('filterUnits') === 'userSpaceOnUse'
    const packageCenter = packageUsesPixels
      ? packageHostRect.left + packageX + packageWidth / 2
      : packageHostRect.left + (packageX + packageWidth / 2) * packageHostRect.width
    return {
      coordinateError: Math.abs(surfaceRect.left + lensX * surfaceRect.width - (buttonRect.left + buttonRect.width / 2)),
      opticalError: Math.abs(lensRect.left + lensRect.width / 2 - (buttonRect.left + buttonRect.width / 2)),
      packageError: Number.isFinite(packageCenter)
        ? Math.abs(packageCenter - (buttonRect.left + buttonRect.width / 2))
        : Number.NaN,
      leftInset: lensRect.left - surfaceRect.left,
      rightInset: surfaceRect.right - lensRect.right,
    }
  })

  let firstBounds: { leftInset: number; rightInset: number } | undefined
  let lastBounds: { leftInset: number; rightInset: number } | undefined
  for (const [index, name] of tabNames.entries()) {
    await tabBar.getByRole('button', { name }).click()
    await expect(tabBar.getByRole('button', { name })).toHaveAttribute('aria-current', 'page')
    await expect.poll(async () => (await measureAlignment()).coordinateError).toBeLessThanOrEqual(.5)
    await expect.poll(async () => (await measureAlignment()).opticalError).toBeLessThanOrEqual(.5)
    await expect.poll(async () => (await measureAlignment()).packageError).toBeLessThanOrEqual(.5)
    const bounds = await measureAlignment()
    if (index === 0) firstBounds = bounds
    if (index === tabNames.length - 1) lastBounds = bounds
  }

  expect(firstBounds).toBeDefined()
  expect(lastBounds).toBeDefined()
  expect(firstBounds!.leftInset).toBeGreaterThanOrEqual(0)
  expect(lastBounds!.rightInset).toBeGreaterThanOrEqual(0)
  expect(Math.abs(firstBounds!.leftInset - lastBounds!.rightInset)).toBeLessThanOrEqual(.5)
  expect(Math.abs(firstBounds!.rightInset - lastBounds!.leftInset)).toBeLessThanOrEqual(.5)

  await page.emulateMedia({ colorScheme: 'light' })
  const lightAlpha = await surface.evaluate((element) => Number(getComputedStyle(element).backgroundColor.match(/[\d.]+(?=\)$)/)?.[0] ?? '1'))
  expect(lightAlpha).toBeGreaterThanOrEqual(.12)
  expect(lightAlpha).toBeLessThanOrEqual(.15)
  await page.emulateMedia({ colorScheme: 'dark' })
  const darkAlpha = await surface.evaluate((element) => Number(getComputedStyle(element).backgroundColor.match(/[\d.]+(?=\)$)/)?.[0] ?? '1'))
  expect(darkAlpha).toBeGreaterThanOrEqual(.15)
  expect(darkAlpha).toBeLessThanOrEqual(.18)
})

test('fits first and last dock lenses at 320px in normal and pressed states', async ({ page }) => {
  dockNaNErrors.get(page)?.splice(0)
  await page.setViewportSize({ width: 320, height: 852 })
  await page.reload()
  await expect(page.locator('.film-card').first()).toBeVisible()

  const tabBar = page.locator('.liquid-tab-bar')
  const surface = tabBar.locator('.liquid-tab-bar-surface')
  await expect.poll(() => tabBar.getAttribute('data-liquid-ready')).toBe('true')
  expect(dockNaNErrors.get(page) ?? []).toEqual([])

  const measure = () => surface.evaluate((element) => {
    const surfaceRect = element.getBoundingClientRect()
    const button = element.querySelector<HTMLButtonElement>('button[aria-current="page"]')!
    const buttonRect = button.getBoundingClientRect()
    const opticalRect = element.querySelector<HTMLElement>('.liquid-dock-optical-lens')!.getBoundingClientRect()
    const host = element.querySelector<HTMLElement>('[data-tab-lens-host="true"]')!
    const hostRect = host.getBoundingClientRect()
    const filter = host.querySelector<SVGFilterElement>('svg filter')!
    const lens = filter.querySelector<SVGElement>('[data-lens]')!
    const packageX = Number.parseFloat(lens.getAttribute('x') ?? 'NaN')
    const packageWidth = Number.parseFloat(lens.getAttribute('width') ?? 'NaN')
    const usesPixels = filter.getAttribute('filterUnits') === 'userSpaceOnUse'
    const packageLeft = usesPixels ? hostRect.left + packageX : hostRect.left + packageX * hostRect.width
    const renderedPackageWidth = usesPixels ? packageWidth : packageWidth * hostRect.width
    const round = (value: number) => Math.round(value * 100) / 100
    return {
      buttonWidth: buttonRect.width,
      opticalWidth: opticalRect.width,
      opticalLeftInset: round(opticalRect.left - surfaceRect.left),
      opticalRightInset: round(surfaceRect.right - opticalRect.right),
      opticalCenterError: Math.abs(opticalRect.left + opticalRect.width / 2 - (buttonRect.left + buttonRect.width / 2)),
      packageWidth: renderedPackageWidth,
      packageLeftInset: round(packageLeft - surfaceRect.left),
      packageRightInset: round(surfaceRect.right - (packageLeft + renderedPackageWidth)),
      packageCenterError: Math.abs(packageLeft + renderedPackageWidth / 2 - (buttonRect.left + buttonRect.width / 2)),
    }
  })

  const normalBounds: Awaited<ReturnType<typeof measure>>[] = []
  const pressedBounds: Awaited<ReturnType<typeof measure>>[] = []
  for (const { name, id } of [
    { name: '영화 찾기', id: 'films' },
    { name: '설정', id: 'settings' },
  ]) {
    const button = tabBar.getByRole('button', { name })
    await button.click()
    await expect(button).toHaveAttribute('aria-current', 'page')
    await expect.poll(async () => {
      const bounds = await measure()
      return Math.max(bounds.opticalCenterError, bounds.packageCenterError)
    }).toBeLessThanOrEqual(.5)

    const normal = await measure()
    const expectedNormalWidth = Math.min(92, normal.buttonWidth + 5.5)
    await expect.poll(async () => Math.abs((await measure()).opticalWidth - expectedNormalWidth)).toBeLessThanOrEqual(.1)
    expect(Number.isFinite(normal.packageWidth)).toBe(true)
    expect(normal.packageWidth).toBeGreaterThan(0)
    expect(normal.opticalLeftInset).toBeGreaterThanOrEqual(0)
    expect(normal.opticalRightInset).toBeGreaterThanOrEqual(0)
    expect(normal.packageLeftInset).toBeGreaterThanOrEqual(0)
    expect(normal.packageRightInset).toBeGreaterThanOrEqual(0)
    normalBounds.push(normal)

    await button.hover({ position: { x: normal.buttonWidth / 2, y: 28 } })
    await page.mouse.down()
    await expect(tabBar).toHaveAttribute('data-lens-pressed', id)
    const expectedPressedWidth = Math.min(88, normal.buttonWidth + 1.5)
    await expect.poll(async () => Math.abs((await measure()).opticalWidth - expectedPressedWidth)).toBeLessThanOrEqual(.1)
    await expect.poll(async () => {
      const bounds = await measure()
      return Math.max(bounds.opticalCenterError, bounds.packageCenterError)
    }).toBeLessThanOrEqual(.5)
    const pressed = await measure()
    expect(Number.isFinite(pressed.packageWidth)).toBe(true)
    expect(pressed.packageWidth).toBeGreaterThan(0)
    expect(pressed.opticalLeftInset).toBeGreaterThanOrEqual(0)
    expect(pressed.opticalRightInset).toBeGreaterThanOrEqual(0)
    expect(pressed.packageLeftInset).toBeGreaterThanOrEqual(0)
    expect(pressed.packageRightInset).toBeGreaterThanOrEqual(0)
    pressedBounds.push(pressed)

    await page.mouse.up()
    await expect(tabBar).not.toHaveAttribute('data-lens-pressed')
  }

  for (const bounds of [normalBounds, pressedBounds]) {
    const [first, last] = bounds
    expect(Math.abs(first.opticalLeftInset - last.opticalRightInset)).toBeLessThanOrEqual(.5)
    expect(Math.abs(first.opticalRightInset - last.opticalLeftInset)).toBeLessThanOrEqual(.5)
    expect(Math.abs(first.packageLeftInset - last.packageRightInset)).toBeLessThanOrEqual(.5)
    expect(Math.abs(first.packageRightInset - last.packageLeftInset)).toBeLessThanOrEqual(.5)
  }
})

test('keeps SVG refraction on stable glass while content avoids ghost-prone filter layers', async ({ page, browserName }) => {
  const topbar = page.locator('.topbar')
  const firstFilmCard = page.locator('.film-card').first()

  await expect(topbar).toHaveAttribute('data-liquid-glass', 'navigation')
  await expect(firstFilmCard).toHaveAttribute('data-liquid-glass', 'content')
  await expect(firstFilmCard.locator(':scope > .liquid-glass-refraction-layer')).toHaveCount(0)
  await expect(firstFilmCard).not.toHaveClass(/liquid-glass-backdrop-refraction/)

  if (browserName === 'webkit') {
    await expect.poll(() => page.locator('.liquid-glass-filter-defs filter').count()).toBe(0)
    await expect(topbar.locator(':scope > .liquid-glass-refraction-layer')).toHaveCount(0)
    await expect.poll(() => topbar.evaluate((element) => getComputedStyle(element).backdropFilter || getComputedStyle(element).webkitBackdropFilter)).toContain('blur(')
  } else {
    await expect.poll(() => page.locator('.liquid-glass-filter-defs filter').count()).toBeGreaterThanOrEqual(2)
    await expect(topbar.locator(':scope > .liquid-glass-refraction-layer')).toHaveCount(1)

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

test('moves the selection lens with active navigation', async ({ page }) => {
  const tabBar = page.locator('.liquid-tab-bar')
  const selection = tabBar.locator('[data-tab-lens-host="true"]')
  const readPosition = () => selection.evaluate((element) => {
    const filter = element.querySelector('svg filter')!
    return filter.querySelector('[data-lens]')?.getAttribute('x')
  })
  const readOpticalPosition = () => tabBar.locator('.liquid-tab-bar-surface').evaluate((element) => (
    getComputedStyle(element).getPropertyValue('--dock-lens-x').trim()
  ))

  const initialPosition = (await readPosition()) ?? ''
  const initialX = Number.parseFloat(initialPosition || '0')
  const initialOpticalPosition = await readOpticalPosition()
  await tabBar.getByRole('button', { name: '내 시간표' }).click()
  await expect(tabBar.getByRole('button', { name: '내 시간표' })).toHaveAttribute('aria-current', 'page')
  await expect.poll(async () => Number.parseFloat((await readPosition()) ?? '0')).toBeGreaterThan(initialX)
  const timetablePositionAttribute = (await readPosition()) ?? ''
  const timetablePosition = Number.parseFloat(timetablePositionAttribute || '0')
  await expect.poll(async () => Number.parseFloat(await readOpticalPosition())).toBeGreaterThan(Number.parseFloat(initialOpticalPosition))
  const timetableOpticalPosition = await readOpticalPosition()

  await tabBar.getByRole('button', { name: '영화 찾기' }).click()
  await expect(tabBar.getByRole('button', { name: '영화 찾기' })).toHaveAttribute('aria-current', 'page')
  await expect.poll(async () => Number.parseFloat((await readPosition()) ?? '0')).toBeLessThan(timetablePosition)
  await expect.poll(async () => Number.parseFloat(await readOpticalPosition())).toBeLessThan(Number.parseFloat(timetableOpticalPosition))
})

test('deforms the selection lens on press without duplicating actions', async ({ page }) => {
  dockNaNErrors.get(page)?.splice(0)
  await page.setViewportSize({ width: 390, height: 852 })
  await page.reload()
  await expect(page.locator('.film-card').first()).toBeVisible()

  const tabBar = page.locator('.liquid-tab-bar')
  const button = tabBar.getByRole('button', { name: 'AI 도슨트' })

  await button.hover({ position: { x: 16, y: 24 } })
  await page.mouse.down()
  await expect(tabBar).toHaveAttribute('data-lens-pressed', 'curator')
  await expect(button).toHaveAttribute('data-pressed', 'true')
  await expect(tabBar.getByRole('button')).toHaveCount(4)
  await expect(tabBar.locator('.liquid-tab-bar-surface')).toHaveCSS('--dock-lens-width', '88px')
  await expect(tabBar.locator('.liquid-tab-bar-surface')).toHaveCSS('--dock-lens-height', '56px')
  await page.mouse.up()
  await expect(tabBar).not.toHaveAttribute('data-lens-pressed')
  await expect(tabBar.locator('.liquid-tab-bar-surface')).toHaveCSS('--dock-lens-width', '92px')
  await expect(tabBar.locator('.liquid-tab-bar-surface')).toHaveCSS('--dock-lens-height', '59px')
})

test('uses the plain tab surface when transparency is reduced', async ({ page, browserName }) => {
  if (browserName === 'chromium') {
    const session = await page.context().newCDPSession(page)
    await session.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }],
    })
  } else {
    await page.addInitScript(() => {
      const nativeMatchMedia = window.matchMedia.bind(window)
      window.matchMedia = (query: string) => query.includes('prefers-reduced-transparency')
        ? { matches: true, media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false }
        : nativeMatchMedia(query)
    })
  }
  await page.goto('./')

  const tabBar = page.locator('.liquid-tab-bar')
  await expect(tabBar.locator('[data-tab-lens-host="true"]')).toHaveCount(0)
  await expect(tabBar.locator('.liquid-tab-bar-surface svg filter')).toHaveCount(0)
  if (browserName === 'chromium') {
    const material = await tabBar.locator('.liquid-tab-bar-surface').evaluate((element) => {
      const style = getComputedStyle(element)
      return { backgroundColor: style.backgroundColor, backdropFilter: style.backdropFilter }
    })
    const alpha = Number(material.backgroundColor.match(/[\d.]+(?=\))/)?.[0] ?? '1')
    expect(alpha).toBeGreaterThanOrEqual(.9)
    expect(material.backdropFilter).toBe('none')
  }
  await tabBar.getByRole('button', { name: '내 시간표' }).click()
  await expect(tabBar.getByRole('button', { name: '내 시간표' })).toHaveAttribute('aria-current', 'page')
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

  for (const selector of ['.topbar', '.controls', '.film-results-toolbar', '.film-card']) {
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
  await expectAlignedRim('.curator-latest')
  await expectAlignedRim('.curator-card')
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

test('follows the system dark appearance and keeps motion optional', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await expect.poll(() => page.evaluate(() => {
    const root = getComputedStyle(document.documentElement)
    return {
      background: root.getPropertyValue('--ios-bg').trim(),
      label: root.getPropertyValue('--ios-label').trim(),
      colorScheme: root.colorScheme,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
    }
  })).toEqual({
    background: '#000',
    label: '#f5f5f7',
    colorScheme: 'dark',
    bodyBackground: 'rgb(17, 19, 22)',
  })
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
    expect(rgba!.at(-1), `${selector} should retain visible translucency`).toBeGreaterThan(0.1)
    expect(rgba!.at(-1), `${selector} should retain visible translucency`).toBeLessThan(0.95)
  }

  await expectGlassSurface('.favorite-button')
  await page.getByRole('button', { name: '상세', exact: true }).first().click()
  await expectGlassSurface('.film-detail-grid')
  await page.keyboard.press('Escape')

  const tabBar = page.locator('.liquid-tab-bar')
  await tabBar.getByRole('button', { name: '설정' }).click()
  await expectGlassSurface('.settings-intro')
  await expectGlassSurface('.settings-card-head')

  await tabBar.getByRole('button', { name: 'AI 도슨트' }).click()
  await expectGlassSurface('.curator-card')

  await tabBar.getByRole('button', { name: '내 시간표' }).click()
  await page.getByRole('button', { name: /일정 추가/ }).click()
  await expectGlassSurface('.custom-event-form input[type="text"]')
  await expectGlassSurface('.custom-event-form-actions button:first-child')
})

test('uses a solid warm canvas with dark readable text', async ({ page }) => {
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
  expect(palette.themeColorCount).toBe(2)
  expect(palette.htmlBackgroundColor).toBe('rgba(0, 0, 0, 0)')
  expect(palette.bodyBackgroundColor).toBe('rgb(241, 238, 233)')
  expect(palette.rootBackgroundColor).toBe('rgba(0, 0, 0, 0)')
  expect(palette.shellBackgroundColor).toBe('rgb(241, 238, 233)')
  expect(palette.bodyBeforeContent).toBe('none')
  expect(palette.headingColor).toBe('rgb(17, 24, 39)')
  expect(palette.inputColor).toBe('rgb(17, 24, 39)')
})
