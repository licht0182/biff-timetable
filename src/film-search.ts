import type { Film } from './components/film-types'

export type FilmSearchMatchField = 'title' | 'englishTitle' | 'director' | 'genre' | 'country' | 'section'

export type FilmSearchMatch<T> = T & {
  searchScore: number
  matchField: FilmSearchMatchField
  matchLabel: string
}

const FIELD_CONFIG: Array<{
  field: FilmSearchMatchField
  label: string
  exact: number
  prefix: number
  includes: number
}> = [
  { field: 'title', label: '제목 일치', exact: 1000, prefix: 920, includes: 820 },
  { field: 'englishTitle', label: '영문 제목 일치', exact: 960, prefix: 870, includes: 770 },
  { field: 'director', label: '감독 일치', exact: 920, prefix: 840, includes: 740 },
  { field: 'genre', label: '장르 일치', exact: 690, prefix: 640, includes: 590 },
  { field: 'country', label: '국가 일치', exact: 650, prefix: 610, includes: 560 },
  { field: 'section', label: '섹션 일치', exact: 620, prefix: 580, includes: 530 },
]

export function normalizeSearchText(value: string) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('ko')
    .replace(/\s+/g, ' ')
    .trim()
}

export function getFilmSearchMatch(film: Film, query: string) {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) return null

  let best: { score: number; field: FilmSearchMatchField; label: string } | null = null

  for (const config of FIELD_CONFIG) {
    const rawValue = film[config.field]
    if (typeof rawValue !== 'string' || !rawValue.trim()) continue
    const value = normalizeSearchText(rawValue)

    let score = 0
    if (value === normalizedQuery) score = config.exact
    else if (value.startsWith(normalizedQuery)) score = config.prefix
    else if (value.includes(normalizedQuery)) score = config.includes

    if (score > (best?.score ?? 0)) {
      best = { score, field: config.field, label: config.label }
    }
  }

  return best
}

export function filmMatchesQuery(film: Film, query: string) {
  if (!normalizeSearchText(query)) return true
  return getFilmSearchMatch(film, query) !== null
}

export function rankFilmSearchMatches<T extends { film: Film }>(
  items: T[],
  query: string,
  limit = 6,
): Array<FilmSearchMatch<T>> {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery || limit <= 0) return []

  return items
    .map((item, stableIndex) => {
      const match = getFilmSearchMatch(item.film, normalizedQuery)
      return match ? { item, stableIndex, match } : null
    })
    .filter((entry): entry is { item: T; stableIndex: number; match: NonNullable<ReturnType<typeof getFilmSearchMatch>> } => entry !== null)
    .sort((a, b) => b.match.score - a.match.score || a.stableIndex - b.stableIndex)
    .slice(0, limit)
    .map(({ item, match }) => ({
      ...item,
      searchScore: match.score,
      matchField: match.field,
      matchLabel: match.label,
    }))
}
