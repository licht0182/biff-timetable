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
  await expect(page.locator('.curator-body')).not.toContainText('상영시간표가 붙으면 순위는 다시 바뀝니다')
  await expect(page.locator('.curator-article-footer')).toHaveCount(0)
})


test('shows complete film-analysis guides for the next four sections', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'AI 큐레이터' }).click()

  const guides = [
    { card: /아이콘 35편 전작 분석/, count: 35, first: 'zi', last: '피오르' },
    { card: /비전 - 한국 12편 전작 분석/, count: 12, first: '귀벌레', last: '화곡사' },
    { card: /비전 - 아시아 12편 전작 분석/, count: 12, first: '1982', last: '환상의 불빛' },
    { card: /아시아영화의 창 27편 전작 분석/, count: 27, first: '겨울 이야기', last: '필리피냐나' },
  ]

  for (const guide of guides) {
    await page.getByRole('button', { name: guide.card }).click()
    await expect(page.locator('.curator-film-guide')).toHaveCount(guide.count)
    await expect(page.locator('.curator-film-guide').first()).toContainText(guide.first)
    await expect(page.locator('.curator-film-guide').last()).toContainText(guide.last)
    await expect(page.locator('.curator-article-footer')).toHaveCount(0)
    await page.getByRole('button', { name: '← 목록으로' }).click()
  }
})
