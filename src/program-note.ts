const SCHEDULE_SUFFIX_PATTERN = /\bSchedule\s+code\s+\d{3}\b/i

export function programNoteForDisplay(value: string) {
  const normalized = value.trim()
  if (!normalized) return ''

  const markerIndex = normalized.search(SCHEDULE_SUFFIX_PATTERN)
  if (markerIndex < 0) return normalized

  return normalized.slice(0, markerIndex).trimEnd()
}
