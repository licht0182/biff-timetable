import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

const SELECTED_KEY = 'biff-timetable:selected-screenings:v1'
const STATUS_KEY = 'biff-timetable:ticket-status:v1'

type Screening = { id: string; date: string; start: string }
type FilmData = { films: Array<{ screenings: Screening[] }> }

async function seedOneScreening(page: Page, id: string) {
  await page.addInitScript(({ selectedKey, statusKey, screeningId }) => {
    localStorage.setItem(selectedKey, JSON.stringify([screeningId]))
    localStorage.setItem(statusKey, JSON.stringify({ [screeningId]: 'planned' }))
  }, { selectedKey: SELECTED_KEY, statusKey: STATUS_KEY, screeningId: id })
}

async function ordinaryScreening(request: APIRequestContext) {
  const response = await request.get('./screenings.json')
  expect(response.ok()).toBeTruthy()
  const data = await response.json() as FilmData
  return data.films
    .flatMap((film) => film.screenings)
    .find((screening) => screening.start >= '08:00')
}

async function timetableGeometry(page: Page) {
  return await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>('.app-shell')!
    const scroll = document.querySelector<HTMLElement>('.timetable-scroll')!
    const timetable = document.querySelector<HTMLElement>('.timetable')!
    const style = getComputedStyle(timetable)
    return {
      shellHeight: shell.getBoundingClientRect().height,
      timetableHeight: timetable.getBoundingClientRect().height,
      hourHeight: Number.parseFloat(style.getPropertyValue('--hour-height')),
      gridHeight: Number.parseFloat(style.getPropertyValue('--grid-height')),
      bodyOverflowY: getComputedStyle(document.body).overflowY,
      htmlOverflowY: getComputedStyle(document.documentElement).overflowY,
      stableClass: shell.classList.contains('timetable-viewport-stable'),
      stableData: timetable.dataset.stableViewport,
      scrollOverflowY: getComputedStyle(scroll).overflowY,
    }
  })
}

async function addEarlyEvent(page: Page, date: string) {
  await page.getByRole('button', { name: /일정 추가|\+ 일정/ }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('일정명 *').fill('아침 일정')
  await dialog.getByLabel('날짜 *').fill(date)
  await dialog.getByLabel('시작 *').fill('07:00')
  await dialog.getByLabel('종료 *').fill('08:00')
  await dialog.getByRole('button', { name: '추가', exact: true }).click()
}

test('keeps a fixed 40px-per-hour timetable while allowing normal page scrolling', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 560 })
  const screening = await ordinaryScreening(request)
  test.skip(!screening, '일반 시간대 회차가 없습니다.')
  await seedOneScreening(page, screening!.id)

  await page.goto('./')
  await page.getByRole('button', { name: '내 시간표' }).click()
  await page.getByRole('button', { name: '시간표', exact: true }).click()

  const before = await timetableGeometry(page)
  expect(before.stableClass).toBeFalsy()
  expect(before.stableData).toBeUndefined()
  expect(before.bodyOverflowY).not.toBe('hidden')
  expect(before.htmlOverflowY).not.toBe('hidden')
  expect(before.scrollOverflowY).not.toBe('hidden')
  expect(before.hourHeight).toBeCloseTo(40, 5)
  expect(before.gridHeight).toBeGreaterThanOrEqual(16 * 40)
  expect(before.shellHeight).toBeGreaterThan(560)

  await page.setViewportSize({ width: 390, height: 780 })
  const after = await timetableGeometry(page)
  expect(after.hourHeight).toBeCloseTo(before.hourHeight, 5)
  expect(after.gridHeight).toBeCloseTo(before.gridHeight, 5)
  expect(after.timetableHeight).toBeCloseTo(before.timetableHeight, 5)

  await page.setViewportSize({ width: 390, height: 560 })
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
})

test('expands the fixed timetable by exactly one hour when the visible range starts at 07:00', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 700 })
  const screening = await ordinaryScreening(request)
  test.skip(!screening, '일반 시간대 회차가 없습니다.')
  await seedOneScreening(page, screening!.id)

  await page.goto('./')
  await page.getByRole('button', { name: '내 시간표' }).click()
  await page.getByRole('button', { name: '시간표', exact: true }).click()

  const before = await timetableGeometry(page)
  await addEarlyEvent(page, screening!.date)
  await expect(page.locator('.time-axis')).toContainText('07시')

  const after = await timetableGeometry(page)
  expect(after.hourHeight).toBeCloseTo(40, 5)
  expect(after.gridHeight - before.gridHeight).toBeCloseTo(40, 5)
  expect(after.timetableHeight - before.timetableHeight).toBeCloseTo(40, 5)
})
