import fs from 'node:fs'

const FILMS_PATH = new URL('../public/films-2026.json', import.meta.url)
const films = JSON.parse(fs.readFileSync(FILMS_PATH, 'utf8'))

const requestedSections = process.argv.slice(2)
const allSections = [...new Set(
  films.flatMap((film) => (film.biff?.sections ?? []).map((section) => section.name)),
)].sort((a, b) => a.localeCompare(b, 'ko'))

const targets = requestedSections.length > 0 ? requestedSections : allSections

function count(values) {
  const result = new Map()
  for (const value of values.filter(Boolean)) {
    result.set(value, (result.get(value) ?? 0) + 1)
  }
  return Object.fromEntries(
    [...result.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko')),
  )
}

function median(values) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

function round1(value) {
  return Math.round(value * 10) / 10
}

function analyzeSection(sectionName) {
  const sectionFilms = films.filter((film) =>
    (film.biff?.sections ?? []).some((section) => section.name === sectionName),
  )

  const runtimes = sectionFilms
    .map((film) => film.production?.runtimeMinutes)
    .filter(Number.isFinite)

  return {
    section: sectionName,
    filmCount: sectionFilms.length,
    countryParticipation: count(sectionFilms.flatMap((film) => film.production?.countries ?? [])),
    themes: count(sectionFilms.flatMap((film) => film.classification?.themes ?? [])),
    premieres: count(sectionFilms.flatMap((film) => film.biff?.premiere ?? [])),
    runtime: runtimes.length === 0 ? null : {
      averageMinutes: round1(runtimes.reduce((sum, value) => sum + value, 0) / runtimes.length),
      medianMinutes: median(runtimes),
      shortestMinutes: Math.min(...runtimes),
      longestMinutes: Math.max(...runtimes),
    },
    formats: count(sectionFilms.map((film) => film.production?.screeningFormat)),
    colors: count(sectionFilms.map((film) => film.production?.color)),
    multiSectionFilms: sectionFilms
      .filter((film) => (film.biff?.sections ?? []).length > 1)
      .map((film) => ({
        title: film.title?.display,
        sections: film.biff.sections.map((section) => section.name),
      })),
    films: sectionFilms.map((film) => ({
      id: film.id,
      title: film.title,
      director: film.director?.display,
      countries: film.production?.countries ?? [],
      runtimeMinutes: film.production?.runtimeMinutes ?? null,
      themes: film.classification?.themes ?? [],
      premiere: film.biff?.premiere ?? [],
      source: film.source?.url,
    })),
  }
}

const analyses = targets.map(analyzeSection)
const missing = analyses.filter((analysis) => analysis.filmCount === 0).map((analysis) => analysis.section)
if (missing.length > 0) {
  console.error(`Unknown or empty BIFF section: ${missing.join(', ')}`)
  process.exit(1)
}

console.log(JSON.stringify(requestedSections.length === 1 ? analyses[0] : analyses, null, 2))
