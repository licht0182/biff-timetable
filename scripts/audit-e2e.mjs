import fs from 'node:fs'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const BASE = 'http://127.0.0.1:4173/biff-timetable/'
const data = JSON.parse(fs.readFileSync('public/screenings.json', 'utf8'))
const allItems = data.films.flatMap((film) => film.screenings.map((screening) => ({ film, screening })))
const results = []
const observations = []

const toMinutes = (time) => { const [h, m] = time.split(':').map(Number); return h * 60 + m }
const endMinutes = ({ film, screening }) => {
  const start = toMinutes(screening.start)
  if (screening.end) {
    let end = toMinutes(screening.end)
    if (end <= start) end += 1440
    return end
  }
  return start + (film.runtime ?? 120)
}

function findConflictPair() {
  for (const a of allItems) {
    for (const b of allItems) {
      if (a.screening.id === b.screening.id || a.screening.date !== b.screening.date || a.film.id === b.film.id) continue
      if (toMinutes(a.screening.start) < endMinutes(b) && toMinutes(b.screening.start) < endMinutes(a)) return [a, b]
    }
  }
  return null
}

function findSameVenueTightPair() {
  for (const a of allItems) {
    for (const b of allItems) {
      if (a.screening.id === b.screening.id || a.screening.date !== b.screening.date || a.film.id === b.film.id) continue
      if (a.screening.venue !== b.screening.venue) continue
      const gap = toMinutes(b.screening.start) - endMinutes(a)
      if (gap >= 0 && gap < 120) return [a, b]
    }
  }
  return null
}

const conflictPair = findConflictPair()
const travelPair = findSameVenueTightPair()
const midnightItem = allItems.find(({ screening }) => screening.start === '23:59')
const normalItem = allItems.find(({ screening }) => toMinutes(screening.start) >= 9 * 60 && toMinutes(screening.start) < 18 * 60)

async function withPage(browser, viewport, fn, init = null) {
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()
  const pageErrors = []
  const consoleErrors = []
  page.on('pageerror', (err) => pageErrors.push(String(err)))
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })
  if (init) await page.addInitScript(init)
  try {
    await page.goto(BASE, { waitUntil: 'networkidle' })
    return await fn({ page, context, pageErrors, consoleErrors })
  } finally {
    await context.close()
  }
}

async function run(name, fn) {
  const started = Date.now()
  try {
    await fn()
    results.push({ name, status: 'PASS', ms: Date.now() - started })
    console.log(`PASS ${name}`)
  } catch (error) {
    results.push({ name, status: 'FAIL', ms: Date.now() - started, error: String(error?.stack ?? error) })
    console.error(`FAIL ${name}\n${error?.stack ?? error}`)
  }
}

const browser = await chromium.launch({ headless: true })
try {
  await run('desktop initial load / no runtime errors', async () => {
    await withPage(browser, { width: 1280, height: 900 }, async ({ page, pageErrors }) => {
      await page.locator('.app-shell').waitFor()
      assert.equal(await page.locator('.tabs button').count(), 3)
      assert.ok(await page.locator('.film-card').count() > 0)
      assert.deepEqual(pageErrors, [])
    })
  })

  await run('search, favorite, detail modal, center, escape/outside close', async () => {
    const target = data.films.find((film) => film.title && film.screenings.length) ?? data.films[0]
    await withPage(browser, { width: 1280, height: 900 }, async ({ page, pageErrors }) => {
      await page.locator('.controls input').fill(target.title)
      const card = page.locator('.film-card').first()
      await card.waitFor()
      await card.locator('.favorite-button').click()
      assert.ok((await page.locator('.selection-count').textContent()).includes('0개'))
      await card.locator('.detail-button').click()
      const modal = page.locator('.film-modal')
      await modal.waitFor({ state: 'visible' })
      const box = await modal.boundingBox()
      assert.ok(box)
      const dx = Math.abs((box.x + box.width / 2) - 640)
      const dy = Math.abs((box.y + box.height / 2) - 450)
      assert.ok(dx < 20 && dy < 20, `modal not centered dx=${dx}, dy=${dy}`)
      const activeTag = await page.evaluate(() => document.activeElement?.tagName)
      observations.push({ type: 'modal-focus', activeTag, note: 'Opening detail modal does not explicitly move focus.' })
      await page.keyboard.press('Escape')
      await modal.waitFor({ state: 'hidden' })
      await card.locator('.detail-button').click()
      await modal.waitFor({ state: 'visible' })
      await page.locator('.modal-backdrop').click({ position: { x: 4, y: 4 } })
      await modal.waitFor({ state: 'hidden' })
      assert.deepEqual(pageErrors, [])
    })
  })

  await run('select screening, change ticket status, reload persistence', async () => {
    const target = normalItem
    assert.ok(target)
    await withPage(browser, { width: 1280, height: 900 }, async ({ page, pageErrors }) => {
      await page.locator('.controls input').fill(target.film.title)
      const row = page.locator('.screening-row').filter({ hasText: target.screening.start }).first()
      await row.getByRole('button', { name: '+ 추가' }).click()
      await row.locator('select.ticket-select').selectOption('booked')
      assert.ok((await page.locator('.selection-count').textContent()).includes('1개'))
      await page.reload({ waitUntil: 'networkidle' })
      await page.locator('.controls input').fill(target.film.title)
      const row2 = page.locator('.screening-row').filter({ hasText: target.screening.start }).first()
      assert.equal(await row2.locator('select.ticket-select').inputValue(), 'booked')
      assert.ok(await row2.getByRole('button', { name: '선택됨' }).count())
      assert.deepEqual(pageErrors, [])
    })
  })

  await run('overlap is blocked and alert identifies conflicting screening', async () => {
    assert.ok(conflictPair)
    const [selectedItem, target] = conflictPair
    await withPage(browser, { width: 1280, height: 900 }, async ({ page, pageErrors }) => {
      await page.addInitScript(({ id }) => {
        localStorage.setItem('biff-timetable:selected-screenings:v1', JSON.stringify([id]))
        localStorage.setItem('biff-timetable:ticket-status:v1', JSON.stringify({ [id]: 'planned' }))
      }, { id: selectedItem.screening.id })
      await page.reload({ waitUntil: 'networkidle' })
      await page.locator('.controls input').fill(target.film.title)
      const conflictRow = page.locator('.screening-row.conflict').first()
      await conflictRow.waitFor()
      assert.equal((await conflictRow.locator('.screening-note').textContent())?.trim(), '선택된 회차와 시간이 겹칩니다.')
      const color = await conflictRow.locator('.screening-note').evaluate((el) => getComputedStyle(el).color)
      observations.push({ type: 'conflict-color', color })
      let dialogText = ''
      page.once('dialog', async (dialog) => { dialogText = dialog.message(); await dialog.accept() })
      await conflictRow.getByRole('button', { name: '+ 추가' }).click()
      assert.ok(dialogText.includes(selectedItem.film.title), `alert missing conflicting title: ${dialogText}`)
      assert.ok((await page.locator('.selection-count').textContent()).includes('1개'))
      assert.deepEqual(pageErrors, [])
    })
  })

  await run('detail modal shows overlap and transfer warnings', async () => {
    assert.ok(conflictPair && travelPair)
    const [selectedConflict, targetConflict] = conflictPair
    await withPage(browser, { width: 390, height: 844 }, async ({ page, pageErrors }) => {
      await page.addInitScript(({ id }) => {
        localStorage.setItem('biff-timetable:selected-screenings:v1', JSON.stringify([id]))
        localStorage.setItem('biff-timetable:ticket-status:v1', JSON.stringify({ [id]: 'planned' }))
      }, { id: selectedConflict.screening.id })
      await page.reload({ waitUntil: 'networkidle' })
      await page.locator('.controls input').fill(targetConflict.film.title)
      await page.locator('.detail-button').first().click()
      assert.ok(await page.locator('.modal-screenings > div.conflict .modal-screening-note').count() > 0)
      assert.deepEqual(pageErrors, [])
    })

    const [selectedTravel, targetTravel] = travelPair
    await withPage(browser, { width: 390, height: 844 }, async ({ page, pageErrors }) => {
      await page.addInitScript(({ id }) => {
        localStorage.setItem('biff-timetable:selected-screenings:v1', JSON.stringify([id]))
        localStorage.setItem('biff-timetable:ticket-status:v1', JSON.stringify({ [id]: 'planned' }))
        localStorage.setItem('biff-timetable:user-settings:v1', JSON.stringify({ sameVenueMinutes: 120, sameClusterMinutes: 10, differentVenueMinutes: 30, showTransferWarnings: true, showVenueInTimetable: true, showBookingStatusInTimetable: true }))
      }, { id: selectedTravel.screening.id })
      await page.reload({ waitUntil: 'networkidle' })
      await page.locator('.controls input').fill(targetTravel.film.title)
      await page.locator('.detail-button').first().click()
      const note = page.locator('.modal-screening-note').filter({ hasText: '이동 여유' }).first()
      await note.waitFor()
      assert.ok((await note.textContent()).includes('필요 120분'))
      assert.deepEqual(pageErrors, [])
    })
  })

  await run('timetable normal range and detail modal', async () => {
    assert.ok(normalItem)
    const init = ({ id }) => {
      localStorage.setItem('biff-timetable:selected-screenings:v1', JSON.stringify([id]))
      localStorage.setItem('biff-timetable:ticket-status:v1', JSON.stringify({ [id]: 'planned' }))
    }
    await withPage(browser, { width: 1280, height: 900 }, async ({ page, pageErrors }) => {
      await page.addInitScript(init, { id: normalItem.screening.id })
      await page.reload({ waitUntil: 'networkidle' })
      await page.getByRole('button', { name: '내 시간표' }).click()
      const labels = await page.locator('.time-axis > div').allTextContents()
      assert.equal(labels.at(-1), '00시')
      const block = page.locator('.event-block').first()
      await block.click()
      const modal = page.locator('.film-modal')
      await modal.waitFor({ state: 'visible' })
      assert.ok(await page.locator('.current-screening-badge').count() === 1)
      const box = await modal.boundingBox(); assert.ok(box)
      assert.ok(Math.abs((box.x + box.width / 2) - 640) < 20)
      assert.ok(Math.abs((box.y + box.height / 2) - 450) < 20)
      await page.keyboard.press('Escape')
      assert.deepEqual(pageErrors, [])
    })
  })

  await run('midnight timetable expands to actual end hour', async () => {
    assert.ok(midnightItem)
    await withPage(browser, { width: 1280, height: 900 }, async ({ page, pageErrors }) => {
      await page.addInitScript(({ id }) => {
        localStorage.setItem('biff-timetable:selected-screenings:v1', JSON.stringify([id]))
        localStorage.setItem('biff-timetable:ticket-status:v1', JSON.stringify({ [id]: 'planned' }))
      }, { id: midnightItem.screening.id })
      await page.reload({ waitUntil: 'networkidle' })
      await page.getByRole('button', { name: '내 시간표' }).click()
      const labels = await page.locator('.time-axis > div').allTextContents()
      const last = labels.at(-1)
      observations.push({ type: 'midnight-axis', title: midnightItem.film.title, last })
      assert.notEqual(last, '00시')
      const block = page.locator('.event-block').first()
      const blockBox = await block.boundingBox(); const tableBox = await page.locator('.timetable').boundingBox()
      assert.ok(blockBox && tableBox && blockBox.y + blockBox.height <= tableBox.y + tableBox.height + 1)
      assert.deepEqual(pageErrors, [])
    })
  })

  await run('selection delete cancel then confirm', async () => {
    const candidates = allItems.filter((item) => item.screening.date !== midnightItem?.screening.date).slice(0, 2)
    assert.equal(candidates.length, 2)
    await withPage(browser, { width: 1280, height: 900 }, async ({ page, pageErrors }) => {
      await page.addInitScript(({ ids }) => {
        localStorage.setItem('biff-timetable:selected-screenings:v1', JSON.stringify(ids))
        localStorage.setItem('biff-timetable:ticket-status:v1', JSON.stringify(Object.fromEntries(ids.map((id) => [id, 'planned']))))
      }, { ids: candidates.map((x) => x.screening.id) })
      await page.reload({ waitUntil: 'networkidle' })
      await page.getByRole('button', { name: '내 시간표' }).click()
      await page.getByRole('button', { name: '선택' }).click()
      const blocks = page.locator('.event-block')
      await blocks.nth(0).click(); await blocks.nth(1).click()
      page.once('dialog', (dialog) => dialog.dismiss())
      await page.getByRole('button', { name: '삭제 2' }).click()
      assert.ok((await page.locator('.selection-count').textContent()).includes('2개'))
      page.once('dialog', (dialog) => dialog.accept())
      await page.getByRole('button', { name: '삭제 2' }).click()
      assert.ok((await page.locator('.selection-count').textContent()).includes('0개'))
      assert.deepEqual(pageErrors, [])
    })
  })

  await run('clear all cancel then confirm', async () => {
    assert.ok(normalItem)
    await withPage(browser, { width: 1280, height: 900 }, async ({ page }) => {
      await page.addInitScript(({ id }) => {
        localStorage.setItem('biff-timetable:selected-screenings:v1', JSON.stringify([id]))
        localStorage.setItem('biff-timetable:ticket-status:v1', JSON.stringify({ [id]: 'planned' }))
      }, { id: normalItem.screening.id })
      await page.reload({ waitUntil: 'networkidle' })
      await page.getByRole('button', { name: '내 시간표' }).click()
      page.once('dialog', (dialog) => dialog.dismiss())
      await page.getByRole('button', { name: '전체 비우기' }).click()
      assert.ok((await page.locator('.selection-count').textContent()).includes('1개'))
      page.once('dialog', (dialog) => dialog.accept())
      await page.getByRole('button', { name: '전체 비우기' }).click()
      assert.ok((await page.locator('.selection-count').textContent()).includes('0개'))
    })
  })

  await run('ICS and JSON backup downloads contain expected data', async () => {
    assert.ok(normalItem)
    await withPage(browser, { width: 1280, height: 900 }, async ({ page }) => {
      await page.addInitScript(({ id }) => {
        localStorage.setItem('biff-timetable:selected-screenings:v1', JSON.stringify([id]))
        localStorage.setItem('biff-timetable:ticket-status:v1', JSON.stringify({ [id]: 'booked' }))
      }, { id: normalItem.screening.id })
      await page.reload({ waitUntil: 'networkidle' })
      await page.getByRole('button', { name: '내 시간표' }).click()
      const icsPromise = page.waitForEvent('download')
      await page.getByRole('button', { name: '캘린더' }).click()
      const ics = await icsPromise
      const icsPath = await ics.path(); assert.ok(icsPath)
      const icsText = fs.readFileSync(icsPath, 'utf8')
      assert.ok(icsText.includes('BEGIN:VEVENT'))
      assert.ok(icsText.includes('STATUS:CONFIRMED'))
      assert.ok(icsText.includes('TZID=Asia/Seoul'))

      await page.locator('.backup-menu > summary').click()
      const jsonPromise = page.waitForEvent('download')
      await page.getByRole('button', { name: 'JSON 저장' }).click()
      const json = await jsonPromise
      const jsonPath = await json.path(); assert.ok(jsonPath)
      const payload = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
      assert.deepEqual(payload.selected, [normalItem.screening.id])
      assert.equal(payload.ticketStatus[normalItem.screening.id], 'booked')
    })
  })

  await run('mobile layout has no page-level horizontal overflow and controls do not wrap', async () => {
    const ids = [normalItem?.screening.id].filter(Boolean)
    await withPage(browser, { width: 320, height: 740 }, async ({ page, pageErrors }) => {
      await page.addInitScript(({ ids }) => {
        localStorage.setItem('biff-timetable:selected-screenings:v1', JSON.stringify(ids))
        localStorage.setItem('biff-timetable:ticket-status:v1', JSON.stringify(Object.fromEntries(ids.map((id) => [id, 'planned']))))
      }, { ids })
      await page.reload({ waitUntil: 'networkidle' })
      await page.getByRole('button', { name: '내 시간표' }).click()
      await page.getByRole('button', { name: '선택' }).click()
      const metrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        buttons: Array.from(document.querySelectorAll('.timetable-action-buttons > button, .backup-menu > summary')).map((el) => {
          const s = getComputedStyle(el)
          const r = el.getBoundingClientRect()
          return { text: el.textContent?.trim(), whiteSpace: s.whiteSpace, right: r.right, width: r.width, fontSize: s.fontSize }
        }),
      }))
      observations.push({ type: 'mobile-actions', metrics })
      assert.ok(metrics.scrollWidth <= metrics.clientWidth + 1, JSON.stringify(metrics))
      for (const b of metrics.buttons) {
        assert.equal(b.whiteSpace, 'nowrap')
        assert.ok(b.right <= 320 + 1, JSON.stringify(b))
      }
      assert.deepEqual(pageErrors, [])
    })
  })

  await run('settings persist and transfer matrix renders', async () => {
    await withPage(browser, { width: 390, height: 844 }, async ({ page, pageErrors }) => {
      await page.getByRole('button', { name: '설정' }).click()
      assert.equal(await page.locator('.travel-matrix tbody tr').count(), 6)
      const firstNumber = page.locator('.settings-number-control input').first()
      await firstNumber.fill('25')
      await firstNumber.blur()
      await page.reload({ waitUntil: 'networkidle' })
      await page.getByRole('button', { name: '설정' }).click()
      assert.equal(await page.locator('.settings-number-control input').first().inputValue(), '25')
      assert.deepEqual(pageErrors, [])
    })
  })

  await run('malformed localStorage shapes do not crash app', async () => {
    await withPage(browser, { width: 390, height: 844 }, async ({ page, pageErrors }) => {
      await page.addInitScript(() => {
        localStorage.setItem('biff-timetable:selected-screenings:v1', JSON.stringify({ bad: true }))
        localStorage.setItem('biff-timetable:favorites:v1', JSON.stringify({ bad: true }))
        localStorage.setItem('biff-timetable:ticket-status:v1', JSON.stringify('bad'))
      })
      await page.reload({ waitUntil: 'networkidle' })
      const shellVisible = await page.locator('.app-shell').isVisible().catch(() => false)
      assert.ok(shellVisible, `app shell missing; pageErrors=${JSON.stringify(pageErrors)}`)
      assert.deepEqual(pageErrors, [])
    })
  })

  await run('PNG export trigger exists and export completes for one screening', async () => {
    assert.ok(normalItem)
    await withPage(browser, { width: 1280, height: 900 }, async ({ page, pageErrors }) => {
      await page.addInitScript(({ id }) => {
        localStorage.setItem('biff-timetable:selected-screenings:v1', JSON.stringify([id]))
        localStorage.setItem('biff-timetable:ticket-status:v1', JSON.stringify({ [id]: 'planned' }))
      }, { id: normalItem.screening.id })
      await page.reload({ waitUntil: 'networkidle' })
      await page.getByRole('button', { name: '내 시간표' }).click()
      const pngButton = page.locator('.png-export-trigger')
      await pngButton.waitFor()
      const downloadPromise = page.waitForEvent('download', { timeout: 30000 })
      await pngButton.click()
      const download = await downloadPromise
      assert.equal(download.suggestedFilename(), 'BIFF-timetable.png')
      const path = await download.path(); assert.ok(path)
      assert.ok(fs.statSync(path).size > 1000)
      assert.deepEqual(pageErrors, [])
    })
  })

} finally {
  await browser.close()
}

const failed = results.filter((r) => r.status === 'FAIL')
console.log('\n=== E2E AUDIT SUMMARY ===')
console.log(JSON.stringify({ total: results.length, passed: results.length - failed.length, failed: failed.length, results, observations }, null, 2))
if (failed.length) process.exitCode = 2
