import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

type Screening = { id: string; date: string; start: string }
type FilmData = { films: Array<{ screenings: Screening[] }> }

async function openTwoDayGrid(page: Page, request: APIRequestContext) {
  const response = await request.get('./screenings.json')
  expect(response.ok()).toBeTruthy()
  const data = await response.json() as FilmData
  const firstByDate = new Map<string, Screening>()
  for (const screening of data.films.flatMap((film) => film.screenings)) {
    if (!firstByDate.has(screening.date)) firstByDate.set(screening.date, screening)
  }
  const selected = [...firstByDate.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(0, 2).map(([, screening]) => screening)
  expect(selected).toHaveLength(2)
  await page.addInitScript((ids) => {
    localStorage.setItem('biff-timetable:selected-screenings:v1', JSON.stringify(ids))
    localStorage.setItem('biff-timetable:view-mode:v1', JSON.stringify('grid'))
  }, selected.map((screening) => screening.id))
  await page.goto('./')
  await page.getByRole('button', { name: '내 시간표' }).click()
  await expect(page.locator('.day-column')).toHaveCount(page.viewportSize()!.width <= 1023 ? 1 : 2)
  return selected
}

for (const width of [320, 390, 768, 1023, 1024, 1440]) {
  test(`grid date layout and keyboard navigation at ${width}px`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 844 })
    await openTwoDayGrid(page, request)
    const days = page.locator('.timetable-day-button')
    if (width <= 1023) {
      await expect(days).toHaveCount(2)
      for (const day of await days.all()) {
        const bounds = await day.boundingBox()
        expect(bounds?.height).toBeGreaterThanOrEqual(44)
      }
      await expect(days.nth(0)).toHaveAttribute('aria-pressed', 'true')
      await days.nth(0).focus()
      await page.keyboard.press('End')
      await expect(days.nth(1)).toHaveAttribute('aria-pressed', 'true')
      await expect(days.nth(1)).toBeFocused()
      await expect(page.locator('.day-column')).toHaveCount(1)
      await page.keyboard.press('Home')
      await expect(days.nth(0)).toHaveAttribute('aria-pressed', 'true')
      await expect(days.nth(0)).toBeFocused()
      const event = page.locator('.day-column .event-block').first()
      await expect(event).toBeVisible()
      await expect(event).toHaveAttribute('aria-label', /부터 .*까지.*예매 예정/)
      await event.focus()
      await page.keyboard.press('Enter')
      await expect(page.getByRole('dialog')).toBeVisible()
    } else {
      await expect(days).toHaveCount(0)
      await expect(page.locator('.day-column')).toHaveCount(2)
    }
    const geometry = await page.evaluate(() => {
      const grid = document.querySelector('.timetable')!
      const column = document.querySelector('.day-column')!
      const axis = document.querySelector('.time-axis')!
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        columnWidth: column.getBoundingClientRect().width,
        gridWidth: grid.getBoundingClientRect().width,
        hourHeight: Number.parseFloat(getComputedStyle(grid).getPropertyValue('--hour-height')),
        axisWidth: axis.getBoundingClientRect().width,
      }
    })
    expect(geometry.overflow).toBeLessThanOrEqual(1)
    expect(geometry.hourHeight).toBe(40)
    expect(geometry.gridWidth).toBeGreaterThan(geometry.columnWidth)
    if (width <= 1023) expect(geometry.columnWidth).toBeGreaterThan(width * 0.65)
  })
}

test('keeps the selected date when crossing the desktop breakpoint', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openTwoDayGrid(page, request)
  const days = page.locator('.timetable-day-button')
  await days.nth(1).click()
  await expect(days.nth(1)).toHaveAttribute('aria-pressed', 'true')
  await page.setViewportSize({ width: 1024, height: 844 })
  await expect(page.locator('.day-column')).toHaveCount(2)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(days.nth(1)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.day-column')).toHaveCount(1)
})

test('falls back to the first date when the selected date loses its only screening', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openTwoDayGrid(page, request)
  const days = page.locator('.timetable-day-button')
  const firstDateLabel = await days.nth(0).innerText()
  await days.nth(1).click()
  await expect(days.nth(1)).toHaveAttribute('aria-pressed', 'true')
  await page.locator('.timetable-selection-button').click()
  await page.locator('.day-column .event-block').click()
  await expect(page.locator('.timetable-delete-button')).toHaveText('삭제 1')
  page.once('dialog', (dialog) => void dialog.accept())
  await page.locator('.timetable-delete-button').click()
  await expect(days).toHaveCount(0)
  await expect(page.locator('.date-head')).toHaveText(firstDateLabel)
  await expect(page.locator('.day-column')).toHaveCount(1)
  await expect(page.locator('.day-column .event-block')).toHaveCount(1)
})
