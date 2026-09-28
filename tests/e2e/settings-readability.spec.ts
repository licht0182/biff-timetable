import { expect, test, type Page } from '@playwright/test'

async function openSettings(page: Page) {
  await page.goto('./')
  await page.locator('.tabs:visible, .liquid-tab-bar:visible').getByRole('button', { name: '설정', exact: true }).click()
  await expect(page.locator('.app-page--settings')).toBeVisible()
}

for (const width of [320, 390, 700, 1024, 1440]) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`settings stay legible and locally scrollable at ${width}px in ${scheme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 740 })
      await page.emulateMedia({ colorScheme: scheme })
      await openSettings(page)

      const metrics = await page.evaluate(() => {
        const style = (selector: string) => getComputedStyle(document.querySelector<HTMLElement>(selector)!)
        const size = (selector: string) => Number.parseFloat(style(selector).fontSize)
        const matrix = document.querySelector<HTMLElement>('.travel-matrix-wrap')!
        const firstRow = document.querySelector<HTMLElement>('.travel-matrix tbody th')!
        const firstColumn = document.querySelector<HTMLElement>('.travel-matrix thead th')!
        const before = firstRow.getBoundingClientRect().left
        matrix.scrollLeft = matrix.scrollWidth
        return {
          sizes: [
            size('.settings-card-head p'),
            size('.precise-transfer-note'),
            size('.settings-number-row small'),
            size('.travel-matrix td'),
          ],
          rowHeaderScope: firstRow.getAttribute('scope'),
          columnHeaderScope: document.querySelector('.travel-matrix thead th')?.getAttribute('scope'),
          textColor: style('.settings-number-row small').color,
          matrixTextColor: style('.travel-matrix td').color,
          pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
          matrixOverflow: matrix.scrollWidth - matrix.clientWidth,
          matrixScrolled: matrix.scrollLeft,
          stickyDrift: Math.abs(firstRow.getBoundingClientRect().left - before),
          stickyBackgrounds: [getComputedStyle(firstColumn).backgroundColor, getComputedStyle(firstRow).backgroundColor],
          resetHeight: document.querySelector<HTMLElement>('.settings-reset-button')!.getBoundingClientRect().height,
        }
      })
      for (const fontSize of metrics.sizes) expect(fontSize).toBeGreaterThanOrEqual(12)
      expect(metrics.rowHeaderScope).toBe('row')
      expect(metrics.columnHeaderScope).toBe('col')
      expect(metrics.pageOverflow).toBeLessThanOrEqual(1)
      expect(metrics.resetHeight).toBeGreaterThanOrEqual(44)
      expect(metrics.textColor).not.toBe('rgb(153, 153, 153)')
      expect(metrics.matrixTextColor).not.toBe('rgb(153, 153, 153)')
      for (const background of metrics.stickyBackgrounds) {
        const alpha = background.match(/^rgba?\(([^)]+)\)$/)?.[1]?.split(',').map(Number)[3] ?? 1
        expect(alpha, `sticky first-column background: ${background}`).toBe(1)
      }
      if (metrics.matrixOverflow > 1) {
        expect(metrics.matrixScrolled).toBeGreaterThan(1)
        expect(metrics.stickyDrift).toBeLessThanOrEqual(2)
      }
    })
  }
}

test('settings toggles and reset remain reachable above the dock', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 })
  await openSettings(page)
  const row = page.locator('.settings-toggle-row').first()
  const toggle = row.locator('input[type="checkbox"]')
  const initial = await toggle.isChecked()
  await row.click()
  expect(await toggle.isChecked()).toBe(!initial)

  const reset = page.getByRole('button', { name: '기본값으로 초기화' })
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await expect(reset).toBeInViewport()
  const separation = await page.evaluate(() => {
    const button = document.querySelector<HTMLElement>('.settings-reset-button')!
    const dock = document.querySelector<HTMLElement>('.liquid-tab-bar')!
    return dock.getBoundingClientRect().top - button.getBoundingClientRect().bottom
  })
  expect(separation).toBeGreaterThanOrEqual(0)
  await reset.click()
  expect(await toggle.isChecked()).toBe(initial)
})

test('keyboard focus can scroll the transfer matrix horizontally', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await openSettings(page)
  const matrix = page.locator('.travel-matrix-wrap[aria-label="상영관 이동시간 표, 좌우로 스크롤"]')
  await expect(matrix).toHaveAttribute('tabindex', '0')
  await matrix.focus()
  await expect(matrix).toBeFocused()
  await expect.poll(() => matrix.evaluate((element) => element.scrollLeft)).toBe(0)
  await matrix.press('ArrowRight')
  await expect.poll(() => matrix.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
})
