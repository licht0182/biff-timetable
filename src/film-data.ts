import type { Film, Screening } from './components/film-types'

export type FilmData = {
  films: Film[]
  note?: string
  source?: string
}

export type FilmDataLoadResult = {
  data: FilmData
  source: 'network' | 'cache'
  savedAt: string
}

export const FILM_DATA_VERSION = '2026-official-20260911-1'

const FILM_DATA_CACHE_KEY = 'biff-timetable:film-data-cache:v1'
const DATA_VERSION_STORAGE_KEY = 'biff-timetable:data-version:v1'

type FilmDataCache = {
  version: string
  savedAt: string
  data: FilmData
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isScreening(value: unknown): value is Screening {
  if (!isRecord(value)) return false
  return ['id', 'date', 'start', 'venue'].every((key) => typeof value[key] === 'string' && value[key].trim().length > 0)
}

function isFilm(value: unknown): value is Film {
  if (!isRecord(value)) return false
  return typeof value.id === 'string'
    && value.id.trim().length > 0
    && typeof value.title === 'string'
    && value.title.trim().length > 0
    && Array.isArray(value.screenings)
    && value.screenings.every(isScreening)
}

export function isFilmData(value: unknown): value is FilmData {
  if (!isRecord(value) || !Array.isArray(value.films) || !value.films.every(isFilm)) return false
  if (value.note !== undefined && typeof value.note !== 'string') return false
  if (value.source !== undefined && typeof value.source !== 'string') return false
  return true
}

function readCachedFilmData(): FilmDataCache | null {
  try {
    const raw = localStorage.getItem(FILM_DATA_CACHE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return null
    if (parsed.version !== FILM_DATA_VERSION || typeof parsed.savedAt !== 'string' || !isFilmData(parsed.data)) return null
    if (Number.isNaN(Date.parse(parsed.savedAt))) return null
    return parsed as FilmDataCache
  } catch {
    return null
  }
}

function cacheFilmData(data: FilmData, savedAt: string) {
  try {
    const cache: FilmDataCache = { version: FILM_DATA_VERSION, savedAt, data }
    localStorage.setItem(FILM_DATA_CACHE_KEY, JSON.stringify(cache))
    localStorage.setItem(DATA_VERSION_STORAGE_KEY, JSON.stringify(FILM_DATA_VERSION))
  } catch {
    // The timetable remains usable even when storage is unavailable or full.
  }
}

export async function loadFilmData(signal?: AbortSignal): Promise<FilmDataLoadResult> {
  try {
    const url = `${import.meta.env.BASE_URL}screenings.json?v=${encodeURIComponent(FILM_DATA_VERSION)}`
    const response = await fetch(url, { signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const payload: unknown = await response.json()
    if (!isFilmData(payload)) throw new Error('Invalid screenings data')

    const savedAt = new Date().toISOString()
    cacheFilmData(payload, savedAt)
    return { data: payload, source: 'network', savedAt }
  } catch (error) {
    if (signal?.aborted) throw error
    const cached = readCachedFilmData()
    if (cached) return { data: cached.data, source: 'cache', savedAt: cached.savedAt }
    throw new Error('상영 데이터를 불러오지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.')
  }
}
