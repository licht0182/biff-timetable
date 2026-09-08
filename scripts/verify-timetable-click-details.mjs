import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const pageErrors = []
page.on('pageerror', (error) => pageErrors.push(String(error)))

try {
  await page.goto('http://127.0.0.1:4173/biff-timetable/', { waitUntil: 'networkidle' })
  await page.locator('.film-card').first().waitFor({ state: 'visible' })
  await page.getByRole('button', { name: '+ 추가' }).first().click()
  await page.getByRole('button', { name: '내 시간표' }).click()

  const block = page.locator('.event-block').first()
  await block.waitFor({ state: 'visible' })
  const box = await block.boundingBox()
  if (!box) throw new Error('event block has no bounding box')

  await block.click()
  const modal = page.locator('.timetable-detail-modal')
  await modal.waitFor({ state: 'visible' })
  if (await page.locator('.modal-screenings>div.current-screening').count() !== 1) throw new Error('clicked screening is not highlighted exactly once')
  if ((await page.locator('.current-screening-badge').textContent())?.trim() !== '현재 회차') throw new Error('current screening badge missing')
  if (!(await page.locator('.timetable').isVisible())) throw new Error('timetable disappeared while details are open')

  await page.mouse.click(box.x + 5, box.y + Math.min(box.height / 2, 8))
  await modal.waitFor({ state: 'hidden' })

  await block.click()
  await modal.waitFor({ state: 'visible' })
  await page.locator('.timetable-detail-backdrop').click({ position: { x: 2, y: 2 } })
  await modal.waitFor({ state: 'hidden' })

  await page.getByRole('button', { name: '선택', exact: true }).click()
  await block.click()
  if (!(await block.evaluate((node) => node.classList.contains('selected-for-delete')))) throw new Error('selection mode no longer marks blocks for deletion')
  if (await page.locator('.timetable-detail-modal').count()) throw new Error('detail modal opened during deletion selection mode')

  await page.getByRole('button', { name: '선택 취소' }).click()
  await block.click()
  await modal.waitFor({ state: 'visible' })
  await page.keyboard.press('Escape')
  await modal.waitFor({ state: 'hidden' })

  await page.setViewportSize({ width: 390, height: 844 })
  await block.click()
  await modal.waitFor({ state: 'visible' })
  const mobileModalBox = await modal.boundingBox()
  if (!mobileModalBox || mobileModalBox.width > 390) throw new Error('mobile detail modal overflows viewport')

  if (pageErrors.length) throw new Error(`page errors:\n${pageErrors.join('\n')}`)
  console.log(JSON.stringify({ desktop: 'ok', sameBlockCloses: true, outsideClickCloses: true, selectionModePreserved: true, escapeCloses: true, mobile: 'ok' }, null, 2))
} finally {
  await browser.close()
}
