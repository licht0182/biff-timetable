import { expect, test, type APIRequestContext } from '@playwright/test'

type Screening = {
  id: string
  date: string
  start: string
  venue: string
  code?: string
}

type Film = {
  id: string
  title: string
  synopsis?: string
  screenings: Screening[]
}

type FilmData = { films: Film[] }

async function screeningData(request: APIRequestContext) {
  const response = await request.get('./screenings.json')
  expect(response.ok()).toBeTruthy()
  return await response.json() as FilmData
}

test('shows only the BIFF program note in film details while preserving screening data below it', async ({ page, request }) => {
  const data = await screeningData(request)
  const film = data.films.find((candidate) => candidate.title === '와일드 호스 나인')

  test.skip(!film, '와일드 호스 나인 데이터가 없습니다.')
  test.skip(!film!.synopsis?.includes('Schedule code'), '현재 원본 데이터에 테스트할 일정 접미사가 없습니다.')

  expect(film!.synopsis).toContain('1973년 칠레 쿠데타 직전')
  expect(film!.synopsis).toContain('(박가언)')
  expect(film!.synopsis).toContain('Schedule code')
  expect(film!.screenings.length).toBeGreaterThan(0)

  await page.goto('./')

  const search = page.getByRole('combobox', { name: '영화 검색' })
  await search.fill(film!.title)
  await search.press('Escape')

  const card = page.locator('.film-card').filter({ hasText: film!.title }).first()
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: '상세' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  const synopsis = dialog.locator('.synopsis')
  await expect(synopsis).toContainText('1973년 칠레 쿠데타 직전')
  await expect(synopsis).toContainText('(박가언)')
  await expect(synopsis).not.toContainText('Schedule code')
  await expect(synopsis).not.toContainText('날짜 10-08')

  const screeningRows = dialog.locator('.modal-screenings > div')
  await expect(screeningRows).toHaveCount(film!.screenings.length)
  await expect(screeningRows.first()).toContainText(film!.screenings[0].venue)
})
