import { expect, test } from '@playwright/test'

for (const viewport of [
  { width: 320, height: 740 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]) {
  test(`keeps custom event native controls isolated at ${viewport.width}px`, async ({ page }) => {
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

    const nativeGeometry = await dialog.locator('.custom-event-control-shell').evaluateAll((shells) => shells.map((shell) => {
      const control = shell.querySelector('input, select') as HTMLElement | null
      const shellStyle = getComputedStyle(shell)
      const controlStyle = control ? getComputedStyle(control) : null
      return {
        overflow: shellStyle.overflow,
        shellPaddingLeft: shellStyle.paddingLeft,
        shellPaddingRight: shellStyle.paddingRight,
        controlPaddingLeft: controlStyle?.paddingLeft,
        controlPaddingRight: controlStyle?.paddingRight,
        controlBorderLeft: controlStyle?.borderLeftWidth,
        controlBorderRight: controlStyle?.borderRightWidth,
      }
    }))

    for (const geometry of nativeGeometry) {
      expect(geometry.overflow).toBe('hidden')
      expect(parseFloat(geometry.shellPaddingLeft)).toBeGreaterThan(0)
      expect(parseFloat(geometry.shellPaddingRight)).toBeGreaterThan(0)
      expect(geometry.controlPaddingLeft).toBe('0px')
      expect(geometry.controlPaddingRight).toBe('0px')
      expect(geometry.controlBorderLeft).toBe('0px')
      expect(geometry.controlBorderRight).toBe('0px')
    }

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
