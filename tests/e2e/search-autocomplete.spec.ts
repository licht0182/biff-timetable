import { expect, test, type APIRequestContext } from '@playwright/test'

type Screening = { id: string; date: string; start: string; venue: string; gv?: boolean }
type Film = {
  id: string
  title: string
  englishTitle?: string
  director?: string
  section?: string
  screenings: Screening[]
}
type FilmData = { films: Film[] }

async function screeningData(request: APIRequestContext) {
  const response = await request.get('./screenings.json')
  expect(response.ok()).toBeTruthy()
  return await response.json() as FilmData
}

test('previews related films while typing and commits a clicked suggestion', async ({ page, request }) => {
  const data = await screeningData(request)
  const candidate = data.films.find((film) => film.title.trim().length >= 4 && film.screenings.length > 0)
  test.skip(!candidate, '자동완성 테스트에 사용할 영화가 없습니다.')

  const partial = candidate!.title.trim().slice(0, Math.max(1, candidate!.title.trim().length - 1))
  await page.goto('./')

  const input = page.getByLabel('영화 검색')
  await input.fill(partial)

  const listbox = page.getByRole('listbox', { name: '영화 검색 미리보기' })
  await expect(listbox).toBeVisible()
  const option = listbox.getByRole('option').filter({ hasText: candidate!.title }).first()
  await expect(option).toBeVisible()
  await expect(option).toContainText(candidate!.screenings[0].venue)

  await option.click()
  await expect(input).toHaveValue(candidate!.title)
  await expect(listbox).toBeHidden()
  await expect(page.locator('.film-card').filter({ hasText: candidate!.title }).first()).toBeVisible()
})

test('supports keyboard selection in film search autocomplete', async ({ page, request }) => {
  const data = await screeningData(request)
  const candidate = data.films.find((film) => film.title.trim().length >= 3 && film.screenings.length > 0)
  test.skip(!candidate, '키보드 자동완성 테스트에 사용할 영화가 없습니다.')

  await page.goto('./')
  const input = page.getByLabel('영화 검색')
  await input.fill(candidate!.title)
  await expect(page.getByRole('listbox', { name: '영화 검색 미리보기' })).toBeVisible()

  await input.press('ArrowDown')
  await expect(page.getByRole('option').first()).toHaveAttribute('aria-selected', 'true')
  await input.press('Enter')

  await expect(input).toHaveValue(candidate!.title)
  await expect(page.getByRole('listbox', { name: '영화 검색 미리보기' })).toBeHidden()
})

test('respects the active date filter and stays inside a 320px viewport', async ({ page, request }) => {
  const data = await screeningData(request)
  const allDates = Array.from(new Set(data.films.flatMap((film) => film.screenings.map((screening) => screening.date)))).sort()
  const pair = data.films
    .map((film) => ({
      film,
      excludedDate: allDates.find((date) => !film.screenings.some((screening) => screening.date === date)),
    }))
    .find(({ film, excludedDate }) => film.title.trim().length >= 3 && Boolean(excludedDate))
  test.skip(!pair?.excludedDate, '날짜 필터 자동완성 테스트 조합이 없습니다.')

  await page.setViewportSize({ width: 320, height: 740 })
  await page.goto('./')
  await page.getByLabel('날짜').selectOption(pair!.excludedDate!)
  await page.getByLabel('영화 검색').fill(pair!.film.title)

  await expect(page.getByRole('listbox', { name: '영화 검색 미리보기' })).toBeVisible()
  await expect(page.getByRole('option').filter({ hasText: pair!.film.title })).toHaveCount(0)
  await expect(page.getByText('현재 필터 조건에서 일치하는 영화가 없습니다.')).toBeVisible()

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
})
