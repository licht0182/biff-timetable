import { expect, test } from '@playwright/test'

type Film = {
  title: string
  genre?: string
}

type FilmData = { films: Film[] }

test('shows collected genres in film search and detail, and genre text is searchable', async ({ page, request }) => {
  const response = await request.get('./screenings.json')
  expect(response.ok()).toBeTruthy()
  const data = await response.json() as FilmData
  const film = data.films.find((candidate) => typeof candidate.genre === 'string' && candidate.genre.trim().length > 0)
  expect(film, '장르가 수집된 작품이 최소 1개 있어야 합니다.').toBeTruthy()

  await page.goto('./')
  const search = page.getByLabel('영화 검색')
  await expect(search).toHaveAttribute('placeholder', /장르/)

  await search.fill(film!.title)
  const card = page.locator('.film-card').filter({ hasText: film!.title }).first()
  await expect(card).toBeVisible()
  await expect(card.locator('.genre-meta')).toHaveText(film!.genre!)

  await card.getByRole('button', { name: '상세' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('장르', { exact: true })).toBeVisible()
  await expect(dialog.locator('.film-detail-genre')).toHaveText(film!.genre!)
  await page.keyboard.press('Escape')

  await search.fill(film!.genre!)
  await expect(page.locator('.film-card .genre-meta').first()).toContainText(film!.genre!)
})
