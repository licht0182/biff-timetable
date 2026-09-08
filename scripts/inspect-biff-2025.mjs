const url = 'https://www.biff.kr/pop/20250909/schedule_kor.asp'
const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 BIFF Timetable Research' } })
console.log('status', res.status)
console.log('content-type', res.headers.get('content-type'))
const buffer = Buffer.from(await res.arrayBuffer())
console.log('bytes', buffer.length)
let html = buffer.toString('utf8')
console.log('replacement chars', (html.match(/�/g) || []).length)
const matches = [...html.matchAll(/href=["']([^"']*prog_view[^"']*)["']/gi)]
console.log('prog_view links', matches.length)
for (const match of matches.slice(0, 8)) {
  const i = match.index ?? 0
  console.log('\n--- LINK ---\n', match[1])
  console.log(html.slice(Math.max(0, i - 700), Math.min(html.length, i + 1200)).replace(/\s+/g, ' '))
}
const codes = [...html.matchAll(/>\s*(\d{3})\s*</g)].map(m => m[1])
console.log('3-digit text tokens', codes.length, 'unique', new Set(codes).size)
