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

function findNonOverlappingPair(data: FilmData): [Item, Item] | null {
  const items = flatten(data)
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      if (items[i].film.id === items[j].film.id) continue
      if (!overlaps(items[i], items[j])) return [items[i], items[j]]
    }
  }
  return null
}

async function streamText(stream: NodeJS.ReadableStream | null) {
  if (!stream) throw new Error('다운로드 스트림을 열 수 없습니다.')
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf-8')
}

async function seedState(
  page: Page,
  selected: string[],
  statuses: Record<string, string>,
  bookingPlan: Record<string, { priority: number; fallbackFor?: string[] }>,
) {
  await page.addInitScript(({ selectedKey, statusKey, planKey, selected, statuses, bookingPlan }) => {
    localStorage.setItem(selectedKey, JSON.stringify(selected))
    localStorage.setItem(statusKey, JSON.stringify(statuses))
    localStorage.setItem(planKey, JSON.stringify(bookingPlan))
  }, { selectedKey: SELECTED_KEY, statusKey: STATUS_KEY, planKey: BOOKING_PLAN_KEY, selected, statuses, bookingPlan })
}

async function emulateAppleAndPreserveExportHost(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
    })
    Object.defineProperty(navigator, 'platform', {
      configurable: true,
      get: () => 'iPhone',
    })

    const originalRemove = Element.prototype.remove
    Element.prototype.remove = function remove() {
      if (this instanceof HTMLElement && this.classList.contains('png-export-host')) return
      originalRemove.call(this)
    }
  })
}

test('exports booking plan backup v3 and still imports a v2 backup', async ({ page, request }) => {
  const data = await screeningData(request)
  const pair = findOverlappingPair(data)
  test.skip(!pair, '백업 테스트에 필요한 겹치는 회차가 없습니다.')
  const [origin, candidate] = pair!

  await seedState(
    page,
    [origin.screening.id],
    { [origin.screening.id]: 'failed' },
    {
      [origin.screening.id]: { priority: 1 },
      [candidate.screening.id]: { priority: 2, fallbackFor: [origin.screening.id] },
    },
  )
  await page.goto('./')
  await page.getByRole('button', { name: '내 시간표' }).click()

  await page.locator('.backup-menu > summary').click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'JSON 저장' }).click()
  const download = await downloadPromise
  const backupText = await streamText(await download.createReadStream())
  const backup = JSON.parse(backupText) as {
    version: number
    bookingPlan: Record<string, { priority?: number; fallbackFor?: string[] }>
  }

  expect(backup.version).toBe(3)
  expect(backup.bookingPlan[origin.screening.id]?.priority).toBe(1)
  expect(backup.bookingPlan[candidate.screening.id]).toEqual({
    priority: 2,
    fallbackFor: [origin.screening.id],
  })

  const v2 = {
    version: 2,
    exportedAt: new Date().toISOString(),
    selected: [origin.screening.id],
    favorites: [],
    ticketStatus: { [origin.screening.id]: 'planned' },
    customEvents: [],
  }
  await page.locator('input[type="file"][accept*=".json"]').setInputFiles({
    name: 'legacy-v2.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(v2)),
  })

  await expect.poll(() => page.evaluate(({ selectedKey, planKey }) => ({
    selected: JSON.parse(localStorage.getItem(selectedKey) ?? '[]') as string[],
    plan: JSON.parse(localStorage.getItem(planKey) ?? '{}') as Record<string, unknown>,
  }), { selectedKey: SELECTED_KEY, planKey: BOOKING_PLAN_KEY })).toEqual({
    selected: [origin.screening.id],
    plan: {},
  })
})

test('excludes failed screenings from ICS export', async ({ page, request }) => {
  const data = await screeningData(request)
  const pair = findNonOverlappingPair(data)
  test.skip(!pair, 'ICS 테스트에 필요한 비충돌 회차가 없습니다.')
  const [failedItem, plannedItem] = pair!

  await seedState(
    page,
    [failedItem.screening.id, plannedItem.screening.id],
    {
      [failedItem.screening.id]: 'failed',
      [plannedItem.screening.id]: 'planned',
    },
    {
      [failedItem.screening.id]: { priority: 1 },
      [plannedItem.screening.id]: { priority: 2 },
    },
  )
  await page.goto('./')
  await page.getByRole('button', { name: '내 시간표' }).click()

  await page.locator('.backup-menu > summary').click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '캘린더' }).click()
  const download = await downloadPromise
  const ics = await streamText(await download.createReadStream())

  expect(ics).toContain(`UID:${plannedItem.screening.id}@biff-timetable`)
  expect(ics).not.toContain(`UID:${failedItem.screening.id}@biff-timetable`)
})

test('shows priority and failure symbols in PNG while excluding unselected alternatives', async ({ page, request }) => {
  const data = await screeningData(request)
  const selectedPair = findNonOverlappingPair(data)
  test.skip(!selectedPair, 'PNG 예매 계획 테스트에 필요한 회차 조합이 없습니다.')
  const [priorityItem, failedItem] = selectedPair!
  const selectedIds = new Set([priorityItem.screening.id, failedItem.screening.id])
  const selectedTitles = new Set([priorityItem.film.title, failedItem.film.title])
  const alternativeItem = flatten(data).find(({ film, screening }) => (
    !selectedIds.has(screening.id) && !selectedTitles.has(film.title)
  ))
  test.skip(!alternativeItem, 'PNG 대안 제외 테스트에 사용할 추가 회차가 없습니다.')

  await emulateAppleAndPreserveExportHost(page)
  await seedState(
    page,
    [priorityItem.screening.id, failedItem.screening.id],
    {
      [priorityItem.screening.id]: 'planned',
      [failedItem.screening.id]: 'failed',
    },
    {
      [priorityItem.screening.id]: { priority: 2 },
      [failedItem.screening.id]: { priority: 1 },
      [alternativeItem.screening.id]: { priority: 3, fallbackFor: [failedItem.screening.id] },
    },
  )
  await page.setViewportSize({ width: 393, height: 852 })
  await page.goto('./')
  await page.getByRole('button', { name: '내 시간표' }).click()
  await page.getByRole('button', { name: 'PNG 저장' }).click()
  await expect(page.locator('.png-ios-preview')).toBeVisible({ timeout: 20_000 })

  const titles = await page.locator('.png-export-host .png-export-event-title').allTextContents()
  expect(titles).toContain(`② ${priorityItem.film.title}`)
  expect(titles).toContain(`× ${failedItem.film.title}`)
  expect(titles.some((title) => title.includes(alternativeItem.film.title))).toBeFalsy()
})
