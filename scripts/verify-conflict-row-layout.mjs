import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const pageErrors = []
page.on('pageerror', (error) => pageErrors.push(String(error)))

async function measureRows(label) {
  const rows = page.locator('.screening-row')
  const count = Math.min(await rows.count(), 200)
  const data = []
  for (let i = 0; i < count; i += 1) {
    const row = rows.nth(i)
    const info = await row.evaluate((node) => {
      const rect = node.getBoundingClientRect()
      const actions = node.querySelector('.screening-actions')?.getBoundingClientRect()
      return {
        height: rect.height,
        classes: node.className,
        hasSelected: Boolean(node.querySelector('button.selected')),
        hasTravel: node.classList.contains('travel-warning'),
        hasConflict: node.classList.contains('conflict'),
        actionHeight: actions?.height ?? 0,
        rowLeft: rect.left,
        rowRight: rect.right,
        actionLeft: actions?.left ?? 0,
        actionRight: actions?.right ?? 0,
      }
    })
    data.push(info)
  }
  const heights = [...new Set(data.map((item) => Math.round(item.height * 10) / 10))]
  if (heights.length !== 1) throw new Error(`${label} row heights differ: ${JSON.stringify(heights)}`)
  if (data.some((item) => item.actionRight > item.rowRight + 1 || item.actionLeft < item.rowLeft - 1)) {
    throw new Error(`${label} action controls overflow row bounds`)
  }
  return { label, height: heights[0], count, states: {
    selected: data.some((item) => item.hasSelected),
    travel: data.some((item) => item.hasTravel),
    conflict: data.some((item) => item.hasConflict),
  }}
}

try {
  await page.goto('http://127.0.0.1:4173/biff-timetable/', { waitUntil: 'networkidle' })
  await page.locator('.film-card').first().waitFor({ state: 'visible' })

  await page.getByRole('button', { name: '+ 추가' }).first().click()
  const selectedRow = page.locator('.screening-row').filter({ has: page.locator('button.selected') }).first()
  await selectedRow.waitFor({ state: 'visible' })
  const selectedTitle = (await selectedRow.locator('xpath=ancestor::article').locator('h2').textContent())?.trim() ?? ''
  const selectedStrong = (await selectedRow.locator('strong').textContent())?.trim() ?? ''

  const conflictRow = page.locator('.screening-row.conflict').first()
  await conflictRow.waitFor({ state: 'visible' })
  let conflictAlert = ''
  page.once('dialog', async (dialog) => {
    conflictAlert = dialog.message()
    await dialog.accept()
  })
  await conflictRow.getByRole('button', { name: '+ 추가' }).click()
  if (!conflictAlert.includes('이미 선택한 다음 회차와 시간이 겹칩니다.')) throw new Error(`missing conflict heading: ${conflictAlert}`)
  if (!selectedTitle || !conflictAlert.includes(selectedTitle)) throw new Error(`conflict alert missing selected film title: ${conflictAlert}`)
  const codeMatch = selectedStrong.match(/\[(\d+)\]/)
  if (codeMatch && !conflictAlert.includes(`[${codeMatch[1]}]`)) throw new Error(`conflict alert missing selected screening code: ${conflictAlert}`)
  if (!conflictAlert.includes('기존 회차를 먼저 제거한 뒤 추가해 주세요.')) throw new Error(`missing removal guidance: ${conflictAlert}`)
  if ((await page.locator('.selection-count').textContent())?.trim() !== '총 1개 선택') throw new Error('conflicting screening was added')

  const desktop = await measureRows('desktop 1280')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(100)
  const mobile390 = await measureRows('mobile 390')
  await page.setViewportSize({ width: 320, height: 800 })
  await page.waitForTimeout(100)
  const mobile320 = await measureRows('mobile 320')

  if (!desktop.states.selected || !desktop.states.travel || !desktop.states.conflict) throw new Error(`desktop did not cover all row states: ${JSON.stringify(desktop)}`)
  if (!mobile390.states.selected || !mobile390.states.travel || !mobile390.states.conflict) throw new Error(`mobile did not cover all row states: ${JSON.stringify(mobile390)}`)
  if (pageErrors.length) throw new Error(`page errors:\n${pageErrors.join('\n')}`)

  console.log(JSON.stringify({ conflictAlert, selectedTitle, selectedStrong, desktop, mobile390, mobile320 }, null, 2))
} finally {
  await browser.close()
}
