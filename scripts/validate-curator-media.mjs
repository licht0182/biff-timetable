import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(SCRIPT_DIR, '..')
const CURATOR_MEDIA_PATH = path.join(ROOT_DIR, 'src', 'curator-feature-media.ts')
const FILMS_PATH = path.join(ROOT_DIR, 'public', 'films-2026.json')
const SRC_DIR = path.join(ROOT_DIR, 'src')
const EXPECTED_MEDIA = [
  ['director-guide-2026-koreeda-hirokazu', 'https://d2j6u4o1bq9z89.cloudfront.net/9611_DATA/FILM_PHOTO/2026_MS8H_SL8F/1786100358.jpg'],
  ['director-guide-2026-majid-majidi', 'https://d2j6u4o1bq9z89.cloudfront.net/9611_DATA/FILM_PHOTO/2026_MS8H_SL8F/1788153786.jpg'],
  ['director-guide-2026-cristian-mungiu', 'https://d2j6u4o1bq9z89.cloudfront.net/9611_DATA/FILM_PHOTO/2026_MS8H_SL8F/1783477110.jpg'],
  ['director-guide-2026-na-hong-jin', 'https://d2j6u4o1bq9z89.cloudfront.net/9611_DATA/FILM_PHOTO/2026_MS8H_SL8F/1786672419.jpg'],
  ['director-guide-2026-pawel-pawlikowski', 'https://d2j6u4o1bq9z89.cloudfront.net/9611_DATA/FILM_PHOTO/2026_MS8H_SL8F/1785398550.jpg'],
  ['director-guide-2026-tsai-ming-liang', 'https://d2j6u4o1bq9z89.cloudfront.net/9611_DATA/FILM_PHOTO/2026_MS8H_SL8F/1786641221.jpg'],
  ['director-guide-2026-andrey-zvyagintsev', 'https://d2j6u4o1bq9z89.cloudfront.net/9611_DATA/FILM_PHOTO/2026_MS8H_SL8F/1784515019.jpg'],
  ['director-guide-2026-lee-chang-dong', 'https://d2j6u4o1bq9z89.cloudfront.net/9611_DATA/FILM_PHOTO/2026_MS8H_SL8F/1785389350.jpg'],
]

const errors = []
function fail(message) {
  errors.push(message)
}

function parseFeatureMedia(source) {
  const declarationIndex = source.indexOf('export const CURATOR_FEATURE_MEDIA')
  const assignmentIndex = declarationIndex < 0 ? -1 : source.indexOf('=', declarationIndex)
  const arrayStart = assignmentIndex < 0 ? -1 : source.indexOf('[', assignmentIndex)
  const arrayEnd = arrayStart < 0 ? -1 : source.indexOf('\n]', arrayStart)
  if (arrayStart < 0 || arrayEnd < 0) {
    fail('could not locate the CURATOR_FEATURE_MEDIA array')
    return []
  }

  const body = source.slice(arrayStart + 1, arrayEnd)
  const blocks = [...body.matchAll(/\{([\s\S]*?)\}/g)].map(match => match[1])
  const fieldNames = ['slug', 'imageSrc', 'imageAlt', 'credit', 'filmTitle']
  return blocks.map((block, index) => {
    const entry = {}
    for (const field of fieldNames) {
      const pattern = new RegExp(`\\b${field}\\s*:\\s*'((?:\\\\.|[^'\\\\])*)'`, 'g')
      const values = [...block.matchAll(pattern)]
      if (values.length !== 1) {
        fail(`entry #${index + 1}: expected one ${field} string, found ${values.length}`)
        continue
      }
      entry[field] = values[0][1].replace(/\\(['\\])/g, '$1')
    }
    return entry
  })
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

try {
  const mediaSource = fs.readFileSync(CURATOR_MEDIA_PATH, 'utf8')
  const media = parseFeatureMedia(mediaSource)
  const filmJson = JSON.parse(fs.readFileSync(FILMS_PATH, 'utf8'))
  const films = Array.isArray(filmJson) ? filmJson : filmJson?.films
  if (!Array.isArray(films)) fail('films-2026.json must contain a film array')

  if (media.length !== EXPECTED_MEDIA.length) {
    fail(`expected exactly ${EXPECTED_MEDIA.length} manually curated photo entries, found ${media.length}`)
  }

  const expectedBySlug = new Map(EXPECTED_MEDIA)
  const seenSlugs = new Set()
  const seenUrls = new Set()
  const articleSources = fs.readdirSync(SRC_DIR)
    .filter(name => /^curator-.*\.tsx?$/.test(name) && name !== 'curator-feature-media.ts')
    .map(name => fs.readFileSync(path.join(SRC_DIR, name), 'utf8'))

  for (const entry of media) {
    const { slug, imageSrc, imageAlt, credit, filmTitle } = entry
    if (!slug || !imageSrc || !imageAlt || !credit || !filmTitle) continue

    if (seenSlugs.has(slug)) fail(`${slug}: duplicate curator slug`)
    seenSlugs.add(slug)
    if (seenUrls.has(imageSrc)) fail(`${slug}: duplicate image URL`)
    seenUrls.add(imageSrc)

    const expectedUrl = expectedBySlug.get(slug)
    if (!expectedUrl) fail(`${slug}: photo is outside the fixed eight-image curated set`)
    else if (imageSrc !== expectedUrl) fail(`${slug}: image URL changed from the fixed curated set`)

    try {
      const url = new URL(imageSrc)
      if (url.protocol !== 'https:' || url.hostname !== 'd2j6u4o1bq9z89.cloudfront.net'
        || url.search || url.hash
        || !/^\/9611_DATA\/FILM_PHOTO\/2026_MS8H_SL8F\/\d+\.jpg$/.test(url.pathname)) {
        fail(`${slug}: image URL is outside the expected HTTPS BIFF film-photo path`)
      }
    } catch {
      fail(`${slug}: image URL is invalid`)
    }

    const titleMatches = films.filter(film => film?.title?.ko === filmTitle)
    if (titleMatches.length !== 1) {
      fail(`${slug}: expected one film record for title ${filmTitle}, found ${titleMatches.length}`)
      continue
    }

    const film = titleMatches[0]
    const officialPhoto = Array.isArray(film?.media?.images)
      && film.media.images.some(image => image?.url === imageSrc && image?.role === 'filmPhoto')
    if (!officialPhoto) fail(`${slug}: image URL is not listed as a filmPhoto for ${filmTitle}`)

    const notices = film?.media?.photoCopyrightNotices
    if (!Array.isArray(notices) || !notices.includes(credit)) {
      fail(`${slug}: displayed credit does not exactly match a photoCopyrightNotices entry for ${filmTitle}`)
    }

    const slugPattern = new RegExp(`\\bslug\\s*:\\s*['"]${escapeRegExp(slug)}['"]`)
    if (!articleSources.some(source => slugPattern.test(source))) {
      fail(`${slug}: no matching curator article source was found`)
    }
  }

  for (const [slug] of EXPECTED_MEDIA) {
    if (!seenSlugs.has(slug)) fail(`${slug}: missing from the current curated photo set`)
  }
} catch (error) {
  fail(`could not validate curator media: ${error instanceof Error ? error.message : String(error)}`)
}

if (errors.length > 0) {
  for (const error of errors) console.error(`[curator-media] ${error}`)
  process.exitCode = 1
} else {
  console.log(`[curator-media] ${EXPECTED_MEDIA.length} curated photos match their article, official image URL, and photo copyright notice metadata.`)
  console.log('[curator-media] This verifies attribution metadata consistency only; it does not establish usage rights or a license.')
}
