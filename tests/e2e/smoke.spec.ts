import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

type Screening = { id: string; date: string; start: string; end?: string; venue: string; code?: string }
type Film = { id: string; title: string; runtime?: number; screenings: Screening[] }
type FilmData = { films: Film[] }
type Item = { film: Film; screening: Screening }

const SELECTED_KEY = 'biff-timetable:selected-screenings:v1'
const FAVORITES_KEY = 'biff-timetable:favorites:v1'
const STATUS_KEY = 'biff-timetable:ticket-status:v1'

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

function timetableEnd(item: Item) {
  let start = clockMinutes(item.screening.start)
  if (start < 8 * 60) start += 1440
  return start + duration(item)
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
    const a = absoluteWindow(items[i])
    for (let j = i + 1; j < items.length; j += 1) {
      const b = absoluteWindow(items[j])
      if (items[i].screening.id !== items[j].screening.id && a.start < b.end && b.start < a.end) return [items[i], items[j]]
    }
  }
  return null
}

function findNonOverlappingItems(data: FilmData, count = 2) {
  const items = flatten(data)
  const result: Item[] = []
  for (const item of items) {
    const candidate = absoluteWindow(item)
    if (result.every((existing) => {
      const other = absoluteWindow(existing)
      return !(candidate.start < other.end && other.start < candidate.end)
    })) result.push(item)
    if (result.length === count) return result
  }
  return result
}

async function seedSelected(page: Page, ids: string[]) {
  await page.addInitScript(({ selectedKey, statusKey, ids }) => {
    localStorage.setItem(selectedKey, JSON.stringify(ids))
    localStorage.setItem(statusKey, JSON.stringify(Object.fromEntries(ids.map((id) => [id, 'planned']))))
  }, { selectedKey: SELECTED_KEY, statusKey: STATUS_KEY, ids })
}

test('loads, opens a centered detail dialog, and closes it from the backdrop', async ({ page }) => {
  const errors: Error[] = []
  page.on('pageerror', (error) => errors.push(error))
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'BIFF Timetable' })).toBeVisible()

  await page.locator('.film-card .detail-button').first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const box = await dialog.boundingBox()
  const viewport = page.viewportSize()
  expect(box).not.toBeNull()
  expect(viewport).not.toBeNull()
  if (box && viewport) {
    expect(Math.abs((box.x + box.width / 2) - viewport.width / 2)).toBeLessThan(35)
    expect(Math.abs((box.y + box.height / 2) - viewport.height / 2)).toBeLessThan(35)
  }

  await page.locator('.modal-backdrop').click({ position: { x: 4, y: 4 } })
  await expect(dialog).toBeHidden()
  expect(errors).toEqual([])
})

test('repairs malformed persisted state instead of crashing', async ({ page }) => {
  const errors: Error[] = []
  page.on('pageerror', (error) => errors.push(error))
  await page.addInitScript(({ selectedKey, favoritesKey, statusKey }) => {
    localStorage.setItem(selectedKey, JSON.stringify({ broken: true }))
    localStorage.setItem(favoritesKey, JSON.stringify([1, null, '', 'film-x', 'film-x']))
    localStorage.setItem(statusKey, JSON.stringify({ bad: 'unknown', empty: null }))
  }, { selectedKey: SELECTED_KEY, favoritesKey: FAVORITES_KEY, statusKey: STATUS_KEY })

  await page.goto('./')
  await expect(page.locator('.selection-count')).toHaveText('총 0개 선택')
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), SELECTED_KEY)).toBe('[]')
  expect(errors).toEqual([])
})

test('persists a selected screening across reload and opens its timetable detail', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: '+ 추가' }).first().click()
  await expect(page.locator('.selection-count')).toHaveText('총 1개 선택')
  await page.reload()
  await expect(page.locator('.selection-count')).toHaveText('총 1개 선택')

  await page.getByRole('button', { name: '내 시간표' }).click()
  const event = page.locator('.event-block').first()
  await expect(event).toBeVisible()
  await event.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
})

test('changes booking status from a timetable detail and persists it', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: '+ 추가' }).first().click()
  await page.getByRole('button', { name: '내 시간표' }).click()

  const event = page.locator('.event-block').first()
  await expect(event).toBeVisible()
  await event.click()

  const currentRow = page.locator('.modal-screenings>div.current-screening')
  const statusSelect = currentRow.locator('.ticket-select')
  await expect(statusSelect).toBeVisible()
  await expect(statusSelect).toHaveValue('planned')
  await statusSelect.selectOption('booked')
  await expect(statusSelect).toHaveValue('booked')
  await expect.poll(() => page.evaluate((key) => {
    const statuses = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, string>
    return Object.values(statuses)[0]
  }, STATUS_KEY)).toBe('booked')

  await page.keyboard.press('Escape')
  await expect(event).toHaveClass(/status-booked/)

  await page.reload()
  await page.getByRole('button', { name: '내 시간표' }).click()
  await expect(page.locator('.event-block').first()).toHaveClass(/status-booked/)
})

test('blocks adding an overlapping screening and identifies the existing conflict', async ({ page, request }) => {
  const data = await screeningData(request)
  const pair = findOverlappingPair(data)
  test.skip(!pair, '현재 DB에 겹치는 회차 조합이 없습니다.')
  const [existing, candidate] = pair!
  await seedSelected(page, [existing.screening.id])
  await page.goto('./')

  await page.getByLabel('영화 검색').fill(candidate.film.title)
  const card = page.locator('.film-card').filter({ hasText: candidate.film.title }).first()
  const row = card.locator('.screening-row').filter({ hasText: `${candidate.screening.venue} · ${candidate.screening.start}` }).first()
  const addButton = row.getByRole('button', { name: '+ 추가' })
  await expect(addButton).toBeVisible()

  let message = ''
  page.once('dialog', async (dialog) => {
    message = dialog.message()
    await dialog.accept()
  })
  await addButton.click()
  expect(message).toContain(existing.film.title)
  expect(message).toContain('겹치는 기존 회차를 먼저 제거')
  await expect(page.locator('.selection-count')).toHaveText('총 1개 선택')
})

test('extends the timetable for a screening that runs past midnight', async ({ page, request }) => {
  const data = await screeningData(request)
  const item = flatten(data).find((candidate) => timetableEnd(candidate) > 24 * 60)
  test.skip(!item, '현재 DB에 자정을 넘기는 상영이 없습니다.')
  await seedSelected(page, [item!.screening.id])
  await page.goto('./')
  await page.getByRole('button', { name: '내 시간표' }).click()

  const expectedHour = Math.ceil(timetableEnd(item!) / 60)
  const labelHour = expectedHour < 24 ? expectedHour : expectedHour - 24
  const label = `${String(labelHour).padStart(2, '0')}시`
  await expect(page.locator('.time-axis')).toContainText(label)
  const event = page.locator('.event-block').first()
  const box = await event.boundingBox()
  expect(box?.y ?? -1).toBeGreaterThanOrEqual(0)
})

test('supports multi-select deletion with confirmation cancellation and approval', async ({ page, request }) => {
  const data = await screeningData(request)
  const items = findNonOverlappingItems(data, 2)
  test.skip(items.length < 2, '삭제 회귀 테스트에 필요한 회차가 부족합니다.')
  await seedSelected(page, items.map((item) => item.screening.id))
  await page.goto('./')
  await page.getByRole('button', { name: '내 시간표' }).click()
  await page.getByRole('button', { name: '선택', exact: true }).click()
  const events = page.locator('.event-block')
  await events.nth(0).click()
  await events.nth(1).click()

  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('button', { name: '삭제 2' }).click()
  await expect(page.locator('.selection-count')).toHaveText('총 2개 선택')

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: '삭제 2' }).click()
  await expect(page.locator('.selection-count')).toHaveText('총 0개 선택')
})

test('keeps the 320px mobile layout inside the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await page.goto('./')
  const initialOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(initialOverflow).toBeLessThanOrEqual(1)

  await page.getByRole('button', { name: '+ 추가' }).first().click()
  await page.getByRole('button', { name: '내 시간표' }).click()
  const timetableOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(timetableOverflow).toBeLessThanOrEqual(1)
  await expect(page.locator('.timetable-action-buttons')).toBeVisible()
})
