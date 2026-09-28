import { expect, test } from '@playwright/test'

test('loads film results before background curator code on a slow connection', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { effectiveType: '3g', saveData: false },
    })
  })
  const curatorRequests: string[] = []
  page.on('request', (request) => {
    if (/CuratorPage-[^/]+\.js/.test(request.url())) curatorRequests.push(request.url())
  })

  await page.goto('./')
  await expect(page.locator('.film-card').first()).toBeVisible()
  await page.waitForTimeout(900)
  expect(curatorRequests).toHaveLength(0)

  await page.getByRole('button', { name: 'AI 도슨트' }).click()
  await expect(page.getByRole('heading', { name: '감독의 시선으로 고르는 영화' })).toBeVisible()
  expect(curatorRequests).toHaveLength(1)
})
