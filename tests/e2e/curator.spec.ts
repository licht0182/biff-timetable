import { expect, test } from '@playwright/test'

test('opens the AI docent, groups columns, and keeps article navigation anchored at the top', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'AI 도슨트' }).click()

  await expect(page.getByRole('heading', { name: '영화 고르기 전에 읽는 BIFF 분석' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'AI 도슨트 칼럼' })).toBeVisible()
  const categoryFilters = page.locator('.curator-filter-chips button')
  await expect(categoryFilters.filter({ hasText: '전체' })).toHaveCount(0)
  await expect(categoryFilters.filter({ hasText: '2026 섹션 가이드' }).first()).toBeVisible()
  await expect(categoryFilters.filter({ hasText: '2026 섹션 가이드' }).first()).toHaveClass(/active/)
  await expect(categoryFilters.filter({ hasText: '선택 전략' }).first()).toBeVisible()
  await expect(page.getByText('먼저 읽을 글')).toHaveCount(0)
  await expect(page.locator('.curator-featured-card')).toHaveCount(0)
  await expect(page.getByText('2026. 09. 11.')).toHaveCount(0)

  await categoryFilters.filter({ hasText: '체류 일정별 추천' }).first().click()
  const twoDayCard = page.getByRole('button', { name: /10월 10~11일만 BIFF에 있다면/ })
  await twoDayCard.scrollIntoViewIfNeeded()
  await twoDayCard.click()

  await expect(page.getByRole('heading', { name: '10월 10~11일만 BIFF에 있다면: 가장 붐비는 이틀의 실전 선택법' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  await expect(page.locator('.curator-meta')).toContainText('AI 도슨트 편집부')
  await expect(page.locator('.curator-meta')).toContainText('예상 읽는 시간 : 약 9분')
  await expect(page.locator('.curator-body')).toContainText('114편')
  await expect(page.getByRole('button', { name: '영화 찾기로 이동' })).toBeVisible()

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
  await page.getByRole('button', { name: '↑ 맨 위로' }).click()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(2)

  await page.getByRole('button', { name: 'AI 도슨트' }).click()
  await expect(page.getByRole('heading', { name: 'AI 도슨트 칼럼' })).toBeVisible()
  await expect(page.locator('.curator-article-header h2')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /경쟁 13편 전작 분석/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /10월 10~11일만 BIFF에 있다면/ })).toHaveCount(0)
})



test('filters AI docent columns by category without showing unrelated cards', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'AI 도슨트' }).click()

  const allCount = await page.locator('.curator-card').count()
  expect(allCount).toBeGreaterThan(5)

  const categoryFilters = page.locator('.curator-filter-chips button')
  await categoryFilters.filter({ hasText: '선택 전략' }).first().click()
  await expect(page.locator('.curator-card')).toHaveCount(1)
  await expect(page.locator('.curator-card')).toContainText('작품을 고르기 전에 먼저 정할 세 가지')
  await expect(page.locator('.curator-card')).not.toContainText('경쟁 13편 전작 분석')

  await categoryFilters.filter({ hasText: '2026 섹션 가이드' }).first().click()
  const sectionGuideCards = page.locator('.curator-card')
  await expect(sectionGuideCards.first()).toBeVisible()
  expect(await sectionGuideCards.count()).toBeGreaterThan(5)
  await expect(page.getByRole('button', { name: /10월 10~11일만 BIFF에 있다면/ })).toHaveCount(0)

  await categoryFilters.filter({ hasText: '체류 일정별 추천' }).first().click()
  await expect(page.locator('.curator-card')).toHaveCount(4)
  await expect(page.getByRole('button', { name: /10월 10~11일만 BIFF에 있다면/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /10월 10~12일에 있다면/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /10월 9~11일에 있다면/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /10월 9~12일 4일 체류 실전판/ })).toBeVisible()
})


test('supports browser back and forward across menus and docent articles', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('button', { name: '영화 찾기' })).toHaveClass(/active/)

  await page.getByRole('button', { name: 'AI 도슨트' }).click()
  await expect(page.getByRole('heading', { name: 'AI 도슨트 칼럼' })).toBeVisible()

  await page.getByRole('button', { name: /경쟁 13편 전작 분석/ }).click()
  await expect(page.getByRole('heading', { name: '경쟁 13편 전작 분석: 올해 BIFF가 새롭게 발견하려는 영화들' })).toBeVisible()

  await page.goBack()
  await expect(page.getByRole('heading', { name: 'AI 도슨트 칼럼' })).toBeVisible()
  await expect(page.locator('.curator-article-header h2')).toHaveCount(0)

  await page.goBack()
  await expect(page.getByRole('button', { name: '영화 찾기' })).toHaveClass(/active/)
  await expect(page.getByLabel('영화 검색')).toBeVisible()

  await page.goForward()
  await expect(page.getByRole('heading', { name: 'AI 도슨트 칼럼' })).toBeVisible()

  await page.goForward()
  await expect(page.getByRole('heading', { name: '경쟁 13편 전작 분석: 올해 BIFF가 새롭게 발견하려는 영화들' })).toBeVisible()
})


test('shows the 2026 director guide with the Lee Chang-dong analysis first', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'AI 도슨트' }).click()

  const categoryFilters = page.locator('.curator-filter-chips button')
  const directorGuideFilter = categoryFilters.filter({ hasText: '2026 감독 가이드' }).first()
  await expect(directorGuideFilter).toBeVisible()
  await directorGuideFilter.click()

  await expect(page.locator('.curator-card')).toHaveCount(1)
  const leeCard = page.getByRole('button', { name: /이창동: 고통을 설명하지 않고 끝까지 바라보는 영화/ })
  await expect(leeCard).toBeVisible()
  await expect(leeCard).toContainText('예상 읽는 시간 : 약 14분')
  await leeCard.click()

  await expect(page.getByRole('heading', { name: '이창동: 고통을 설명하지 않고 끝까지 바라보는 영화' })).toBeVisible()
  await expect(page.locator('.curator-meta')).toContainText('예상 읽는 시간 : 약 14분')
  await expect(page.locator('.curator-body')).toContainText('초록물고기')
  await expect(page.locator('.curator-body')).toContainText('박하사탕')
  await expect(page.locator('.curator-body')).toContainText('오아시스')
  await expect(page.locator('.curator-body')).toContainText('밀양')
  await expect(page.locator('.curator-body')).toContainText('시')
  await expect(page.locator('.curator-body')).toContainText('버닝')
  await expect(page.locator('.curator-body')).toContainText('가능한 사랑')
  await expect(page.locator('.curator-stats')).toContainText('7편')
  await expect(page.locator('.curator-film-guide')).toHaveCount(1)
  await expect(page.locator('.curator-film-guide')).toContainText('Possible Love')
  await expect(page.locator('.curator-film-guide')).toContainText('164분')
  await expect(page.locator('.curator-article-footer')).toHaveCount(0)

  await page.locator('.curator-film-guide').getByRole('button', { name: '영화 찾기에서 보기' }).click()
  await expect(page.getByLabel('영화 검색')).toHaveValue('가능한 사랑')
})

test('keeps the curator within a narrow mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 })
  await page.goto('./')
  await page.getByRole('button', { name: 'AI 도슨트' }).click()

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
  await page.getByRole('button', { name: 'AI 도슨트' }).click()

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
  await page.getByRole('button', { name: 'AI 도슨트' }).click()

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


test('shows complete World, Flash Forward and Korean Cinema Today guides', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'AI 도슨트' }).click()

  const guides = [
    { card: /월드 시네마 29편 전작 분석/, count: 29, first: '15/18', last: '프레셔' },
    { card: /플래시 포워드 12편 전작 분석/, count: 12, first: '노트르 살뤼', last: '타인에게 속한 것들' },
    { card: /한국영화의 오늘 - 파노라마 6편 분석/, count: 6, first: '수능, 출제의 비밀', last: '호프' },
    { card: /한국영화의 오늘 - 스페셜 프리미어 3편 분석/, count: 3, first: '사피엔스', last: '정가네' },
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


test('shows complete Wide Angle, Gala, Open Cinema and Midnight Passion guides', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'AI 도슨트' }).click()

  const guides = [
    { card: /와이드 앵글 47편 전작 분석/, count: 47, first: '58번째', last: '흐르는 세월' },
    { card: /갈라 프레젠테이션 6편 분석/, count: 6, first: '그 소녀의 기억', last: '우리 할머니는 큐브왕' },
    { card: /오픈 시네마 8편 분석/, count: 8, first: '내일은 이름이 있다', last: '세대유감' },
    { card: /미드나잇 패션 9편 분석/, count: 9, first: '불청객', last: '사피엔스' },
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


test('shows complete On Screen, special program, special screening and opening-film analyses', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'AI 도슨트' }).click()

  const guides = [
    { card: /온 스크린 3편 분석/, count: 3, first: '꿀알바', last: '푸른길' },
    { card: /특별기획 프로그램 23편 분석/, count: 23, first: '우리 할머니는 큐브왕', last: '하얀전쟁' },
    { card: /특별상영 8편 분석/, count: 8, first: 'M \(4K 리마스터링\)', last: '플레시 임팩트' },
  ]

  for (const guide of guides) {
    await page.getByRole('button', { name: guide.card }).click()
    await expect(page.locator('.curator-film-guide')).toHaveCount(guide.count)
    await expect(page.locator('.curator-film-guide').first()).toContainText(guide.first)
    await expect(page.locator('.curator-film-guide').last()).toContainText(guide.last)
    await expect(page.locator('.curator-article-footer')).toHaveCount(0)
    await page.getByRole('button', { name: '← 목록으로' }).click()
  }

  await page.getByRole('button', { name: /개막작 분석/ }).click()
  await expect(page.getByRole('heading', { name: /개막작 분석: <낮과 밤은 서로에게>/ })).toBeVisible()
  await expect(page.locator('.curator-body')).toContainText('하나의 장소, 서로 다른 시간')
  await expect(page.locator('.curator-body')).toContainText('대화가 사건이 되는 영화')
  await expect(page.locator('.curator-article-footer')).toHaveCount(0)
})


test('shows stay-window guides with real 2026 schedule data and opens a recommended film', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'AI 도슨트' }).click()

  await page.getByRole('button', { name: /체류 일정별 추천 4/ }).click()
  await expect(page.locator('.curator-card')).toHaveCount(4)

  await page.getByRole('button', { name: /10월 10~11일만 BIFF에 있다면/ }).click()
  await expect(page.getByRole('heading', { name: /10월 10~11일만 BIFF에 있다면/ })).toBeVisible()
  await expect(page.locator('.curator-stats')).toContainText('160편')
  await expect(page.locator('.curator-stats')).toContainText('206회')
  await expect(page.locator('.curator-stats')).toContainText('118회')
  await expect(page.locator('.curator-stats')).toContainText('114편')
  await expect(page.locator('.curator-body')).toContainText('스페이스')
  await expect(page.locator('.curator-body')).toContainText('멜트다운')

  const firstFilm = page.locator('.curator-film-guide').filter({ hasText: '비트윈 투 러버스' })
  await firstFilm.getByRole('button', { name: '영화 찾기에서 보기' }).click()
  await expect(page.getByLabel('영화 검색')).toHaveValue('비트윈 투 러버스')
  await expect(page.getByText('비트윈 투 러버스', { exact: true }).first()).toBeVisible()
})
