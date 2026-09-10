import { expect, test, type Locator } from '@playwright/test'

async function expectTwoLineInfoCentered(row: Locator, info: Locator) {
  await expect(row).toBeVisible()
  await expect(info).toBeVisible()

  const [rowBox, strongBox, spanBox] = await Promise.all([
    row.boundingBox(),
    info.locator(':scope > strong').boundingBox(),
    info.locator(':scope > span').boundingBox(),
  ])

  expect(rowBox).not.toBeNull()
  expect(strongBox).not.toBeNull()
  expect(spanBox).not.toBeNull()

  const trackCount = await info.evaluate((element) => {
    const rows = getComputedStyle(element).gridTemplateRows.trim()
    return rows ? rows.split(/\s+/).length : 0
  })
  expect(trackCount).toBe(2)

  const visibleTop = Math.min(strongBox!.y, spanBox!.y)
  const visibleBottom = Math.max(strongBox!.y + strongBox!.height, spanBox!.y + spanBox!.height)
  const visibleCenter = (visibleTop + visibleBottom) / 2
  const rowCenter = rowBox!.y + rowBox!.height / 2

  expect(Math.abs(visibleCenter - rowCenter)).toBeLessThanOrEqual(2.5)
}

test('centers ordinary two-line screening information without reserving a warning row', async ({ page }) => {
  await page.goto('./')

  const finderRow = page.locator('.screening-row:not(.conflict):not(.travel-warning)').first()
  const finderInfo = finderRow.locator(':scope > div:first-child')
  await expect(finderRow.locator('.screening-note')).toBeHidden()
  await expectTwoLineInfoCentered(finderRow, finderInfo)

  await page.locator('.film-card .detail-button').first().click()
  const modalRow = page.locator('.modal-screenings > div:not(.conflict):not(.travel-warning)').first()
  const modalInfo = modalRow.locator(':scope > div:first-child')
  await expect(modalRow.locator('.modal-screening-note')).toHaveCount(0)
  await expectTwoLineInfoCentered(modalRow, modalInfo)
})
