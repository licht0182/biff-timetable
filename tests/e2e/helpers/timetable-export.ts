import type { Page } from '@playwright/test'

export async function openPngExport(page: Page) {
  const exportButton = page.getByRole('button', { name: 'PNG 저장', exact: true })
  if (!await exportButton.isVisible()) {
    await page.locator('.timetable-action-buttons .timetable-more-menu > summary').click()
  }
  await exportButton.click()
}
