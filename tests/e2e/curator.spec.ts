import { expect, test } from '@playwright/test'

test('opens the AI curator and reads a column like an editorial page', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'AI 큐레이터' }).click()

  await expect(page.getByRole('heading', { name: '영화 고르기 전에 읽는 BIFF 분석' })).toBeVisible()
  await expect(page.locator('.curator-featured-card')).toBeVisible()
  await expect(page.locator('.curator-featured-card')).toContainText('예상 읽는 시간 : 약 7분')
  await expect(page.getByText('2026. 09. 11.')).toHaveCount(0)

  await page.locator('.curator-featured-card').click()
  await expect(page.getByRole('heading', { name: '10월 9일부터 12일까지 BIFF에 간다면: 4일을 가장 강하게 쓰는 법' })).toBeVisible()
  await expect(page.locator('.curator-meta')).toContainText('예상 읽는 시간 : 약 7분')
  await expect(page.locator('.curator-body')).toContainText('기간 내 회차 희소성')
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


test('shows the complete 2026 competition section analysis', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'AI 큐레이터' }).click()

  const competitionCard = page.getByRole('button', { name: /경쟁 13편 전작 분석/ })
  await expect(competitionCard).toBeVisible()
  await competitionCard.click()

  await expect(page.getByRole('heading', { name: '경쟁 13편 전작 분석: 올해 BIFF가 새롭게 발견하려는 영화들' })).toBeVisible()
  await expect(page.locator('.curator-stats')).toContainText('13편')
  await expect(page.locator('.curator-stats')).toContainText('11편')
  await expect(page.locator('.curator-stats')).toContainText('약 114분')
  await expect(page.locator('.curator-film-guide')).toHaveCount(13)
  await expect(page.locator('.curator-film-guide').first()).toContainText('그날의 태주')
  await expect(page.locator('.curator-film-guide').last()).toContainText('힐롤')
  await expect(page.locator('.curator-body')).toContainText('상영시간표가 붙으면 순위는 다시 바뀝니다')
})
