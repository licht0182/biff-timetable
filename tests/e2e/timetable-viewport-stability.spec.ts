import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

const SELECTED_KEY = 'biff-timetable:selected-screenings:v1'
const STATUS_KEY = 'biff-timetable:ticket-status:v1'

type FilmData = { films: Array<{ screenings: Array<{ id: string }> }> }

async function seedOneScreening(page: Page, id: string) {
  await page.addInitScript(({ selectedKey, statusKey, screeningId }) => {
    localStorage.setItem(selectedKey, JSON.stringify([screeningId]))
    localStorage.setItem(statusKey, JSON.stringify({ [screeningId]: 'planned' }))
  }, { selectedKey: SELECTED_KEY, statusKey: STATUS_KEY, screeningId: id })
}

async function firstScreeningId(request: APIRequestContext) {
  const response = await request.get('./screenings.json')
  expect(response.ok()).toBeTruthy()
  const data = await response.json() as FilmData
  return data.films.flatMap((film) => film.screenings)[0]?.id as string | undefined
}

async function timetableGeometry(page: Page) {
  return await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>('.app-shell')!
    const scroll = document.querySelector<HTMLElement>('.timetable-scroll')!
    const timetable = document.querySelector<HTMLElement>('.timetable')!
    const event = document.querySelector<HTMLElement>('.event-block')!
    const labels = Array.from(document.querySelectorAll<HTMLElement>('.time-axis>div:not(.runtime-pre-hour)'))
    const middleLabel = labels[Math.floor(labels.length / 2)]
    const style = getComputedStyle(timetable)
    return {
      shellHeight: shell.getBoundingClientRect().height,
      scrollHeight: scroll.getBoundingClientRect().height,
      timetableHeight: timetable.getBoundingClientRect().height,
      hourHeight: Number.parseFloat(style.getPropertyValue('--hour-height')),
      gridHeight: Number.parseFloat(style.getPropertyValue('--grid-height')),
      reactHourHeight: timetable.style.getPropertyValue('--hour-height'),
      reactGridHeight: timetable.style.getPropertyValue('--grid-height'),
      eventTop: event.getBoundingClientRect().top - scroll.getBoundingClientRect().top,
      eventHeight: event.getBoundingClientRect().height,
      middleLabelTop: middleLabel ? middleLabel.getBoundingClientRect().top - scroll.getBoundingClientRect().top : 0,
      bodyPosition: getComputedStyle(document.body).position,
      bodyOverflow: getComputedStyle(document.body).overflow,
      htmlOverflow: getComputedStyle(document.documentElement).overflow,
      stableClass: shell.classList.contains('timetable-viewport-stable'),
      stableData: timetable.dataset.stableViewport,
    }
  })
}

test('keeps mobile timetable geometry fixed across Safari-style height-only resize', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const id = await firstScreeningId(request)
  test.skip(!id, '상영 회차 데이터가 없습니다.')
  await seedOneScreening(page, id!)
  await page.goto('./')
  await page.getByRole('button', { name: '내 시간표' }).click()
  await expect(page.locator('.app-shell')).toHaveClass(/timetable-viewport-stable/)
  await expect(page.locator('.timetable')).toHaveAttribute('data-stable-viewport', 'true')

  await expect.poll(async () => (await timetableGeometry(page)).timetableHeight).toBeGreaterThan(200)
  const before = await timetableGeometry(page)

  expect(before.stableClass).toBeTruthy()
  expect(before.stableData).toBe('true')
  expect(before.bodyPosition).toBe('fixed')
  expect(before.bodyOverflow).toBe('hidden')
  expect(before.htmlOverflow).toBe('hidden')
  expect(Math.abs(before.timetableHeight - before.scrollHeight)).toBeLessThanOrEqual(2)
  expect(before.hourHeight).toBeGreaterThan(0)
  expect(before.gridHeight).toBeGreaterThan(0)

  const spoofed = await page.evaluate(() => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'innerHeight')
    try {
      Object.defineProperty(window, 'innerHeight', {
        configurable: true,
        value: Math.max(320, window.innerHeight - 140),
      })
      window.dispatchEvent(new Event('resize'))
      return true
    } catch {
      if (descriptor) Object.defineProperty(window, 'innerHeight', descriptor)
      return false
    }
  })
  test.skip(!spoofed, '이 브라우저에서는 innerHeight 재정의가 지원되지 않습니다.')
  await page.waitForTimeout(100)

  const after = await timetableGeometry(page)
  expect(after.reactHourHeight).toBe(before.reactHourHeight)
  expect(after.reactGridHeight).toBe(before.reactGridHeight)
  expect(Math.abs(after.hourHeight - before.hourHeight)).toBeLessThanOrEqual(0.05)
  expect(Math.abs(after.gridHeight - before.gridHeight)).toBeLessThanOrEqual(0.5)
  expect(Math.abs(after.eventTop - before.eventTop)).toBeLessThanOrEqual(0.5)
  expect(Math.abs(after.eventHeight - before.eventHeight)).toBeLessThanOrEqual(0.5)
  expect(Math.abs(after.middleLabelTop - before.middleLabelTop)).toBeLessThanOrEqual(0.5)
})

test('releases the timetable viewport lock for settings', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 700 })
  const id = await firstScreeningId(request)
  test.skip(!id, '상영 회차 데이터가 없습니다.')
  await seedOneScreening(page, id!)
  await page.goto('./')
  await page.getByRole('button', { name: '내 시간표' }).click()
  await expect(page.locator('.app-shell')).toHaveClass(/timetable-viewport-stable/)

  await page.getByRole('button', { name: '설정' }).click()
  await expect(page.getByRole('heading', { name: '설정', exact: true })).toBeVisible()
  await expect(page.locator('.app-shell')).not.toHaveClass(/timetable-viewport-stable/)

  const unlocked = await page.evaluate(() => ({
    bodyClass: document.body.classList.contains('timetable-viewport-locked'),
    htmlClass: document.documentElement.classList.contains('timetable-viewport-locked'),
    bodyPosition: getComputedStyle(document.body).position,
    bodyOverflow: getComputedStyle(document.body).overflow,
  }))
  expect(unlocked.bodyClass).toBeFalsy()
  expect(unlocked.htmlClass).toBeFalsy()
  expect(unlocked.bodyPosition).not.toBe('fixed')
  expect(unlocked.bodyOverflow).not.toBe('hidden')

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
})
