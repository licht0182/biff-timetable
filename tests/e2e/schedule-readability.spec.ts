import { expect, test } from '@playwright/test'

test('keeps a populated schedule readable in both appearances', async ({ page, request }) => {
  const response = await request.get('./screenings.json')
  expect(response.ok()).toBeTruthy()
  const data = await response.json() as { films: { screenings: { id: string; date: string }[] }[] }
  const selected = data.films.flatMap((film) => film.screenings.filter((screening) => screening.date === '2026-10-11').slice(0, 1)).slice(0, 6).map((screening) => screening.id)
  expect(selected).toHaveLength(6)
  await page.addInitScript((ids) => {
    localStorage.setItem('biff-timetable:selected-screenings:v1', JSON.stringify(ids))
  }, selected)
  await page.setViewportSize({ width: 390, height: 844 })

  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme })
    await page.goto('./')
    await page.getByRole('button', { name: '내 시간표' }).first().click()
    await expect(page.locator('.schedule-list-row')).toHaveCount(6)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
  }

  const contrast = await page.evaluate(() => {
    const color = (element: Element, property: 'color' | 'backgroundColor') => {
      const numbers = getComputedStyle(element)[property].match(/[\d.]+/g)?.slice(0, 3).map(Number)
      if (!numbers || numbers.length !== 3) throw new Error(`색상을 읽을 수 없습니다: ${property}`)
      return numbers
    }
    const luminance = (rgb: number[]) => {
      const linear = rgb.map((channel) => {
        const value = channel / 255
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
    }
    const ratio = (textSelector: string, surfaceSelector: string) => {
      const text = document.querySelector(textSelector)
      const surface = document.querySelector(surfaceSelector)
      if (!text || !surface) throw new Error(`시간표 요소가 없습니다: ${textSelector}`)
      const foreground = luminance(color(text, 'color'))
      const background = luminance(color(surface, 'backgroundColor'))
      return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
    }
    return {
      date: ratio('.schedule-list-day>h2', 'body'),
      count: ratio('.schedule-list-day>h2 small', 'body'),
      conflict: ratio('.schedule-screening-group.has-conflict>h3', '.schedule-screening-group.has-conflict'),
      time: ratio('.schedule-list-time strong', '.schedule-list-row'),
      endTime: ratio('.schedule-list-time span', '.schedule-list-row'),
      venue: ratio('.schedule-list-copy>span:not(.schedule-row-badges)', '.schedule-list-row'),
      badge: ratio('.schedule-screening-group.has-conflict>h3 span', '.schedule-screening-group.has-conflict>h3 span'),
    }
  })
  for (const [name, ratio] of Object.entries(contrast)) {
    expect(ratio, `${name} 대비`).toBeGreaterThanOrEqual(4.5)
  }
})
