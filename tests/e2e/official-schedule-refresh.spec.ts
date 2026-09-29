import { expect, test } from '@playwright/test'

test('new official Gravity screening can be found and added to the timetable', async ({ page }) => {
  await page.goto('./')
  await page.getByLabel('영화 검색').fill('그래비티')

  const card = page.locator('.film-card').filter({ hasText: '그래비티' }).first()
  await expect(card).toBeVisible()
  await expect(card.locator('.screening-row')).toContainText('20:20')
  await expect(card.locator('.screening-row')).toContainText('IMAX')

  await card.getByRole('button', { name: '+ 추가' }).click()
  await expect(page.locator('.selection-count')).toHaveText('총 1개 선택')
  await page.getByRole('button', { name: '내 시간표' }).click()
  await expect(page.locator('.schedule-list')).toContainText('그래비티')
})
