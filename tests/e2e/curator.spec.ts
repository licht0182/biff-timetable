import { expect, test } from '@playwright/test'

test('opens the AI curator and reads a column like an editorial page', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'AI 큐레이터' }).click()

  await expect(page.getByRole('heading', { name: '영화 고르기 전에 읽는 BIFF 분석' })).toBeVisible()
  await expect(page.locator('.curator-featured-card')).toBeVisible()
  await expect(page.locator('.curator-featured-card')).toContainText('예상 읽는 시간 : 약 5분')
  await expect(page.getByText('2026. 09. 11.')).toHaveCount(0)

  await page.locator('.curator-featured-card').click()
  await expect(page.getByRole('heading', { name: '2026 BIFF, 작품을 고르기 전에 먼저 정할 세 가지' })).toBeVisible()
  await expect(page.locator('.curator-meta')).toContainText('예상 읽는 시간 : 약 5분')
  await expect(page.locator('.curator-body')).toContainText('회차의 희소성')
  await expect(page.getByRole('button', { name: '영화 찾기로 이동' })).toBeVisible()

  await page.getByRole('button', { name: '← 목록으로' }).click()
  await expect(page.getByRole('heading', { name: '큐레이터 칼럼' })).toBeVisible()
})

test('keeps the curator within a narrow mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 })
  await page.goto('./')
  await page.getByRole('button', { name: 'AI 큐레이터' }).click()

  const metrics = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }))

  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewport)
  expect(metrics.bodyWidth).toBeLessThanOrEqual(metrics.viewport)
})
