import { expect, test } from '@playwright/test'

const BOOKING_PLAN_KEY = 'biff-timetable:booking-plan:v1'
const STATUS_KEY = 'biff-timetable:ticket-status:v1'

test('sets booking priorities through 10, keeps priority on failure, and persists the plan', async ({ page }) => {
  await page.goto('./')

  const firstCard = page.locator('.film-card').first()
  const filmTitle = (await firstCard.locator('h2').textContent())?.trim() ?? ''
  expect(filmTitle).not.toBe('')

  await firstCard.getByRole('button', { name: '+ 추가' }).first().click()

  const bookingSelect = firstCard.locator('.ticket-select').first()
  await expect(bookingSelect).toBeVisible()

  for (const priority of Array.from({ length: 10 }, (_, index) => index + 1)) {
    const value = `priority-${priority}`
    await bookingSelect.selectOption(value)
    await expect(bookingSelect).toHaveValue(value)
    await expect.poll(() => page.evaluate(({ key, expected }) => {
      const plan = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, { priority?: number }>
      return Object.values(plan)[0]?.priority === expected
    }, { key: BOOKING_PLAN_KEY, expected: priority })).toBeTruthy()
  }

  await bookingSelect.selectOption('failed')
  await expect(bookingSelect).toHaveValue('failed')
  await expect.poll(() => page.evaluate(({ statusKey, planKey }) => {
    const statuses = JSON.parse(localStorage.getItem(statusKey) ?? '{}') as Record<string, string>
    const plan = JSON.parse(localStorage.getItem(planKey) ?? '{}') as Record<string, { priority?: number }>
    return Object.values(statuses)[0] === 'failed' && Object.values(plan)[0]?.priority === 10
  }, { statusKey: STATUS_KEY, planKey: BOOKING_PLAN_KEY })).toBeTruthy()

  await page.getByRole('button', { name: '내 시간표' }).click()
  await page.getByRole('button', { name: '시간표', exact: true }).click()
  const planPanel = page.locator('.booking-plan-panel')
  await expect(planPanel).toBeVisible()
  await expect(planPanel.locator('summary')).toContainText('10순위 1')
  await planPanel.locator('summary').click()
  await expect(planPanel).toContainText(filmTitle)
  await expect(planPanel).toContainText('예매 실패')

  const event = page.locator('.event-block').filter({ hasText: filmTitle }).first()
  await expect(event).toHaveClass(/status-failed/)
  await expect(event.locator('strong')).toContainText('×')

  await page.reload()
  await page.getByRole('button', { name: '내 시간표' }).click()
  await page.getByRole('button', { name: '시간표', exact: true }).click()
  await expect(page.locator('.booking-plan-panel summary')).toContainText('10순위 1')
  const reloadedEvent = page.locator('.event-block').filter({ hasText: filmTitle }).first()
  await expect(reloadedEvent).toHaveClass(/status-failed/)
  await expect(reloadedEvent.locator('strong')).toContainText('×')
})

test('keeps the booking plan usable without horizontal overflow at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await page.goto('./')

  const firstCard = page.locator('.film-card').first()
  await firstCard.getByRole('button', { name: '+ 추가' }).first().click()
  await firstCard.locator('.ticket-select').first().selectOption('priority-1')

  const finderOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(finderOverflow).toBeLessThanOrEqual(1)

  await page.getByRole('button', { name: '내 시간표' }).click()
  await page.getByRole('button', { name: '시간표', exact: true }).click()
  const panel = page.locator('.booking-plan-panel')
  await expect(panel).toBeVisible()
  await panel.locator('summary').click()

  const timetableOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(timetableOverflow).toBeLessThanOrEqual(1)
})


test('keeps a pending fallback action inside the 320px viewport', async ({ page, request }) => {
  const response = await request.get('./screenings.json')
  expect(response.ok()).toBeTruthy()
  const data = await response.json() as { films: Array<{ screenings: Array<{ id: string }> }> }
  const ids = data.films.flatMap((film) => film.screenings.map((screening) => screening.id))
  test.skip(ids.length < 2, '모바일 대안 테스트에 필요한 회차가 없습니다.')
  const [originId, candidateId] = ids

  await page.addInitScript(({ selectedKey, statusKey, planKey, originId, candidateId }) => {
    localStorage.setItem(selectedKey, JSON.stringify([originId]))
    localStorage.setItem(statusKey, JSON.stringify({ [originId]: 'failed' }))
    localStorage.setItem(planKey, JSON.stringify({
      [originId]: { priority: 1 },
      [candidateId]: { priority: 2, fallbackFor: [originId] },
    }))
  }, {
    selectedKey: 'biff-timetable:selected-screenings:v1',
    statusKey: STATUS_KEY,
    planKey: BOOKING_PLAN_KEY,
    originId,
    candidateId,
  })

  await page.setViewportSize({ width: 320, height: 740 })
  await page.goto('./')
  await page.getByRole('button', { name: '내 시간표' }).click()
  await page.getByRole('button', { name: '시간표', exact: true }).click()
  const panel = page.locator('.booking-plan-panel')
  await expect(panel.locator('summary')).toContainText('다음 대안 1')
  await panel.locator('summary').click()
  await expect(panel.getByRole('button', { name: /시간표에 적용/ })).toBeVisible()

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
})
