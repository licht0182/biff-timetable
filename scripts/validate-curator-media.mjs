import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const expectedSlugs = [
  'koreeda-hirokazu', 'majid-majidi', 'cristian-mungiu', 'na-hong-jin',
  'pawel-pawlikowski', 'tsai-ming-liang', 'andrey-zvyagintsev', 'lee-chang-dong',
].map(name => `director-guide-2026-${name}`)
const errors = []
const fail = message => errors.push(message)

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filename = path.join(directory, entry.name)
    return entry.isDirectory() ? sourceFiles(filename) : /\.(tsx?|css)$/.test(entry.name) ? [filename] : []
  })
}

try {
  const mediaSource = fs.readFileSync(path.join(root, 'src/curator-feature-media.ts'), 'utf8')
  const entries = [...mediaSource.matchAll(/\{\s*slug: '([^']+)', tone: '([^']+)', filmTitle: '([^']+)'\s*\}/g)]
    .map(([, slug, tone, filmTitle]) => ({ slug, tone, filmTitle }))
  const filmJson = JSON.parse(fs.readFileSync(path.join(root, 'public/films-2026.json'), 'utf8'))
  const films = Array.isArray(filmJson) ? filmJson : filmJson?.films
  if (!Array.isArray(films)) throw new Error('films-2026.json must contain a film array')
  if (entries.length !== expectedSlugs.length) fail(`expected ${expectedSlugs.length} original artwork entries, found ${entries.length}`)
  const sources = sourceFiles(path.join(root, 'src')).map(filename => ({ filename, text: fs.readFileSync(filename, 'utf8') }))
  const articles = sources.filter(({ filename }) => /curator-.*\.ts$/.test(filename) && !filename.endsWith('curator-feature-media.ts'))
  const seen = new Set()
  for (const { slug, tone, filmTitle } of entries) {
    if (seen.has(slug)) fail(`${slug}: duplicate entry`)
    seen.add(slug)
    if (!expectedSlugs.includes(slug)) fail(`${slug}: unexpected article`)
    if (!['wine', 'forest', 'ocean', 'indigo'].includes(tone)) fail(`${slug}: unknown artwork tone`)
    if (films.filter(film => film?.title?.ko === filmTitle).length !== 1) fail(`${slug}: film title must match one film record`)
    if (!articles.some(({ text }) => text.includes(`slug: '${slug}'`))) fail(`${slug}: matching article is missing`)
  }
  for (const slug of expectedSlugs) if (!seen.has(slug)) fail(`${slug}: artwork is missing`)
  if (/\b(imageSrc|imageAlt|credit)\s*:/.test(mediaSource)) fail('artwork manifest must not contain photograph fields')
  for (const { filename, text } of sources) {
    if (/FILM_PHOTO|https?:\/\/[^\s'"`]*cloudfront\.net/i.test(text)) fail(`${path.relative(root, filename)}: official photograph reference in application source`)
  }
  const artwork = fs.readFileSync(path.join(root, 'src/components/CuratorArtwork.tsx'), 'utf8')
  if (/<img\b|\b(?:src|href)=/.test(artwork)) fail('original artwork must not load external media')
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}

if (errors.length) {
  errors.forEach(error => console.error(`[curator-media] ${error}`))
  process.exitCode = 1
} else {
  console.log(`[curator-media] ${expectedSlugs.length} original artwork entries match their films and articles; application source contains no official photograph references.`)
}
