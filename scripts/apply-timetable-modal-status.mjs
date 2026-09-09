import { readFile, writeFile } from 'node:fs/promises'

async function replaceOnce(path, from, to) {
  const url = new URL(`../${path}`, import.meta.url)
  const source = await readFile(url, 'utf8')
  if (!source.includes(from)) throw new Error(`${path}: expected source fragment not found`)
  const updated = source.replace(from, to)
  await writeFile(url, updated, 'utf8')
}

await replaceOnce(
  'src/App.tsx',
  `</div><button className={isSelected ? 'selected' : ''} onClick={() => toggle(detailFilm, screening)}>{isSelected ? '선택됨' : '+ 추가'}</button></div>`,
  `</div><div className="modal-screening-actions">{isSelected && <select className={\`ticket-select \${ticketStatus[screening.id] ?? 'planned'}\`} value={ticketStatus[screening.id] ?? 'planned'} onChange={(event) => setScreeningTicketStatus(screening.id, event.target.value as TicketStatus)} aria-label={\`\${detailFilm.title} \${formatDate(screening.date)} \${screening.start} 예매 상태\`}><option value="planned">예매 예정</option><option value="booked">예매 완료</option></select>}<button className={isSelected ? 'selected' : ''} onClick={() => toggle(detailFilm, screening)}>{isSelected ? '선택됨' : '+ 추가'}</button></div></div>`,
)

const cssUrl = new URL('../src/features.css', import.meta.url)
const css = await readFile(cssUrl, 'utf8')
if (!css.includes('.modal-screening-actions{')) {
  await writeFile(cssUrl, `${css.trimEnd()}\n\n.modal-screening-actions{display:flex!important;flex-direction:column;align-items:stretch;gap:4px!important;flex:0 0 105px;min-width:0}\n.modal-screening-actions>.ticket-select,.modal-screening-actions>button{width:100%;max-width:none}\n@media(max-width:700px){.modal-screening-actions{flex-basis:92px}}\n`, 'utf8')
}

await replaceOnce(
  'tests/e2e/smoke.spec.ts',
  `test('blocks adding an overlapping screening and identifies the existing conflict', async ({ page, request }) => {`,
  `test('changes booking status from a timetable detail and persists it', async ({ page }) => {\n  await page.goto('./')\n  await page.getByRole('button', { name: '+ 추가' }).first().click()\n  await page.getByRole('button', { name: '내 시간표' }).click()\n\n  const event = page.locator('.event-block').first()\n  await expect(event).toBeVisible()\n  await event.click()\n\n  const currentRow = page.locator('.modal-screenings>div.current-screening')\n  const statusSelect = currentRow.locator('.ticket-select')\n  await expect(statusSelect).toBeVisible()\n  await expect(statusSelect).toHaveValue('planned')\n  await statusSelect.selectOption('booked')\n  await expect(statusSelect).toHaveValue('booked')\n  await expect.poll(() => page.evaluate((key) => {\n    const statuses = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, string>\n    return Object.values(statuses)[0]\n  }, STATUS_KEY)).toBe('booked')\n\n  await page.keyboard.press('Escape')\n  await expect(event).toHaveClass(/status-booked/)\n\n  await page.reload()\n  await page.getByRole('button', { name: '내 시간표' }).click()\n  await expect(page.locator('.event-block').first()).toHaveClass(/status-booked/)\n})\n\ntest('blocks adding an overlapping screening and identifies the existing conflict', async ({ page, request }) => {`,
)

console.log('Timetable modal booking status patch applied.')
