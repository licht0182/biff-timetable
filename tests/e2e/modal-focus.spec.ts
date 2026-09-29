import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

type Screening = { id: string; date: string; start: string; end?: string; venue: string }
type Film = { id: string; title: string; runtime?: number; screenings: Screening[] }
type Item = { film: Film; screening: Screening }

const SELECTED_KEY = 'biff-timetable:selected-screenings:v1'
const STATUS_KEY = 'biff-timetable:ticket-status:v1'
const PLAN_KEY = 'biff-timetable:booking-plan:v1'

function absoluteWindow({ film, screening }: Item) {
  const [year, month, day] = screening.date.split('-').map(Number)
  const [hour, minute] = screening.start.split(':').map(Number)
  const start = Math.floor(Date.UTC(year, month - 1, day) / 86_400_000) * 1440 + hour * 60 + minute
  let duration = film.runtime ?? 120
  if (screening.end) {
    const [endHour, endMinute] = screening.end.split(':').map(Number)
    const end = endHour * 60 + endMinute
    duration = end <= hour * 60 + minute ? end + 1440 - hour * 60 - minute : end - hour * 60 - minute
  }
  return { start, end: start + duration }
}

async function overlappingPair(request: APIRequestContext): Promise<[Item, Item]> {
  const response = await request.get('./screenings.json')
  expect(response.ok()).toBeTruthy()
  const data = await response.json() as { films: Film[] }
  const items = data.films.flatMap((film) => film.screenings.map((screening) => ({ film, screening })))
  for (let i = 0; i < items.length; i += 1) {
    const first = absoluteWindow(items[i])
    for (let j = i + 1; j < items.length; j += 1) {
      if (items[i].film.id === items[j].film.id) continue
      const second = absoluteWindow(items[j])
      if (first.start < second.end && second.start < first.end) return [items[i], items[j]]
    }
  }
  throw new Error('겹치는 영화 회차를 찾지 못했습니다.')
}

async function assertFocusInside(page: Page, selector: string) {
  const state = await page.evaluate((target) => {
    const dialog = document.querySelector(target)
    return { inside: Boolean(dialog?.contains(document.activeElement)), active: document.activeElement?.outerHTML.slice(0, 180), modal: dialog?.matches(':modal') }
  }, selector)
  expect(state.inside, JSON.stringify(state)).toBe(true)
}

test('film detail traps focus and restores its opening control', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('combobox', { name: '영화 검색' }).fill('아버지의 방')
  const opener = page.locator('.film-card').first().getByRole('button', { name: '상세' })
  await opener.click()
  const dialog = page.getByRole('dialog', { name: '아버지의 방' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: '상세보기 닫기' })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await assertFocusInside(page, 'dialog.modal-backdrop')
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: '상세보기 닫기' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(opener).toBeFocused()
})

test('nested booking conflict closes one layer at a time and restores both openers', async ({ page, request }) => {
  const [selected, candidate] = await overlappingPair(request)
  await page.addInitScript(({ key, id }) => localStorage.setItem(key, JSON.stringify([id])), { key: SELECTED_KEY, id: selected.screening.id })
  await page.goto('./')
  await page.getByRole('combobox', { name: '영화 검색' }).fill(candidate.film.title)
  const card = page.locator('.film-card').filter({ hasText: candidate.film.title }).first()
  const opener = card.getByRole('button', { name: '상세' })
  await opener.click()
  const filmDialog = page.getByRole('dialog', { name: candidate.film.title })
  const screeningRow = filmDialog.locator('.modal-screenings > div').filter({ hasText: `${candidate.screening.venue} · ${candidate.screening.start}` }).first()
  const add = screeningRow.getByRole('button', { name: '+ 추가' })
  await add.click()
  const conflict = page.getByRole('dialog', { name: '시간이 겹치는 회차입니다' })
  await expect(conflict).toBeVisible()
  await expect(conflict.getByRole('button', { name: '예매 대안 창 닫기' })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await assertFocusInside(page, 'dialog.booking-conflict-backdrop')
  await page.keyboard.press('Tab')
  await expect(conflict.getByRole('button', { name: '예매 대안 창 닫기' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(conflict).toHaveCount(0)
  await expect(filmDialog).toBeVisible()
  await expect(add).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(filmDialog).toHaveCount(0)
  await expect(opener).toBeFocused()
})

test('fallback apply dialog restores its trigger on Escape', async ({ page, request }) => {
  const [origin, candidate] = await overlappingPair(request)
  await page.addInitScript(({ selectedKey, statusKey, planKey, originId, candidateId }) => {
    localStorage.setItem(selectedKey, JSON.stringify([originId]))
    localStorage.setItem(statusKey, JSON.stringify({ [originId]: 'failed' }))
    localStorage.setItem(planKey, JSON.stringify({
      [originId]: { priority: 1 },
      [candidateId]: { priority: 2, fallbackFor: [originId] },
    }))
  }, { selectedKey: SELECTED_KEY, statusKey: STATUS_KEY, planKey: PLAN_KEY, originId: origin.screening.id, candidateId: candidate.screening.id })
  await page.goto('./')
  await page.getByRole('button', { name: '내 시간표' }).click()
  await page.getByRole('button', { name: '시간표', exact: true }).click()
  const panel = page.locator('.booking-plan-panel')
  await panel.locator('summary').click()
  const trigger = panel.locator('.booking-plan-item').filter({ hasText: candidate.film.title }).first().getByRole('button', { name: /시간표에 적용/ })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: '시간표에 적용하시겠습니까?' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: '대안 적용 창 닫기' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
})

test('custom event create and detail-to-edit transition keep focus inside', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: '내 시간표' }).click()
  await page.getByRole('button', { name: '시간표', exact: true }).click()
  const opener = page.getByRole('button', { name: /일정 추가|\+ 일정/ }).first()
  await opener.click()
  let dialog = page.getByRole('dialog', { name: '일정 추가' })
  const title = dialog.getByLabel('일정명 *')
  await expect(title).toBeFocused()
  await title.fill('초점 확인 일정')
  await dialog.getByRole('button', { name: '추가', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  const event = page.locator('.event-block.custom-event').filter({ hasText: '초점 확인 일정' }).first()
  await event.click()
  dialog = page.getByRole('dialog', { name: '초점 확인 일정' })
  await expect(dialog.getByRole('button', { name: '일정 창 닫기' })).toBeFocused()
  await dialog.getByRole('button', { name: '수정' }).click()
  dialog = page.getByRole('dialog', { name: '일정 수정' })
  await expect(dialog.getByLabel('일정명 *')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(event).toBeFocused()
})

test('mobile filters are modal and desktop filters remain inline', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  const trigger = page.getByRole('button', { name: /날짜·상영관·시간대/ })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: '상세 필터' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: '상세 필터 닫기' })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await assertFocusInside(page, 'dialog#film-advanced-filters')
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: '상세 필터 닫기' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()

  await page.setViewportSize({ width: 1024, height: 844 })
  await expect(page.locator('div#film-advanced-filters')).toBeVisible()
  await expect(page.getByRole('dialog', { name: '상세 필터' })).toHaveCount(0)
  await page.locator('div#film-advanced-filters').getByRole('combobox', { name: '날짜' }).selectOption({ index: 1 })
})
