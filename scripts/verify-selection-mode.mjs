import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(String(error)))

try {
  await page.goto('http://127.0.0.1:4173/biff-timetable/', { waitUntil: 'networkidle' })
  await page.locator('.film-card').first().waitFor({ state: 'visible' })

  const notice = page.locator('.film-data-notice')
  await notice.waitFor({ state: 'visible' })
  const panelStyles = await page.locator('.film-data-notice, .controls').evaluateAll((nodes) => nodes.map((node) => {
    const style = getComputedStyle(node)
    return { cls: node.className, radius: style.borderRadius, paddingTop: style.paddingTop, paddingRight: style.paddingRight, borderWidth: style.borderTopWidth, background: style.backgroundColor }
  }))
  if (panelStyles.length !== 2) throw new Error(`missing desktop panels: ${JSON.stringify(panelStyles)}`)
  for (const key of ['radius', 'paddingTop', 'paddingRight', 'borderWidth', 'background']) {
    if (panelStyles[0][key] !== panelStyles[1][key]) throw new Error(`notice mismatch on ${key}: ${JSON.stringify(panelStyles)}`)
  }

  for (let i = 0; i < 3; i += 1) await page.getByRole('button', { name: '+ 추가' }).first().click()
  await page.getByRole('button', { name: '내 시간표' }).click()
  await page.locator('.event-block').first().waitFor({ state: 'visible' })
  await page.locator('.png-export-trigger').waitFor({ state: 'visible' })

  const normalMetrics = await page.locator('.timetable-action-buttons > button, .timetable-action-buttons > .backup-menu > summary').evaluateAll((nodes) => nodes.map((node) => ({ text: node.textContent?.trim(), fontSize: getComputedStyle(node).fontSize, fontWeight: getComputedStyle(node).fontWeight })))
  const sizes = new Set(normalMetrics.map((item) => item.fontSize))
  if (sizes.size !== 1 || !sizes.has('10px')) throw new Error(`desktop action fonts differ: ${JSON.stringify(normalMetrics)}`)
  const backup = normalMetrics.find((item) => item.text === '백업')
  const calendar = normalMetrics.find((item) => item.text === '캘린더')
  if (!backup || !calendar || backup.fontSize !== calendar.fontSize || backup.fontWeight !== calendar.fontWeight) throw new Error(`backup typography differs: ${JSON.stringify(normalMetrics)}`)

  const pointerBefore = await page.locator('.event-block').first().evaluate((node) => getComputedStyle(node).pointerEvents)
  if (pointerBefore !== 'none') throw new Error(`timetable block should be read-only before selection mode: ${pointerBefore}`)

  await page.getByRole('button', { name: '선택', exact: true }).click()
  const pointerDuring = await page.locator('.event-block').first().evaluate((node) => getComputedStyle(node).pointerEvents)
  if (pointerDuring !== 'auto') throw new Error(`selection mode did not enable blocks: ${pointerDuring}`)

  await page.locator('.event-block').nth(0).click()
  await page.locator('.event-block').nth(1).click()
  if (await page.locator('.event-block.selected-for-delete').count() !== 2) throw new Error('expected two selected timetable blocks')
  if (!(await page.locator('.booking-summary').textContent())?.includes('2개 선택')) throw new Error('selection summary did not update')

  page.once('dialog', async (dialog) => {
    if (!dialog.message().includes('2개 회차')) throw new Error(`unexpected delete confirmation: ${dialog.message()}`)
    await dialog.dismiss()
  })
  await page.getByRole('button', { name: '삭제 2' }).click()
  if (await page.locator('.event-block').count() !== 3) throw new Error('dismissed confirmation still deleted blocks')
  if (await page.locator('.event-block.selected-for-delete').count() !== 2) throw new Error('dismissed confirmation cleared selection')

  page.once('dialog', async (dialog) => { await dialog.accept() })
  await page.getByRole('button', { name: '삭제 2' }).click()
  await page.locator('.event-block').first().waitFor({ state: 'visible' })
  if (await page.locator('.event-block').count() !== 1) throw new Error(`expected one block after deletion, got ${await page.locator('.event-block').count()}`)
  if ((await page.locator('.selection-count').textContent())?.trim() !== '총 1개 선택') throw new Error('header count did not update after deletion')
  if (await page.getByRole('button', { name: '선택 취소' }).count()) throw new Error('selection mode did not exit after deletion')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '선택', exact: true }).click()
  await page.locator('.event-block').first().click()
  const mobileControls = page.locator('.timetable-action-buttons > button, .timetable-action-buttons > .backup-menu > summary')
  const mobileMetrics = await mobileControls.evaluateAll((nodes) => nodes.map((node) => {
    const style = getComputedStyle(node)
    const rect = node.getBoundingClientRect()
    return { text: node.textContent?.trim(), fontSize: style.fontSize, whiteSpace: style.whiteSpace, left: rect.left, right: rect.right, height: rect.height, scrollHeight: node.scrollHeight, clientHeight: node.clientHeight }
  }))
  if (mobileMetrics.some((item) => item.fontSize !== '10px' || item.whiteSpace !== 'nowrap')) throw new Error(`mobile action typography invalid: ${JSON.stringify(mobileMetrics)}`)
  if (mobileMetrics.some((item) => item.left < 0 || item.right > 390 || item.scrollHeight > item.clientHeight + 1)) throw new Error(`mobile actions overflow or wrap: ${JSON.stringify(mobileMetrics)}`)

  if (errors.length) throw new Error(`page errors:\n${errors.join('\n')}`)
  console.log(JSON.stringify({ panelStyles, normalMetrics, mobileMetrics }, null, 2))
} finally {
  await browser.close()
}
