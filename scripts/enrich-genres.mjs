import { readFile, writeFile } from 'node:fs/promises'

const dataPath = new URL('../public/screenings.json', import.meta.url)
const CHECK_ONLY = process.argv.includes('--check')
const CONCURRENCY = 6
const REQUEST_TIMEOUT_MS = 15_000
const MAX_ATTEMPTS = 3

function decodeEntities(value) {
  const named = { amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"' }
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const lower = entity.toLowerCase()
    if (lower in named) return named[lower]
    if (lower.startsWith('#x')) {
      const code = Number.parseInt(lower.slice(2), 16)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }
    if (lower.startsWith('#')) {
      const code = Number.parseInt(lower.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }
    return match
  })
}

function htmlToLines(html) {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, '\n'),
  )
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function normalize(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function cleanGenreParts(parts, film) {
  const excluded = new Set([
    normalize(film.title),
    normalize(film.englishTitle),
    normalize(film.section),
    '영화 정보',
    '영화정보',
  ].filter(Boolean))

  const cleaned = parts
    .map(normalize)
    .filter((line) => line && !excluded.has(line))
    .filter((line) => !/^(?:국가(?:\/지역)?|제작연도|러닝타임|상영포맷|컬러|Country|Year|Running Time|Format|Color)(?:\s|$)/i.test(line))
    .filter((line) => line.length <= 180)

  if (!cleaned.length) return null
  return cleaned
    .join(' ')
    .replace(/\s*·\s*/g, ' · ')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, ' ')
    .trim()
}

function findCountryIndex(lines, fromIndex, maxDistance = 18) {
  const limit = Math.min(lines.length, fromIndex + maxDistance + 1)
  for (let index = fromIndex + 1; index < limit; index += 1) {
    if (/^(?:국가(?:\/지역)?|Country)(?:\s|$)/i.test(lines[index])) return index
  }
  return -1
}

function parseGenre(html, film) {
  const lines = htmlToLines(html)
  const section = normalize(film.section)

  if (section) {
    for (let index = 0; index < lines.length; index += 1) {
      if (normalize(lines[index]) !== section) continue
      const countryIndex = findCountryIndex(lines, index)
      if (countryIndex < 0) continue
      const genre = cleanGenreParts(lines.slice(index + 1, countryIndex), film)
      if (genre) return genre
    }
  }

  const title = normalize(film.title)
  const englishTitle = normalize(film.englishTitle)
  for (let index = 0; index < lines.length; index += 1) {
    const line = normalize(lines[index])
    const titleMatch = line === title || (englishTitle && line.includes(title) && line.includes(englishTitle))
    if (!titleMatch) continue
    const countryIndex = findCountryIndex(lines, index, 24)
    if (countryIndex < 0) continue
    const genre = cleanGenreParts(lines.slice(index + 1, countryIndex), film)
    if (genre) return genre
  }

  return null
}

function normalizeCharset(value) {
  const charset = normalize(value).toLowerCase().replace(/["']/g, '')
  if (!charset) return null
  if (/^(?:euc-kr|ks_c_5601-1987|ks-c-5601|cp949|ms949|windows-949|x-windows-949)$/.test(charset)) return 'euc-kr'
  if (/^(?:utf-8|utf8)$/.test(charset)) return 'utf-8'
  return charset
}

function decodeHtmlBytes(bytes, contentType, expectedTexts) {
  const latinPreview = new TextDecoder('windows-1252').decode(bytes.subarray(0, Math.min(bytes.length, 16_384)))
  const headerCharset = normalizeCharset(contentType.match(/charset\s*=\s*([^;\s]+)/i)?.[1])
  const metaCharset = normalizeCharset(
    latinPreview.match(/<meta[^>]+charset\s*=\s*["']?([^"'\s/>]+)/i)?.[1]
      ?? latinPreview.match(/<meta[^>]+content\s*=\s*["'][^"']*charset\s*=\s*([^;"'\s]+)/i)?.[1],
  )

  const candidates = Array.from(new Set([headerCharset, metaCharset, 'utf-8', 'euc-kr'].filter(Boolean)))
  let fallback = null
  for (const charset of candidates) {
    try {
      const decoded = new TextDecoder(charset).decode(bytes)
      fallback ??= decoded
      if (expectedTexts.some((text) => text && decoded.includes(text))) return decoded
    } catch {
      // Unsupported charset: try the next candidate.
    }
  }
  return fallback ?? new TextDecoder('utf-8').decode(bytes)
}

async function fetchHtml(url, expectedTexts = []) {
  let lastError
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const response = await fetch(url, {
        headers: {
          'accept-language': 'ko-KR,ko;q=0.9,en;q=0.7',
          'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/153.0 Safari/537.36',
        },
        redirect: 'follow',
        signal: controller.signal,
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const bytes = new Uint8Array(await response.arrayBuffer())
      return decodeHtmlBytes(bytes, response.headers.get('content-type') ?? '', expectedTexts)
    } catch (error) {
      lastError = error
      if (attempt < MAX_ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, attempt * 500))
    } finally {
      clearTimeout(timeout)
    }
  }
  throw lastError
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length)
  let cursor = 0
  async function run() {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await worker(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run))
  return results
}

const raw = await readFile(dataPath, 'utf8')
const data = JSON.parse(raw)
const candidates = data.films.filter((film) => (
  typeof film.url === 'string'
  && /biff\.kr\/kor\/html\/archive\/arc_history_view\.asp/i.test(film.url)
))

let collected = 0
let unchanged = 0
let failed = 0
const failures = []

await mapLimit(candidates, CONCURRENCY, async (film, index) => {
  try {
    const html = await fetchHtml(film.url, [film.title, film.section, film.englishTitle])
    const genre = parseGenre(html, film)
    if (!genre) {
      failed += 1
      failures.push(`${film.title}: 장르를 찾지 못함`)
      return
    }
    if (film.genre === genre) unchanged += 1
    else {
      film.genre = genre
      collected += 1
    }
    process.stdout.write(`\r장르 수집 ${index + 1}/${candidates.length}`)
  } catch (error) {
    failed += 1
    failures.push(`${film.title}: ${error instanceof Error ? error.message : String(error)}`)
  }
})

process.stdout.write('\n')
console.log(`장르 수집 결과: 신규/변경 ${collected}, 동일 ${unchanged}, 실패 ${failed}, 대상 ${candidates.length}`)
if (failures.length) {
  for (const failure of failures.slice(0, 20)) console.warn(`- ${failure}`)
  if (failures.length > 20) console.warn(`- 그 외 ${failures.length - 20}건`)
}

const genreCount = data.films.filter((film) => typeof film.genre === 'string' && film.genre.trim()).length
if (genreCount === 0) {
  console.error('장르를 한 건도 수집하지 못했습니다.')
  process.exit(1)
}

if (!CHECK_ONLY && collected > 0) {
  await writeFile(dataPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

console.log(`DB 장르 보유 작품: ${genreCount}/${data.films.length}`)
