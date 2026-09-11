import fs from 'node:fs'

const films = JSON.parse(fs.readFileSync(new URL('../public/films-2026.json', import.meta.url), 'utf8'))

const guides = [
  {
    section: '경쟁',
    file: '../src/curator-section-content.ts',
    expectedCount: 13,
    stats: ({ films: xs, averageRuntime, themeCount, premiereCount }) => [
      `{ value: '${xs.length}편', label: '경쟁작' }`,
      `{ value: '${premiereCount('World Premiere')}편', label: 'World Premiere' }`,
      `{ value: '약 ${averageRuntime}분', label: '평균 러닝타임' }`,
      `{ value: '${themeCount('여성')}편', label: '‘여성’ 주제 포함' }`,
    ],
  },
  {
    section: '아이콘',
    file: '../src/curator-section-guide-icons.ts',
    expectedCount: 35,
    stats: ({ films: xs, averageRuntime, themeCount }) => [
      `{ value: '${xs.length}편', label: '전체 작품' }`,
      `{ value: '약 ${averageRuntime}분', label: '평균 러닝타임' }`,
      `{ value: '${themeCount('가족/아동')}편', label: '가족/아동 주제' }`,
      `{ value: '${themeCount('예술/예술가')}편', label: '예술/예술가 주제' }`,
    ],
  },
  {
    section: '비전 - 한국',
    file: '../src/curator-section-guides-vision.ts',
    expectedCount: 12,
    stats: ({ films: xs, averageRuntime, themeCount, premiereCount }) => [
      `{ value: '${xs.length}편', label: '전체 작품' }`,
      `{ value: '${premiereCount('World Premiere')}편', label: 'World Premiere' }`,
      `{ value: '약 ${averageRuntime}분', label: '평균 러닝타임' }`,
      `{ value: '${themeCount('사랑/연애/로맨스')}편', label: '사랑/연애/로맨스' }`,
    ],
  },
  {
    section: '비전 - 아시아',
    file: '../src/curator-section-guides-vision.ts',
    expectedCount: 12,
    stats: ({ films: xs, averageRuntime, themeCount, premiereCount }) => [
      `{ value: '${xs.length}편', label: '전체 작품' }`,
      `{ value: '${premiereCount('World Premiere')}편', label: 'World Premiere' }`,
      `{ value: '약 ${averageRuntime}분', label: '평균 러닝타임' }`,
      `{ value: '${themeCount('성장영화/청춘')}편', label: '성장영화/청춘' }`,
    ],
  },
  {
    section: '월드 시네마',
    file: '../src/curator-section-guides-world.ts',
    expectedCount: 29,
    stats: ({ films: xs, averageRuntime, themeCount }) => [
      `{ value: '${xs.length}편', label: '전체 작품' }`,
      `{ value: '약 ${averageRuntime}분', label: '평균 러닝타임' }`,
      `{ value: '${themeCount('인권/노동/사회')}편', label: '인권/노동/사회' }`,
      `{ value: '${themeCount('성장영화/청춘')}편', label: '성장영화/청춘' }`,
    ],
  },
  {
    section: '플래시 포워드',
    file: '../src/curator-section-guides-world.ts',
    expectedCount: 12,
    stats: ({ films: xs, averageRuntime, themeCount }) => [
      `{ value: '${xs.length}편', label: '전체 작품' }`,
      `{ value: '약 ${averageRuntime}분', label: '평균 러닝타임' }`,
      `{ value: '${themeCount('성장영화/청춘')}편', label: '성장영화/청춘' }`,
      `{ value: '${themeCount('LGBTQ+')}편', label: 'LGBTQ+ 주제' }`,
    ],
  },
  {
    section: '한국영화의 오늘 - 파노라마',
    file: '../src/curator-section-guides-korean-today.ts',
    expectedCount: 6,
    stats: ({ films: xs, averageRuntime, themeCount, premiereCount }) => [
      `{ value: '${xs.length}편', label: '전체 작품' }`,
      `{ value: '${premiereCount('World Premiere')}편', label: 'World Premiere' }`,
      `{ value: '약 ${averageRuntime}분', label: '평균 러닝타임' }`,
      `{ value: '${themeCount('여성')}편', label: '여성 주제' }`,
    ],
  },
  {
    section: '한국영화의 오늘 - 스페셜 프리미어',
    file: '../src/curator-section-guides-korean-today.ts',
    expectedCount: 3,
    stats: ({ films: xs, averageRuntime, themeCount, premiereCount }) => [
      `{ value: '${xs.length}편', label: '전체 작품' }`,
      `{ value: '${premiereCount('World Premiere')}편', label: 'World Premiere' }`,
      `{ value: '약 ${averageRuntime}분', label: '평균 러닝타임' }`,
      `{ value: '${themeCount('가족/아동')}편', label: '가족/아동 주제' }`,
    ],
  },
  {
    section: '아시아영화의 창',
    file: '../src/curator-section-guide-asian-window.ts',
    expectedCount: 27,
    stats: ({ films: xs, averageRuntime, themeCount }) => [
      `{ value: '${xs.length}편', label: '전체 작품' }`,
      `{ value: '약 ${averageRuntime}분', label: '평균 러닝타임' }`,
      `{ value: '${themeCount('가족/아동')}편', label: '가족/아동 주제' }`,
      `{ value: '${themeCount('인권/노동/사회')}편', label: '인권/노동/사회 주제' }`,
    ],
  },
]

function sectionFilms(sectionName) {
  return films.filter((film) =>
    (film.biff?.sections ?? []).some((section) => section.name === sectionName),
  )
}

let failed = false

for (const guide of guides) {
  const xs = sectionFilms(guide.section)
  const content = fs.readFileSync(new URL(guide.file, import.meta.url), 'utf8')

  if (xs.length !== guide.expectedCount) {
    console.error(`[${guide.section}] Expected ${guide.expectedCount} films, got ${xs.length}`)
    failed = true
    continue
  }

  const missing = xs
    .map((film) => film.title?.ko)
    .filter((title) => title && !content.includes(`title: '${title.replaceAll("'", "\\'")}'`))

  if (missing.length > 0) {
    console.error(`[${guide.section}] Curator article is missing: ${missing.join(', ')}`)
    failed = true
  }

  const runtimes = xs.map((film) => film.production?.runtimeMinutes).filter(Number.isFinite)
  const averageRuntime = Math.round(runtimes.reduce((sum, value) => sum + value, 0) / runtimes.length)
  const themeCount = (theme) => xs.filter((film) => (film.classification?.themes ?? []).includes(theme)).length
  const premiereCount = (premiere) => xs.filter((film) => (film.biff?.premiere ?? []).includes(premiere)).length

  const requiredStats = guide.stats({ films: xs, averageRuntime, themeCount, premiereCount })
  const missingStats = requiredStats.filter((fragment) => !content.includes(fragment))
  if (missingStats.length > 0) {
    console.error(`[${guide.section}] Curator statistics are stale or missing:`)
    for (const fragment of missingStats) console.error(`- ${fragment}`)
    failed = true
  }

  console.log(
    `Curator guide OK: ${guide.section} — ${xs.length} films, ~${averageRuntime} min average runtime.`,
  )
}

if (failed) process.exit(1)
