import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

type Screening = { id: string; date: string; start: string; end?: string; venue: string; code?: string }
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

function duration(item: Item) {
  const start = clockMinutes(item.screening.start)
  if (!item.screening.end) return item.film.runtime ?? 120
  let end = clockMinutes(item.screening.end)
  while (end <= start) end += 24 * 60
  return end - start
}

function absoluteWindow(item: Item) {
  const start = dayIndex(item.screening.date) * 1440 + clockMinutes(item.screening.start)
  return { start, end: start + duration(item) }
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

  for (const requireDifferentFilm of [true, false]) {
    for (let i = 0; i < items.length; i += 1) {
      const a = absoluteWindow(items[i])
      for (let j = i + 1; j < items.length; j += 1) {
        if (requireDifferentFilm && items[i].film.id === items[j].film.id) continue
        const b = absoluteWindow(items[j])
        if (a.start < b.end && b.start < a.end) return [items[i], items[j]]
      }
    }
  }
  return null
}

async function seedOrigin(page: Page, originId: string, priority?: 1 | 2 | 3) {
  await page.addInitScript(({ selectedKey, statusKey, planKey, originId, priority }) => {
    if (!localStorage.getItem(selectedKey)) localStorage.setItem(selectedKey, JSON.stringify([originId]))
    if (!localStorage.getItem(statusKey)) localStorage.setItem(statusKey, JSON.stringify({ [originId]: 'planned' }))
    if (!localStorage.getItem(planKey)) localStorage.setItem(planKey, JSON.stringify(priority ? { [originId]: { priority } } : {}))
  }, { selectedKey: SELECTED_KEY, statusKey: STATUS_KEY, planKey: BOOKING_PLAN_KEY, originId, priority })
}

async function openCandidateDialog(page: Page, candidate: Item) {
  await page.getByLabel('영화 검색').fill(candidate.film.title)
  const card = page.locator('.film-card').filter({ hasText: candidate.film.title }).first()
  const row = card.locator('.screening-row').filter({ hasText: `${candidate.screening.venue} · ${candidate.screening.start}` }).first()
  await expect(row.getByRole('button', { name: '+ 추가' })).toBeVisible()
  await row.getByRole('button', { name: '+ 추가' }).click()
  return { row, dialog: page.locator('.booking-conflict-dialog') }
}

test('stores an overlapping screening as a fallback without adding it to the real timetable', async ({ page, request }) => {
  const data = await screeningData(request)
  const pair = findOverlappingPair(data)
  test.skip(!pair, '대안 예매 테스트에 사용할 겹치는 회차가 없습니다.')
  const [origin, candidate] = pair!

  await seedOrigin(page, origin.screening.id)
  await page.goto('./')

  const { row, dialog } = await openCandidateDialog(page, candidate)
  await expect(dialog).toBeVisible()
  const prioritySelect = dialog.locator('select')
  await expect(prioritySelect).toHaveValue('2')
  await dialog.getByRole('button', { name: '2순위 대안으로 저장' }).click()
  await expect(dialog).toBeHidden()

  await expect(page.locator('.selection-count')).toHaveText('총 1개 선택')
  await expect(row.getByRole('button')).toContainText('② 대안')

  await expect.poll(() => page.evaluate(({ key, originId, candidateId }) => {
    const plan = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, { priority?: number; fallbackFor?: string[] }>
    return {
      originPriority: plan[originId]?.priority,
      candidatePriority: plan[candidateId]?.priority,
      fallbackFor: plan[candidateId]?.fallbackFor ?? [],
    }
  }, { key: BOOKING_PLAN_KEY, originId: origin.screening.id, candidateId: candidate.screening.id })).toEqual({
    originPriority: 1,
    candidatePriority: 2,
    fallbackFor: [origin.screening.id],
  })

  await page.reload()
  await page.getByRole('button', { name: '내 시간표' }).click()
  const panel = page.locator('.booking-plan-panel')
  await expect(panel).toBeVisible()
  await panel.locator('summary').click()
  const alternative = panel.locator('.booking-plan-item.is-alternative').filter({ hasText: candidate.film.title }).first()
  await expect(alternative).toBeVisible()
  await expect(alternative).toContainText('대안')
  await expect(alternative).toContainText(origin.film.title)
  await expect(alternative).toContainText('실패 시 대안')
  await expect(page.locator('.event-block')).toHaveCount(1)

  await alternative.getByRole('button', { name: /대안 해제/ }).click()
  await expect(alternative).toBeHidden()
  await expect.poll(() => page.evaluate(({ key, candidateId }) => {
    const plan = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>
    return Boolean(plan[candidateId])
  }, { key: BOOKING_PLAN_KEY, candidateId: candidate.screening.id })).toBeFalsy()
  await expect(page.locator('.selection-count')).toHaveText('총 1개 선택')
})

test('requires a third-priority fallback when the conflicting origin is second priority', async ({ page, request }) => {
  const data = await screeningData(request)
  const pair = findOverlappingPair(data)
  test.skip(!pair, '대안 예매 테스트에 사용할 겹치는 회차가 없습니다.')
  const [origin, candidate] = pair!

  await seedOrigin(page, origin.screening.id, 2)
  await page.goto('./')
  const { dialog } = await openCandidateDialog(page, candidate)

  await expect(dialog.locator('select')).toHaveValue('3')
  await expect(dialog.locator('select option[value="2"]')).toHaveCount(0)
  await dialog.getByRole('button', { name: '3순위 대안으로 저장' }).click()

  await expect.poll(() => page.evaluate(({ key, candidateId }) => {
    const plan = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, { priority?: number }>
    return plan[candidateId]?.priority
  }, { key: BOOKING_PLAN_KEY, candidateId: candidate.screening.id })).toBe(3)
  await expect(page.locator('.selection-count')).toHaveText('총 1개 선택')
})

test('does not invent a fourth priority for a third-priority conflict', async ({ page, request }) => {
  const data = await screeningData(request)
  const pair = findOverlappingPair(data)
  test.skip(!pair, '대안 예매 테스트에 사용할 겹치는 회차가 없습니다.')
  const [origin, candidate] = pair!

  await seedOrigin(page, origin.screening.id, 3)
  await page.goto('./')
  const { dialog } = await openCandidateDialog(page, candidate)

  await expect(dialog).toContainText('4순위 대안을 만들 수 없습니다')
  await expect(dialog.locator('select')).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: '대안 저장 불가' })).toBeDisabled()
  await expect(page.locator('.selection-count')).toHaveText('총 1개 선택')
})
