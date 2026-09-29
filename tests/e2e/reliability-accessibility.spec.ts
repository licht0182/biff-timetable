import { expect, test } from '@playwright/test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const FILM_DATA_CACHE_KEY = 'biff-timetable:film-data-cache:v1'
const DATA_VERSION_KEY = 'biff-timetable:data-version:v1'

test('requests one versioned screenings resource', async ({ page }) => {
  const screeningRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('screenings.json')) screeningRequests.push(request.url())
  })

  await page.goto('./')
  await expect(page.locator('.film-card').first()).toBeVisible()

  expect(screeningRequests).toHaveLength(1)
  const requestUrl = new URL(screeningRequests[0])
  expect(requestUrl.searchParams.getAll('v')).toHaveLength(1)
  const expectedHash = createHash('sha256').update(readFileSync('public/screenings.json')).digest('hex').slice(0, 12)
  expect(requestUrl.searchParams.get('v')).toBe(`2026-official-${expectedHash}`)
})

test('recovers from a screenings request failure with an explicit retry', async ({ page }) => {
  let shouldFail = true
  await page.route('**/screenings.json*', async (route) => {
    if (shouldFail) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
      return
    }
    await route.continue()
  })

  await page.goto('./')
  await expect(page.getByRole('alert')).toContainText('상영 데이터를 불러오지 못했습니다.')

  shouldFail = false
  await page.getByRole('button', { name: '다시 시도' }).click()
  await expect(page.locator('.film-card').first()).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: /검색 결과 \d+편/ })).toBeVisible()
})

test('uses a validated same-version cache and labels it when the network fails', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  await expect(page.locator('.film-card').first()).toBeVisible()
  await expect.poll(() => page.evaluate((key) => Boolean(localStorage.getItem(key)), FILM_DATA_CACHE_KEY)).toBe(true)
  await page.evaluate((key) => {
    const cached = JSON.parse(localStorage.getItem(key) ?? 'null')
    const screeningId = cached.data.films.flatMap((film: { screenings: Array<{ id: string }> }) => film.screenings)[0].id
    localStorage.setItem('biff-timetable:selected-screenings:v1', JSON.stringify([screeningId]))
    localStorage.setItem('biff-timetable:view-mode:v1', JSON.stringify('grid'))
  }, FILM_DATA_CACHE_KEY)

  await page.route('**/screenings.json*', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }))
  await page.reload()

  await expect(page.getByRole('status').filter({ hasText: '저장한 상영시간표' })).toBeVisible()
  await expect(page.getByRole('button', { name: '최신 데이터 다시 확인' })).toBeVisible()
  await expect(page.locator('.film-card').first()).toBeVisible()
  await page.getByRole('button', { name: '내 시간표' }).click()
  await expect(page.locator('.timetable-page .data-cache-notice')).toBeVisible()
  await expect(page.locator('.day-column')).toHaveCount(1)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

test('shows cached films while a slow screenings request is still pending', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('.film-card').first()).toBeVisible()
  await expect.poll(() => page.evaluate((key) => Boolean(localStorage.getItem(key)), FILM_DATA_CACHE_KEY)).toBe(true)

  let releaseRequest!: () => void
  const requestHeld = new Promise<void>((resolve) => { releaseRequest = resolve })
  await page.route('**/screenings.json*', async (route) => {
    await requestHeld
    const response = await route.fetch()
    const data = await response.json()
    await route.fulfill({ response, json: { ...data, note: '최신 데이터 갱신 확인' } })
  })

  try {
    await page.reload()
    await expect(page.locator('.film-card').first()).toBeVisible()
    await expect(page.locator('.data-cache-notice')).toContainText('최신 데이터를 확인하는 중입니다.')
    await expect(page.getByRole('button', { name: '최신 데이터 다시 확인' })).toHaveCount(0)
  } finally {
    releaseRequest()
  }

  await expect(page.locator('.data-cache-notice')).toHaveCount(0)
  await expect(page.getByText('최신 데이터 갱신 확인')).toBeVisible()
  await expect(page.locator('.film-card').first()).toBeVisible()
})

test('rejects a malformed cached payload', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('.film-card').first()).toBeVisible()
  await page.evaluate(({ cacheKey, versionKey }) => {
    const version = JSON.parse(localStorage.getItem(versionKey) ?? 'null')
    localStorage.setItem(cacheKey, JSON.stringify({
      version,
      savedAt: new Date().toISOString(),
      data: { films: 'not-an-array' },
    }))
  }, { cacheKey: FILM_DATA_CACHE_KEY, versionKey: DATA_VERSION_KEY })

  await page.route('**/screenings.json*', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }))
  await page.reload()

  await expect(page.getByRole('alert')).toContainText('상영 데이터를 불러오지 못했습니다.')
  await expect(page.getByText('저장한 상영시간표')).toHaveCount(0)
})

test('does not reuse a cache from an older screenings revision', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('.film-card').first()).toBeVisible()
  await page.evaluate((key) => {
    const cached = JSON.parse(localStorage.getItem(key) ?? 'null')
    cached.version = '2026-official-previous-revision'
    localStorage.setItem(key, JSON.stringify(cached))
  }, FILM_DATA_CACHE_KEY)

  await page.route('**/screenings.json*', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }))
  await page.reload()

  await expect(page.getByRole('alert')).toContainText('상영 데이터를 불러오지 못했습니다.')
  await expect(page.getByText('저장한 상영시간표')).toHaveCount(0)
})

test('exposes active navigation, section selection, and result count semantics', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('.film-card').first()).toBeVisible()

  await expect(page.getByRole('button', { name: '영화 찾기' }).first()).toHaveAttribute('aria-current', 'page')
  await expect(page.locator('.chips button').first()).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('status').filter({ hasText: /검색 결과 \d+편/ })).toBeVisible()

  await page.getByRole('button', { name: '내 시간표' }).click()
  await expect(page.getByRole('button', { name: '내 시간표' })).toHaveAttribute('aria-current', 'page')
})

test('keeps mobile navigation and a compact filter entry point available while scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 })
  await page.goto('./')
  await expect(page.locator('.film-card').first()).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeGreaterThanOrEqual(900)

  await page.evaluate(() => window.scrollTo(0, 900))
  await expect(page.locator('.liquid-tab-bar')).toBeInViewport()
  await expect.poll(() => page.locator('.liquid-tab-bar-surface').evaluate((element) => Math.round(window.innerHeight - element.getBoundingClientRect().bottom))).toBeGreaterThanOrEqual(5)
  await expect(page.getByRole('button', { name: '검색·필터' })).toBeInViewport()

  await page.getByRole('button', { name: '검색·필터' }).click()
  await expect(page.locator('#film-advanced-filters')).toBeVisible()
  await expect(page.locator('#film-advanced-filters')).toHaveAttribute('tabindex', '-1')
  await expect(page.getByRole('button', { name: '상세 필터 닫기' }).last()).toBeVisible()
})

test('labels AI docent content as prewritten editorial content', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'AI 도슨트' }).click()
  await expect(page.getByText(/미리 작성·검토한 BIFF 탐색 가이드/)).toBeVisible()
  await expect(page.getByText(/실시간 AI 대화가 아닌 사전 편집 콘텐츠/)).toBeVisible()
})
