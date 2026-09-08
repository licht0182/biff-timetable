import { readFile } from 'node:fs/promises'

const scheduleUrl = 'https://www.biff.kr/pop/20250909/schedule_kor.asp'
const cancelled = new Set(['034', '099'])
const response = await fetch(scheduleUrl, { headers: { 'user-agent': 'Mozilla/5.0 BIFF Timetable Research' } })
if (!response.ok) throw new Error(`schedule fetch failed: ${response.status}`)
const html = Buffer.from(await response.arrayBuffer()).toString('utf8')
const rawCodes = new Set([...html.matchAll(/data-scode="(\d{3})"/g)].map((match) => match[1]))
const expected = new Set([...rawCodes].filter((code) => !cancelled.has(code)))
const generated = JSON.parse(await readFile('generated-screenings.json', 'utf8'))
const outputCodes = new Set(generated.films.flatMap((film) => film.screenings.map((screening) => screening.code)))
const missing = [...expected].filter((code) => !outputCodes.has(code)).sort()
const extra = [...outputCodes].filter((code) => !expected.has(code)).sort()
console.log(`Raw official schedule: ${rawCodes.size} unique codes`)
console.log(`Expected after cancellations: ${expected.size}`)
console.log(`Generated: ${outputCodes.size}`)
console.log('Missing codes:', missing.length ? missing.join(', ') : 'none')
console.log('Extra codes:', extra.length ? extra.join(', ') : 'none')
if (missing.length || extra.length || outputCodes.size !== expected.size) process.exit(1)
