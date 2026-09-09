import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const SELECTED_KEY = 'biff-timetable:selected-screenings:v1'

type Screening = { id: string; date: string; start: string; end?: string; venue: string }
type Film = { title: string; screenings: Screening[] }
type FilmData = { films: Film[] }

function minutes(time: string) {
  const [hour, minute] = time.split(':').map(Number)
  return hour * 60 + minute
}

function plusMinutes(time: string, amount: number) {
  const value = minutes(time) + amount
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
}

async function addCustomEvent(page: import('@playwright/test').Page, title = '점심 식사') {
  await page.getByRole('button', { name: /일정 추가|\+ 일정/ }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('일정명 *').fill(title)
  await dialog.getByLabel('날짜 *').fill('2025-09-20')
  await dialog.getByLabel('시작 *').fill('12:00')
  await dialog.getByLabel('종료 *').fill('13:00')
  await dialog.getByLabel('장소').fill('센텀시티')
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

test('marks a movie and custom event when their times overlap', async ({ page, request }) => {
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

  await expect(page.locator('.event-block.custom-event')).toHaveClass(/has-time-conflict/)
  await expect(page.locator('.event-block').not('.custom-event').first()).toHaveClass(/has-time-conflict/)
})

test('includes custom events in JSON backup and calendar export', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: '내 시간표' }).click()
  await addCustomEvent(page, '백업할 일정')

  await page.locator('.backup-menu > summary').click()
  const backupPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'JSON 저장' }).click()
  const backupDownload = await backupPromise
  const backupPath = await backupDownload.path()
  expect(backupPath).not.toBeNull()
  const backup = JSON.parse(await readFile(backupPath!, 'utf8')) as { version: number; customEvents: Array<{ title: string }> }
  expect(backup.version).toBe(2)
  expect(backup.customEvents.some((event) => event.title === '백업할 일정')).toBeTruthy()

  const calendarPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '캘린더' }).click()
  const calendarDownload = await calendarPromise
  const calendarPath = await calendarDownload.path()
  expect(calendarPath).not.toBeNull()
  const calendar = await readFile(calendarPath!, 'utf8')
  expect(calendar).toContain('SUMMARY:백업할 일정')
  expect(calendar).toContain('LOCATION:센텀시티')
})

test('keeps the custom event form within a 320px mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await page.goto('./')
  await page.getByRole('button', { name: '내 시간표' }).click()
  await page.getByRole('button', { name: '+ 일정 추가' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
})
