import { expect, test, type Locator, type Page } from '@playwright/test'

const SELECTED_KEY = 'biff-timetable:selected-screenings:v1'
const STATUS_KEY = 'biff-timetable:ticket-status:v1'

type FilmData = { films: Array<{ screenings: Array<{ id: string }> }> }

async function expectLabelsInStraightCenter(control: Locator) {
  const geometry = await control.evaluate((element) => {
    const box = element.getBoundingClientRect()
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    const boxes: DOMRect[] = []
    while (walker.nextNode()) {
      if (!walker.currentNode.textContent?.trim()) continue
      const range = document.createRange()
      range.selectNodeContents(walker.currentNode)
      boxes.push(range.getBoundingClientRect())
    }
    return {
      height: box.height,
      leftGap: Math.min(...boxes.map((text) => text.left)) - box.left,
      rightGap: box.right - Math.max(...boxes.map((text) => text.right)),
      radius: Number.parseFloat(getComputedStyle(element).borderRadius),
      compactToolbar: window.innerWidth <= 700 && Boolean(element.closest('.timetable-empty-actions, .timetable-action-buttons')) && !element.closest('.timetable-more-menu > div'),
    }
  })
  expect(geometry.height).toBeGreaterThanOrEqual(44)
  expect(geometry.radius).toBeGreaterThanOrEqual(geometry.height / 2)
  const minimumGap = geometry.compactToolbar ? 4 : geometry.height / 2 - 1
  expect(geometry.leftGap).toBeGreaterThanOrEqual(minimumGap)
  expect(geometry.rightGap).toBeGreaterThanOrEqual(minimumGap)
}

async function expectFloatingMenuInViewport(menu: Locator) {
  const bounds = await menu.evaluate((element) => {
    const boxes = [element, ...element.querySelectorAll('button')]
      .map((control) => control.getBoundingClientRect()).filter((box) => box.width > 0 && box.height > 0)
    return { left: Math.min(...boxes.map((box) => box.left)), right: Math.max(...boxes.map((box) => box.right)), width: window.innerWidth }
  })
  expect(bounds.left).toBeGreaterThanOrEqual(-1)
  expect(bounds.right).toBeLessThanOrEqual(bounds.width + 1)
}

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

for (const width of [390, 1440]) {
  test(`centers the more-menu label in empty and populated timetables at ${width}px`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 })
    const checkLabel = async () => {
      const summary = page.locator('.timetable-more-menu > summary')
      await expect(summary).toBeVisible()
      await expect.poll(() => summary.evaluate((element) => {
        const control = element.getBoundingClientRect()
        const range = document.createRange()
        range.selectNodeContents(element)
        const text = range.getBoundingClientRect()
        return Math.max(
          Math.abs(text.x + text.width / 2 - control.x - control.width / 2),
          Math.abs(text.y + text.height / 2 - control.y - control.height / 2),
        )
      })).toBeLessThanOrEqual(2)
    }
    await page.goto('./')
    await page.getByRole('button', { name: '내 시간표' }).click()
    await checkLabel()
    await seedTimetable(page, request)
    await page.reload()
    await page.getByRole('button', { name: '내 시간표' }).click()
    await checkLabel()
  })
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
    expect(control.height).toBeGreaterThanOrEqual(44)
    expect(control.fontSize).toBeGreaterThanOrEqual(12)
  }
  await expectLabelsInStraightCenter(actions.locator('.timetable-view-switch'))
  await expectLabelsInStraightCenter(actions.locator('.custom-event-add-button'))
  await expectLabelsInStraightCenter(actions.locator('.timetable-more-menu > summary'))
  const moreStyle = styles.controls[styles.controls.length - 1]
  expect(moreStyle.background).toBe(styles.add.background)
  expect(moreStyle.color).toBe(styles.add.color)

  const more = actions.locator('.timetable-more-menu')
  await more.locator(':scope > summary').click()
  await expect(more).toHaveAttribute('open', '')
  const menuBackground = await more.locator(':scope > div').evaluate((element) => getComputedStyle(element).backgroundColor)
  expect(menuBackground).not.toBe('rgb(255, 255, 255)')
  await expectFloatingMenuInViewport(more.locator(':scope > div'))
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
    expect(control.height).toBeGreaterThanOrEqual(44)
    expect(control.fontSize).toBeGreaterThanOrEqual(12)
  }
  await expectLabelsInStraightCenter(actions.locator('.timetable-view-switch'))
  await expectLabelsInStraightCenter(actions.locator('.custom-event-add-button'))
  await expectLabelsInStraightCenter(actions.locator('.timetable-more-menu > summary'))
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
  await expectFloatingMenuInViewport(more.locator(':scope > div'))

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
      const controls = [geometry.switcher, geometry.find, geometry.add, geometry.more]
      expect(Math.max(...controls.map((control) => control.top)) - Math.min(...controls.map((control) => control.top))).toBeLessThanOrEqual(1)
      for (const [index, control] of controls.entries()) {
        expect(control.left).toBeGreaterThanOrEqual(0)
        expect(control.right).toBeLessThanOrEqual(width)
        for (const other of controls.slice(index + 1)) {
          const overlaps = Math.min(control.right, other.right) > Math.max(control.left, other.left) + 1
            && Math.min(control.bottom, other.bottom) > Math.max(control.top, other.top) + 1
          expect(overlaps).toBe(false)
        }
      }
    }
    for (const selector of ['.timetable-view-switch', '.timetable-empty-find-button', '.custom-event-add-button', '.timetable-empty-backup > summary']) {
      await expectLabelsInStraightCenter(actions.locator(selector))
    }
    await actions.locator('.timetable-empty-backup > summary').click()
    await expectFloatingMenuInViewport(actions.locator('.timetable-empty-backup > div'))
    await actions.locator('.timetable-empty-backup > summary').click()
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

  for (const width of [320, 360, 390, 430, 700]) {
    await page.setViewportSize({ width, height: 844 })
    const actions = page.locator('.timetable-action-buttons')
    await expect.poll(() => actions.evaluate((element) => element.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running').length)).toBe(0)
    const measure = async (selection: boolean) => actions.evaluate((container, isSelection) => {
      const selectors = isSelection
        ? ['.timetable-view-switch', '.timetable-selection-button', '.timetable-delete-button', '.timetable-more-menu > summary']
        : ['.timetable-view-switch', '.custom-event-add-button', '.timetable-selection-button', '.timetable-more-menu > summary']
      const boxes = selectors.map((selector) => container.querySelector(selector)!.getBoundingClientRect())
      return {
        overlap: boxes.some((box, index) => boxes.slice(index + 1).some((other) => (
          Math.min(box.right, other.right) > Math.max(box.left, other.left) + 1
          && Math.min(box.bottom, other.bottom) > Math.max(box.top, other.top) + 1
        ))),
        left: Math.min(...boxes.map((box) => box.left)),
        right: Math.max(...boxes.map((box) => box.right)),
        minHeight: Math.min(...boxes.map((box) => box.height)),
        minWidth: Math.min(...boxes.map((box) => box.width)),
        rowSpread: Math.max(...boxes.map((box) => box.top)) - Math.min(...boxes.map((box) => box.top)),
        overflow: document.documentElement.scrollWidth - window.innerWidth,
      }
    }, selection)
    const normal = await measure(false)
    expect(normal.overlap, `${width}px normal controls`).toBe(false)
    expect(normal.left).toBeGreaterThanOrEqual(0)
    expect(normal.right).toBeLessThanOrEqual(width)
    expect(normal.minHeight).toBeGreaterThanOrEqual(44)
    expect(normal.minWidth).toBeGreaterThanOrEqual(44)
    expect(normal.rowSpread).toBeLessThanOrEqual(1)
    expect(normal.overflow).toBeLessThanOrEqual(1)

    await actions.getByRole('button', { name: '선택', exact: true }).click()
    await expect(actions.getByRole('button', { name: '선택 취소' })).toHaveText('취소')
    await expect(actions.locator(':scope > .custom-event-add-button')).toBeHidden()
    const selected = await measure(true)
    expect(selected.overlap, `${width}px delete controls`).toBe(false)
    expect(selected.right).toBeLessThanOrEqual(width)
    expect(selected.minHeight).toBeGreaterThanOrEqual(44)
    expect(selected.minWidth).toBeGreaterThanOrEqual(44)
    expect(selected.rowSpread).toBeLessThanOrEqual(1)
    expect(selected.overflow).toBeLessThanOrEqual(1)
    const more = actions.locator('.timetable-more-menu')
    await more.locator(':scope > summary').click()
    await expect(more.getByRole('button', { name: 'PNG 저장' })).toBeVisible()
    await expect(more.getByRole('button', { name: '일정 추가' })).toBeVisible()
    await expectFloatingMenuInViewport(more.locator(':scope > div'))
    await more.locator(':scope > summary').click()
    await actions.getByRole('button', { name: '선택 취소' }).click()
  }
})

for (const colorScheme of ['light', 'dark'] as const) {
  test(`toolbar capsule shares the adjacent glass material in ${colorScheme} mode`, async ({ page, request }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
    await seedTimetable(page, request)
    await page.goto('./')
    await page.getByRole('button', { name: '내 시간표' }).click()
    const actions = page.locator('.timetable-action-buttons')
    for (const width of [320, 360, 390, 430, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      const material = await actions.evaluate((container) => {
        const capsule = container.querySelector('.timetable-view-switch')!
        const neighbor = container.querySelector('.custom-event-add-button')!
        const style = getComputedStyle(capsule)
        const adjacent = getComputedStyle(neighbor)
        const visible = [...container.children].filter((element) => element.getBoundingClientRect().width > 0)
        const bounds = visible.map((element) => element.getBoundingClientRect())
        return {
          background: style.backgroundColor,
          adjacentBackground: adjacent.backgroundColor,
          backdrop: style.backdropFilter || style.getPropertyValue('-webkit-backdrop-filter'),
          adjacentBackdrop: adjacent.backdropFilter || adjacent.getPropertyValue('-webkit-backdrop-filter'),
          shadow: style.boxShadow,
          adjacentShadow: adjacent.boxShadow,
          rim: getComputedStyle(capsule, '::before').backgroundImage,
          divider: getComputedStyle(capsule.querySelector('button')!, '::after').display,
          rowSpread: Math.max(...bounds.map((box) => box.top)) - Math.min(...bounds.map((box) => box.top)),
          right: Math.max(...bounds.map((box) => box.right)),
        }
      })
      expect(material.background, `${width}px material`).toBe(material.adjacentBackground)
      expect(material.backdrop).toBe(material.adjacentBackdrop)
      expect(material.shadow).toBe(material.adjacentShadow)
      expect(material.rim).toContain('linear-gradient')
      expect(material.divider).toBe('block')
      expect(material.rowSpread).toBeLessThanOrEqual(1)
      expect(material.right).toBeLessThanOrEqual(width)
    }
  })
}
