import { expect, test } from '@playwright/test'

const OFFICIAL_UPDATE_URL = 'https://www.biff.kr/kor/artyboard/mboard.asp?Action=view&intSeq=102705&strBoardID=9611_03'

for (const width of [390, 1440]) {
  test(`official update link follows the search controls at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('./')

    const search = page.getByRole('combobox', { name: '영화 검색' })
    const ribbon = page.getByRole('complementary', { name: 'BIFF 공식 상영·행사 변경 안내' })
    await expect(search).toBeVisible()
    await expect(ribbon).toContainText('추가 상영·GV·프로그램 행사 변경사항')
    const link = ribbon.getByRole('link', { name: /변경 안내 보기/ })
    await expect(link).toHaveAttribute('href', OFFICIAL_UPDATE_URL)
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', /noopener/)

    const positions = await page.evaluate(() => {
      const searchBox = document.querySelector('[aria-label="영화 검색"]')?.getBoundingClientRect()
      const ribbonBox = document.querySelector('.official-update-ribbon')?.getBoundingClientRect()
      return { searchTop: searchBox?.top ?? Number.NaN, ribbonTop: ribbonBox?.top ?? Number.NaN, overflow: document.documentElement.scrollWidth - window.innerWidth }
    })
    expect(positions.searchTop).toBeLessThan(positions.ribbonTop)
    expect(positions.overflow).toBeLessThanOrEqual(1)
  })
}
