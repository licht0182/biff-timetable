import { writeFile } from 'node:fs/promises'

const SCHEDULE_URL = 'https://www.biff.kr/pop/20250909/schedule_kor.asp'
const ARCHIVE_BASE = 'https://www.biff.kr/kor/html/archive/arc_history_view.asp?kind=history&pyear=2025&m_idx='
const HEADERS = { 'user-agent': 'Mozilla/5.0 BIFF Timetable Research (personal timetable test)' }

const CANCELLED_CODES = new Set(['034', '099'])
const GV_CANCELLED = new Set(['094', '482', '415', '483', '272', '282', '566'])
const GV_ADDED = new Set(['492', '452', '528', '491', '560', '487', '561', '532', '606', '410', '521', '459'])
const RUNTIME_OVERRIDES = new Map([
  ['The Second Child', 102],
])
const TITLE_OVERRIDES = new Map([
  ['Nouvelle Vague', { title: '누벨바그', englishTitle: 'Nouvelle Vague' }],
  ['Eureka', { title: '유레카(리마스터링)', englishTitle: 'Eureka (remastered)' }],
  ['Exterior Night', { title: '익스테리어, 나잇', englishTitle: 'Exterior Night' }],
])
const AWARD_SCREENINGS = new Map([
  ['621', 'On Your Lap'],
  ['622', 'Hana Korea'],
  ['623', 'Coming of Age'],
  ['624', "The Observer's Journal"],
  ['625', 'Where We Stay for a While'],
  ['626', 'I, Poppy'],
])

function decodeEntities(value = '') {
  return value
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
}

function cleanText(value = '') {
  return decodeEntities(value.replace(/<br\s*\/?\s*>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function capture(html, regex) {
  const match = html.match(regex)
  return match ? cleanText(match[1]) : ''
}

function normalizeEnglish(value = '') {
  return value
    .replace(/[′’‘`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function parseIdx(href = '') {
  return decodeEntities(href).match(/[?&]idx=(\d+)/)?.[1] ?? ''
}

function toAbsoluteProgramUrl(href = '') {
  const decoded = decodeEntities(href)
  return decoded ? new URL(decoded, 'https://www.biff.kr').toString() : ''
}

async function fetchText(url, attempts = 3) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: HEADERS })
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
      return Buffer.from(await response.arrayBuffer()).toString('utf8')
    } catch (error) {
      lastError = error
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 500 * attempt))
    }
  }
  throw lastError
}

function parseSchedule(html) {
  const items = []
  const dayMatches = [...html.matchAll(/<div class="day-(\d+) day-section">/g)]

  for (let d = 0; d < dayMatches.length; d += 1) {
    const start = dayMatches[d].index ?? 0
    const end = d + 1 < dayMatches.length ? (dayMatches[d + 1].index ?? html.length) : html.length
    const dayHtml = html.slice(start, end)
    const scheduleTitle = capture(dayHtml, /<h3 class="tit_schedule">([\s\S]*?)<\/h3>/i)
    const dateMatch = scheduleTitle.match(/(\d{1,2})월\s*(\d{1,2})일/)
    if (!dateMatch) continue
    const date = `2025-${dateMatch[1].padStart(2, '0')}-${dateMatch[2].padStart(2, '0')}`

    const venueMatches = [...dayHtml.matchAll(/<div class="sch_li">/g)]
    for (let v = 0; v < venueMatches.length; v += 1) {
      const venueStart = venueMatches[v].index ?? 0
      const venueEnd = v + 1 < venueMatches.length ? (venueMatches[v + 1].index ?? dayHtml.length) : dayHtml.length
      const venueHtml = dayHtml.slice(venueStart, venueEnd)
      const venue = capture(venueHtml, /<div class="sch_li_tit">([\s\S]*?)<\/div>/i)
      if (!venue) continue

      const itemMatches = [...venueHtml.matchAll(/<div class="sch_it\b[^">]*">/g)]
      for (let i = 0; i < itemMatches.length; i += 1) {
        const itemStart = itemMatches[i].index ?? 0
        const itemEnd = i + 1 < itemMatches.length ? (itemMatches[i + 1].index ?? venueHtml.length) : venueHtml.length
        const itemHtml = venueHtml.slice(itemStart, itemEnd)
        const code = itemHtml.match(/data-scode="(\d{3})"/)?.[1] ?? ''
        const time = capture(itemHtml, /<p class="time en">([\s\S]*?)<\/p>/i)
        if (!code || !time || !/^\d{2}:\d{2}$/.test(time)) continue

        const gv = /ico_grade\s+ico_gv/i.test(itemHtml)
        const bundle = /ico_grade\s+ico_bundle/i.test(itemHtml)
        const links = [...itemHtml.matchAll(/<a href="([^"]*prog_view[^"]*)">([\s\S]*?)<\/a>/gi)].map((match) => {
          const body = match[2]
          return {
            href: decodeEntities(match[1]),
            idx: parseIdx(match[1]),
            title: capture(body, /<span class="film_tit_kor">([\s\S]*?)<\/span>/i),
            englishTitle: capture(body, /<span class="film_tit_eng[^">]*">([\s\S]*?)<\/span>/i),
          }
        }).filter((link) => link.idx)

        let title = ''
        let englishTitle = ''
        if (bundle) {
          title = capture(itemHtml, /<p class="film_tit_kor">([\s\S]*?)<\/p>/i)
          englishTitle = capture(itemHtml, /<p class="film_tit_eng[^">]*">([\s\S]*?)<\/p>/i)
        } else if (links[0]) {
          title = links[0].title
          englishTitle = links[0].englishTitle
        } else {
          title = capture(itemHtml, /<(?:p|span)[^>]*class="[^"]*film_tit_kor[^"]*"[^>]*>([\s\S]*?)<\/(?:p|span)>/i)
          englishTitle = capture(itemHtml, /<(?:p|span)[^>]*class="[^"]*film_tit_eng[^"]*"[^>]*>([\s\S]*?)<\/(?:p|span)>/i)
          if (!title) {
            const filmBlock = itemHtml.match(/<div class="film_tit">([\s\S]*?)<div class="grade">/i)?.[1] ?? ''
            const withoutTime = filmBlock.replace(/<p class="time en">[\s\S]*?<\/p>/i, '')
            title = cleanText(withoutTime)
          }
        }

        items.push({ code, date, start: time, venue, gv, bundle, title, englishTitle, links })
      }
    }
  }
  return items
}

function parseArchive(html, idx) {
  const titleGroup = html.match(/<span class="h2 tit_h1">([\s\S]*?)<small class="film_tit_en">([\s\S]*?)<\/small><\/span>/i)
  const title = titleGroup ? cleanText(titleGroup[1]) : ''
  const englishTitle = titleGroup ? cleanText(titleGroup[2]) : ''
  const afterTitle = titleGroup ? html.slice((titleGroup.index ?? 0) + titleGroup[0].length) : html
  const section = capture(afterTitle, /<p class="film_tit">([\s\S]*?)<\/p>/i)
  const country = capture(html, /<span class="screen_outx">국가(?:\/지역)?<\/span>([\s\S]*?)<\/li>/i)
  const yearRaw = capture(html, /<span class="screen_outx">제작연도<\/span>([\s\S]*?)<\/li>/i)
  const runtimeRaw = capture(html, /<span class="screen_outx">러닝타임<\/span>([\s\S]*?)<\/li>/i)
  const runtime = Number(runtimeRaw.match(/\d+/)?.[0] ?? 0) || undefined
  const year = Number(yearRaw.match(/\d{4}/)?.[0] ?? 0) || undefined
  const directors = [...html.matchAll(/<strong class="dir_name desc bold">([\s\S]*?)<\/strong>/gi)]
    .map((match) => cleanText(match[1]))
    .filter(Boolean)

  return {
    idx,
    title,
    englishTitle,
    director: [...new Set(directors)].join(', '),
    country,
    section,
    runtime,
    year,
    url: `${ARCHIVE_BASE}${idx}`,
  }
}

async function mapLimit(values, limit, mapper) {
  const output = new Array(values.length)
  let cursor = 0
  async function worker() {
    while (true) {
      const index = cursor
      cursor += 1
      if (index >= values.length) return
      output[index] = await mapper(values[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, () => worker()))
  return output
}

function screeningFromItem(item) {
  const screening = {
    id: `biff2025-${item.code}`,
    date: item.date,
    start: item.start,
    venue: item.venue,
    gv: GV_CANCELLED.has(item.code) ? false : (GV_ADDED.has(item.code) ? true : item.gv),
    code: item.code,
  }
  if (item.code === '001') screening.end = '22:19'
  if (item.code === '002') screening.end = '22:00'
  return screening
}

function overrideTitles(title, englishTitle) {
  const override = TITLE_OVERRIDES.get(englishTitle)
  return override ?? { title, englishTitle }
}

const scheduleHtml = await fetchText(SCHEDULE_URL)
const parsed = parseSchedule(scheduleHtml)
const allCodes = new Set(parsed.map((item) => item.code))
const finalItems = parsed.filter((item) => !CANCELLED_CODES.has(item.code))

const idxSet = new Set()
for (const item of finalItems) for (const link of item.links) idxSet.add(link.idx)
const idxs = [...idxSet]
console.log(`Fetching ${idxs.length} BIFF 2025 archive film pages...`)

const metadataResults = await mapLimit(idxs, 6, async (idx, index) => {
  if (index % 25 === 0) console.log(`archive ${index + 1}/${idxs.length}`)
  try {
    const html = await fetchText(`${ARCHIVE_BASE}${idx}`)
    return parseArchive(html, idx)
  } catch (error) {
    console.warn(`archive fetch failed ${idx}:`, error?.message ?? error)
    return { idx, url: `${ARCHIVE_BASE}${idx}` }
  }
})
const metadataByIdx = new Map(metadataResults.map((meta) => [meta.idx, meta]))

const filmsByIdx = new Map()
const bundleFilms = new Map()
const eventFilms = []
const unresolved = []

for (const item of finalItems) {
  if (item.bundle) {
    const componentMeta = item.links.map((link) => metadataByIdx.get(link.idx)).filter(Boolean)
    const bundleKey = `${item.title}|${item.links.map((link) => link.idx).join(',')}`
    let film = bundleFilms.get(bundleKey)
    if (!film) {
      const runtimes = componentMeta.map((meta) => meta?.runtime).filter((value) => Number.isFinite(value))
      const sections = [...new Set(componentMeta.map((meta) => meta?.section).filter(Boolean))]
      const countries = [...new Set(componentMeta.map((meta) => meta?.country).filter(Boolean))]
      film = {
        id: `biff2025-bundle-${item.code}`,
        title: item.title || `묶음상영 ${item.code}`,
        englishTitle: item.englishTitle || undefined,
        country: countries.join(' / ') || undefined,
        section: item.title.startsWith('미드나잇 패션') ? '미드나잇 패션' : (sections.length === 1 ? sections[0] : '묶음상영'),
        runtime: runtimes.length === componentMeta.length && runtimes.length ? runtimes.reduce((sum, runtime) => sum + runtime, 0) : undefined,
        year: 2025,
        url: SCHEDULE_URL,
        screenings: [],
      }
      bundleFilms.set(bundleKey, film)
    }
    film.screenings.push(screeningFromItem(item))
    continue
  }

  const primary = item.links[0]
  if (primary?.idx) {
    let film = filmsByIdx.get(primary.idx)
    if (!film) {
      const meta = metadataByIdx.get(primary.idx) ?? {}
      const titles = overrideTitles(item.title || meta.title || `작품 ${primary.idx}`, item.englishTitle || meta.englishTitle || '')
      film = {
        id: `biff2025-${primary.idx}`,
        title: titles.title,
        englishTitle: titles.englishTitle || undefined,
        director: meta.director || undefined,
        country: meta.country || undefined,
        section: meta.section || undefined,
        runtime: RUNTIME_OVERRIDES.get(titles.englishTitle) ?? meta.runtime,
        url: meta.url || toAbsoluteProgramUrl(primary.href),
        year: meta.year,
        screenings: [],
      }
      filmsByIdx.set(primary.idx, film)
    }
    film.screenings.push(screeningFromItem(item))
    continue
  }

  if (AWARD_SCREENINGS.has(item.code)) continue

  const eventTitle = item.code === '002' ? '폐막식 + 루오무의 황혼' : (item.title || `BIFF 행사 ${item.code}`)
  eventFilms.push({
    id: `biff2025-event-${item.code}`,
    title: eventTitle,
    englishTitle: item.englishTitle || undefined,
    section: item.code === '002' ? '개·폐막식' : '행사',
    runtime: item.code === '002' ? 240 : undefined,
    year: 2025,
    url: SCHEDULE_URL,
    screenings: [screeningFromItem(item)],
  })
}

const regularFilms = [...filmsByIdx.values()]
const byEnglish = new Map(regularFilms.filter((film) => film.englishTitle).map((film) => [normalizeEnglish(film.englishTitle), film]))
for (const item of finalItems.filter((entry) => AWARD_SCREENINGS.has(entry.code))) {
  const winner = AWARD_SCREENINGS.get(item.code)
  const film = byEnglish.get(normalizeEnglish(winner))
  if (!film) {
    unresolved.push({ type: 'award', code: item.code, target: winner })
    eventFilms.push({
      id: `biff2025-award-${item.code}`,
      title: item.title || `수상작 상영 ${item.code}`,
      englishTitle: item.englishTitle || undefined,
      section: '수상작 상영',
      year: 2025,
      url: SCHEDULE_URL,
      screenings: [screeningFromItem(item)],
    })
  } else {
    film.screenings.push(screeningFromItem(item))
  }
}

const films = [...regularFilms, ...bundleFilms.values(), ...eventFilms]
  .map((film) => ({ ...film, screenings: film.screenings.sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`)) }))
  .sort((a, b) => a.title.localeCompare(b.title, 'ko'))

const filmScreenings = films.flatMap((film) => film.screenings)
const missingRuntimeFilms = films.filter((film) => film.section !== '행사' && film.section !== '개·폐막식' && film.runtime == null)
const archiveMissingRuntime = metadataResults.filter((meta) => meta.title && meta.runtime == null)
const missingMetadata = metadataResults.filter((meta) => !meta.title)
const bundleSummary = [...bundleFilms.values()].map((film) => ({ title: film.title, runtime: film.runtime, screenings: film.screenings.map((s) => s.code) }))

const data = {
  note: 'BIFF 2025 공식 한국어 시간표 전체 테스트 데이터입니다. 2025-09-23 공식 변경 공지의 상영 취소·GV 변경·러닝타임/제목 변경을 반영했고, 영화 러닝타임은 BIFF 2025 공식 아카이브를 우선 사용했습니다. 9월 26일 수상작 상영 슬롯은 실제 수상 결과와 연결했습니다.',
  source: SCHEDULE_URL,
  films,
}

await writeFile('generated-screenings.json', `${JSON.stringify(data, null, 2)}\n`, 'utf8')
await writeFile('generated-report.json', `${JSON.stringify({
  rawScheduleCodes: allCodes.size,
  rawParsedItems: parsed.length,
  cancelledCodesRemoved: [...CANCELLED_CODES],
  finalScreenings: filmScreenings.length,
  films: films.length,
  archivePages: idxs.length,
  archiveMissingRuntime: archiveMissingRuntime.map((meta) => ({ idx: meta.idx, title: meta.title, englishTitle: meta.englishTitle })),
  missingRuntimeFilms: missingRuntimeFilms.map((film) => ({ id: film.id, title: film.title, englishTitle: film.englishTitle, section: film.section })),
  missingMetadata: missingMetadata.map((meta) => meta.idx),
  unresolved,
  bundleSummary,
  gvCancelledApplied: [...GV_CANCELLED],
  gvAddedApplied: [...GV_ADDED],
}, null, 2)}\n`, 'utf8')

console.log(`Parsed ${parsed.length} coded schedule entries (${allCodes.size} unique codes).`)
console.log(`Final: ${films.length} entries / ${filmScreenings.length} screenings after cancellations.`)
console.log(`Archive pages: ${idxs.length}; archive runtime missing: ${archiveMissingRuntime.length}; output runtime missing (non-event): ${missingRuntimeFilms.length}.`)
console.log(`Bundles: ${bundleFilms.size}; unresolved award mappings: ${unresolved.length}; metadata failures: ${missingMetadata.length}.`)
if (missingRuntimeFilms.length) console.log('MISSING_RUNTIME', missingRuntimeFilms.map((film) => `${film.title} / ${film.englishTitle ?? ''}`).join(' | '))
if (unresolved.length) console.log('UNRESOLVED', JSON.stringify(unresolved))
