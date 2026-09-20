import { expect, test, type Page } from '@playwright/test'

const viewports = [
  { width: 320, height: 740, gutter: 10, radius: 20 },
  { width: 390, height: 844, gutter: 10, radius: 20 },
  { width: 768, height: 1024, gutter: 18, radius: 22 },
  { width: 1280, height: 900, gutter: 24, radius: 22 },
] as const

const sections = [
  { label: '영화 찾기', selector: '.app-page--films .film-data-notice, .app-page--films #film-controls' },
  { label: '내 시간표', selector: '.app-page--timetable .timetable-empty, .app-page--timetable .enhanced-timetable-actions' },
  { label: 'AI 도슨트', selector: '.app-page--curator .curator-hero' },
  { label: '설정', selector: '.app-page--settings .settings-intro' },
] as const

async function openSection(page: Page, label: string) {
  const navigation = page.locator('.tabs:visible, .liquid-tab-bar:visible')
  await navigation.getByRole('button', { name: label, exact: true }).click()
}

for (const viewport of viewports) {
  test(`keeps one layout contract at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('./')

    const expectedShellWidth = Math.min(viewport.width, 1180)
    const expectedSurfaceX = (viewport.width - expectedShellWidth) / 2 + viewport.gutter
    const expectedSurfaceWidth = expectedShellWidth - viewport.gutter * 2
    const topGaps: number[] = []

    for (const section of sections) {
      await openSection(page, section.label)
      const surface = page.locator(section.selector).first()
      await expect(surface).toBeVisible()
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)

      const metrics = await surface.evaluate((element) => {
        const header = document.querySelector<HTMLElement>('.topbar')
        const rect = element.getBoundingClientRect()
        if (!header) throw new Error('Missing app header')
        return {
          x: rect.x,
          width: rect.width,
          radius: Number.parseFloat(getComputedStyle(element).borderRadius),
          topGap: rect.top - header.getBoundingClientRect().bottom,
          overflow: document.documentElement.scrollWidth - window.innerWidth,
        }
      })

      expect(Math.abs(metrics.x - expectedSurfaceX), `${viewport.width}px ${section.label} gutter`).toBeLessThanOrEqual(1)
      expect(Math.abs(metrics.width - expectedSurfaceWidth), `${viewport.width}px ${section.label} width`).toBeLessThanOrEqual(2)
      expect(metrics.radius, `${viewport.width}px ${section.label} radius`).toBe(viewport.radius)
      expect(metrics.overflow, `${viewport.width}px ${section.label} overflow`).toBeLessThanOrEqual(1)
      topGaps.push(metrics.topGap)
    }

    expect(
      Math.max(...topGaps) - Math.min(...topGaps),
      `${viewport.width}x${viewport.height} top gaps: ${topGaps.join(', ')}`,
    ).toBeLessThanOrEqual(4)
  })
}
