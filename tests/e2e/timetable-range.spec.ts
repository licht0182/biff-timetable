import { expect, test } from '@playwright/test'

type Screening = { id: string; start: string; end?: string }
type Film = { runtime?: number; screenings: Screening[] }
type FilmData = { films: Film[] }

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

test('keeps an ordinary timetable at 08:00–00:00 and extends only when a late screening needs it', async ({ page, request }) => {
  const response = await request.get('./screenings.json')
  expect(response.ok()).toBeTruthy()
  const data = await response.json() as FilmData
  const item = data.films.flatMap((film) => film.screenings.map((screening) => ({ film, screening })))
    .find(({ film, screening }) => {
      const start = minutes(screening.start)
      return start >= 8 * 60 && start + duration(film, screening) <= 24 * 60
    })
  test.skip(!item, '일반 시간대 회차가 없습니다.')

  await page.addInitScript(({ selectedKey, statusKey, id }) => {
    localStorage.setItem(selectedKey, JSON.stringify([id]))
    localStorage.setItem(statusKey, JSON.stringify({ [id]: 'planned' }))
  }, { selectedKey: SELECTED_KEY, statusKey: STATUS_KEY, id: item!.screening.id })

  await page.goto('./')
  await page.getByRole('button', { name: '내 시간표' }).click()
  const axis = page.locator('.time-axis')
  await expect(axis).toContainText('00시')
  await expect(axis).not.toContainText('01시')
  await expect(axis).not.toContainText('02시')
  await expect(axis).not.toContainText('03시')
})
