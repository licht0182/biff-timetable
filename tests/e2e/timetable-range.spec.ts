import { expect, test } from '@playwright/test'

type Screening = { id: string; start: string; end?: string }
type Film = { runtime?: number; screenings: Screening[] }
type FilmData = { films: Film[] }
type Item = { film: Film; screening: Screening }

const SELECTED_KEY = 'biff-timetable:selected-screenings:v1'
const STATUS_KEY = 'biff-timetable:ticket-status:v1'

function minutes(time: string) {
  const [hour, minute] = time.split(':').map(Number)
  return hour * 60 + minute
}

function duration(film: Film, screening: Screening) {
  const start = minutes(screening.start)
  if (!screening.end) return film.runtime ?? 120
  let end = minutes(screening.end)
  while (end <= start) end += 24 * 60
  return end - start
}

function timetableEnd({ film, screening }: Item) {
  let start = minutes(screening.start)
  if (start < 8 * 60) start += 24 * 60
  return start + duration(film, screening)
}

async function seed(page: import('@playwright/test').Page, id: string) {
  await page.addInitScript(({ selectedKey, statusKey, id }) => {
    localStorage.setItem(selectedKey, JSON.stringify([id]))
    localStorage.setItem(statusKey, JSON.stringify({ [id]: 'planned' }))
  }, { selectedKey: SELECTED_KEY, statusKey: STATUS_KEY, id })
}

test('uses 08:00–00:00 as the default range', async ({ page, request }) => {
  const response = await request.get('./screenings.json')
  expect(response.ok()).toBeTruthy()
  const data = await response.json() as FilmData
  const item = data.films.flatMap((film) => film.screenings.map((screening) => ({ film, screening })))
    .find((candidate) => timetableEnd(candidate) <= 24 * 60 && minutes(candidate.screening.start) >= 8 * 60)
  test.skip(!item, '일반 시간대 회차가 없습니다.')

  await seed(page, item!.screening.id)
  await page.goto('./')
  await page.getByRole('button', { name: '내 시간표' }).click()

  const axis = page.locator('.time-axis')
  await expect(axis).toContainText('00시')
  await expect(axis).not.toContainText('01시')
  await expect(axis).not.toContainText('02시')
  await expect(axis).not.toContainText('03시')
  await expect(page.locator('.day-column').first().locator('.hour-line')).toHaveCount(17)
})

test('extends only as far as the selected late screening requires', async ({ page, request }) => {
  const response = await request.get('./screenings.json')
  expect(response.ok()).toBeTruthy()
  const data = await response.json() as FilmData
  const item = data.films.flatMap((film) => film.screenings.map((screening) => ({ film, screening })))
    .filter((candidate) => timetableEnd(candidate) > 24 * 60)
    .sort((a, b) => timetableEnd(b) - timetableEnd(a))[0]
  test.skip(!item, '자정을 넘기는 회차가 없습니다.')

  await seed(page, item!.screening.id)
  await page.goto('./')
  await page.getByRole('button', { name: '내 시간표' }).click()

  const expectedEndHour = Math.ceil(timetableEnd(item!) / 60)
  const axis = page.locator('.time-axis')
  for (let hour = 24; hour <= expectedEndHour; hour += 1) {
    const label = `${String(hour % 24).padStart(2, '0')}시`
    await expect(axis).toContainText(label)
  }
  await expect(page.locator('.day-column').first().locator('.hour-line')).toHaveCount(expectedEndHour - 8 + 1)
})
