import { test, expect, type Locator } from '@playwright/test'

const labels = ['10월 10일 토', '10월 11일 일', '10월 12일 월']

async function appearance(selector: Locator) {
  return selector.evaluate((element) => ({
    padding: getComputedStyle(element).padding,
    gap: getComputedStyle(element).gap,
    buttons: [...element.querySelectorAll('button')].map((button) => {
      const style = getComputedStyle(button)
      const before = getComputedStyle(button, '::before')
      const after = getComputedStyle(button, '::after')
      const range = document.createRange()
      range.selectNodeContents(button)
      const box = button.getBoundingClientRect()
      return {
        width: box.width, height: box.height, top: box.top,
        font: style.font, background: style.backgroundColor, color: style.color,
        border: style.borderColor, lines: range.getClientRects().length,
        glass: before.backgroundImage.includes('linear-gradient')
          && after.backgroundImage.includes('linear-gradient')
          && before.maskComposite.split(',').every(value => value.trim() === 'exclude'),
      }
    }),
  }))
}

for (const { width, theme } of [
  { width: 320, theme: 'light' }, { width: 393, theme: 'light' },
  { width: 768, theme: 'light' }, { width: 1440, theme: 'light' },
  { width: 393, theme: 'dark' },
] as const) {
  test(`shares single-line glass date controls at ${width}px in ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 852 })
    await page.emulateMedia({ colorScheme: theme })
    await page.addInitScript(() => {
      localStorage.setItem('biff-timetable:custom-events:v1', JSON.stringify(
        ['2026-10-10', '2026-10-11', '2026-10-12'].map((date, index) => ({
          id: `custom-date-${index}`, title: `날짜 선택 확인 ${index}`, date,
          start: '12:00', end: '13:00', category: 'personal',
        })),
      ))
      localStorage.setItem('biff-timetable:view-mode:v1', JSON.stringify('list'))
    })
    await page.goto('./')
    await expect(page.locator('.film-card').first()).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await page.locator(width <= 700 ? '.liquid-tab-bar' : '.tabs').getByRole('button', { name: '내 시간표' }).click()
    const list = page.getByRole('tablist', { name: '날짜별 시간표' })
    await expect(list.getByRole('tab')).toHaveText(labels)
    const listAppearance = await appearance(list)
    await list.getByRole('tab').nth(1).click()
    await expect(list.getByRole('tab').nth(1)).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tabpanel')).toContainText('10/11')
    await expect(page.getByRole('tabpanel')).toContainText('1개 일정')

    await page.locator('.timetable-view-switch').getByRole('button', { name: '시간표', exact: true }).click()
    if (width > 1023) await page.getByRole('button', { name: '하루 자세히', exact: true }).click()
    const grid = page.getByRole('group', { name: '시간표 날짜 선택', exact: true })
    const days = grid.getByRole('button')
    await expect(days).toHaveText(labels)
    const gridAppearance = await appearance(grid)
    expect(gridAppearance.padding).toBe(listAppearance.padding)
    expect(gridAppearance.gap).toBe(listAppearance.gap)
    for (let index = 0; index < labels.length; index += 1) {
      const a = listAppearance.buttons[index], b = gridAppearance.buttons[index]
      expect(Math.abs(a.width - b.width)).toBeLessThan(0.5)
      expect(a.height).toBe(b.height)
      expect(a.height).toBeGreaterThanOrEqual(44)
      expect(a.font).toBe(b.font)
      expect(a.background).toBe(b.background)
      expect(a.color).toBe(b.color)
      for (const item of [a, b]) {
        expect(item.border).toBe('rgba(0, 0, 0, 0)')
        expect(item.glass).toBe(true)
        expect(item.lines).toBe(1)
      }
      expect(a.top).toBe(listAppearance.buttons[0].top)
      expect(b.top).toBe(gridAppearance.buttons[0].top)
    }
    const target = days.nth(1)
    const before = await target.boundingBox()
    const color = await target.evaluate(button => getComputedStyle(button).backgroundColor)
    await target.hover()
    await page.mouse.down()
    await expect.poll(() => target.evaluate(button => getComputedStyle(button).backgroundColor)).not.toBe(color)
    expect(await target.boundingBox()).toEqual(before)
    await page.mouse.up()
    await expect(target).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.date-head')).toHaveText(labels[1])
    await days.first().focus()
    await days.first().press('End')
    await expect(days.last()).toHaveAttribute('aria-pressed', 'true')
    await expect(days.last()).toBeFocused()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0)
  })
}
