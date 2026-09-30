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

  // Surface entrance motion temporarily scales bounds; measure settled controls.
  await expect.poll(() => actions.evaluate((element) => element.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running').length)).toBe(0)
  const styles = await actions.evaluate((container) => {
    const switcher = container.querySelector('.timetable-view-switch')!
    const add = container.querySelector('.custom-event-add-button')!
    const more = container.querySelector('.timetable-more-menu > summary')!
    const controls = [
      ...switcher.querySelectorAll('button'),
      ...container.querySelectorAll(':scope > button:not(.custom-event-add-button):not(.timetable-empty-find-button)'),
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

  expect(styles.switcher.background).not.toBe('rgba(0, 0, 0, 0)')
  expect(styles.switcher.height).toBeCloseTo(styles.add.height, 0)
  for (const control of styles.controls) {
    expect(control.height).toBeGreaterThanOrEqual(36)
    expect(control.fontSize).toBeGreaterThanOrEqual(12)
    expect(control.radius).toBeGreaterThan(control.height / 2)
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

  expect(styles.switcher.background).not.toBe('rgba(0, 0, 0, 0)')
  expect(styles.switcher.height).toBeCloseTo(styles.add.height, 0)
  for (const control of styles.controls) {
    expect(control.height).toBeGreaterThanOrEqual(36)
    expect(control.fontSize).toBeGreaterThanOrEqual(12)
    expect(control.radius).toBeGreaterThan(control.height / 2)
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
  await expect(menuActions).toHaveCount(5)
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

test('empty timetable keeps its primary action and touch controls readable on small screens', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: '내 시간표' }).click()
  const actions = page.locator('.timetable-empty-actions')
  await expect(actions).toBeVisible()

  for (const width of [320, 390, 700, 1440]) {
    await page.setViewportSize({ width, height: 844 })
    await expect(actions).toHaveCSS('display', 'flex')
    if (width <= 700) {
      for (const selector of ['.timetable-view-switch button', '.timetable-empty-find-button', '.custom-event-add-button', '.timetable-empty-backup > summary']) {
        const height = await actions.locator(selector).first().evaluate((element) => element.getBoundingClientRect().height)
        expect(height).toBeGreaterThanOrEqual(selector.includes('switch') ? 36 : 44)
      }
    }
    const geometry = await actions.evaluate((container) => {
      const rect = (selector: string) => {
        const box = container.querySelector(selector)!.getBoundingClientRect()
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, height: box.height }
      }
      return {
        pageWidth: document.documentElement.scrollWidth,
        switcher: rect('.timetable-view-switch'),
        find: rect('.timetable-empty-find-button'),
        add: rect('.custom-event-add-button'),
        more: rect('.timetable-empty-backup > summary'),
        findBackground: getComputedStyle(container.querySelector('.timetable-empty-find-button')!).backgroundColor,
        addBackground: getComputedStyle(container.querySelector('.custom-event-add-button')!).backgroundColor,
      }
    })
    expect(geometry.pageWidth).toBeLessThanOrEqual(width)
    expect(geometry.findBackground).not.toBe(geometry.addBackground)
    if (width <= 700) {
      for (const control of [geometry.find, geometry.add, geometry.more]) expect(control.height).toBeGreaterThanOrEqual(44)
      expect(geometry.switcher.height).toBeGreaterThanOrEqual(44)
      expect(Math.abs(geometry.switcher.top - geometry.find.top)).toBeLessThanOrEqual(2)
      expect(geometry.find.top).toBe(geometry.add.top)
      expect(geometry.find.right).toBeLessThan(geometry.add.left)
      expect(geometry.more.top).toBe(geometry.find.top)
    }
  }

  await actions.getByRole('button', { name: '영화 찾기' }).click()
  await expect(page.getByRole('combobox', { name: '영화 검색' })).toBeVisible()
})

test('view switch keeps pressed state and persists the selected layout', async ({ page, request }) => {
  await seedTimetable(page, request)
  await page.goto('./')
  await page.getByRole('button', { name: '내 시간표' }).click()
  const switcher = page.getByRole('group', { name: '시간표 보기 방식' })
  await switcher.getByRole('button', { name: '시간표' }).click()
  await expect(switcher.getByRole('button', { name: '시간표' })).toHaveAttribute('aria-pressed', 'true')
  await expect(switcher.getByRole('button', { name: '목록' })).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('.timetable-scroll')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('group', { name: '시간표 보기 방식' }).getByRole('button', { name: '시간표' })).toHaveAttribute('aria-pressed', 'true')
  await switcher.getByRole('button', { name: '목록' }).click()
  await expect(page.locator('.schedule-list')).toBeVisible()
})

test('populated action row stays complete in normal and delete selection states', async ({ page, request }) => {
  await seedTimetable(page, request)
  await page.goto('./')
  await page.getByRole('button', { name: '내 시간표' }).click()

  for (const width of [320, 390, 402, 700]) {
    await page.setViewportSize({ width, height: 844 })
    const actions = page.locator('.timetable-action-buttons')
    await expect.poll(() => actions.evaluate((element) => element.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running').length)).toBe(0)
    const measure = async (selection: boolean) => actions.evaluate((container, isSelection) => {
      const selectors = isSelection
        ? ['.timetable-view-switch', '.timetable-selection-button', '.timetable-delete-button', '.timetable-more-menu > summary']
        : ['.timetable-view-switch', '.custom-event-add-button', '.timetable-selection-button', '.timetable-more-menu > summary']
      const boxes = selectors.map((selector) => container.querySelector(selector)!.getBoundingClientRect())
      return {
        tops: boxes.map((box) => Math.round(box.top)),
        left: Math.min(...boxes.map((box) => box.left)),
        right: Math.max(...boxes.map((box) => box.right)),
        minHeight: Math.min(...boxes.map((box) => box.height)),
        overflow: document.documentElement.scrollWidth - window.innerWidth,
      }
    }, selection)
    const normal = await measure(false)
    expect(new Set(normal.tops).size, `${width}px normal row`).toBe(1)
    expect(normal.left).toBeGreaterThanOrEqual(0)
    expect(normal.right).toBeLessThanOrEqual(width)
    expect(normal.minHeight).toBeGreaterThanOrEqual(44)
    expect(normal.overflow).toBeLessThanOrEqual(1)

    await actions.getByRole('button', { name: '선택', exact: true }).click()
    await expect(actions.getByRole('button', { name: '선택 취소' })).toHaveText('취소')
    await expect(actions.locator(':scope > .custom-event-add-button')).toBeHidden()
    const selected = await measure(true)
    expect(new Set(selected.tops).size, `${width}px delete row`).toBe(1)
    expect(selected.right).toBeLessThanOrEqual(width)
    expect(selected.minHeight).toBeGreaterThanOrEqual(44)
    expect(selected.overflow).toBeLessThanOrEqual(1)
    const more = actions.locator('.timetable-more-menu')
    await more.locator(':scope > summary').click()
    await expect(more.getByRole('button', { name: 'PNG 저장' })).toBeVisible()
    await expect(more.getByRole('button', { name: '일정 추가' })).toBeVisible()
    await more.locator(':scope > summary').click()
    await actions.getByRole('button', { name: '선택 취소' }).click()
  }
})
