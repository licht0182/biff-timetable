import { readFile, writeFile } from 'node:fs/promises'

async function replaceOnce(path, from, to) {
  const url = new URL(`../${path}`, import.meta.url)
  const source = await readFile(url, 'utf8')
  if (!source.includes(from)) throw new Error(`${path}: expected source fragment not found`)
  const updated = source.replace(from, to)
  await writeFile(url, updated, 'utf8')
}

await replaceOnce(
  'src/components/film-types.ts',
  '  country?: string\n  section?: string\n',
  '  country?: string\n  genre?: string\n  section?: string\n',
)

await replaceOnce(
  'src/components/FilmCard.tsx',
  "          {film.englishTitle && <p className=\"english-title\">{film.englishTitle}</p>}\n          <p className=\"meta\">{[film.director, film.country, film.runtime ? `${film.runtime}분` : undefined].filter(Boolean).join(' · ')}</p>\n",
  "          {film.englishTitle && <p className=\"english-title\">{film.englishTitle}</p>}\n          {film.genre && <p className=\"genre-meta\">{film.genre}</p>}\n          <p className=\"meta\">{[film.director, film.country, film.runtime ? `${film.runtime}분` : undefined].filter(Boolean).join(' · ')}</p>\n",
)

await replaceOnce(
  'src/App.tsx',
  '      const haystack = [film.title, film.englishTitle, film.director, film.country, film.section].filter(Boolean).join(\' \').toLowerCase()\n',
  '      const haystack = [film.title, film.englishTitle, film.director, film.country, film.genre, film.section].filter(Boolean).join(\' \').toLowerCase()\n',
)

await replaceOnce(
  'src/App.tsx',
  '          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="제목, 감독, 국가 검색" aria-label="영화 검색" />\n',
  '          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="제목, 감독, 국가, 장르 검색" aria-label="영화 검색" />\n',
)

await replaceOnce(
  'src/App.tsx',
  '            {detailFilm.country && <><dt>국가</dt><dd>{detailFilm.country}</dd></>}\n            {detailFilm.year && <><dt>연도</dt><dd>{detailFilm.year}</dd></>}\n',
  '            {detailFilm.country && <><dt>국가</dt><dd>{detailFilm.country}</dd></>}\n            {detailFilm.genre && <><dt>장르</dt><dd className="film-detail-genre">{detailFilm.genre}</dd></>}\n            {detailFilm.year && <><dt>연도</dt><dd>{detailFilm.year}</dd></>}\n',
)

await replaceOnce(
  'scripts/validate-screenings.mjs',
  '    if (typeof film.title !== \'string\' || !film.title.trim()) errors.push(`${prefix}.title is required`)\n    if (film.runtime != null && (!Number.isFinite(film.runtime) || film.runtime <= 0)) errors.push(`${prefix}.runtime must be a positive number`)\n',
  '    if (typeof film.title !== \'string\' || !film.title.trim()) errors.push(`${prefix}.title is required`)\n    if (film.genre != null && (typeof film.genre !== \'string\' || !film.genre.trim())) errors.push(`${prefix}.genre must be a non-empty string when present`)\n    if (film.runtime != null && (!Number.isFinite(film.runtime) || film.runtime <= 0)) errors.push(`${prefix}.runtime must be a positive number`)\n',
)

await replaceOnce(
  'package.json',
  '    "validate:data": "node scripts/validate-screenings.mjs",\n',
  '    "validate:data": "node scripts/validate-screenings.mjs",\n    "enrich:genres": "node scripts/enrich-genres.mjs",\n',
)

const cssUrl = new URL('../src/features.css', import.meta.url)
const css = await readFile(cssUrl, 'utf8')
if (!css.includes('.genre-meta{')) {
  await writeFile(cssUrl, `${css.trimEnd()}\n\n.genre-meta{margin:5px 0 0;color:#666;font-size:11px;font-weight:700;line-height:1.4;word-break:keep-all;overflow-wrap:anywhere}\n.film-detail-genre{line-height:1.45;word-break:keep-all;overflow-wrap:anywhere}\n@media(max-width:700px){.genre-meta{font-size:10px;margin-top:4px}}\n`, 'utf8')
}

console.log('Genre UI/schema patches applied.')
