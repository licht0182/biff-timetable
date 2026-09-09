import { expect, test, type Page } from '@playwright/test'

const SELECTED_KEY = 'biff-timetable:selected-screenings:v1'
const STATUS_KEY = 'biff-timetable:ticket-status:v1'

async function seedSelected(page: Page, ids: string[]) {
  await page.addInitScript(({ selectedKey, statusKey, ids }) => {
    localStorage.setItem(selectedKey, JSON.stringify(ids))
    localStorage.setItem(statusKey, JSON.stringify(Object.fromEntries(ids.map((id) => [id, 'planned']))))
  }, { selectedKey: SELECTED_KEY, statusKey: STATUS_KEY, ids })
}

async function openTimetable(page: Page) {
  await page.getByRole('button', { name: '내 시간표' }).click()
  await expect(page.locator('.timetable-scroll')).toBeVisible()
}

test('keeps film-search and timetable header/navigation geometry identical', async ({ page }) => {
  await seedSelected(page, ['biff2025-097'])
  await page.goto('./')

  const topbar = page.locator('.topbar')
  const tabs = page.locator('.tabs')
  const filmTab = page.getByRole('button', { name: '영화 찾기' })
  const timetableTab = page.getByRole('button', { name: '내 시간표' })

  const before = {
    topbar: await topbar.boundingBox(),
    tabs: await tabs.boundingBox(),
    filmTab: await filmTab.boundingBox(),
    timetableTab: await timetableTab.boundingBox(),
  }

  await openTimetable(page)

  const after = {
    topbar: await topbar.boundingBox(),
    tabs: await tabs.boundingBox(),
    filmTab: await filmTab.boundingBox(),
    timetableTab: await timetableTab.boundingBox(),
  }

  for (const box of [...Object.values(before), ...Object.values(after)]) expect(box).not.toBeNull()
  expect(Math.abs(after.topbar!.height - before.topbar!.height)).toBeLessThanOrEqual(1)
  expect(Math.abs(after.tabs!.height - before.tabs!.height)).toBeLessThanOrEqual(1)
  expect(Math.abs(after.filmTab!.height - before.filmTab!.height)).toBeLessThanOrEqual(1)
  expect(Math.abs(after.timetableTab!.height - before.timetableTab!.height)).toBeLessThanOrEqual(1)
})

test('shows the 08:00-00:00 baseline without clipping edge labels', async ({ page }) => {
  await seedSelected(page, ['biff2025-097'])
  await page.goto('./')
  await openTimetable(page)

  const timeAxis = page.locator('.time-axis')
  await expect(timeAxis.getByText('08시', { exact: true })).toBeVisible()
  await expect(timeAxis.getByText('00시', { exact: true })).toBeVisible()
  await expect(timeAxis.getByText('01시', { exact: true })).toHaveCount(0)
  await expect(page.locator('.day-column').first().locator('.hour-line')).toHaveCount(17)

  const bounds = await timeAxis.evaluate((axis) => {
    const labels = Array.from(axis.querySelectorAll<HTMLElement>(':scope > div'))
    const first = labels[0]?.getBoundingClientRect()
    const last = labels.at(-1)?.getBoundingClientRect()
    const axisRect = axis.getBoundingClientRect()
    return {
      axisTop: axisRect.top,
      axisBottom: axisRect.bottom,
      firstTop: first?.top ?? Number.NEGATIVE_INFINITY,
      lastBottom: last?.bottom ?? Number.POSITIVE_INFINITY,
    }
  })

  expect(bounds.firstTop).toBeGreaterThanOrEqual(bounds.axisTop - 1)
  expect(bounds.lastBottom).toBeLessThanOrEqual(bounds.axisBottom + 1)
})

test('fits a five-day timetable inside a 390x844 mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await seedSelected(page, [
    'biff2025-805',
    'biff2025-806',
    'biff2025-807',
    'biff2025-808',
    'biff2025-809',
  ])
  await page.goto('./')
  await openTimetable(page)

  const timetableScroll = page.locator('.timetable-scroll')
  await expect(page.locator('.date-head')).toHaveCount(5)

  const overflow = await timetableScroll.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }))
  const box = await timetableScroll.boundingBox()

  expect(box).not.toBeNull()
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)
  expect(overflow.scrollHeight).toBeLessThanOrEqual(overflow.clientHeight + 1)
  expect(box!.x).toBeGreaterThanOrEqual(-1)
  expect(box!.x + box!.width).toBeLessThanOrEqual(391)
  expect(box!.y + box!.height).toBeLessThanOrEqual(845)
})
