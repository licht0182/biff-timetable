import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 })
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(String(error)))

try {
  await page.goto('http://127.0.0.1:4173/biff-timetable/', { waitUntil: 'networkidle' })
  await page.locator('.film-card').first().waitFor({ state: 'visible' })

  const addButtons = page.getByRole('button', { name: '+ 추가' })
  for (let i = 0; i < 3; i += 1) await addButtons.nth(i).click()
  await page.getByRole('button', { name: '내 시간표' }).click()
  await page.locator('.timetable-action-buttons .png-export-trigger').waitFor({ state: 'visible' })

  const controls = page.locator('.timetable-action-buttons > button, .timetable-action-buttons > .backup-menu > summary')
  const metrics = await controls.evaluateAll((nodes) => nodes.map((node) => {
    const style = getComputedStyle(node)
    const rect = node.getBoundingClientRect()
    return {
      text: node.textContent?.trim(),
      fontSize: style.fontSize,
      whiteSpace: style.whiteSpace,
      width: rect.width,
      height: rect.height,
      scrollHeight: node.scrollHeight,
      clientHeight: node.clientHeight,
    }
  }))

  if (metrics.length !== 4) throw new Error(`expected 4 controls, got ${metrics.length}`)
  if (new Set(metrics.map((item) => item.fontSize)).size !== 1 || metrics[0].fontSize !== '10px') {
    throw new Error(`inconsistent fonts: ${JSON.stringify(metrics)}`)
  }
  if (metrics.some((item) => item.whiteSpace !== 'nowrap')) throw new Error(`wrapping enabled: ${JSON.stringify(metrics)}`)
  if (metrics.some((item) => item.scrollHeight > item.clientHeight + 1)) throw new Error(`wrapped/clipped control: ${JSON.stringify(metrics)}`)

  const topTextDisplay = await page.locator('.enhanced-timetable-actions > div:first-child p').evaluate((node) => getComputedStyle(node).display)
  const bottomText = await page.locator('.timetable-page').evaluate((node) => getComputedStyle(node, '::after').content)
  if (topTextDisplay !== 'none') throw new Error(`auto-adjust text still visible at top: ${topTextDisplay}`)
  if (!bottomText.includes('자동 조정')) throw new Error(`auto-adjust text missing at bottom: ${bottomText}`)

  const buttonBox = await page.locator('.timetable-action-buttons').boundingBox()
  if (!buttonBox || buttonBox.x < 0 || buttonBox.x + buttonBox.width > 390) {
    throw new Error(`controls overflow viewport: ${JSON.stringify(buttonBox)}`)
  }
  if (errors.length) throw new Error(`page errors: ${errors.join('\n')}`)

  console.log(JSON.stringify({ metrics, topTextDisplay, bottomText, buttonBox }, null, 2))
} finally {
  await browser.close()
}
