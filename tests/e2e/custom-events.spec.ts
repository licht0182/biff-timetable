import { expect, test } from '@playwright/test'
import { readFile, stat } from 'node:fs/promises'

const SELECTED_KEY = 'biff-timetable:selected-screenings:v1'
const CUSTOM_EVENTS_KEY = 'biff-timetable:custom-events:v1'

type Screening = { id: string; date: string; start: string; end?: string; venue: string }
type Film = { title: string; screenings: Screening[] }
type FilmData = { films: Film[] }

type CustomEventInput = {
  title?: string
  date?: string
  start?: string
  end?: string
  location?: string
}

function minutes(time: string) {
  const [hour, minute] = time.split(':').map(Number)
  return hour * 60 + minute
}

function plusMinutes(time: string, amount: number) {
  const value = minutes(time) + amount
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
}

async function addCustomEvent(page: import('@playwright/test').Page, input: CustomEventInput = {}) {
  const {
    title = '점심 식사',
    date = '2025-09-20',
    start = '12:00',
    end = '13:00',
    location = '센텀시티',
  } = input
  await page.getByRole('button', { name: /일정 추가|\+ 일정/ }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('일정명 *').fill(title)
  await dialog.getByLabel('날짜 *').fill(date)
  await dialog.getByLabel('시작 *').fill(start)
  await dialog.getByLabel('종료 *').fill(end)
  if (location) await dialog.getByLabel('장소').fill(location)
  await dialog.getByRole('button', { name: '추가', exact: true }).click()
}

test('creates, edits, persists, and deletes a custom-only timetable event', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: '내 시간표' }).click()
  await addCustomEvent(page)

  await expect(page.locator('.selection-count')).toHaveText('총 1개 선택')
  const customEvent = page.locator('.event-block.custom-event').first()
  await expect(customEvent).toBeVisible()
  await expect(customEvent).toContainText('점심 식사')

  await customEvent.click()
  let dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: '점심 식사' })).toBeVisible()
  await expect(dialog).toContainText('센텀시티')
  await dialog.getByRole('button', { name: '수정' }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByLabel('일정명 *').fill('늦은 점심')
  await dialog.getByRole('button', { name: '저장' }).click()
  await expect(page.locator('.event-block.custom-event')).toContainText('늦은 점심')

  await page.reload()
  await page.getByRole('button', { name: '내 시간표' }).click()
  const persisted = page.locator('.event-block.custom-event').first()
  await expect(persisted).toContainText('늦은 점심')

  await persisted.click()
  page.once('dialog', (confirmation) => confirmation.accept())
  await page.getByRole('dialog').getByRole('button', { name: '삭제' }).click()
  await expect(page.locator('.selection-count')).toHaveText('총 0개 선택')
  await expect(page.locator('.event-block.custom-event')).toHaveCount(0)
})

test('splits overlapping custom events into lanes and allows cancelling another conflict', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: '내 시간표' }).click()
  await addCustomEvent(page, { title: '첫 일정', start: '12:00', end: '13:00' })

  page.once('dialog', (confirmation) => confirmation.accept())
  await addCustomEvent(page, { title: '겹치는 일정', start: '12:30', end: '13:30' })

  const blocks = page.locator('.event-block.custom-event')
  await expect(blocks).toHaveCount(2)
  await expect(blocks.nth(0)).toHaveAttribute('data-runtime-lane', /\/2$/)
  await expect(blocks.nth(1)).toHaveAttribute('data-runtime-lane', /\/2$/)
  const firstBox = await blocks.nth(0).boundingBox()
  const secondBox = await blocks.nth(1).boundingBox()
  const columnBox = await page.locator('.day-column').first().boundingBox()
  expect(firstBox).not.toBeNull()
  expect(secondBox).not.toBeNull()
  expect(columnBox).not.toBeNull()
  expect(Math.abs(firstBox!.x - secondBox!.x)).toBeGreaterThan(2)
  expect(firstBox!.width).toBeLessThan(columnBox!.width * 0.6)
  expect(secondBox!.width).toBeLessThan(columnBox!.width * 0.6)

  page.once('dialog', (confirmation) => confirmation.dismiss())
  await addCustomEvent(page, { title: '취소할 일정', start: '12:15', end: '12:45' })
  await expect(blocks).toHaveCount(2)
})

test('keeps an early-morning custom event on its entered date and expands the axis before 08:00', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: '내 시간표' }).click()
  await addCustomEvent(page, { title: '아침 식사', date: '2025-09-20', start: '07:00', end: '08:00' })

  await expect(page.locator('.date-head')).toContainText('9월 20일')
  await expect(page.locator('.date-head')).not.toContainText('9월 19일')
  await expect(page.locator('.time-axis')).toContainText('07시')
  const block = page.locator('.event-block.custom-event')
  await expect(block).toBeVisible()
  const blockBox = await block.boundingBox()
  const columnBox = await page.locator('.day-column').first().boundingBox()
  expect(blockBox).not.toBeNull()
  expect(columnBox).not.toBeNull()
  expect(blockBox!.y).toBeGreaterThanOrEqual(columnBox!.y - 1)
  expect(blockBox!.y + blockBox!.height).toBeLessThanOrEqual(columnBox!.y + columnBox!.height + 1)
})

test('stores an overnight custom event as next-day end and exports the correct ICS dates', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: '내 시간표' }).click()
  await addCustomEvent(page, { title: '늦은 이동', date: '2025-09-20', start: '23:30', end: '00:30', location: '숙소' })

  const block = page.locator('.event-block.custom-event')
  await expect(block.locator('.event-time')).toContainText('23:30–00:30 (다음 날)')
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '[]'), CUSTOM_EVENTS_KEY) as Array<{ end: string }>
  expect(stored[0]?.end).toBe('24:30')

  await block.click()
  await expect(page.getByRole('dialog')).toContainText('23:30–00:30 (다음 날)')
  await page.getByRole('button', { name: '일정 창 닫기' }).click()

  await page.locator('.backup-menu > summary').click()
  const calendarPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '캘린더' }).click()
  const calendarDownload = await calendarPromise
  const calendarPath = await calendarDownload.path()
  expect(calendarPath).not.toBeNull()
  const calendar = await readFile(calendarPath!, 'utf8')
  expect(calendar).toContain('DTSTART;TZID=Asia/Seoul:20250920T233000')
  expect(calendar).toContain('DTEND;TZID=Asia/Seoul:20250921T003000')
})

test('marks a movie and custom event when their times overlap and gives both separate lanes', async ({ page, request }) => {
  const response = await request.get('./screenings.json')
  expect(response.ok()).toBeTruthy()
  const data = await response.json() as FilmData
  const candidate = data.films.flatMap((film) => film.screenings.map((screening) => ({ film, screening }))).find(({ screening }) => {
    const start = minutes(screening.start)
    return start >= 8 * 60 && start <= 22 * 60
  })
  test.skip(!candidate, '겹침 테스트에 사용할 회차가 없습니다.')

  await page.addInitScript(({ key, id }) => localStorage.setItem(key, JSON.stringify([id])), { key: SELECTED_KEY, id: candidate!.screening.id })
  await page.goto('./')
  await page.getByRole('button', { name: '내 시간표' }).click()
  await page.getByRole('button', { name: '+ 일정' }).click()

  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('일정명 *').fill('겹치는 약속')
  await dialog.getByLabel('날짜 *').fill(candidate!.screening.date)
  await dialog.getByLabel('시작 *').fill(candidate!.screening.start)
  await dialog.getByLabel('종료 *').fill(plusMinutes(candidate!.screening.start, 30))

  page.once('dialog', (confirmation) => confirmation.accept())
  await dialog.getByRole('button', { name: '추가', exact: true }).click()

  const custom = page.locator('.event-block.custom-event')
  const movie = page.locator('.event-block:not(.custom-event)').first()
  await expect(custom).toHaveClass(/has-time-conflict/)
  await expect(movie).toHaveClass(/has-time-conflict/)
  await expect(custom).toHaveAttribute('data-runtime-lane', /\/2$/)
  await expect(movie).toHaveAttribute('data-runtime-lane', /\/2$/)
})

test('restores custom events from a JSON backup', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: '내 시간표' }).click()
  await addCustomEvent(page, { title: '백업 원본' })

  await page.locator('.backup-menu > summary').click()
  const backupPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'JSON 저장' }).click()
  const backupDownload = await backupPromise
  const backupPath = await backupDownload.path()
  expect(backupPath).not.toBeNull()

  const block = page.locator('.event-block.custom-event')
  await block.click()
  await page.getByRole('dialog').getByRole('button', { name: '수정' }).click()
  await page.getByRole('dialog').getByLabel('일정명 *').fill('임시 변경')
  await page.getByRole('dialog').getByRole('button', { name: '저장' }).click()
  await expect(block).toContainText('임시 변경')

  await page.locator('input[type="file"]').setInputFiles(backupPath!)
  await expect(block).toContainText('백업 원본')
})

test('deletes a movie screening and custom event together in timetable selection mode', async ({ page, request }) => {
  const response = await request.get('./screenings.json')
  const data = await response.json() as FilmData
  const candidate = data.films.flatMap((film) => film.screenings.map((screening) => ({ film, screening })))[0]
  test.skip(!candidate, '삭제 테스트에 사용할 회차가 없습니다.')

  await page.addInitScript(({ key, id }) => localStorage.setItem(key, JSON.stringify([id])), { key: SELECTED_KEY, id: candidate!.screening.id })
  await page.goto('./')
  await page.getByRole('button', { name: '내 시간표' }).click()
  await addCustomEvent(page, { title: '함께 삭제할 일정', date: candidate!.screening.date })

  await page.getByRole('button', { name: '선택', exact: true }).click()
  await page.locator('.event-block:not(.custom-event)').first().click()
  await page.locator('.event-block.custom-event').click()
  await expect(page.getByRole('button', { name: '삭제 2' })).toBeEnabled()
  page.once('dialog', (confirmation) => confirmation.accept())
  await page.getByRole('button', { name: '삭제 2' }).click()
  await expect(page.locator('.selection-count')).toHaveText('총 0개 선택')
})

test('includes custom events in JSON backup and calendar export', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: '내 시간표' }).click()
  await addCustomEvent(page, { title: '백업할 일정' })

  await page.locator('.backup-menu > summary').click()
  const backupPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'JSON 저장' }).click()
  const backupDownload = await backupPromise
  const backupPath = await backupDownload.path()
  expect(backupPath).not.toBeNull()
  const backup = JSON.parse(await readFile(backupPath!, 'utf8')) as { version: number; customEvents: Array<{ title: string }> }
  expect(backup.version).toBe(2)
  expect(backup.customEvents.some((event) => event.title === '백업할 일정')).toBeTruthy()

  await page.locator('.backup-menu > summary').click()
  const calendarPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '캘린더' }).click()
  const calendarDownload = await calendarPromise
  const calendarPath = await calendarDownload.path()
  expect(calendarPath).not.toBeNull()
  const calendar = await readFile(calendarPath!, 'utf8')
  expect(calendar).toContain('SUMMARY:백업할 일정')
  expect(calendar).toContain('LOCATION:센텀시티')
})

test('exports a custom-only timetable as a non-empty PNG', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: '내 시간표' }).click()
  await addCustomEvent(page, { title: 'PNG 일정', start: '07:30', end: '09:00' })

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'PNG 저장' }).click()
  const download = await downloadPromise
  const path = await download.path()
  expect(path).not.toBeNull()
  const info = await stat(path!)
  expect(info.size).toBeGreaterThan(5_000)
})

test('keeps the custom event form within a 320px mobile viewport with long content', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await page.goto('./')
  await page.getByRole('button', { name: '내 시간표' }).click()
  await page.getByRole('button', { name: '+ 일정 추가' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('일정명 *').fill('아주 긴 사용자 일정 제목이 모바일 화면을 넘어가지 않는지 확인하는 테스트 일정')
  await dialog.getByLabel('장소').fill('부산광역시 해운대구 센텀시티 안에서 매우 길게 입력한 사용자 지정 장소 이름')
  await dialog.getByLabel('메모').fill('긴 메모를 여러 글자 입력하더라도 모달 자체가 가로 방향으로 화면 밖으로 빠져나가지 않아야 합니다.')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
})
