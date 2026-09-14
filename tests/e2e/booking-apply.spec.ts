import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

type Screening = { id: string; date: string; start: string; end?: string; venue: string }
type Film = { id: string; title: string; runtime?: number; screenings: Screening[] }
type FilmData = { films: Film[] }
type Item = { film: Film; screening: Screening }

const SELECTED_KEY = 'biff-timetable:selected-screenings:v1'
const STATUS_KEY = 'biff-timetable:ticket-status:v1'
const BOOKING_PLAN_KEY = 'biff-timetable:booking-plan:v1'

function clockMinutes(time: string) {
  const [hour, minute] = time.split(':').map(Number)
  return hour * 60 + minute
}

function dayIndex(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000)
}

function absoluteWindow(item: Item) {
  const start = dayIndex(item.screening.date) * 1440 + clockMinutes(item.screening.start)
  const startClock = clockMinutes(item.screening.start)
  let duration = item.film.runtime ?? 120
  if (item.screening.end) {
    let endClock = clockMinutes(item.screening.end)
    while (endClock <= startClock) endClock += 1440
    duration = endClock - startClock
  }
  return { start, end: start + duration }
}

function overlaps(a: Item, b: Item) {
  const aw = absoluteWindow(a)
  const bw = absoluteWindow(b)
  return aw.start < bw.end && bw.start < aw.end
}

async function screeningData(request: APIRequestContext) {
  const response = await request.get('./screenings.json')
  expect(response.ok()).toBeTruthy()
  return await response.json() as FilmData
}

function flatten(data: FilmData) {
  return data.films.flatMap((film) => film.screenings.map((screening) => ({ film, screening })))
}

function findOverlappingPair(data: FilmData): [Item, Item] | null {
  const items = flatten(data)
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      if (items[i].film.id === items[j].film.id) continue
      if (overlaps(items[i], items[j])) return [items[i], items[j]]
    }
  }
  return null
}

function findFallbackChain(data: FilmData): [Item, Item, Item] | null {
  const items = flatten(data)
  for (const origin of items) {
    const alternatives = items.filter((item) => (
      item.screening.id !== origin.screening.id
      && item.film.id !== origin.film.id
      && overlaps(origin, item)
    ))
    for (let i = 0; i < alternatives.length; i += 1) {
      for (let j = i + 1; j < alternatives.length; j += 1) {
        if (alternatives[i].film.id === alternatives[j].film.id) continue
        if (!overlaps(alternatives[i], alternatives[j])) {
          return [origin, alternatives[i], alternatives[j]]
        }
      }
    }
  }
  return null
}

function findBookedGuardTriple(data: FilmData): [Item, Item, Item] | null {
  const items = flatten(data)
  for (const candidate of items) {
    const conflicts = items.filter((item) => item.screening.id !== candidate.screening.id && overlaps(candidate, item))
    for (let i = 0; i < conflicts.length; i += 1) {
      for (let j = i + 1; j < conflicts.length; j += 1) {
        if (conflicts[i].screening.id !== conflicts[j].screening.id) return [conflicts[i], candidate, conflicts[j]]
      }
    }
  }
  return null
}

async function finderRow(page: Page, item: Item) {
  await page.getByLabel('영화 검색').fill(item.film.title)
  const card = page.locator('.film-card').filter({ hasText: item.film.title }).first()
  const row = card.locator('.screening-row').filter({ hasText: `${item.screening.venue} · ${item.screening.start}` }).first()
  await expect(row).toBeVisible()
  return row
}

async function seedFallbackState(
  page: Page,
  origin: Item,
  candidate: Item,
  extraBooked?: Item,
) {
  await page.addInitScript(({ selectedKey, statusKey, planKey, originId, candidateId, extraBookedId }) => {
    const selected = extraBookedId ? [originId, extraBookedId] : [originId]
    const statuses: Record<string, string> = { [originId]: 'failed' }
    if (extraBookedId) statuses[extraBookedId] = 'booked'

    localStorage.setItem(selectedKey, JSON.stringify(selected))
    localStorage.setItem(statusKey, JSON.stringify(statuses))
    localStorage.setItem(planKey, JSON.stringify({
      [originId]: { priority: 1 },
      [candidateId]: { priority: 2, fallbackFor: [originId] },
    }))
  }, {
    selectedKey: SELECTED_KEY,
    statusKey: STATUS_KEY,
    planKey: BOOKING_PLAN_KEY,
    originId: origin.screening.id,
    candidateId: candidate.screening.id,
    extraBookedId: extraBooked?.screening.id,
  })
}

test('applies the next fallback to the real timetable while preserving failed history', async ({ page, request }) => {
  const data = await screeningData(request)
  const pair = findOverlappingPair(data)
  test.skip(!pair, '대안 적용 테스트에 필요한 겹치는 회차가 없습니다.')
  const [origin, candidate] = pair!

  await seedFallbackState(page, origin, candidate)
  await page.goto('./')
  await page.getByRole('button', { name: '내 시간표' }).click()

  const panel = page.locator('.booking-plan-panel')
  await expect(panel).toBeVisible()
  await panel.locator('summary').click()

  const candidatePlan = panel.locator('.booking-plan-item').filter({ hasText: candidate.film.title }).first()
  await expect(candidatePlan).toContainText('다음 대안')
  await candidatePlan.getByRole('button', { name: /시간표에 적용/ }).click()

  const dialog = page.locator('.booking-apply-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText(candidate.film.title)
  await expect(dialog).toContainText(origin.film.title)
  await dialog.getByRole('button', { name: '시간표에 적용', exact: true }).click()
  await expect(dialog).toBeHidden()

  await expect(page.locator('.selection-count')).toHaveText('총 1개 선택')
  await expect(page.locator('.event-block').filter({ hasText: candidate.film.title })).toHaveCount(1)
  await expect(page.locator('.event-block').filter({ hasText: origin.film.title })).toHaveCount(0)

  await expect.poll(() => page.evaluate(({ selectedKey, statusKey, planKey, originId, candidateId }) => {
    const selected = JSON.parse(localStorage.getItem(selectedKey) ?? '[]') as string[]
    const statuses = JSON.parse(localStorage.getItem(statusKey) ?? '{}') as Record<string, string>
    const plan = JSON.parse(localStorage.getItem(planKey) ?? '{}') as Record<string, { priority?: number; fallbackFor?: string[] }>
    return {
      selected,
      originStatus: statuses[originId],
      candidateStatus: statuses[candidateId],
      originPriority: plan[originId]?.priority,
      candidatePriority: plan[candidateId]?.priority,
      candidateFallbackFor: plan[candidateId]?.fallbackFor ?? [],
    }
  }, {
    selectedKey: SELECTED_KEY,
    statusKey: STATUS_KEY,
    planKey: BOOKING_PLAN_KEY,
    originId: origin.screening.id,
    candidateId: candidate.screening.id,
  })).toEqual({
    selected: [candidate.screening.id],
    originStatus: 'failed',
    candidateStatus: 'planned',
    originPriority: 1,
    candidatePriority: 2,
    candidateFallbackFor: [origin.screening.id],
  })

  await expect(candidatePlan.getByRole('button', { name: /시간표에 적용/ })).toHaveCount(0)
})

test('blocks fallback application when it now conflicts with a booked screening', async ({ page, request }) => {
  const data = await screeningData(request)
  const triple = findBookedGuardTriple(data)
  test.skip(!triple, '예매 완료 충돌 보호 테스트에 필요한 회차 조합이 없습니다.')
  const [origin, candidate, booked] = triple!

  await seedFallbackState(page, origin, candidate, booked)
  await page.goto('./')
  await page.getByRole('button', { name: '내 시간표' }).click()

  const panel = page.locator('.booking-plan-panel')
  await panel.locator('summary').click()
  const candidatePlan = panel.locator('.booking-plan-item').filter({ hasText: candidate.film.title }).first()
  await candidatePlan.getByRole('button', { name: /시간표에 적용/ }).click()

  const dialog = page.locator('.booking-apply-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('예매 완료 회차와 충돌하여 적용할 수 없습니다')
  await expect(dialog).toContainText(booked.film.title)
  await expect(dialog.getByRole('button', { name: '적용 불가' })).toBeDisabled()

  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '[]') as string[], SELECTED_KEY))
    .toEqual([origin.screening.id, booked.screening.id])
})


test('activates the third priority only after the applied second priority also fails', async ({ page, request }) => {
  const data = await screeningData(request)
  const chain = findFallbackChain(data)
  test.skip(!chain, '연속 대안 테스트에 필요한 겹치는 회차가 부족합니다.')
  const [origin, second, third] = chain!

  await page.addInitScript(({ selectedKey, statusKey, planKey, originId, secondId, thirdId }) => {
    localStorage.setItem(selectedKey, JSON.stringify([originId]))
    localStorage.setItem(statusKey, JSON.stringify({ [originId]: 'failed' }))
    localStorage.setItem(planKey, JSON.stringify({
      [originId]: { priority: 1 },
      [secondId]: { priority: 2, fallbackFor: [originId] },
      [thirdId]: { priority: 3, fallbackFor: [originId] },
    }))
  }, {
    selectedKey: SELECTED_KEY,
    statusKey: STATUS_KEY,
    planKey: BOOKING_PLAN_KEY,
    originId: origin.screening.id,
    secondId: second.screening.id,
    thirdId: third.screening.id,
  })

  await page.goto('./')
  await page.getByRole('button', { name: '내 시간표' }).click()
  const panel = page.locator('.booking-plan-panel')
  await expect(panel.locator('summary')).toContainText('다음 대안 1')
  await panel.locator('summary').click()

  const secondPlan = panel.locator('.booking-plan-item').filter({ hasText: second.film.title }).first()
  const thirdPlan = panel.locator('.booking-plan-item').filter({ hasText: third.film.title }).first()
  await expect(secondPlan.getByRole('button', { name: /시간표에 적용/ })).toBeVisible()
  await expect(thirdPlan.getByRole('button', { name: /시간표에 적용/ })).toHaveCount(0)

  await secondPlan.getByRole('button', { name: /시간표에 적용/ }).click()
  await page.locator('.booking-apply-dialog').getByRole('button', { name: '시간표에 적용', exact: true }).click()

  const secondEvent = page.locator('.event-block').filter({ hasText: second.film.title }).first()
  await expect(secondEvent).toBeVisible()
  await secondEvent.click()

  const statusSelect = page.locator('.film-modal .ticket-select').filter({ has: page.locator('option[value="failed"]') }).first()
  await statusSelect.selectOption('failed')
  await page.getByRole('button', { name: '상세보기 닫기' }).click()

  await expect(panel.locator('summary')).toContainText('다음 대안 1')
  await expect(thirdPlan.getByRole('button', { name: /시간표에 적용/ })).toBeVisible()
  await thirdPlan.getByRole('button', { name: /시간표에 적용/ }).click()

  const thirdDialog = page.locator('.booking-apply-dialog')
  await expect(thirdDialog).toContainText(second.film.title)
  await thirdDialog.getByRole('button', { name: '시간표에 적용', exact: true }).click()

  await expect(page.locator('.event-block').filter({ hasText: second.film.title })).toHaveCount(0)
  await expect(page.locator('.event-block').filter({ hasText: third.film.title })).toHaveCount(1)
  await expect(page.locator('.selection-count')).toHaveText('총 1개 선택')

  await expect.poll(() => page.evaluate(({ selectedKey, statusKey, secondId, thirdId }) => {
    const selected = JSON.parse(localStorage.getItem(selectedKey) ?? '[]') as string[]
    const statuses = JSON.parse(localStorage.getItem(statusKey) ?? '{}') as Record<string, string>
    return {
      selected,
      secondStatus: statuses[secondId],
      thirdStatus: statuses[thirdId],
    }
  }, {
    selectedKey: SELECTED_KEY,
    statusKey: STATUS_KEY,
    secondId: second.screening.id,
    thirdId: third.screening.id,
  })).toEqual({
    selected: [third.screening.id],
    secondStatus: 'failed',
    thirdStatus: 'planned',
  })
})


test('runs the complete 1-to-2-to-3 fallback journey through the visible UI', async ({ page, request }) => {
  const data = await screeningData(request)
  const chain = findFallbackChain(data)
  test.skip(!chain, '전체 예매 대안 여정 테스트에 필요한 회차 조합이 없습니다.')
  const [origin, second, third] = chain!

  await page.goto('./')

  const originRow = await finderRow(page, origin)
  await originRow.getByRole('button', { name: '+ 추가' }).click()
  await originRow.locator('.ticket-select').selectOption('priority-1')

  const secondRow = await finderRow(page, second)
  await secondRow.getByRole('button', { name: '+ 추가' }).click()
  const secondConflict = page.locator('.booking-conflict-dialog')
  await expect(secondConflict).toBeVisible()
  await secondConflict.locator('select').selectOption('2')
  await secondConflict.getByRole('button', { name: '2순위 대안으로 저장' }).click()
  await expect(secondRow.getByRole('button')).toContainText('② 대안')

  const thirdRow = await finderRow(page, third)
  await thirdRow.getByRole('button', { name: '+ 추가' }).click()
  const thirdConflict = page.locator('.booking-conflict-dialog')
  await expect(thirdConflict).toBeVisible()
  await thirdConflict.locator('select').selectOption('3')
  await thirdConflict.getByRole('button', { name: '3순위 대안으로 저장' }).click()
  await expect(thirdRow.getByRole('button')).toContainText('③ 대안')

  const originRowAgain = await finderRow(page, origin)
  await originRowAgain.locator('.ticket-select').selectOption('failed')

  await page.getByRole('button', { name: '내 시간표' }).click()
  const panel = page.locator('.booking-plan-panel')
  await expect(panel.locator('summary')).toContainText('다음 대안 1')
  await panel.locator('summary').click()

  const secondPlan = panel.locator('.booking-plan-item').filter({ hasText: second.film.title }).first()
  const thirdPlan = panel.locator('.booking-plan-item').filter({ hasText: third.film.title }).first()
  await expect(secondPlan).toContainText('다음 대안')
  await expect(thirdPlan.getByRole('button', { name: /시간표에 적용/ })).toHaveCount(0)

  await secondPlan.getByRole('button', { name: /시간표에 적용/ }).click()
  await page.locator('.booking-apply-dialog').getByRole('button', { name: '시간표에 적용', exact: true }).click()
  await expect(page.locator('.event-block').filter({ hasText: second.film.title })).toHaveCount(1)
  await expect(page.locator('.event-block').filter({ hasText: origin.film.title })).toHaveCount(0)

  await page.locator('.event-block').filter({ hasText: second.film.title }).first().click()
  await page.locator('.film-modal .current-screening .ticket-select').selectOption('failed')
  await page.getByRole('button', { name: '상세보기 닫기' }).click()

  await expect(panel.locator('summary')).toContainText('다음 대안 1')
  await expect(thirdPlan).toContainText('다음 대안')
  await thirdPlan.getByRole('button', { name: /시간표에 적용/ }).click()

  const finalDialog = page.locator('.booking-apply-dialog')
  await expect(finalDialog).toContainText(second.film.title)
  await finalDialog.getByRole('button', { name: '시간표에 적용', exact: true }).click()

  await expect(page.locator('.selection-count')).toHaveText('총 1개 선택')
  await expect(page.locator('.event-block').filter({ hasText: second.film.title })).toHaveCount(0)
  await expect(page.locator('.event-block').filter({ hasText: third.film.title })).toHaveCount(1)

  await expect(secondPlan).toContainText('실패한 대안')
  await secondPlan.getByRole('button', { name: /대안 해제/ }).click()
  await expect(secondPlan).toHaveCount(0)
  await expect.poll(() => page.evaluate(({ statusKey, planKey, secondId }) => {
    const statuses = JSON.parse(localStorage.getItem(statusKey) ?? '{}') as Record<string, string>
    const plan = JSON.parse(localStorage.getItem(planKey) ?? '{}') as Record<string, unknown>
    return { status: statuses[secondId], inPlan: Boolean(plan[secondId]) }
  }, {
    statusKey: STATUS_KEY,
    planKey: BOOKING_PLAN_KEY,
    secondId: second.screening.id,
  })).toEqual({ status: undefined, inPlan: false })

  await page.reload()
  await page.getByRole('button', { name: '내 시간표' }).click()
  await expect(page.locator('.selection-count')).toHaveText('총 1개 선택')
  await expect(page.locator('.event-block').filter({ hasText: third.film.title })).toHaveCount(1)
  await expect(page.locator('.event-block').filter({ hasText: second.film.title })).toHaveCount(0)
})


test('activates every option in the same next-priority tier', async ({ page, request }) => {
  const data = await screeningData(request)
  const chain = findFallbackChain(data)
  test.skip(!chain, '동일 순위 대안 테스트에 필요한 회차 조합이 없습니다.')
  const [origin, optionA, optionB] = chain!

  await page.addInitScript(({ selectedKey, statusKey, planKey, originId, optionAId, optionBId }) => {
    localStorage.setItem(selectedKey, JSON.stringify([originId]))
    localStorage.setItem(statusKey, JSON.stringify({ [originId]: 'failed' }))
    localStorage.setItem(planKey, JSON.stringify({
      [originId]: { priority: 1 },
      [optionAId]: { priority: 2, fallbackFor: [originId] },
      [optionBId]: { priority: 2, fallbackFor: [originId] },
    }))
  }, {
    selectedKey: SELECTED_KEY,
    statusKey: STATUS_KEY,
    planKey: BOOKING_PLAN_KEY,
    originId: origin.screening.id,
    optionAId: optionA.screening.id,
    optionBId: optionB.screening.id,
  })

  await page.goto('./')
  await page.getByRole('button', { name: '내 시간표' }).click()
  const panel = page.locator('.booking-plan-panel')
  await expect(panel.locator('summary')).toContainText('다음 대안 2')
  await panel.locator('summary').click()

  const optionAPlan = panel.locator('.booking-plan-item').filter({ hasText: optionA.film.title }).first()
  const optionBPlan = panel.locator('.booking-plan-item').filter({ hasText: optionB.film.title }).first()
  await expect(optionAPlan.getByRole('button', { name: /시간표에 적용/ })).toBeVisible()
  await expect(optionBPlan.getByRole('button', { name: /시간표에 적용/ })).toBeVisible()

  await optionAPlan.getByRole('button', { name: /시간표에 적용/ }).click()
  await page.locator('.booking-apply-dialog').getByRole('button', { name: '시간표에 적용', exact: true }).click()
  await expect(page.locator('.event-block').filter({ hasText: optionA.film.title })).toHaveCount(1)
  await expect(optionBPlan.getByRole('button', { name: /시간표에 적용/ })).toHaveCount(0)

  await page.locator('.event-block').filter({ hasText: optionA.film.title }).first().click()
  await page.locator('.film-modal .current-screening .ticket-select').selectOption('failed')
  await page.getByRole('button', { name: '상세보기 닫기' }).click()

  await expect(optionBPlan.getByRole('button', { name: /시간표에 적용/ })).toBeVisible()
  await optionBPlan.getByRole('button', { name: /시간표에 적용/ }).click()
  const replacementDialog = page.locator('.booking-apply-dialog')
  await expect(replacementDialog).toContainText(optionA.film.title)
  await replacementDialog.getByRole('button', { name: '시간표에 적용', exact: true }).click()

  await expect(page.locator('.event-block').filter({ hasText: optionA.film.title })).toHaveCount(0)
  await expect(page.locator('.event-block').filter({ hasText: optionB.film.title })).toHaveCount(1)
  await expect(page.locator('.selection-count')).toHaveText('총 1개 선택')
})
