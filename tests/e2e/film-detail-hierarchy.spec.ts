import { expect, test } from '@playwright/test'

for (const width of [320, 390]) {
  test(`keeps dialog favorite labels horizontal and close targets usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 740 })
    await page.goto('./')
    const film = page.locator('.film-card').first()
    await expect(film).toBeVisible({ timeout: 15_000 })
    const icon = await film.locator('.film-actions .favorite-button').boundingBox()
    expect(icon?.width).toBe(44)
    expect(icon?.height).toBe(44)
    await film.getByRole('button', { name: '상세', exact: true }).click()
    const dialog = page.getByRole('dialog')
    const favorite = dialog.locator('.modal-footer .favorite-button')
    const geometry = await favorite.evaluate((element) => {
      const button = element.getBoundingClientRect()
      const range = document.createRange()
      range.selectNodeContents(element)
      const text = range.getBoundingClientRect()
      return { buttonWidth: button.width, buttonHeight: button.height, textHeight: text.height, fontSize: parseFloat(getComputedStyle(element).fontSize) }
    })
    expect(geometry.buttonWidth).toBeGreaterThan(geometry.buttonHeight)
    expect(geometry.textHeight).toBeLessThan(geometry.fontSize * 2)
    const close = await dialog.getByRole('button', { name: '상세보기 닫기' }).boundingBox()
    expect(close?.width).toBeGreaterThanOrEqual(44)
    expect(close?.height).toBeGreaterThanOrEqual(44)
  })
}

test('keeps screening actions visible while a long synopsis can expand', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  await page.getByRole('combobox', { name: '영화 검색' }).fill('아버지의 방')
  await expect(page.getByRole('status').filter({ hasText: '검색 결과 1편' })).toBeVisible()
  const card = page.locator('.film-card').filter({ has: page.getByRole('heading', { name: '아버지의 방' }) }).first()
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: '상세' }).click()

  const modal = page.getByRole('dialog', { name: '아버지의 방' })
  const synopsis = modal.locator('.film-synopsis .synopsis')
  const expand = modal.getByRole('button', { name: '줄거리 더 읽기' })
  await expect(expand).toHaveAttribute('aria-expanded', 'false')
  await expect(synopsis).toHaveClass(/is-collapsed/)
  await expect(modal.locator('.modal-screenings button').first()).toBeInViewport()
  await page.setViewportSize({ width: 320, height: 640 })
  await expect(modal.locator('.modal-screenings button').first()).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
  await page.setViewportSize({ width: 390, height: 844 })

  await expand.focus()
  await page.keyboard.press('Enter')
  await expect(modal.getByRole('button', { name: '줄거리 접기' })).toHaveAttribute('aria-expanded', 'true')
  await expect(synopsis).not.toHaveClass(/is-collapsed/)
  await modal.getByRole('button', { name: '줄거리 접기' }).click()
  await expect(expand).toHaveAttribute('aria-expanded', 'false')
  await modal.locator('.modal-screenings button').first().click()
  await expect(modal.locator('.modal-screenings button').first()).toHaveText('선택됨')

  await modal.getByRole('button', { name: '상세보기 닫기' }).click()
  await card.getByRole('button', { name: '상세' }).click()
  await expect(modal.getByRole('button', { name: '줄거리 더 읽기' })).toHaveAttribute('aria-expanded', 'false')
})
