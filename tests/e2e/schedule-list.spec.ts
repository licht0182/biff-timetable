import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

type Screening = { id: string; date: string; start: string; end?: string; venue: string }
type Film = { id: string; title: string; runtime?: number; screenings: Screening[] }
type Item = { film: Film; screening: Screening }

const SELECTED_KEY = 'biff-timetable:selected-screenings:v1'
const PLAN_KEY = 'biff-timetable:booking-plan:v1'
const VIEW_KEY = 'biff-timetable:view-mode:v1'
const CUSTOM_EVENTS_KEY = 'biff-timetable:custom-events:v1'

function minutes(time: string) {
  const [hour, minute] = time.split(':').map(Number)
  return hour * 60 + minute
}

function absoluteWindow({ film, screening }: Item) {
  const day = Math.floor(Date.parse(`${screening.date}T00:00:00Z`) / 86_400_000)
  const start = day * 1440 + minutes(screening.start)
  let end = screening.end ? day * 1440 + minutes(screening.end) : start + (film.runtime ?? 120)
  while (end <= start) end += 1440
  return { start, end }
}

function overlaps(a: Item, b: Item) {
  const aw = absoluteWindow(a)
  const bw = absoluteWindow(b)
  return aw.start < bw.end && bw.start < aw.end
}

async function items(request: APIRequestContext) {
  const response = await request.get('./screenings.json')
  const data = await response.json() as { films: Film[] }
  return data.films.flatMap((film) => film.screenings.map((screening) => ({ film, screening })))
}

function overlappingTriple(all: Item[]) {
  for (let i = 0; i < all.length; i += 1) {
    for (let j = i + 1; j < all.length; j += 1) {
      if (all[i].film.id === all[j].film.id || !overlaps(all[i], all[j])) continue
      for (let k = j + 1; k < all.length; k += 1) {
        if (new Set([all[i].film.id, all[j].film.id, all[k].film.id]).size < 3) continue
        if (overlaps(all[i], all[k]) && overlaps(all[j], all[k])) return [all[i], all[j], all[k]] as const
      }
    }
  }
  return null
}

async function openTimetable(page: Page) {
  await page.getByRole('button', { name: '내 시간표' }).click()
}

test('uses the chronological list by default and persists the view switch', async ({ page, request }) => {
  const first = (await items(request))[0]
  await page.addInitScript(({ key, id }) => localStorage.setItem(key, JSON.stringify([id])), { key: SELECTED_KEY, id: first.screening.id })
  await page.goto('./')
  await openTimetable(page)

  await expect(page.locator('.schedule-list')).toBeVisible()
  await expect(page.locator('.timetable-scroll')).toHaveCount(0)

  await page.getByRole('button', { name: '시간표', exact: true }).click()
  await expect(page.locator('.timetable-scroll')).toBeVisible()
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), VIEW_KEY)).toBe('grid')

  await page.reload()
  await expect(page.locator('.timetable-scroll')).toBeVisible()
  await page.getByRole('button', { name: '목록', exact: true }).click()
  await page.reload()
  await expect(page.locator('.schedule-list')).toBeVisible()
})

test('keeps a custom event delete action aligned inside the list row on mobile', async ({ page }) => {
  const event = {
    id: 'custom-layout-test',
    title: '부산 친구와 저녁 식사',
    date: '2026-10-07',
    start: '18:30',
    end: '20:00',
    location: '센텀시티',
    category: 'meal',
    createdAt: '2026-09-19T00:00:00.000Z',
  }
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify([value])), {
    key: CUSTOM_EVENTS_KEY,
    value: event,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  await openTimetable(page)

  const row = page.locator('.schedule-custom-row')
  const actions = row.locator('.schedule-custom-actions')
  const remove = actions.getByRole('button', { name: `${event.title} 일정 삭제` })
  await expect(row).toBeVisible()
  await expect(actions).toBeVisible()
  await expect(remove).toBeVisible()

  const geometry = await row.evaluate((element) => {
    const rowBox = element.getBoundingClientRect()
    const actionBox = element.querySelector<HTMLElement>('.schedule-custom-actions')!.getBoundingClientRect()
    const buttonBox = element.querySelector<HTMLButtonElement>('.schedule-list-remove')!.getBoundingClientRect()
    return {
      actionParent: element.querySelector('.schedule-list-remove')?.parentElement?.className,
      rightInset: rowBox.right - buttonBox.right,
      rowCenter: rowBox.top + rowBox.height / 2,
      actionCenter: actionBox.top + actionBox.height / 2,
      buttonCenter: buttonBox.top + buttonBox.height / 2,
    }
  })
  expect(geometry.actionParent).toContain('schedule-row-actions')
  expect(geometry.rightInset).toBeGreaterThanOrEqual(6)
  expect(Math.abs(geometry.rowCenter - geometry.actionCenter)).toBeLessThanOrEqual(1)
  expect(Math.abs(geometry.rowCenter - geometry.buttonCenter)).toBeLessThanOrEqual(1)
})

test('shows one selected date at a time and keeps the mobile list scrollable', async ({ page, request }) => {
  const all = await items(request)
  const dateCounts = new Map<string, number>()
  all.forEach(({ screening }) => dateCounts.set(screening.date, (dateCounts.get(screening.date) ?? 0) + 1))
  const firstDate = [...dateCounts.entries()].filter(([, count]) => count >= 8).sort(([a], [b]) => a.localeCompare(b))[0][0]
  const firstDayItems = all.filter(({ screening }) => screening.date === firstDate).slice(0, 16)
  const secondDayItem = all.find(({ screening }) => screening.date > firstDate)
  test.skip(!secondDayItem || firstDayItems.length < 8, '두 날짜와 충분한 첫날 상영 회차가 없습니다.')
  const selectedIds = [...firstDayItems.map(({ screening }) => screening.id), secondDayItem!.screening.id]
  await page.addInitScript(({ key, ids }) => localStorage.setItem(key, JSON.stringify(ids)), { key: SELECTED_KEY, ids: selectedIds })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  await openTimetable(page)

  const tabs = page.getByRole('tab')
  const visibleDay = page.locator('.schedule-list-day')
  await expect(tabs).toHaveCount(2)
  await expect(visibleDay).toHaveCount(1)
  await expect(visibleDay.locator(`[data-screening-id="${firstDayItems[0].screening.id}"]`)).toBeVisible()
  await expect(visibleDay.locator(`[data-screening-id="${secondDayItem!.screening.id}"]`)).toHaveCount(0)

  const scrollState = await page.evaluate(() => ({
    bodyLocked: document.body.classList.contains('timetable-viewport-locked'),
    htmlLocked: document.documentElement.classList.contains('timetable-viewport-locked'),
    bodyOverflow: getComputedStyle(document.body).overflow,
    shellOverflow: getComputedStyle(document.querySelector<HTMLElement>('.app-shell')!).overflow,
    scrollRange: document.documentElement.scrollHeight - window.innerHeight,
  }))
  expect(scrollState).toMatchObject({ bodyLocked: false, htmlLocked: false })
  expect(scrollState.bodyOverflow).not.toBe('hidden')
  expect(scrollState.shellOverflow).not.toBe('hidden')
  expect(scrollState.scrollRange).toBeGreaterThan(100)
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)

  await tabs.nth(1).click()
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true')
  await expect(visibleDay.locator(`[data-screening-id="${firstDayItems[0].screening.id}"]`)).toHaveCount(0)
  await expect(visibleDay.locator(`[data-screening-id="${secondDayItem!.screening.id}"]`)).toBeVisible()
})

test('groups overlapping priorities and removes only the selected alternative', async ({ page, request }) => {
  const triple = overlappingTriple(await items(request))
  test.skip(!triple, '서로 겹치는 세 영화 회차가 없습니다.')
  const [origin, second, third] = triple!
  await page.addInitScript(({ selectedKey, planKey, originId, secondId, thirdId }) => {
    localStorage.setItem(selectedKey, JSON.stringify([originId]))
    localStorage.setItem(planKey, JSON.stringify({
      [originId]: { priority: 1 },
      [secondId]: { priority: 2, fallbackFor: [originId] },
      [thirdId]: { priority: 3, fallbackFor: [originId] },
    }))
  }, {
    selectedKey: SELECTED_KEY,
    planKey: PLAN_KEY,
    originId: origin.screening.id,
    secondId: second.screening.id,
    thirdId: third.screening.id,
  })
  await page.goto('./')
  await openTimetable(page)

  const group = page.locator('.schedule-screening-group.has-conflict')
  await expect(group.getByRole('heading')).toContainText('같은 시간대에 3개 일정')
  await expect(group.locator('.schedule-list-row')).toHaveCount(3)
  await expect(group.locator('.priority-1')).toHaveCount(1)
  await expect(group.locator('.priority-2')).toHaveCount(1)
  await expect(group.locator('.priority-3')).toHaveCount(1)

  await page.getByRole('button', { name: `${second.film.title} 시간표에서 삭제` }).click()
  await expect(group.getByText(second.film.title, { exact: true })).toHaveCount(0)
  await expect.poll(() => page.evaluate(({ key, id }) => {
    const plan = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>
    return Boolean(plan[id])
  }, { key: PLAN_KEY, id: second.screening.id })).toBe(false)

  await page.getByRole('button', { name: '선택', exact: true }).click()
  await page.getByRole('button', { name: `${third.film.title} 삭제 선택` }).click()
  await expect(page.getByText('삭제할 일정 1개 선택')).toBeVisible()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: '삭제 1' }).click()
  await expect(page.getByText(third.film.title, { exact: true })).toHaveCount(0)
})
