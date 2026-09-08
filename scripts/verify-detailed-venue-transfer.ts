import assert from 'node:assert/strict'
import fs from 'node:fs'
import { chromium } from 'playwright'
import { getPreciseVenueTransfer, getVenueSiteTransferMinutes, resolveVenueSite } from '../src/venue-travel'

assert.equal(resolveVenueSite('CGV센텀시티 1관')?.id, 'cgv')
assert.equal(resolveVenueSite('CGV센텀시티 IMAX관')?.id, 'cgv')
assert.equal(resolveVenueSite('롯데시네마 센텀시티 10관')?.id, 'lotte')
assert.equal(resolveVenueSite('영화의전당 하늘연극장')?.id, 'bcc')
assert.equal(resolveVenueSite('영화진흥위원회 표준시사실')?.id, 'kofic')
assert.equal(resolveVenueSite('동서대학교 소향씨어터 신한카드홀')?.id, 'dsu')
assert.equal(resolveVenueSite('동서대학교-경남정보대학교 지하 1층 민석소극장')?.id, 'dsu')
assert.equal(resolveVenueSite('시청자미디어센터')?.id, 'media')

assert.equal(getVenueSiteTransferMinutes('cgv', 'dsu'), 18)
assert.equal(getVenueSiteTransferMinutes('dsu', 'cgv'), 19)
assert.equal(getVenueSiteTransferMinutes('dsu', 'lotte'), 20)
assert.equal(getVenueSiteTransferMinutes('lotte', 'dsu'), 19)
assert.equal(getVenueSiteTransferMinutes('bcc', 'kofic'), 8)
assert.equal(getVenueSiteTransferMinutes('kofic', 'bcc'), 8)

const cgvToDsu = getPreciseVenueTransfer('CGV센텀시티 1관', '동서대학교 소향씨어터 신한카드홀')
assert.equal(cgvToDsu?.minutes, 18)
assert.equal(cgvToDsu?.routeLabel, 'CGV → 동서대')
const dsuToLotte = getPreciseVenueTransfer('동서대학교 소향씨어터 신한카드홀', '롯데시네마 센텀시티 7관')
assert.equal(dsuToLotte?.minutes, 20)
assert.equal(dsuToLotte?.routeLabel, '동서대 → 롯데')

const data = JSON.parse(fs.readFileSync('public/screenings.json', 'utf8'))
const items = data.films.flatMap((film: any) => film.screenings.map((screening: any) => ({ film, screening })))
const toMinutes = (value: string) => {
  const [h, m] = value.split(':').map(Number)
  return h * 60 + m
}
const endMinutes = (item: any) => {
  const start = toMinutes(item.screening.start)
  if (item.screening.end) {
    let end = toMinutes(item.screening.end)
    if (end <= start) end += 1440
    return end
  }
  return start + (item.film.runtime ?? 120)
}

let warningPair: any = null
for (const earlier of items) {
  for (const later of items) {
    if (earlier.screening.id === later.screening.id || earlier.screening.date !== later.screening.date) continue
    const earlierEnd = endMinutes(earlier)
    const laterStart = toMinutes(later.screening.start)
    if (earlierEnd > laterStart) continue
    const transfer = getPreciseVenueTransfer(earlier.screening.venue, later.screening.venue)
    if (!transfer || transfer.fromSite === transfer.toSite) continue
    const gap = laterStart - earlierEnd
    if (gap >= transfer.minutes) continue
    warningPair = { earlier, later, transfer, gap }
    break
  }
  if (warningPair) break
}
assert.ok(warningPair, 'could not find a real timetable pair that should trigger a precise transfer warning')

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const pageErrors: string[] = []
page.on('pageerror', (error) => pageErrors.push(String(error)))

try {
  await page.addInitScript(({ ids }) => {
    localStorage.setItem('biff-timetable:selected-screenings:v1', JSON.stringify(ids))
    localStorage.setItem('biff-timetable:ticket-status:v1', JSON.stringify(Object.fromEntries(ids.map((id: string) => [id, 'planned']))))
  }, { ids: [warningPair.earlier.screening.id, warningPair.later.screening.id] })

  await page.goto('http://127.0.0.1:4173/biff-timetable/', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: '내 시간표' }).click()
  await page.locator('.event-block').first().waitFor({ state: 'visible' })

  const titles = await page.locator('.event-block').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('title') ?? ''))
  const expectedRoute = warningPair.transfer.routeLabel
  const expectedBuffer = `필요 ${warningPair.transfer.minutes}분`
  assert.ok(titles.some((title) => title.includes(expectedRoute) && title.includes(expectedBuffer)), `timetable title missing directed route ${expectedRoute}`)

  await page.getByRole('button', { name: '설정' }).click()
  const cgvDsuCell = page.locator('td[title="CGV센텀시티 → 동서대 센텀캠퍼스"]')
  await cgvDsuCell.waitFor({ state: 'visible' })
  assert.equal((await cgvDsuCell.textContent())?.trim(), '18분')
  assert.equal((await page.locator('td[title="동서대 센텀캠퍼스 → CGV센텀시티"]').textContent())?.trim(), '19분')
  assert.equal((await page.locator('td[title="동서대 센텀캠퍼스 → 롯데시네마 센텀시티"]').textContent())?.trim(), '20분')

  await page.setViewportSize({ width: 390, height: 844 })
  const wrapper = page.locator('.travel-matrix-wrap')
  await wrapper.waitFor({ state: 'visible' })
  const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  assert.ok(pageWidth <= 390, `settings page horizontally overflows mobile viewport: ${pageWidth}`)
  assert.ok((await wrapper.evaluate((node) => node.scrollWidth)) > (await wrapper.evaluate((node) => node.clientWidth)), 'mobile matrix should scroll inside its own wrapper')

  assert.deepEqual(pageErrors, [])
  console.log(JSON.stringify({
    matrix: 'ok',
    directedExamples: { cgvToDsu: 18, dsuToCgv: 19, dsuToLotte: 20, lotteToDsu: 19 },
    liveWarningPair: {
      route: expectedRoute,
      gap: warningPair.gap,
      required: warningPair.transfer.minutes,
      earlier: warningPair.earlier.screening.id,
      later: warningPair.later.screening.id,
    },
    mobile: 'ok',
  }, null, 2))
} finally {
  await browser.close()
}
