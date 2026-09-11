import fs from 'node:fs'

const FILMS_PATH = new URL('../public/films-2026.json', import.meta.url)
const META_PATH = new URL('../public/films-2026.meta.json', import.meta.url)
const EXPECTED_FILMS = 246
const PREMIERE_LABELS = new Set(['World Premiere', 'International Premiere', 'Korean Premiere', 'Asian Premiere'])

function fail(message) {
  console.error(`[films-2026] ${message}`)
  process.exitCode = 1
}

function clean(value) {
  return String(value ?? '').replace(/\uFEFF/g, '').replace(/\s+/g, ' ').trim()
}

const films = JSON.parse(fs.readFileSync(FILMS_PATH, 'utf8'))
const meta = JSON.parse(fs.readFileSync(META_PATH, 'utf8'))

if (!Array.isArray(films)) fail('database root must be an array')
if (films.length !== EXPECTED_FILMS) fail(`expected ${EXPECTED_FILMS} films, got ${films.length}`)
if (meta.filmCount !== films.length) fail(`meta filmCount ${meta.filmCount} does not match data ${films.length}`)
if (meta.schemaVersion < 5) fail(`schemaVersion must be >= 3, got ${meta.schemaVersion}`)

const ids = new Set()
const urls = new Set()
const sectionMembershipCounts = new Map()
let multipleSections = 0
let withThemes = 0

for (const [index, film] of films.entries()) {
  const label = film?.title?.display || film?.id || `record #${index}`

  if (!film?.id) fail(`${label}: missing id`)
  if (ids.has(film.id)) fail(`${label}: duplicate id ${film.id}`)
  ids.add(film.id)

  const sourceUrl = film?.source?.url
  if (!sourceUrl || !/^https:\/\/(?:www\.)?biff\.kr\//.test(sourceUrl)) {
    fail(`${label}: invalid official source URL`)
  } else if (urls.has(sourceUrl)) {
    fail(`${label}: duplicate source URL`)
  } else {
    urls.add(sourceUrl)
  }

  if (film?.festivalYear !== 2026) fail(`${label}: festivalYear must be 2026`)
  if (!film?.title?.ko || !film?.title?.display) fail(`${label}: missing normalized title`)
  if (!film?.director?.display) fail(`${label}: missing director`)
  if (!Array.isArray(film?.production?.countries) || film.production.countries.length === 0) {
    fail(`${label}: missing production countries`)
  }
  if (!Number.isInteger(film?.production?.year)) fail(`${label}: missing production year`)
  if (!Number.isInteger(film?.production?.runtimeMinutes)) fail(`${label}: missing runtime`)
  if (!film?.production?.screeningFormat) fail(`${label}: missing screening format`)
  if (!film?.production?.color) fail(`${label}: missing color information`)
  if (!film?.editorial?.programNote) fail(`${label}: missing Program Note`)
  if (!Array.isArray(film?.media?.images) || film.media.images.length === 0) fail(`${label}: missing official image references`)
  if (!Array.isArray(film?.media?.copyrightNotices)) fail(`${label}: copyrightNotices must be an array`)
  if (!Array.isArray(film?.media?.photoCopyrightNotices)) fail(`${label}: photoCopyrightNotices must be an array`)
  if (!Array.isArray(film?.related?.films)) fail(`${label}: related.films must be an array`)
  if (!Array.isArray(film?.classification?.themes)) fail(`${label}: themes must be an array`)
  if (film.classification.themes.length > 0) withThemes += 1

  const sections = film?.biff?.sections
  if (!Array.isArray(sections) || sections.length === 0) {
    fail(`${label}: missing official section membership`)
  } else {
    if (sections.length > 1) multipleSections += 1
    if (film.biff.section !== sections[0]?.name) fail(`${label}: primary section does not match first official section`)
    for (const section of sections) {
      if (!section?.name || !section?.group || !section?.heading) fail(`${label}: incomplete section membership`)
      sectionMembershipCounts.set(section.name, (sectionMembershipCounts.get(section.name) ?? 0) + 1)
    }
  }

  const raw = film?.rawSections
  for (const key of ['filmInfo', 'programNote', 'director', 'credit', 'photo', 'screening']) {
    if (!Array.isArray(raw?.[key])) fail(`${label}: rawSections.${key} must be an array`)
  }

  if (!/^[a-f0-9]{64}$/.test(film?.source?.textSha256 ?? '')) {
    fail(`${label}: invalid source text SHA-256`)
  }

  // Validate title/theme normalization directly against the source-order Film Info strings.
  const info = Array.isArray(raw?.filmInfo) ? raw.filmInfo : []
  const countryIndex = info.indexOf('국가')
  const prefix = info
    .slice(0, countryIndex >= 0 ? countryIndex : info.length)
    .map(clean)
    .filter(value => value && value !== '트레일러 재생' && !PREMIERE_LABELS.has(value) && !value.startsWith('©'))

  if (prefix[0] && prefix[0] !== film.title.ko) {
    fail(`${label}: Korean title differs from source Film Info (${prefix[0]})`)
  }
  if (prefix[1] && prefix[1] !== film.title.en) {
    fail(`${label}: English title differs from source Film Info (${prefix[1]})`)
  }
  const sourceThemes = [...new Set(prefix.slice(2))]
  if (JSON.stringify(sourceThemes) !== JSON.stringify(film.classification.themes)) {
    fail(`${label}: normalized themes differ from source Film Info`)
  }
}

const computedMembershipCount = [...sectionMembershipCounts.values()].reduce((sum, count) => sum + count, 0)
if (meta.sectionMembershipCount !== computedMembershipCount) {
  fail(`meta sectionMembershipCount ${meta.sectionMembershipCount} does not match computed ${computedMembershipCount}`)
}
if (meta.catalogueRowCount !== computedMembershipCount) {
  fail(`catalogueRowCount ${meta.catalogueRowCount} does not match section memberships ${computedMembershipCount}`)
}
if (meta.coverage?.withOfficialSection !== films.length) fail('meta coverage.withOfficialSection is inconsistent')
if (meta.coverage?.withMultipleSections !== multipleSections) fail('meta coverage.withMultipleSections is inconsistent')
if (meta.coverage?.withThemes !== withThemes) fail('meta coverage.withThemes is inconsistent')

const metaMemberships = Object.fromEntries(
  Object.entries(meta.sectionMembershipCounts ?? {}).sort(([a], [b]) => a.localeCompare(b, 'ko'))
)
const computedMemberships = Object.fromEntries(
  [...sectionMembershipCounts.entries()].sort(([a], [b]) => a.localeCompare(b, 'ko'))
)
if (JSON.stringify(metaMemberships) !== JSON.stringify(computedMemberships)) {
  fail('meta sectionMembershipCounts does not match database records')
}

if (!process.exitCode) {
  console.log(
    `Validated ${films.length} official 2026 BIFF films, ${computedMembershipCount} section memberships, ` +
    `${multipleSections} multi-section films, and ${withThemes} films with #작품검색 themes.`,
  )
}
