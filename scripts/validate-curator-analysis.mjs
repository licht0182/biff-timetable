import fs from 'node:fs'

const films = JSON.parse(fs.readFileSync(new URL('../public/films-2026.json', import.meta.url), 'utf8'))
const content = fs.readFileSync(new URL('../src/curator-section-content.ts', import.meta.url), 'utf8')

const competition = films.filter((film) =>
  (film.biff?.sections ?? []).some((section) => section.name === '경쟁'),
)

if (competition.length !== 13) {
  console.error(`Expected 13 competition films, got ${competition.length}`)
  process.exit(1)
}

const missing = competition
  .map((film) => film.title?.ko)
  .filter((title) => title && !content.includes(`title: '${title.replaceAll("'", "\\'")}'`))

if (missing.length > 0) {
  console.error(`Competition curator article is missing: ${missing.join(', ')}`)
  process.exit(1)
}

const worldPremieres = competition.filter((film) => (film.biff?.premiere ?? []).includes('World Premiere')).length
const womenThemes = competition.filter((film) => (film.classification?.themes ?? []).includes('여성')).length
const runtimes = competition.map((film) => film.production?.runtimeMinutes).filter(Number.isFinite)
const averageRuntime = Math.round(runtimes.reduce((sum, value) => sum + value, 0) / runtimes.length)

const requiredStatFragments = [
  `{ value: '13편', label: '경쟁작' }`,
  `{ value: '${worldPremieres}편', label: 'World Premiere' }`,
  `{ value: '약 ${averageRuntime}분', label: '평균 러닝타임' }`,
  `{ value: '${womenThemes}편', label: '‘여성’ 주제 포함' }`,
]

const missingStats = requiredStatFragments.filter((fragment) => !content.includes(fragment))
if (missingStats.length > 0) {
  console.error('Competition curator statistics are stale or missing:')
  for (const fragment of missingStats) console.error(`- ${fragment}`)
  process.exit(1)
}

console.log(
  `Curator competition article OK: ${competition.length} films, ${worldPremieres} world premieres, ` +
  `${womenThemes} women-theme films, ~${averageRuntime} min average runtime.`,
)
