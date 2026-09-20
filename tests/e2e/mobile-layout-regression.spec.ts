import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

const SELECTED_KEY = 'biff-timetable:selected-screenings:v1'
const VIEW_KEY = 'biff-timetable:view-mode:v1'

type FilmData = { films: Array<{ screenings: Array<{ id: string }> }> }

async function firstScreeningId(request: APIRequestContext) {
  const response = await request.get('./screenings.json')
  expect(response.ok()).toBeTruthy()
  const data = await response.json() as FilmData
  const id = data.films.flatMap((film) => film.screenings)[0]?.id
  test.skip(!id, '상영 회차 데이터가 없습니다.')
  return id!
}

async function seedOneScreening(page: Page, request: APIRequestContext) {
  const id = await firstScreeningId(request)
  await page.addInitScript(({ selectedKey, viewKey, screeningId }) => {
    localStorage.setItem(selectedKey, JSON.stringify([screeningId]))
    localStorage.setItem(viewKey, JSON.stringify('list'))
  }, { selectedKey: SELECTED_KEY, viewKey: VIEW_KEY, screeningId: id })
}

async function openGrid(page: Page) {
  const dock = page.locator('.liquid-tab-bar')
  await dock.getByRole('button', { name: '내 시간표' }).click()
  const gridButton = page.getByRole('button', { name: '시간표', exact: true }).first()
  if (await gridButton.isVisible()) await gridButton.click()
  await expect(page.locator('.timetable-scroll')).toBeVisible()
  await expect(page.locator('.app-shell')).toHaveClass(/timetable-viewport-stable/)
  await expect(page.locator('html')).toHaveClass(/timetable-viewport-locked/)
  await expect(page.locator('body')).toHaveClass(/timetable-viewport-locked/)
}

async function expectViewportLockReleased(page: Page) {
  await expect.poll(() => page.locator('html').evaluate((el) => el.classList.contains('timetable-viewport-locked'))).toBeFalsy()
  await expect.poll(() => page.locator('body').evaluate((el) => el.classList.contains('timetable-viewport-locked'))).toBeFalsy()
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 })
})

test('anchors the movie filter sheet to the viewport and keeps it interactive', async ({ page, browserName }) => {
  await page.goto('./')
  await expect(page.locator('.film-card').first()).toBeVisible()

  await page.getByRole('button', { name: '검색·필터' }).click()
  const sheet = page.locator('#film-advanced-filters')
  const backdrop = page.locator('.filter-sheet-backdrop')
  await expect(sheet).toBeVisible()
  await expect(backdrop).toBeVisible()

  const metrics = await sheet.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    return {
      left: rect.left,
      right: rect.right,
      bottomGap: window.innerHeight - rect.bottom,
      position: style.position,
      pointerEvents: style.pointerEvents,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    }
  })
  expect(metrics.position).toBe('fixed')
  expect(Math.abs(metrics.left)).toBeLessThanOrEqual(1)
  expect(Math.abs(metrics.right - window.innerWidth)).toBeLessThanOrEqual(1)
  expect(Math.abs(metrics.bottomGap)).toBeLessThanOrEqual(1)
  expect(metrics.pointerEvents).not.toBe('none')
  expect(metrics.overflow).toBeLessThanOrEqual(1)

  await page.getByRole('combobox', { name: '날짜' }).selectOption({ index: 1 })
  await expect(page.getByRole('combobox', { name: '날짜' })).not.toHaveValue('전체')

  const toolbar = page.locator('.film-results-toolbar')
  await expect(toolbar).toHaveAttribute('data-liquid-glass', 'toolbar')
  if (browserName === 'webkit') {
    await expect(toolbar.locator(':scope > .liquid-glass-refraction-layer')).toHaveCount(0)
  }

  await backdrop.click({ position: { x: 8, y: 8 } })
  await expect(sheet).toBeHidden()
  await expect(page.locator('body')).not.toHaveClass(/filter-sheet-open/)
})

test('keeps backup import reachable on an empty timetable and shows a compact toast', async ({ page }) => {
  await page.goto('./')
  const dock = page.locator('.liquid-tab-bar')
  await dock.getByRole('button', { name: '내 시간표' }).click()

  await expect(page.getByText('아직 시간표에 일정이 없습니다.')).toBeVisible()
  const more = page.locator('.timetable-empty-backup')
  await more.locator('summary').click()
  const importButton = more.getByRole('button', { name: 'JSON 가져오기' })
  await expect(importButton).toBeVisible()

  const chooserPromise = page.waitForEvent('filechooser')
  await importButton.click()
  const chooser = await chooserPromise
  await chooser.setFiles({
    name: 'empty-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      version: 3,
      exportedAt: '2026-09-21T00:00:00.000Z',
      selected: [],
      favorites: [],
      ticketStatus: {},
      bookingPlan: {},
      customEvents: [],
    })),
  })

  const toast = page.locator('.toast')
  await expect(toast).toHaveText('백업한 시간표를 가져왔습니다.')
  const box = await toast.boundingBox()
  expect(box).not.toBeNull()
  if (box) {
    expect(box.height).toBeLessThan(90)
    expect(box.width).toBeLessThan(page.viewportSize()!.width - 20)
    expect(box.y).toBeGreaterThan(page.viewportSize()!.height / 2)
  }
})

test('aligns the first content surface across all primary mobile sections', async ({ page }) => {
  await page.goto('./')
  const dock = page.locator('.liquid-tab-bar')

  const filmTop = await page.locator('#film-controls').evaluate((el) => el.getBoundingClientRect().top)

  await dock.getByRole('button', { name: '내 시간표' }).click()
  const timetableTop = await page.locator('.timetable-empty').evaluate((el) => el.getBoundingClientRect().top)

  await dock.getByRole('button', { name: 'AI 도슨트' }).click()
  await expect(page.locator('.curator-hero')).toBeVisible()
  const curatorTop = await page.locator('.curator-hero').evaluate((el) => el.getBoundingClientRect().top)

  await dock.getByRole('button', { name: '설정' }).click()
  const settingsTop = await page.locator('.settings-intro').evaluate((el) => el.getBoundingClientRect().top)

  const tops = [filmTop, timetableTop, curatorTop, settingsTop]
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(4)
})

test('releases the grid viewport lock before leaving for every other primary section', async ({ page, request }) => {
  await seedOneScreening(page, request)
  await page.goto('./')
  const dock = page.locator('.liquid-tab-bar')

  await openGrid(page)
  await dock.getByRole('button', { name: '영화 찾기' }).click()
  await expectViewportLockReleased(page)
  await expect(page.locator('#film-controls')).toBeVisible()

  await openGrid(page)
  await dock.getByRole('button', { name: 'AI 도슨트' }).click()
  await expectViewportLockReleased(page)
  await expect(page.locator('.curator-hero')).toBeVisible()

  await openGrid(page)
  await dock.getByRole('button', { name: '설정' }).click()
  await expectViewportLockReleased(page)
  await expect(page.locator('.settings-intro')).toBeVisible()
})

test('keeps the mobile grid toolbar inside 320px and moves secondary actions into more', async ({ page, request }) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await seedOneScreening(page, request)
  await page.goto('./')
  await openGrid(page)

  const actions = page.locator('.timetable-action-buttons')
  await expect(actions).toBeVisible()
  const png = actions.locator('.png-export-trigger')
  await expect(png).toBeHidden()

  const more = actions.locator('.backup-menu.timetable-more-menu')
  const summary = more.locator(':scope > summary')
  await expect(summary).toHaveText('더보기')
  await summary.click()
  await expect(png).toBeVisible()
  await expect(actions.locator(':scope > .png-export-trigger + button')).toBeVisible()

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)

  const toolbarBox = await page.locator('.enhanced-timetable-actions').boundingBox()
  expect(toolbarBox).not.toBeNull()
  if (toolbarBox) {
    expect(toolbarBox.x).toBeGreaterThanOrEqual(0)
    expect(toolbarBox.x + toolbarBox.width).toBeLessThanOrEqual(321)
  }
})

test('uses the settings wrapper only for layout and contains matrix overflow locally', async ({ page }) => {
  await page.goto('./')
  await page.locator('.liquid-tab-bar').getByRole('button', { name: '설정' }).click()

  const wrapper = page.locator('.react-settings-panel')
  const wrapperStyle = await wrapper.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      background: style.backgroundColor,
      borderTopWidth: style.borderTopWidth,
      boxShadow: style.boxShadow,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    }
  })
  expect(wrapperStyle.background).toBe('rgba(0, 0, 0, 0)')
  expect(wrapperStyle.borderTopWidth).toBe('0px')
  expect(wrapperStyle.boxShadow).toBe('none')
  expect(wrapperStyle.overflow).toBeLessThanOrEqual(1)

  const matrix = page.locator('.travel-matrix-wrap')
  await expect(matrix).toBeVisible()
  const matrixMetrics = await matrix.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    overflowX: getComputedStyle(element).overflowX,
  }))
  expect(matrixMetrics.scrollWidth).toBeGreaterThan(matrixMetrics.clientWidth)
  expect(['auto', 'scroll']).toContain(matrixMetrics.overflowX)
})
