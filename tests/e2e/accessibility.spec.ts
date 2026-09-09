import { expect, test } from '@playwright/test'

test('traps focus inside the detail dialog and restores it to the trigger after closing', async ({ page }) => {
  await page.goto('./')
  const trigger = page.locator('.film-card .detail-button').first()
  await trigger.focus()
  await trigger.click()

  const dialog = page.getByRole('dialog')
  const closeButton = page.getByRole('button', { name: '상세보기 닫기' })
  await expect(dialog).toBeVisible()
  await expect(closeButton).toBeFocused()

  await page.keyboard.press('Shift+Tab')
  expect(await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]')
    return Boolean(dialog && document.activeElement && dialog.contains(document.activeElement))
  })).toBe(true)

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
})
