import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const pageErrors: string[] = []
page.on('pageerror', (error) => pageErrors.push(String(error)))

await page.addInitScript(() => {
  localStorage.setItem('biff-timetable:selected-screenings:v1', JSON.stringify(['biff2025-808']))
  localStorage.setItem('biff-timetable:ticket-status:v1', JSON.stringify({ 'biff2025-808': 'planned' }))
})

async function inspect(width: number, height: number) {
  await page.setViewportSize({ width, height })
  await page.goto('http://127.0.0.1:4173/biff-timetable/', { waitUntil: 'networkidle' })

  const row = page.locator('.screening-row').first()
  await row.waitFor({ state: 'visible' })
  const select = row.locator('.ticket-select')
  const button = row.locator('.screening-actions button')
  const detail = row.locator(':scope > div:first-child > span')
  const actions = row.locator('.screening-actions')

  await select.waitFor({ state: 'visible' })
  const [selectBox, buttonBox, rowBox] = await Promise.all([select.boundingBox(), button.boundingBox(), row.boundingBox()])
  assert.ok(selectBox && buttonBox && rowBox)
  assert.ok(selectBox.y + selectBox.height <= buttonBox.y + 1, `${width}px: booking status must be above selected button`)
  assert.ok(selectBox.x >= rowBox.x - 1 && selectBox.x + selectBox.width <= rowBox.x + rowBox.width + 1, `${width}px: select overflows row`)
  assert.ok(buttonBox.x >= rowBox.x - 1 && buttonBox.x + buttonBox.width <= rowBox.x + rowBox.width + 1, `${width}px: button overflows row`)

  const styles = await detail.evaluate((node) => {
    const style = getComputedStyle(node)
    return {
      whiteSpace: style.whiteSpace,
      overflow: style.overflow,
      textOverflow: style.textOverflow,
      lineHeight: Number.parseFloat(style.lineHeight),
      height: node.getBoundingClientRect().height,
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
      text: node.textContent ?? '',
    }
  })
  assert.equal(styles.whiteSpace, 'normal', `${width}px: detail should allow wrapping`)
  assert.equal(styles.overflow, 'visible', `${width}px: detail should not clip overflow`)
  assert.equal(styles.textOverflow, 'clip', `${width}px: detail should not use ellipsis`)
  assert.ok(styles.text.includes('동서대학교-경남정보대학교 지하 1층 민석소극장'), `${width}px: long venue detail missing`)
  assert.ok(styles.scrollWidth <= styles.clientWidth + 1, `${width}px: detail still horizontally clipped`)

  const flexDirection = await actions.evaluate((node) => getComputedStyle(node).flexDirection)
  assert.equal(flexDirection, 'column', `${width}px: selected actions should stack vertically`)

  const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  assert.ok(pageWidth <= width, `${width}px: page horizontally overflows (${pageWidth})`)

  return { width, detailHeight: styles.height, lineHeight: styles.lineHeight, wrapped: styles.height > styles.lineHeight * 1.5 }
}

try {
  const desktop = await inspect(1280, 900)
  const mobile390 = await inspect(390, 844)
  const mobile320 = await inspect(320, 700)
  assert.ok(mobile320.wrapped, '320px: long venue/time detail should wrap to multiple lines')
  assert.deepEqual(pageErrors, [])
  console.log(JSON.stringify({ desktop, mobile390, mobile320, pageErrors }, null, 2))
} finally {
  await browser.close()
}
