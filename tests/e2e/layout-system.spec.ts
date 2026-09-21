import { expect, test, type Page } from '@playwright/test'

const viewports = [
  { width: 320, height: 740, gutter: 10, radius: 20 },
  { width: 390, height: 844, gutter: 10, radius: 20 },
  { width: 768, height: 1024, gutter: 18, radius: 22 },
  { width: 1280, height: 900, gutter: 24, radius: 22 },
] as const

const sections = [
  { label: '영화 찾기', selector: '.app-page--films .film-data-notice, .app-page--films #film-controls' },
  { label: '내 시간표', selector: '.app-page--timetable .timetable-empty, .app-page--timetable .enhanced-timetable-actions' },
  { label: 'AI 도슨트', selector: '.app-page--curator .curator-hero' },
  { label: '설정', selector: '.app-page--settings .settings-intro' },
] as const

async function openSection(page: Page, label: string) {
  const navigation = page.locator('.tabs:visible, .liquid-tab-bar:visible')
  if (label === '내 시간표') {
    await navigation.getByRole('button', { name: /내 시간표$/ }).click()
    return
  }
  await navigation.getByRole('button', { name: label, exact: true }).click()
}

for (const viewport of viewports) {
  test(`keeps one layout contract at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('./')

    const expectedShellWidth = Math.min(viewport.width, 1180)
    const expectedSurfaceX = (viewport.width - expectedShellWidth) / 2 + viewport.gutter
    const expectedSurfaceWidth = expectedShellWidth - viewport.gutter * 2
    const topGaps: number[] = []

    for (const section of sections) {
      await openSection(page, section.label)
      const surface = page.locator(section.selector).first()
      await expect(surface).toBeVisible()
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)

      const metrics = await surface.evaluate((element) => {
        const header = document.querySelector<HTMLElement>('.topbar')
        const rect = element.getBoundingClientRect()
        if (!header) throw new Error('Missing app header')
        return {
          x: rect.x,
          width: rect.width,
          radius: Number.parseFloat(getComputedStyle(element).borderRadius),
          topGap: rect.top - header.getBoundingClientRect().bottom,
          overflow: document.documentElement.scrollWidth - window.innerWidth,
        }
      })

      expect(Math.abs(metrics.x - expectedSurfaceX), `${viewport.width}px ${section.label} gutter`).toBeLessThanOrEqual(1)
      expect(Math.abs(metrics.width - expectedSurfaceWidth), `${viewport.width}px ${section.label} width`).toBeLessThanOrEqual(2)
      expect(metrics.radius, `${viewport.width}px ${section.label} radius`).toBe(viewport.radius)
      expect(metrics.overflow, `${viewport.width}px ${section.label} overflow`).toBeLessThanOrEqual(1)
      topGaps.push(metrics.topGap)
    }

    expect(
      Math.max(...topGaps) - Math.min(...topGaps),
      `${viewport.width}x${viewport.height} top gaps: ${topGaps.join(', ')}`,
    ).toBeLessThanOrEqual(4)
  })
}

test('keeps the settings page wrapper layout-only on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('./')
  await openSection(page, '설정')

  const metrics = await page.locator('.app-page--settings').evaluate((element) => {
    const wrapper = getComputedStyle(element)
    const intro = getComputedStyle(element.querySelector<HTMLElement>('.settings-intro')!)
    const card = getComputedStyle(element.querySelector<HTMLElement>('.settings-card')!)
    return {
      wrapperBackground: wrapper.backgroundColor,
      wrapperBorder: wrapper.borderTopWidth,
      wrapperRadius: wrapper.borderRadius,
      wrapperShadow: wrapper.boxShadow,
      introPadding: intro.padding,
      introRadius: intro.borderRadius,
      cardRadius: card.borderRadius,
    }
  })

  expect(metrics).toEqual({
    wrapperBackground: 'rgba(0, 0, 0, 0)',
    wrapperBorder: '0px',
    wrapperRadius: '0px',
    wrapperShadow: 'none',
    introPadding: '16px',
    introRadius: '22px',
    cardRadius: '22px',
  })
})

for (const viewport of [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 900 },
]) {
  test(`matches the Film Finder section rhythm at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('./')
    await expect(page.locator('.film-card').first()).toBeVisible({ timeout: 15_000 })

    const measureDirectGaps = async (selector: string) => page.locator(selector).evaluate((container) => {
      const children = Array.from(container.children).filter((child) => {
        const element = child as HTMLElement
        const style = getComputedStyle(element)
        const rect = element.getBoundingClientRect()
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 1 && rect.height > 1
      }) as HTMLElement[]
      const rectangles = children.map((child) => child.getBoundingClientRect())
      return {
        display: getComputedStyle(container).display,
        gaps: rectangles.slice(1).map((rect, index) => Number((rect.top - rectangles[index].bottom).toFixed(2))),
      }
    })

    const film = await measureDirectGaps('.app-page--films')
    expect(film.display).toBe('grid')
    expect(film.gaps.length).toBeGreaterThan(0)
    expect(film.gaps.every((gap) => Math.abs(gap - 10) <= 0.1)).toBe(true)

    await page.getByRole('button', { name: '+ 추가', exact: true }).first().click()
    await openSection(page, '내 시간표')
    await expect(page.locator('.enhanced-timetable-actions')).toBeVisible()
    const timetable = await measureDirectGaps('.app-page--timetable')

    await openSection(page, 'AI 도슨트')
    await expect(page.locator('.curator-hero')).toBeVisible()
    const curator = await measureDirectGaps('.app-page--curator')

    await openSection(page, '설정')
    await expect(page.locator('.settings-intro')).toBeVisible()
    const settings = await measureDirectGaps('.app-page--settings')

    for (const section of [timetable, curator, settings]) {
      expect(section.display).toBe('grid')
      expect(section.gaps.length).toBeGreaterThan(0)
      expect(section.gaps.every((gap) => Math.abs(gap - 10) <= 0.1)).toBe(true)
    }
  })
}

test('keeps the desktop timetable in normal document flow', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('./')
  await expect(page.locator('.film-card').first()).toBeVisible()

  const filmShell = await page.locator('.app-shell').boundingBox()
  const filmHeaderHeight = await page.locator('.topbar').evaluate((element) => element.getBoundingClientRect().height)

  await page.getByRole('button', { name: '+ 추가', exact: true }).first().click()
  await openSection(page, '내 시간표')
  await expect(page.locator('.enhanced-timetable-actions')).toBeVisible()
  const listShell = await page.locator('.app-shell').boundingBox()

  expect(filmShell).not.toBeNull()
  expect(listShell).not.toBeNull()
  expect(Math.abs(listShell!.x - filmShell!.x)).toBeLessThanOrEqual(0.5)

  await page.getByRole('button', { name: '시간표', exact: true }).click()
  await expect(page.locator('.timetable-scroll')).toBeVisible()
  await expect(page.locator('.app-shell')).not.toHaveClass(/timetable-viewport-stable/)

  const metrics = await page.evaluate(() => {
    const header = document.querySelector<HTMLElement>('.topbar')!.getBoundingClientRect()
    const actions = document.querySelector<HTMLElement>('.enhanced-timetable-actions')!.getBoundingClientRect()
    const scroll = document.querySelector<HTMLElement>('.timetable-scroll')!.getBoundingClientRect()
    return {
      headerHeight: header.height,
      actionsToGridGap: scroll.top - actions.bottom,
      htmlLocked: document.documentElement.classList.contains('timetable-viewport-locked'),
      bodyLocked: document.body.classList.contains('timetable-viewport-locked'),
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }
  })

  expect(Math.abs(metrics.headerHeight - filmHeaderHeight)).toBeLessThanOrEqual(0.5)
  expect(metrics.actionsToGridGap).toBeCloseTo(10, 1)
  expect(metrics.htmlLocked).toBe(false)
  expect(metrics.bodyLocked).toBe(false)
  expect(metrics.documentOverflow).toBeLessThanOrEqual(0)
})

test('keeps dark desktop timetable events readable', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('./')
  await expect(page.locator('.film-card').first()).toBeVisible({ timeout: 15_000 })

  await page.getByRole('button', { name: '+ 추가', exact: true }).first().click()
  await openSection(page, '내 시간표')
  await page.getByRole('button', { name: '시간표', exact: true }).click()
  const event = page.locator('.event-block').first()
  await expect(event).toBeVisible()

  const colors = await event.evaluate((element) => {
    const parseRgb = (value: string) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number)
    const luminance = (value: string) => {
      const channels = parseRgb(value).map((channel) => {
        const normalized = channel / 255
        return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
    }
    const foreground = getComputedStyle(element).color
    const background = getComputedStyle(element).backgroundColor
    const lighter = Math.max(luminance(foreground), luminance(background))
    const darker = Math.min(luminance(foreground), luminance(background))
    return {
      foreground,
      strong: getComputedStyle(element.querySelector<HTMLElement>('strong')!).color,
      detail: getComputedStyle(element.querySelector<HTMLElement>('span')!).color,
      contrast: (lighter + 0.05) / (darker + 0.05),
    }
  })

  expect(colors.strong).toBe(colors.foreground)
  expect(colors.detail).toBe(colors.foreground)
  expect(colors.contrast).toBeGreaterThanOrEqual(4.5)
})

test('uses the shared iOS radius scale for representative controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  await expect(page.locator('.film-card').first()).toBeVisible()

  const radius = async (selector: string) => page.locator(selector).first().evaluate((element) => getComputedStyle(element).borderRadius)
  const radii = {
    search: await radius('.film-search-autocomplete'),
    filterSheet: await radius('.mobile-advanced-filter-toggle'),
    chip: await radius('.chips button'),
    favorite: await radius('.favorite-button'),
    detail: await radius('.detail-button'),
  }

  expect(radii).toEqual({
    search: '14px',
    filterSheet: '14px',
    chip: '999px',
    favorite: '14px',
    detail: '14px',
  })
})

test('ports the mobile WebKit visual tokens to desktop navigation and surfaces', async ({ page }) => {
  const states: Array<{
    tint: string
    activeColor: string
    activeBackground: string
    surfaceBackground: string
    controlRadius: string
  }> = []

  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(viewport)
    await page.goto('./')
    await openSection(page, '영화 찾기')
    await expect(page.locator('.film-card').first()).toBeVisible()
    await openSection(page, '설정')

    const navigation = viewport.width <= 700
      ? page.locator('.liquid-tab-bar:visible')
      : page.locator('.tabs:visible')
    const active = navigation.getByRole('button', { name: '설정', exact: true })
    await expect(active).toBeVisible()
    await expect(active).toHaveClass(/active/, { timeout: 15_000 })
    await expect.poll(() => active.evaluate((element) => getComputedStyle(element).color), { timeout: 15_000 }).toBe('rgb(10, 132, 255)')
    states.push(await active.evaluate((element) => {
      const root = getComputedStyle(document.documentElement)
      const activeStyle = getComputedStyle(element)
      const surface = getComputedStyle(document.querySelector<HTMLElement>('.settings-intro')!)
      const control = getComputedStyle(document.querySelector<HTMLElement>('.settings-number-control input')!)
      return {
        tint: root.getPropertyValue('--ios-tint').trim(),
        activeColor: activeStyle.color,
        activeBackground: activeStyle.backgroundColor,
        surfaceBackground: surface.backgroundColor,
        controlRadius: control.borderRadius,
      }
    }))
  }

  expect(states[0].tint).toBe('#0a84ff')
  expect(states[0].activeColor).toBe('rgb(10, 132, 255)')
  expect(states[1].activeColor).toBe(states[0].activeColor)
  expect(states[1].surfaceBackground).toBe(states[0].surfaceBackground)
  expect(states[1].controlRadius).toBe(states[0].controlRadius)
  expect(states[0].controlRadius).toBe('14px')
  expect(states[1].activeBackground).not.toBe('rgba(0, 0, 0, 0)')
})
