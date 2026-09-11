import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

type Screening = { id: string; date: string; start: string; end?: string; venue: string; code?: string }
type Film = { id: string; title: string; runtime?: number; screenings: Screening[] }
type FilmData = { films: Film[] }
type Item = { film: Film; screening: Screening }

const SELECTED_KEY = 'biff-timetable:selected-screenings:v1'
const FAVORITES_KEY = 'biff-timetable:favorites:v1'
const STATUS_KEY = 'biff-timetable:ticket-status:v1'
const CUSTOM_EVENTS_KEY = 'biff-timetable:custom-events:v1'

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

async function emulateAppleSaveSheet(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
    })
    Object.defineProperty(navigator, 'platform', {
      configurable: true,
      get: () => 'iPhone',
    })
  })
}

async function pngPreviewSize(page: Page) {
  const preview = page.locator('.png-ios-preview')
  await expect(preview).toBeVisible({ timeout: 20_000 })
  return await preview.evaluate(async (image: HTMLImageElement) => {
    if (!image.complete || image.naturalWidth === 0) {
      await new Promise<void>((resolve, reject) => {
        image.addEventListener('load', () => resolve(), { once: true })
        image.addEventListener('error', () => reject(new Error('PNG preview failed to load')), { once: true })
      })
    }
    return { width: image.naturalWidth, height: image.naturalHeight }
  })
}

test('exports desktop and mobile timetable PNGs with separate high-resolution profiles', async ({ page, request }) => {
  const data = await screeningData(request)
  const item = flatten(data)[0]
  test.skip(!item, 'PNG 출력 테스트에 사용할 회차가 없습니다.')

  await emulateAppleSaveSheet(page)
  await seedSelected(page, [item!.screening.id])

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('./')
  await page.getByRole('button', { name: '내 시간표' }).click()
  await page.getByRole('button', { name: 'PNG 저장' }).click()

  const desktop = await pngPreviewSize(page)
  expect(desktop.width).toBe(2160)
  expect(desktop.height).toBeGreaterThan(900)
  await page.getByRole('button', { name: 'PNG 저장 창 닫기' }).click()

  await page.setViewportSize({ width: 393, height: 852 })
  await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(393)
  await page.getByRole('button', { name: 'PNG 저장' }).click()

  const mobile = await pngPreviewSize(page)
  expect(mobile.width).toBe(1440)
  expect(mobile.height).toBeGreaterThanOrEqual(1920)
  expect(mobile.width / mobile.height).toBeLessThanOrEqual(0.75)
})

test('extends mobile PNG height when the last timetable hour runs past midnight', async ({ page, request }) => {
  const data = await screeningData(request)
  const lateItem = flatten(data).find((item) => timetableEnd(item) > 24 * 60)
  test.skip(!lateItem, '자정 이후 종료되는 회차가 없어 세로 확장 PNG 테스트를 건너뜁니다.')

  await emulateAppleSaveSheet(page)
  await seedSelected(page, [lateItem!.screening.id])
  await page.setViewportSize({ width: 393, height: 852 })
  await page.goto('./')
  await page.getByRole('button', { name: '내 시간표' }).click()
  await page.getByRole('button', { name: 'PNG 저장' }).click()

  const mobile = await pngPreviewSize(page)
  expect(mobile.width).toBe(1440)
  expect(mobile.height).toBeGreaterThan(1920)
})

test('keeps distinct personal-event colors in the timetable and PNG export', async ({ page }) => {
  const customEvents = [
    {
      id: 'custom-alpha',
      title: '개인 일정 A',
      date: '2026-10-10',
      start: '10:00',
      end: '11:00',
      category: 'personal',
      createdAt: '2026-09-11T00:00:00.000Z',
    },
    {
      id: 'custom-beta',
      title: '개인 일정 B',
      date: '2026-10-10',
      start: '12:00',
      end: '13:00',
      category: 'personal',
      createdAt: '2026-09-11T00:00:00.000Z',
    },
  ]

  await emulateAppleSaveSheet(page)
  await page.addInitScript(({ customEventsKey, customEvents }) => {
    localStorage.setItem(customEventsKey, JSON.stringify(customEvents))

    const originalRemove = Element.prototype.remove
    Element.prototype.remove = function remove() {
      if (this instanceof HTMLElement && this.classList.contains('png-export-host')) {
        this.dataset.testPreserved = 'true'
        return
      }
      originalRemove.call(this)
    }
  }, { customEventsKey: CUSTOM_EVENTS_KEY, customEvents })

  await page.setViewportSize({ width: 393, height: 852 })
  await page.goto('./')
  await page.getByRole('button', { name: '내 시간표' }).click()

  const screenEvents = page.locator('.event-block.custom-event.category-personal')
  await expect(screenEvents).toHaveCount(2)
  const screenColors = await screenEvents.evaluateAll((events) => events.map((event) => getComputedStyle(event).backgroundColor))
  expect(new Set(screenColors).size).toBe(2)

  await page.getByRole('button', { name: 'PNG 저장' }).click()
  await pngPreviewSize(page)

  const exportEvents = page.locator('.png-export-host .png-export-event.custom-event.category-personal')
  await expect(exportEvents).toHaveCount(2)
  const exportColors = await exportEvents.evaluateAll((events) => events.map((event) => getComputedStyle(event).backgroundColor))
  expect(new Set(exportColors).size).toBe(2)
  expect(exportColors).toEqual(screenColors)
})

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

test('sorts movie finder films by their earliest screening on the selected date', async ({ page, request }) => {
  const data = await screeningData(request)
  const dates = Array.from(new Set(flatten(data).map(({ screening }) => screening.date))).sort()
  const candidateDate = dates.find((date) => {
    const starts = data.films
      .map((film) => film.screenings.filter((screening) => screening.date === date).map((screening) => screening.start).sort()[0])
      .filter((start): start is string => Boolean(start))
    return new Set(starts).size >= 2
  })
  test.skip(!candidateDate, '영화 정렬 테스트에 사용할 날짜가 없습니다.')

  const candidates = data.films.map((film, sourceIndex) => {
    const screenings = film.screenings.filter((screening) => screening.date === candidateDate)
    if (!screenings.length) return null
    const earliest = screenings.reduce((best, screening) => clockMinutes(screening.start) < clockMinutes(best.start) ? screening : best)
    return { film, earliest, sourceIndex }
  }).filter((item): item is { film: Film; earliest: Screening; sourceIndex: number } => item !== null)

  candidates.sort((a, b) => clockMinutes(a.earliest.start) - clockMinutes(b.earliest.start) || a.sourceIndex - b.sourceIndex)
  const expected = candidates[0]
  expect(expected).toBeTruthy()

  await page.goto('./')
  await page.getByLabel('날짜').selectOption(candidateDate!)
  await expect(page.locator('.film-card h2').first()).toHaveText(expected!.film.title)
})

test('drafts, applies, clears, and fully resets the movie time-range filter', async ({ page, request }) => {
  const data = await screeningData(request)
  const timeCounts = new Map<string, number>()
  for (const { screening } of flatten(data)) timeCounts.set(screening.start, (timeCounts.get(screening.start) ?? 0) + 1)
  const targetTime = [...timeCounts.entries()].sort((a, b) => a[1] - b[1] || b[0].localeCompare(a[0]))[0]?.[0]
  test.skip(!targetTime, '시간대 필터 회귀 테스트에 사용할 회차가 없습니다.')

  await page.goto('./')
  const fromInput = page.getByLabel('회차 시작 시간부터')
  const toInput = page.getByLabel('회차 시작 시간까지')
  const applyButton = page.getByRole('button', { name: '시간대 적용' })
  const clearButton = page.getByRole('button', { name: '시간대 해제' })
  const status = page.locator('.time-range-filter-head small')
  const firstTitleBefore = await page.locator('.film-card h2').first().textContent()
  const firstRowBefore = await page.locator('.screening-row strong').first().textContent()

  await expect(status).toHaveText('시간대 제한 없음')
  await expect(applyButton).toBeDisabled()
  await expect(clearButton).toBeDisabled()

  await fromInput.fill(targetTime!)
  await toInput.fill(targetTime!)

  // Editing the native time inputs only changes the draft; results stay untouched until Apply.
  await expect(page.locator('.film-card h2').first()).toHaveText(firstTitleBefore ?? '')
  await expect(page.locator('.screening-row strong').first()).toHaveText(firstRowBefore ?? '')
  await expect(status).toHaveText('시간대 제한 없음')
  await expect(applyButton).toBeEnabled()
  await expect(clearButton).toBeEnabled()

  await applyButton.click()
  await expect(status).toContainText(`${targetTime} ~ ${targetTime}`)
  await expect(applyButton).toBeDisabled()
  const filteredRowTexts = await page.locator('.screening-row strong').allTextContents()
  expect(filteredRowTexts.length).toBeGreaterThan(0)
  expect(filteredRowTexts.every((text) => text.includes(targetTime!))).toBeTruthy()

  await clearButton.click()
  await expect(fromInput).toHaveValue('')
  await expect(toInput).toHaveValue('')
  await expect(status).toHaveText('시간대 제한 없음')
  await expect(page.locator('.film-card h2').first()).toHaveText(firstTitleBefore ?? '')
  await expect(clearButton).toBeDisabled()

  // Overall reset also discards an unapplied draft.
  await fromInput.fill(targetTime!)
  await expect(applyButton).toBeEnabled()
  await page.getByRole('button', { name: '초기화' }).click()
  await expect(fromInput).toHaveValue('')
  await expect(toInput).toHaveValue('')
  await expect(status).toHaveText('시간대 제한 없음')
  await expect(applyButton).toBeDisabled()
})

test('supports open-ended and overnight time ranges after explicit apply', async ({ page, request }) => {
  const data = await screeningData(request)
  const times = Array.from(new Set(flatten(data).map(({ screening }) => screening.start))).sort((a, b) => clockMinutes(a) - clockMinutes(b))
  test.skip(times.length < 3, '단방향 시간대 테스트에 필요한 회차가 부족합니다.')
  const pivot = times[Math.floor(times.length / 2)]

  await page.goto('./')
  const fromInput = page.getByLabel('회차 시작 시간부터')
  const toInput = page.getByLabel('회차 시작 시간까지')
  const applyButton = page.getByRole('button', { name: '시간대 적용' })
  const clearButton = page.getByRole('button', { name: '시간대 해제' })

  await fromInput.fill(pivot)
  await applyButton.click()
  let rowTexts = await page.locator('.screening-row strong').allTextContents()
  expect(rowTexts.length).toBeGreaterThan(0)
  expect(rowTexts.every((text) => {
    const match = text.match(/\d{2}:\d{2}/g)
    const start = match?.at(-1)
    return Boolean(start) && clockMinutes(start!) >= clockMinutes(pivot)
  })).toBeTruthy()

  await clearButton.click()
  await toInput.fill(pivot)
  await applyButton.click()
  rowTexts = await page.locator('.screening-row strong').allTextContents()
  expect(rowTexts.length).toBeGreaterThan(0)
  expect(rowTexts.every((text) => {
    const match = text.match(/\d{2}:\d{2}/g)
    const start = match?.at(-1)
    return Boolean(start) && clockMinutes(start!) <= clockMinutes(pivot)
  })).toBeTruthy()

  const late = times.find((time) => clockMinutes(time) >= 22 * 60)
  const early = times.find((time) => clockMinutes(time) <= 2 * 60)
  if (!late || !early) return

  await clearButton.click()
  await fromInput.fill(late)
  await toInput.fill(early)
  await applyButton.click()
  rowTexts = await page.locator('.screening-row strong').allTextContents()
  expect(rowTexts.length).toBeGreaterThan(0)
  expect(rowTexts.every((text) => {
    const match = text.match(/\d{2}:\d{2}/g)
    const start = match?.at(-1)
    if (!start) return false
    const minutes = clockMinutes(start)
    return minutes >= clockMinutes(late) || minutes <= clockMinutes(early)
  })).toBeTruthy()
})

test('keeps native time inputs compact and separated on iPhone-width WebKit layouts', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 })
  await page.goto('./')

  const range = page.locator('.time-range-inputs')
  const inputs = range.locator('input[type="time"]')
  const separator = page.locator('.time-range-separator')
  await expect(inputs).toHaveCount(2)
  await expect(separator).toBeVisible()

  const containerBox = await range.boundingBox()
  const firstBox = await inputs.nth(0).boundingBox()
  const secondBox = await inputs.nth(1).boundingBox()
  const separatorBox = await separator.boundingBox()
  expect(containerBox).not.toBeNull()
  expect(firstBox).not.toBeNull()
  expect(secondBox).not.toBeNull()
  expect(separatorBox).not.toBeNull()

  if (containerBox && firstBox && secondBox && separatorBox) {
    expect(firstBox.x).toBeGreaterThanOrEqual(containerBox.x - 1)
    expect(firstBox.x + firstBox.width).toBeLessThanOrEqual(separatorBox.x - 2)
    expect(separatorBox.x + separatorBox.width).toBeLessThanOrEqual(secondBox.x - 2)
    expect(secondBox.x + secondBox.width).toBeLessThanOrEqual(containerBox.x + containerBox.width + 1)
    expect(firstBox.width).toBeLessThan(containerBox.width / 2)
    expect(secondBox.width).toBeLessThan(containerBox.width / 2)
  }

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
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
