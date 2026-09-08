import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

try {
  await page.goto('http://127.0.0.1:4173/biff-timetable/', { waitUntil: 'networkidle' })
  await page.locator('.film-data-notice').waitFor({ state: 'visible' })
  await page.locator('.controls').waitFor({ state: 'visible' })

  const geometry = await page.locator('.film-data-notice, .controls').evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect()
    return {
      className: node.className,
      left: rect.left,
      right: rect.right,
      width: rect.width,
      display: getComputedStyle(node).display,
    }
  }))

  if (geometry.length !== 2) throw new Error(`expected notice and controls: ${JSON.stringify(geometry)}`)
  const [notice, controls] = geometry
  for (const key of ['left', 'right', 'width']) {
    if (Math.abs(notice[key] - controls[key]) > 0.5) {
      throw new Error(`desktop notice geometry mismatch on ${key}: ${JSON.stringify(geometry)}`)
    }
  }

  console.log(JSON.stringify(geometry, null, 2))
} finally {
  await browser.close()
}
