import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

async function rowInfo(locator, label) {
  if (await locator.count() === 0) return null
  return locator.first().evaluate((row, label) => {
    const r = row.getBoundingClientRect()
    const style = getComputedStyle(row)
    const action = row.querySelector('.screening-actions')
    const actionRect = action?.getBoundingClientRect()
    const left = row.firstElementChild
    const leftRect = left?.getBoundingClientRect()
    return {
      label,
      classes: row.className,
      height: r.height,
      paddingTop: style.paddingTop,
      paddingBottom: style.paddingBottom,
      actionHeight: actionRect?.height ?? null,
      leftHeight: leftRect?.height ?? null,
      hasTicketSelect: Boolean(row.querySelector('.ticket-select')),
      hasSmall: Boolean(row.querySelector('small')),
      smallText: row.querySelector('small')?.textContent?.trim() ?? '',
      isLastChild: row === row.parentElement?.lastElementChild,
      text: row.textContent?.trim().slice(0, 180),
    }
  }, label)
}

async function snapshot(viewportLabel) {
  const selectedRow = page.locator('.screening-row').filter({ has: page.locator('button.selected') })
  const travelRow = page.locator('.screening-row.travel-warning').filter({ hasNot: page.locator('button.selected') })
  const conflictRow = page.locator('.screening-row.conflict')
  const normalRow = page.locator('.screening-row:not(.travel-warning):not(.conflict)').filter({ hasNot: page.locator('button.selected') })
  const lastRow = page.locator('.screening-row').filter({ has: page.locator(':scope') }).last()
  return {
    viewport: viewportLabel,
    selected: await rowInfo(selectedRow, 'selected'),
    travel: await rowInfo(travelRow, 'travel'),
    conflict: await rowInfo(conflictRow, 'conflict'),
    normal: await rowInfo(normalRow, 'normal'),
    last: await rowInfo(lastRow, 'last'),
  }
}

try {
  await page.goto('http://127.0.0.1:4173/biff-timetable/', { waitUntil: 'networkidle' })
  await page.locator('.film-card').first().waitFor({ state: 'visible' })
  await page.getByRole('button', { name: '+ 추가' }).first().click()
  await page.waitForTimeout(150)

  const desktop = await snapshot('1280x900')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(150)
  const mobile = await snapshot('390x844')

  console.log(JSON.stringify({ desktop, mobile }, null, 2))
} finally {
  await browser.close()
}
