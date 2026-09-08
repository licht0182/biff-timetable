import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const errors = []
page.on('pageerror', (error) => errors.push(String(error)))

async function waitFrames(count = 3) {
  await page.evaluate(async (frames) => {
    for (let i = 0; i < frames; i += 1) {
      await new Promise((resolve) => requestAnimationFrame(() => resolve()))
    }
  }, count)
}

async function measureDom(label) {
  return page.evaluate((name) => ({
    label: name,
    filmCards: document.querySelectorAll('.film-card').length,
    screeningRows: document.querySelectorAll('.screening-row').length,
    buttons: document.querySelectorAll('button').length,
    elements: document.querySelectorAll('*').length,
    documentHeight: document.documentElement.scrollHeight,
    totalFilms: Number(document.querySelector('.film-list-shell')?.getAttribute('data-total-films') ?? 0),
    scrollY: window.scrollY,
  }), label)
}

async function roundTrip(label) {
  await page.evaluate(() => {
    window.__biffLongTasks = []
    if (!window.__biffLongTaskObserver) {
      window.__biffLongTaskObserver = new PerformanceObserver((list) => {
        window.__biffLongTasks.push(...list.getEntries().map((entry) => entry.duration))
      })
      window.__biffLongTaskObserver.observe({ type: 'longtask', buffered: false })
    }
  })
  const started = performance.now()
  await page.getByRole('button', { name: '설정' }).click()
  await page.getByRole('button', { name: '영화 찾기' }).click()
  await page.locator('.film-card').first().waitFor({ state: 'visible' })
  await waitFrames(4)
  const duration = performance.now() - started
  const longTasks = await page.evaluate(() => window.__biffLongTasks ?? [])
  return { label, duration, maxLongTask: longTasks.length ? Math.max(...longTasks) : 0, longTaskCount: longTasks.length }
}

try {
  await page.goto('http://127.0.0.1:4173/biff-timetable/', { waitUntil: 'networkidle' })
  await page.locator('.film-card').first().waitFor({ state: 'visible' })
  await waitFrames()

  const initial = await measureDom('desktop initial')
  if (initial.totalFilms < 200) throw new Error(`expected full filtered data, got ${initial.totalFilms}`)
  if (initial.filmCards > 45) throw new Error(`too many mounted film cards: ${initial.filmCards}`)
  if (initial.elements > 1800) throw new Error(`DOM still too large: ${initial.elements}`)

  const firstTitle = (await page.locator('.film-card h2').first().textContent())?.trim()
  if (!firstTitle) throw new Error('missing first film title')
  await page.getByLabel('영화 검색').fill(firstTitle)
  await page.waitForTimeout(80)
  await page.locator('.film-card h2').first().waitFor({ state: 'visible' })
  const searchTotal = Number(await page.locator('.film-list-shell').getAttribute('data-total-films'))
  if (searchTotal < 1 || searchTotal >= initial.totalFilms) throw new Error(`deferred search did not filter: ${searchTotal}`)
  await page.getByLabel('영화 검색').fill('')
  await page.waitForTimeout(80)
  await page.locator('.film-card').first().waitFor({ state: 'visible' })

  await page.locator('.film-card .detail-button').first().click()
  await page.keyboard.press('Escape')
  await page.locator('.film-card').first().waitFor({ state: 'visible' })

  await page.getByRole('button', { name: '+ 추가' }).first().click()
  if ((await page.locator('.selection-count').textContent())?.trim() !== '총 1개 선택') throw new Error('screening selection regression')

  const scrollTarget = await page.evaluate(() => Math.min(6000, Math.max(0, document.documentElement.scrollHeight - innerHeight - 200)))
  await page.evaluate((y) => window.scrollTo(0, y), scrollTarget)
  await page.waitForTimeout(180)
  const middle = await measureDom('desktop middle')
  if (middle.scrollY < 500) throw new Error(`virtual list did not scroll: ${middle.scrollY}`)
  if (middle.filmCards > 45 || middle.elements > 1800) throw new Error(`virtualization lost in middle: ${JSON.stringify(middle)}`)

  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(120)
  const normalRoundTrip = await roundTrip('normal cpu')
  if (normalRoundTrip.maxLongTask >= 50) throw new Error(`normal round trip still has long task: ${JSON.stringify(normalRoundTrip)}`)

  const client = await page.context().newCDPSession(page)
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  const throttledRoundTrip = await roundTrip('4x cpu')
  await client.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  if (throttledRoundTrip.duration > 350) throw new Error(`4x CPU round trip too slow: ${JSON.stringify(throttledRoundTrip)}`)

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await page.waitForTimeout(220)
  const bottom = await measureDom('desktop bottom')
  if (bottom.filmCards > 45 || bottom.elements > 1800) throw new Error(`virtualization lost at bottom: ${JSON.stringify(bottom)}`)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(180)
  const mobile = await measureDom('mobile 390')
  if (mobile.filmCards > 45 || mobile.elements > 1800) throw new Error(`mobile DOM too large: ${JSON.stringify(mobile)}`)

  if (errors.length) throw new Error(`page errors:\n${errors.join('\n')}`)

  console.log(JSON.stringify({ initial, searchTotal, middle, normalRoundTrip, throttledRoundTrip, bottom, mobile }, null, 2))
} finally {
  await browser.close()
}
