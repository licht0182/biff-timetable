import { expect, test } from '@playwright/test'

test('opens as a modal, focuses search, and restores focus after Escape', async ({ page }) => {
  await page.goto('./')
  const trigger = page.getByRole('button', { name: '전체 검색' })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: '전체 검색' })
  await expect(dialog).toBeVisible()
  await expect(page.getByRole('searchbox', { name: '영화 검색' })).toBeFocused()
  expect(await page.locator('dialog.global-search-dialog').evaluate((node) => node.matches(':modal'))).toBe(true)
  await page.keyboard.press('ArrowDown')
  await expect(dialog.getByRole('button', { name: /영화 찾기/ })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(dialog.getByRole('button', { name: /상세 필터/ })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
})

test('submits a film query through the existing film search', async ({ page }) => {
  await page.goto('./')
  const title = '부산'
  await page.getByRole('button', { name: '내 시간표' }).first().click()
  await page.getByRole('button', { name: '전체 검색' }).click()
  await page.getByRole('searchbox', { name: '영화 검색' }).fill(title)
  await page.getByRole('dialog', { name: '전체 검색' }).getByRole('button', { name: '검색', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '전체 검색' })).toHaveCount(0)
  await expect(page.getByRole('combobox', { name: '영화 검색' })).toHaveValue(title)
  await expect(page.getByRole('combobox', { name: '영화 검색' })).toBeFocused()
  await expect(page.getByRole('status').filter({ hasText: /검색 결과 \d+편/ })).toBeVisible()
})

test('quick links preserve film search, filters, and four destinations', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  const trigger = page.getByRole('button', { name: '전체 검색' })
  await expect(trigger).toBeVisible()
  await trigger.click()
  await page.getByRole('dialog').getByRole('button', { name: /상세 필터/ }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('combobox', { name: '영화 검색' })).toBeVisible()
  await expect(page.locator('#film-advanced-filters')).toHaveClass(/mobile-open/)
  await page.getByRole('button', { name: '상세 필터 닫기' }).first().click()

  await trigger.click()
  await page.getByRole('dialog').getByRole('button', { name: /내 시간표/ }).click()
  await expect(page.getByRole('main').first()).toHaveClass(/timetable-page/)
  await expect(page.locator('.liquid-tab-bar button[aria-current="page"]')).toBeFocused()

  await trigger.click()
  await page.getByRole('dialog').getByRole('button', { name: /AI 도슨트/ }).click()
  await expect(page.getByRole('main').first()).toHaveClass(/curator-page/)
  await expect(page.locator('.liquid-tab-bar button[aria-current="page"]')).toBeFocused()

  await trigger.click()
  await page.getByRole('dialog').getByRole('button', { name: /설정/ }).click()
  await expect(page.getByRole('main').first()).toHaveClass(/biff-settings-panel/)
  await expect(page.locator('.liquid-tab-bar button[aria-current="page"]')).toBeFocused()

  await trigger.click()
  await page.getByRole('dialog').getByRole('button', { name: /영화 찾기/ }).click()
  await expect(page.getByRole('combobox', { name: '영화 검색' })).toBeFocused()
  await expect(page.locator('.liquid-tab-bar button')).toHaveCount(4)
})

for (const width of [390, 1440]) {
  test(`fits the ${width}px viewport without horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('./')
    const trigger = page.getByRole('button', { name: '전체 검색' })
    await expect(trigger).toBeVisible()
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: '전체 검색' })
    await expect(dialog).toBeInViewport()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await expect(dialog.getByRole('button', { name: /상세 필터/ })).toBeVisible()
    await dialog.getByRole('button', { name: '전체 검색 닫기' }).click()
    if (width === 1440) {
      await trigger.click()
      await page.getByRole('dialog').getByRole('button', { name: /상세 필터/ }).click()
      await expect(page.locator('#film-advanced-filters select').first()).toBeFocused()
    }
  })
}
