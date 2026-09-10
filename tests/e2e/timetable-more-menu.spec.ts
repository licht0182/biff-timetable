import { expect, test, type Page } from '@playwright/test'

const SELECTED_KEY = 'biff-timetable:selected-screenings:v1'
const STATUS_KEY = 'biff-timetable:ticket-status:v1'

type FilmData = { films: Array<{ screenings: Array<{ id: string }> }> }

async function seedTimetable(page: Page, request: any) {
  const response = await request.get('./screenings.json')
  expect(response.ok()).toBeTruthy()
  const data = await response.json() as FilmData
  const id = data.films.flatMap((film) => film.screenings)[0]?.id
  test.skip(!id, '상영 회차 데이터가 없습니다.')
  await page.addInitScript(({ selectedKey, statusKey, screeningId }) => {
    localStorage.setItem(selectedKey, JSON.stringify([screeningId]))
    localStorage.setItem(statusKey, JSON.stringify({ [screeningId]: 'planned' }))
  }, { selectedKey: SELECTED_KEY, statusKey: STATUS_KEY, screeningId: id })
}

test('toggles calendar, backup, and clear-all inside the timetable more menu without resizing the timetable', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await seedTimetable(page, request)
  await page.goto('./')
  await page.getByRole('button', { name: '내 시간표' }).click()

  const actions = page.locator('.timetable-action-buttons')
  const more = actions.locator('.backup-menu.timetable-more-menu')
  const summary = more.locator(':scope > summary')
  const calendar = actions.locator(':scope > .png-export-trigger + button')
  const clearAll = actions.locator(':scope > button:last-child')
  const backupActions = more.locator(':scope > div > button')
  const timetable = page.locator('.timetable-scroll')

  await expect(summary).toHaveText('더보기')
  await expect(summary).toHaveAttribute('aria-label', '더보기 메뉴 열기')
  await expect(calendar).toBeHidden()
  await expect(clearAll).toBeHidden()
  await expect(backupActions).toHaveCount(2)
  await expect(backupActions.nth(0)).toBeHidden()
  await expect(backupActions.nth(1)).toBeHidden()

  const beforeHeight = (await timetable.boundingBox())?.height ?? 0
  await summary.click()

  await expect(more).toHaveAttribute('open', '')
  await expect(summary).toHaveAttribute('aria-label', '더보기 메뉴 닫기')
  await expect(calendar).toBeVisible()
  await expect(clearAll).toBeVisible()
  await expect(backupActions.nth(0)).toBeVisible()
  await expect(backupActions.nth(0)).toHaveText('JSON 저장')
  await expect(backupActions.nth(1)).toBeVisible()
  await expect(backupActions.nth(1)).toHaveText('가져오기')

  const afterOpenHeight = (await timetable.boundingBox())?.height ?? 0
  expect(Math.abs(afterOpenHeight - beforeHeight)).toBeLessThanOrEqual(1)

  await summary.click()
  await expect(more).not.toHaveAttribute('open', '')
  await expect(summary).toHaveAttribute('aria-label', '더보기 메뉴 열기')
  await expect(calendar).toBeHidden()
  await expect(clearAll).toBeHidden()
  await expect(backupActions.nth(0)).toBeHidden()
  await expect(backupActions.nth(1)).toBeHidden()

  const afterCloseHeight = (await timetable.boundingBox())?.height ?? 0
  expect(Math.abs(afterCloseHeight - beforeHeight)).toBeLessThanOrEqual(1)
})
