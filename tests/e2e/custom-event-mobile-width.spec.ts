import { expect, test } from '@playwright/test'

for (const viewport of [
  { width: 320, height: 740 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]) {
  test(`keeps custom event controls aligned at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('./')
    await page.getByRole('button', { name: '내 시간표' }).click()
    await page.getByRole('button', { name: /일정 추가|\+ 일정/ }).first().click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    const rows = dialog.locator('.custom-event-form-row')
    await expect(rows).toHaveCount(2)

    for (let rowIndex = 0; rowIndex < 2; rowIndex += 1) {
      const row = rows.nth(rowIndex)
      const labels = row.locator(':scope > label')
      const firstShell = labels.nth(0).locator('.custom-event-control-shell')
      const secondShell = labels.nth(1).locator('.custom-event-control-shell')
      const firstControl = firstShell.locator(':scope > input, :scope > select')
      const secondControl = secondShell.locator(':scope > input, :scope > select')

      const firstShellBox = await firstShell.boundingBox()
      const secondShellBox = await secondShell.boundingBox()
      const firstControlBox = await firstControl.boundingBox()
      const secondControlBox = await secondControl.boundingBox()

      expect(firstShellBox).not.toBeNull()
      expect(secondShellBox).not.toBeNull()
      expect(firstControlBox).not.toBeNull()
      expect(secondControlBox).not.toBeNull()

      expect(secondShellBox!.x - (firstShellBox!.x + firstShellBox!.width)).toBeGreaterThanOrEqual(7)
      expect(Math.abs(firstShellBox!.width - secondShellBox!.width)).toBeLessThanOrEqual(2)

      for (const [shellBox, controlBox] of [
        [firstShellBox!, firstControlBox!],
        [secondShellBox!, secondControlBox!],
      ] as const) {
        expect(controlBox.x).toBeGreaterThanOrEqual(shellBox.x - 1)
        expect(controlBox.x + controlBox.width).toBeLessThanOrEqual(shellBox.x + shellBox.width + 1)
      }
    }

    const dateAndTimeShells = dialog.locator('.custom-event-date-shell, .custom-event-time-shell')
    await expect(dateAndTimeShells).toHaveCount(3)

    for (let index = 0; index < 3; index += 1) {
      const shell = dateAndTimeShells.nth(index)
      const display = shell.locator(':scope > .custom-event-native-display')
      const nativeInput = shell.locator(':scope > input')
      const shellBox = await shell.boundingBox()
      const displayBox = await display.boundingBox()
      const nativeBox = await nativeInput.boundingBox()

      expect(shellBox).not.toBeNull()
      expect(displayBox).not.toBeNull()
      expect(nativeBox).not.toBeNull()

      expect(Math.abs(displayBox!.x - shellBox!.x)).toBeLessThanOrEqual(1)
      expect(Math.abs(displayBox!.y - shellBox!.y)).toBeLessThanOrEqual(1)
      expect(Math.abs(displayBox!.width - shellBox!.width)).toBeLessThanOrEqual(1)
      expect(Math.abs(displayBox!.height - shellBox!.height)).toBeLessThanOrEqual(1)
      expect(Math.abs(nativeBox!.width - shellBox!.width)).toBeLessThanOrEqual(1)
      expect(Math.abs(nativeBox!.height - shellBox!.height)).toBeLessThanOrEqual(1)

      const alignment = await display.evaluate((element) => {
        const style = getComputedStyle(element)
        return {
          display: style.display,
          alignItems: style.alignItems,
          justifyContent: style.justifyContent,
          lineHeight: style.lineHeight,
        }
      })
      expect(alignment.display).toBe('flex')
      expect(alignment.alignItems).toBe('center')
      expect(alignment.justifyContent).toBe('center')
      expect(alignment.lineHeight).toBe('16px')

      const nativeStyle = await nativeInput.evaluate((element) => {
        const style = getComputedStyle(element)
        return {
          opacity: style.opacity,
          paddingLeft: style.paddingLeft,
          paddingRight: style.paddingRight,
          borderLeft: style.borderLeftWidth,
          borderRight: style.borderRightWidth,
        }
      })
      expect(nativeStyle.opacity).toBe('0')
      expect(nativeStyle.paddingLeft).toBe('0px')
      expect(nativeStyle.paddingRight).toBe('0px')
      expect(nativeStyle.borderLeft).toBe('0px')
      expect(nativeStyle.borderRight).toBe('0px')
    }

    const selectShell = dialog.locator('.custom-event-select-shell')
    const selectStyle = await selectShell.evaluate((element) => {
      const style = getComputedStyle(element)
      return { display: style.display, alignItems: style.alignItems, overflow: style.overflow }
    })
    expect(selectStyle.display).toBe('flex')
    expect(selectStyle.alignItems).toBe('center')
    expect(selectStyle.overflow).toBe('hidden')

    const modalBox = await dialog.boundingBox()
    const titleBox = await dialog.getByLabel('일정명 *').boundingBox()
    const locationBox = await dialog.getByLabel('장소').boundingBox()
    const noteBox = await dialog.getByLabel('메모').boundingBox()
    expect(modalBox).not.toBeNull()
    for (const box of [titleBox, locationBox, noteBox]) {
      expect(box).not.toBeNull()
      expect(box!.x).toBeGreaterThanOrEqual(modalBox!.x)
      expect(box!.x + box!.width).toBeLessThanOrEqual(modalBox!.x + modalBox!.width)
    }
  })
}
