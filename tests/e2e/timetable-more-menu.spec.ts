import { expect, test, type Page } from '@playwright/test'

const SELECTED_KEY = 'biff-timetable:selected-screenings:v1'
const STATUS_KEY = 'biff-timetable:ticket-status:v1'

type FilmData = { films: Array<{ screenings: Array<{ id: string }> }> }

async function seedTimetable(page: Page, request: any) {
  const response = await request.get('./screenings.json')
  expect(response.ok()).toBeTruthy()
  const data = await response.json() as FilmData
  const id = data.films.flatMap((film) => film.screenings)[0]?.id
  test.skip(!id, '상영 회차 데이터가 없습니다.')
  await page.addInitScript(({ selectedKey, statusKey, screeningId }) => {
    localStorage.setItem(selectedKey, JSON.stringify([screeningId]))
    localStorage.setItem(statusKey, JSON.stringify({ [screeningId]: 'planned' }))
  }, { selectedKey: SELECTED_KEY, statusKey: STATUS_KEY, screeningId: id })
}

test('empty timetable controls share font-relative chip geometry and dark material', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('./')
  await page.getByRole('button', { name: '내 시간표' }).click()

  const actions = page.locator('.timetable-empty-actions')
  await expect(actions).toBeVisible()
  const styles = await actions.evaluate((container) => {
    const switcher = container.querySelector('.timetable-view-switch')!
    const add = container.querySelector('.custom-event-add-button')!
    const more = container.querySelector('.timetable-more-menu > summary')!
    const controls = [
      ...switcher.querySelectorAll('button'),
      ...container.querySelectorAll(':scope > button:not(.custom-event-add-button)'),
      more,
    ]
    const styleOf = (element: Element) => {
      const style = getComputedStyle(element)
      return {
        height: element.getBoundingClientRect().height,
        fontSize: Number.parseFloat(style.fontSize),
        paddingBlock: Number.parseFloat(style.paddingTop),
        paddingInline: Number.parseFloat(style.paddingLeft),
        radius: Number.parseFloat(style.borderRadius),
        border: style.borderColor,
        rim: getComputedStyle(element, '::before').backgroundImage,
        background: style.backgroundColor,
        color: style.color,
      }
    }
    return { switcher: styleOf(switcher), add: styleOf(add), controls: controls.map(styleOf) }
  })

  expect(styles.switcher.background).not.toBe('rgb(247, 247, 247)')
  expect(styles.switcher.background).not.toBe('rgb(255, 255, 255)')
  expect(styles.switcher.height).toBeCloseTo(styles.add.height, 0)
  for (const control of styles.controls) {
    expect(control.height).toBeGreaterThanOrEqual(control.fontSize * 3.6 - 1)
    expect(control.paddingBlock / control.fontSize).toBeCloseTo(styles.add.paddingBlock / styles.add.fontSize, 2)
    expect(control.paddingInline / control.fontSize).toBeCloseTo(styles.add.paddingInline / styles.add.fontSize, 2)
    expect(control.radius).toBeGreaterThan(control.height / 2)
    expect(control.border).toBe(styles.add.border)
    expect(control.rim).toBe(styles.add.rim)
  }
  const moreStyle = styles.controls[styles.controls.length - 1]
  expect(moreStyle.background).toBe(styles.add.background)
  expect(moreStyle.color).toBe(styles.add.color)

  const more = actions.locator('.timetable-more-menu')
  await more.locator(':scope > summary').click()
  await expect(more).toHaveAttribute('open', '')
  const menuBackground = await more.locator(':scope > div').evaluate((element) => getComputedStyle(element).backgroundColor)
  expect(menuBackground).not.toBe('rgb(255, 255, 255)')
})

test('populated timetable controls keep the shared dark chip geometry', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ colorScheme: 'dark' })
  await seedTimetable(page, request)
  await page.goto('./')
  await page.getByRole('button', { name: '내 시간표' }).click()

  const actions = page.locator('.timetable-action-buttons')
  await expect(actions).toBeVisible()
  const styles = await actions.evaluate((container) => {
    const switcher = container.querySelector('.timetable-view-switch')!
    const add = container.querySelector('.custom-event-add-button')!
    const more = container.querySelector('.timetable-more-menu > summary')!
    const styleOf = (element: Element) => {
      const style = getComputedStyle(element)
      return {
        height: element.getBoundingClientRect().height,
        fontSize: Number.parseFloat(style.fontSize),
        paddingBlock: Number.parseFloat(style.paddingTop),
        paddingInline: Number.parseFloat(style.paddingLeft),
        radius: Number.parseFloat(style.borderRadius),
        border: style.borderColor,
        rim: getComputedStyle(element, '::before').backgroundImage,
        background: style.backgroundColor,
        color: style.color,
      }
    }
    return { switcher: styleOf(switcher), add: styleOf(add), controls: [...switcher.querySelectorAll('button'), more].map(styleOf) }
  })

  expect(styles.switcher.background).not.toBe('rgb(247, 247, 247)')
  expect(styles.switcher.height).toBeCloseTo(styles.add.height, 0)
  for (const control of styles.controls) {
    expect(control.height).toBeGreaterThanOrEqual(control.fontSize * 3.6 - 1)
    expect(control.paddingBlock / control.fontSize).toBeCloseTo(styles.add.paddingBlock / styles.add.fontSize, 2)
    expect(control.paddingInline / control.fontSize).toBeCloseTo(styles.add.paddingInline / styles.add.fontSize, 2)
    expect(control.radius).toBeGreaterThan(control.height / 2)
    expect(control.border).toBe(styles.add.border)
    expect(control.rim).toBe(styles.add.rim)
  }
  const moreStyle = styles.controls[styles.controls.length - 1]
  expect(moreStyle.background).toBe(styles.add.background)
  expect(moreStyle.color).toBe(styles.add.color)
})

test('toggles calendar, backup, and clear-all inside the timetable more menu without resizing the timetable', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await seedTimetable(page, request)
  await page.goto('./')
  await page.getByRole('button', { name: '내 시간표' }).click()
  await page.getByRole('button', { name: '시간표', exact: true }).click()

  // The timetable has fixed hour geometry and remains in normal document flow.
  // Wait for its rendered geometry before attributing any size change to the menu.
  await expect(page.locator('.timetable')).toBeVisible()
  await expect(page.locator('.app-shell')).not.toHaveClass(/timetable-viewport-stable/)
  await expect.poll(() => page.locator('.timetable').evaluate((element) => Number.parseFloat(getComputedStyle(element).getPropertyValue('--hour-height')))).toBe(40)

  const actions = page.locator('.timetable-action-buttons')
  const more = actions.locator('.backup-menu.timetable-more-menu')
  const summary = more.locator(':scope > summary')
  const menuActions = more.locator(':scope > div > button')
  const calendar = more.getByRole('button', { name: '캘린더' })
  const clearAll = more.getByRole('button', { name: '전체 비우기' })
  const saveBackup = more.getByRole('button', { name: 'JSON 저장' })
  const importBackup = more.getByRole('button', { name: 'JSON 가져오기' })
  const timetable = page.locator('.timetable-scroll')

  await expect(summary).toHaveText('더보기')
  await expect(summary).toHaveAttribute('aria-label', '더보기 메뉴 열기')
  await expect(calendar).toBeHidden()
  await expect(clearAll).toBeHidden()
  await expect(menuActions).toHaveCount(4)
  await expect(saveBackup).toBeHidden()
  await expect(importBackup).toBeHidden()

  const beforeHeight = (await timetable.boundingBox())?.height ?? 0
  await summary.click()

  await expect(more).toHaveAttribute('open', '')
  await expect(summary).toHaveAttribute('aria-label', '더보기 메뉴 닫기')
  await expect(calendar).toBeVisible()
  await expect(clearAll).toBeVisible()
  await expect(saveBackup).toBeVisible()
  await expect(importBackup).toBeVisible()

  const afterOpenHeight = (await timetable.boundingBox())?.height ?? 0
  expect(Math.abs(afterOpenHeight - beforeHeight)).toBeLessThanOrEqual(1)

  await summary.click()
  await expect(more).not.toHaveAttribute('open', '')
  await expect(summary).toHaveAttribute('aria-label', '더보기 메뉴 열기')
  await expect(calendar).toBeHidden()
  await expect(clearAll).toBeHidden()
  await expect(saveBackup).toBeHidden()
  await expect(importBackup).toBeHidden()

  const afterCloseHeight = (await timetable.boundingBox())?.height ?? 0
  expect(Math.abs(afterCloseHeight - beforeHeight)).toBeLessThanOrEqual(1)
})
