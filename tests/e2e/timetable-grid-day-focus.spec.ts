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

async function openMultiDayGrid(page: Page, request: APIRequestContext, dateCount: number, overlapCount: number, overlapDateIndex = 0) {
  const response = await request.get('./screenings.json')
  expect(response.ok()).toBeTruthy()
  const data = await response.json() as FilmData
  const firstByDate = new Map<string, Screening>()
  for (const screening of data.films.flatMap((film) => film.screenings)) {
    if (!firstByDate.has(screening.date)) firstByDate.set(screening.date, screening)
  }
  const selected = [...firstByDate.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(0, dateCount)
  expect(selected).toHaveLength(dateCount)
  const overlapDate = selected[overlapDateIndex][0]
  await page.addInitScript(({ ids, events }) => {
    localStorage.setItem('biff-timetable:selected-screenings:v1', JSON.stringify(ids))
    localStorage.setItem('biff-timetable:custom-events:v1', JSON.stringify(events))
    localStorage.setItem('biff-timetable:view-mode:v1', JSON.stringify('grid'))
  }, {
    ids: selected.map(([, screening]) => screening.id),
    events: Array.from({ length: overlapCount }, (_, index) => ({
      id: `custom-dense-grid-${index}`,
      title: `겹치는 일정 ${index + 1}`,
      date: overlapDate,
      start: '12:00',
      end: '13:00',
      category: 'personal',
      createdAt: '2026-09-29T00:00:00.000Z',
    })),
  })
  await page.goto('./')
  await page.getByRole('button', { name: '내 시간표' }).click()
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

for (const width of [1023, 1024, 1440]) {
  test(`dense ten-day grid focuses a readable date at ${width}px`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 844 })
    await openMultiDayGrid(page, request, 10, 3)
    const columns = page.locator('.day-column')
    const days = page.locator('.timetable-day-button')
    await expect(columns).toHaveCount(1)
    await expect(days).toHaveCount(10)
    const focusedWidth = await columns.first().evaluate((element) => element.getBoundingClientRect().width)
    expect(focusedWidth).toBeGreaterThanOrEqual(width * 0.75)
    await expect(page.locator('.day-column .event-block.custom-event')).toHaveCount(3)
    await expect(page.locator('.day-column .event-block.custom-event[data-runtime-lane]')).toHaveCount(3)
    const focusedCardWidth = await page.locator('.day-column .event-block.custom-event').first().evaluate((element) => element.getBoundingClientRect().width)
    expect(focusedCardWidth).toBeGreaterThan(88)

    await days.first().focus()
    await page.keyboard.press('End')
    await expect(days.last()).toHaveAttribute('aria-pressed', 'true')
    await expect(columns).toHaveCount(1)
    await expect(page.locator('.day-column .event-block.custom-event')).toHaveCount(0)
    await page.keyboard.press('Home')
    await expect(days.first()).toHaveAttribute('aria-pressed', 'true')
    await days.nth(1).click()
    await expect(days.nth(1)).toHaveAttribute('aria-pressed', 'true')
    await days.first().click()

    const viewControls = page.getByRole('group', { name: '시간표 날짜 표시' })
    if (width <= 1023) {
      await expect(viewControls).toHaveCount(0)
      return
    }
    await expect(viewControls.getByRole('button', { name: '하루 자세히' })).toHaveAttribute('aria-pressed', 'true')
    await viewControls.getByRole('button', { name: '전체 날짜' }).click()
    await expect(columns).toHaveCount(10)
    await expect(days).toHaveCount(0)
    await expect(viewControls.getByRole('button', { name: '전체 날짜' })).toHaveAttribute('aria-pressed', 'true')
    const overviewWidth = await columns.first().evaluate((element) => element.getBoundingClientRect().width)
    expect(overviewWidth).toBeLessThan(120)
    expect(overviewWidth).toBeGreaterThan(80)
    const overviewCardWidth = await page.locator('.day-column .event-block.custom-event').first().evaluate((element) => element.getBoundingClientRect().width)
    expect(overviewCardWidth).toBeLessThan(88)
    await viewControls.getByRole('button', { name: '하루 자세히' }).click()
    await expect(columns).toHaveCount(1)
    await expect(days).toHaveCount(10)
    await expect(page.locator('.day-column .event-block.custom-event')).toHaveCount(3)
  })
}

for (const width of [1024, 1440]) {
  test(`sparse ten-day grid keeps all dates at ${width}px`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 844 })
    await openMultiDayGrid(page, request, 10, 0)
    await expect(page.locator('.day-column')).toHaveCount(10)
    await expect(page.locator('.timetable-day-button')).toHaveCount(0)
    await expect(page.getByRole('group', { name: '시간표 날짜 표시' }).getByRole('button', { name: '전체 날짜' })).toHaveAttribute('aria-pressed', 'true')
  })
}

test('two overlapping dates keep the desktop overview', async ({ page, request }) => {
  await page.setViewportSize({ width: 1024, height: 844 })
  await openMultiDayGrid(page, request, 2, 3)
  await expect(page.locator('.day-column')).toHaveCount(2)
  await expect(page.locator('.day-column .event-block.custom-event[data-runtime-lane]')).toHaveCount(3)
})

test('auto focus opens the crowded date when it is not the first date', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openMultiDayGrid(page, request, 10, 3, 4)
  const days = page.locator('.timetable-day-button')
  await expect(days).toHaveCount(10)
  await expect(days.nth(4)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.day-column')).toHaveCount(1)
  await expect(page.locator('.day-column .event-block.custom-event')).toHaveCount(3)
  await days.first().click()
  await expect(days.first()).toHaveAttribute('aria-pressed', 'true')
})
