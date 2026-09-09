import { expect, test } from '@playwright/test'

test('keeps iPhone custom event date, category, and time controls inside their grid columns', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  await page.getByRole('button', { name: '내 시간표' }).click()
  await page.getByRole('button', { name: /일정 추가|\+ 일정/ }).first().click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  const rows = dialog.locator('.custom-event-form-row')
  await expect(rows).toHaveCount(2)

  for (let rowIndex = 0; rowIndex < 2; rowIndex += 1) {
    const row = rows.nth(rowIndex)
    const labels = row.locator(':scope > label')
    const firstLabel = await labels.nth(0).boundingBox()
    const secondLabel = await labels.nth(1).boundingBox()
    const firstControl = await labels.nth(0).locator('input, select').boundingBox()
    const secondControl = await labels.nth(1).locator('input, select').boundingBox()

    expect(firstLabel).not.toBeNull()
    expect(secondLabel).not.toBeNull()
    expect(firstControl).not.toBeNull()
    expect(secondControl).not.toBeNull()

    expect(firstControl!.x).toBeGreaterThanOrEqual(firstLabel!.x - 1)
    expect(firstControl!.x + firstControl!.width).toBeLessThanOrEqual(firstLabel!.x + firstLabel!.width + 1)
    expect(secondControl!.x).toBeGreaterThanOrEqual(secondLabel!.x - 1)
    expect(secondControl!.x + secondControl!.width).toBeLessThanOrEqual(secondLabel!.x + secondLabel!.width + 1)
    expect(secondControl!.x - (firstControl!.x + firstControl!.width)).toBeGreaterThanOrEqual(6)
    expect(Math.abs(firstControl!.width - secondControl!.width)).toBeLessThanOrEqual(2)
  }

  const modalBox = await dialog.boundingBox()
  const titleBox = await dialog.getByLabel('일정명 *').boundingBox()
  const locationBox = await dialog.getByLabel('장소').boundingBox()
  const noteBox = await dialog.getByLabel('메모').boundingBox()
  expect(modalBox).not.toBeNull()
  for (const box of [titleBox, locationBox, noteBox]) {
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(modalBox!.x)
    expect(box!.x + box!.width).toBeLessThanOrEqual(modalBox!.x + modalBox!.width)
  }
})
