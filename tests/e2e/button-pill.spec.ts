import { expect, test } from '@playwright/test'

for (const width of [390, 1280]) {
  test(`centers pill buttons while retaining curator cards at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('./')
    await expect(page.locator('.film-card').first()).toBeVisible({ timeout: 15_000 })
    if (width > 700) {
      await expect(page.locator('.mobile-advanced-filter-toggle')).toBeHidden()
      await expect(page.locator('.mobile-filter-jump')).toBeHidden()
    }
    const shapes = await page.locator('button:visible').evaluateAll((elements) => elements.filter((element) => element.isConnected).map((element) => {
      const style = getComputedStyle(element)
      const bounds = element.getBoundingClientRect()
      return { name: element.textContent?.trim(), radius: Number.parseFloat(style.borderTopLeftRadius), shortestSide: Math.min(bounds.width, bounds.height), align: style.alignItems, justify: style.justifyContent }
    }).filter((button) => button.shortestSide > 0))
    expect(shapes.length).toBeGreaterThan(10)
    for (const button of shapes) {
      expect(button.radius, button.name).toBeGreaterThanOrEqual(button.shortestSide / 2 - 1)
      expect(button.align, button.name).toBe('center')
      expect(button.justify, button.name).toBe('center')
    }
    const navigation = page.locator('.tabs:visible, .liquid-tab-bar:visible')
    await navigation.getByRole('button', { name: 'AI 도슨트', exact: true }).click()
    const card = page.locator('.curator-card').first()
    await expect(card).toBeVisible()
    const cardStyle = await card.evaluate((element) => {
      const style = getComputedStyle(element)
      const bounds = element.getBoundingClientRect()
      return { radius: Number.parseFloat(style.borderTopLeftRadius), shortestSide: Math.min(bounds.width, bounds.height), align: style.textAlign }
    })
    expect(cardStyle.radius).toBeLessThan(cardStyle.shortestSide / 2)
    expect(cardStyle.align).toBe('left')
    for (const selector of ['.curator-featured-card', '.curator-card']) {
      const target = page.locator(selector).first()
      if (!await target.isVisible()) continue
      await page.mouse.move(0, 0)
      const shadow = await target.evaluate((element) => getComputedStyle(element).boxShadow)
      await target.hover()
      await expect(target).toHaveCSS('box-shadow', shadow)
      await expect(target).toHaveCSS('transform', 'none')
    }
    await card.click()
    await expect(page.locator('.curator-article')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  })
}

test('retains agenda and timetable card geometry and details', async ({ page, request }) => {
  const response = await request.get('./screenings.json')
  expect(response.ok()).toBeTruthy()
  const data = await response.json() as { films: Array<{ screenings: Array<{ id: string }> }> }
  await page.addInitScript((id) => localStorage.setItem('biff-timetable:selected-screenings:v1', JSON.stringify([id])), data.films.flatMap((film) => film.screenings)[0].id)
  await page.goto('./')
  await page.getByRole('button', { name: '내 시간표' }).click()
  const agenda = page.locator('.schedule-list-main').first()
  await expect(agenda).toHaveCSS('display', 'grid')
  await expect(agenda).toHaveCSS('text-align', 'left')
  await page.getByRole('group', { name: '시간표 보기 방식' }).getByRole('button', { name: '시간표', exact: true }).click()
  const block = page.locator('.event-block').first()
  await expect(block).toBeVisible()
  await expect(block).toHaveCSS('display', 'block')
  await expect(block).toHaveCSS('text-align', 'left')
  const geometry = await block.evaluate((element) => ({ radius: Number.parseFloat(getComputedStyle(element).borderTopLeftRadius), width: element.clientWidth, height: element.clientHeight }))
  expect(geometry.radius).toBeLessThan(Math.min(geometry.width, geometry.height) / 2)
  await block.click()
  await expect(page.getByRole('dialog')).toBeVisible()
})

for (const width of [390, 1280]) {
  test(`uses color feedback without resizing buttons at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('./')
    const button = page.locator('.favorite-button').first()
    await expect(button).toBeVisible({ timeout: 15_000 })
    await page.mouse.move(0, 0)
    const measure = () => button.evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return { width: bounds.width, height: bounds.height, x: bounds.x, y: bounds.y, transform: style.transform, background: style.backgroundColor, transition: style.transitionProperty }
    })
    const before = await measure()
    await button.hover()
    await page.mouse.down()
    await expect.poll(() => button.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(before.background)
    await expect(button).toHaveCSS('filter', 'none')
    const pressed = await measure()
    expect(pressed.transform).toBe('none')
    expect(pressed.transition).not.toMatch(/transform|scale|all/)
    for (const key of ['width', 'height', 'x', 'y'] as const) expect(pressed[key]).toBeCloseTo(before[key], 1)
    await page.mouse.up()
    await expect(button).toHaveClass(/active/)
    await page.mouse.move(0, 0)
    const released = await measure()
    for (const key of ['width', 'height', 'x', 'y'] as const) expect(released[key]).toBeCloseTo(before[key], 1)
  })
}
