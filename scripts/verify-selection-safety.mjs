import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const pageErrors = []
page.on('pageerror', (error) => pageErrors.push(String(error)))

try {
  await page.goto('http://127.0.0.1:4173/biff-timetable/', { waitUntil: 'networkidle' })
  await page.locator('.film-card').first().waitFor({ state: 'visible' })

  await page.getByRole('button', { name: '+ 추가' }).first().click()
  if ((await page.locator('.selection-count').textContent())?.trim() !== '총 1개 선택') {
    throw new Error('initial screening selection failed')
  }

  const conflictRow = page.locator('.screening-row.conflict').first()
  await conflictRow.waitFor({ state: 'visible' })
  const conflictButton = conflictRow.getByRole('button', { name: '+ 추가' })

  let conflictAlert = ''
  page.once('dialog', async (dialog) => {
    conflictAlert = dialog.message()
    await dialog.accept()
  })
  await conflictButton.click()
  if (!conflictAlert.includes('이미 선택한 회차와 시간이 겹칩니다') || !conflictAlert.includes('기존 회차를 먼저 제거')) {
    throw new Error(`unexpected conflict warning: ${conflictAlert}`)
  }
  if ((await page.locator('.selection-count').textContent())?.trim() !== '총 1개 선택') {
    throw new Error('conflicting screening was added despite warning')
  }

  await page.getByRole('button', { name: '내 시간표' }).click()
  await page.locator('.event-block').first().waitFor({ state: 'visible' })

  let clearPrompt = ''
  page.once('dialog', async (dialog) => {
    clearPrompt = dialog.message()
    await dialog.dismiss()
  })
  await page.getByRole('button', { name: '전체 비우기' }).click()
  if (!clearPrompt.includes('1개 회차를 모두 삭제하시겠습니까')) {
    throw new Error(`unexpected clear confirmation: ${clearPrompt}`)
  }
  if (await page.locator('.event-block').count() !== 1) {
    throw new Error('dismissed clear confirmation still removed timetable items')
  }

  page.once('dialog', async (dialog) => { await dialog.accept() })
  await page.getByRole('button', { name: '전체 비우기' }).click()
  await page.getByText('아직 선택한 상영 회차가 없습니다.').waitFor({ state: 'visible' })
  if ((await page.locator('.selection-count').textContent())?.trim() !== '총 0개 선택') {
    throw new Error('clear confirmation did not remove all selections')
  }

  if (pageErrors.length) throw new Error(`page errors:\n${pageErrors.join('\n')}`)
  console.log(JSON.stringify({ conflictAlert, clearPrompt }, null, 2))
} finally {
  await browser.close()
}
