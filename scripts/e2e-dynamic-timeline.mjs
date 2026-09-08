import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const errors = []

async function openPage() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push(String(error?.stack || error)))
  await page.goto('http://127.0.0.1:4173/biff-timetable/', { waitUntil: 'networkidle' })
  await page.locator('.film-card').first().waitFor({ state: 'visible' })
  return { context, page }
}

try {
  const normal = await openPage()
  const normalRow = normal.page.locator('.screening-row').first()
  await normalRow.getByRole('button', { name: '+ 추가' }).click()
  await normal.page.getByRole('button', { name: '내 시간표' }).click()
  await normal.page.locator('.timetable').waitFor({ state: 'visible' })
  const normalLabels = await normal.page.locator('.time-axis > div').allTextContents()
  const normalHourHeight = await normal.page.locator('.timetable').evaluate((node) => Number.parseFloat(getComputedStyle(node).getPropertyValue('--hour-height')))

  if (normalLabels[0] !== '08시') throw new Error(`normal start label: ${normalLabels[0]}`)
  if (normalLabels.at(-1) !== '00시') throw new Error(`normal end label: ${normalLabels.at(-1)}`)
  if (normalLabels.length !== 17) throw new Error(`normal label count: ${normalLabels.length}`)
  if (!(normalHourHeight > 0)) throw new Error(`invalid normal hour height: ${normalHourHeight}`)
  await normal.context.close()

  const midnight = await openPage()
  await midnight.page.getByLabel('영화 검색').fill('미드나잇 패션 3')
  const midnightCard = midnight.page.locator('.film-card').filter({ has: midnight.page.getByRole('heading', { name: '미드나잇 패션 3', exact: true }) }).first()
  await midnightCard.waitFor({ state: 'visible' })
  const midnightRow = midnightCard.locator('.screening-row').filter({ hasText: '23:59' }).first()
  await midnightRow.getByRole('button', { name: '+ 추가' }).click()
  await midnight.page.getByRole('button', { name: '내 시간표' }).click()
  await midnight.page.locator('.timetable').waitFor({ state: 'visible' })
  const midnightLabels = await midnight.page.locator('.time-axis > div').allTextContents()
  const eventBox = await midnight.page.locator('.event-block').filter({ hasText: '미드나잇 패션 3' }).first().boundingBox()
  const timetableBox = await midnight.page.locator('.timetable').boundingBox()

  if (midnightLabels[0] !== '08시') throw new Error(`midnight start label: ${midnightLabels[0]}`)
  if (midnightLabels.at(-1) !== '06시') throw new Error(`midnight end label: ${midnightLabels.at(-1)}`)
  if (midnightLabels.length !== 23) throw new Error(`midnight label count: ${midnightLabels.length}`)
  if (!eventBox || !timetableBox) throw new Error('missing timetable geometry')
  if (eventBox.y + eventBox.height > timetableBox.y + timetableBox.height + 2) throw new Error('midnight event is clipped below timetable')
  await midnight.context.close()

  if (errors.length) throw new Error(`page errors:\n${errors.join('\n')}`)
  console.log(JSON.stringify({ normalLabels, normalHourHeight, midnightLabels, errors }, null, 2))
} finally {
  await browser.close()
}
