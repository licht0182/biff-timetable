import { expect, test, type Page } from '@playwright/test'

const SELECTED_KEY = 'biff-timetable:selected-screenings:v1'

type FilmData = {
  films: Array<{
    screenings: Array<{ id: string; date: string }>
  }>
}

async function addCustomEvent(page: Page, date: string) {
  await page.getByRole('button', { name: /일정 추가|\+ 일정/ }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('일정명 *').fill('선택 수에서 제외할 개인 일정')
  await dialog.getByLabel('날짜 *').fill(date)
  await dialog.getByLabel('시작 *').fill('06:00')
  await dialog.getByLabel('종료 *').fill('06:30')
  page.once('dialog', (confirmation) => confirmation.accept())
  await dialog.getByRole('button', { name: '추가', exact: true }).click()
}

test('header selection total counts only festival screenings and excludes custom events', async ({ page, request }) => {
  const response = await request.get('./screenings.json')
  expect(response.ok()).toBeTruthy()
  const data = await response.json() as FilmData
  const screening = data.films.flatMap((film) => film.screenings)[0]
  test.skip(!screening, '상영 회차 데이터가 없습니다.')

  await page.addInitScript(({ key, id }) => {
    localStorage.setItem(key, JSON.stringify([id]))
  }, { key: SELECTED_KEY, id: screening!.id })

  await page.goto('./')
  const headerCount = page.locator('.selection-count')
  await expect(headerCount).toHaveText('총 1개 선택')

  await page.getByRole('button', { name: '내 시간표' }).click()
  await addCustomEvent(page, screening!.date)

  await expect(page.locator('.booking-summary')).toContainText('사용자 일정 1')
  await expect(page.locator('.event-block.custom-event')).toHaveCount(1)
  await expect(headerCount).toHaveText('총 1개 선택')
})
