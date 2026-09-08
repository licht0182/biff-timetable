const headers = { 'user-agent': 'Mozilla/5.0 BIFF Timetable Research' }

const scheduleUrl = 'https://www.biff.kr/pop/20250909/schedule_kor.asp'
const res = await fetch(scheduleUrl, { headers })
console.log('schedule status', res.status)
const html = Buffer.from(await res.arrayBuffer()).toString('utf8')
const matches = [...html.matchAll(/href=["']([^"']*prog_view[^"']*)["']/gi)]
console.log('prog_view links', matches.length)
const codes = [...html.matchAll(/>\s*(\d{3})\s*</g)].map(m => m[1])
console.log('3-digit text tokens', codes.length, 'unique', new Set(codes).size)

const firstHref = matches[0]?.[1]?.replaceAll('&amp;', '&')
const idx = firstHref?.match(/[?&]idx=(\d+)/)?.[1]
if (!idx) throw new Error('No idx found')
const detailUrl = `https://www.biff.kr/kor/html/archive/arc_history_view.asp?kind=history&m_idx=${idx}&pyear=2025`
const detailRes = await fetch(detailUrl, { headers })
console.log('detail status', detailRes.status, detailUrl)
const detail = Buffer.from(await detailRes.arrayBuffer()).toString('utf8')
console.log('detail bytes', detail.length, 'replacement chars', (detail.match(/�/g) || []).length)
for (const needle of ['러닝타임', '국가/지역', '제작연도', 'Director', '개막작', 'film_tit', 'program']) {
  const i = detail.indexOf(needle)
  console.log(`\n--- ${needle} @ ${i} ---`)
  if (i >= 0) console.log(detail.slice(Math.max(0, i - 1000), Math.min(detail.length, i + 2000)).replace(/\s+/g, ' '))
}
