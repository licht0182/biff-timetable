from pathlib import Path

path = Path('src/App.tsx')
text = path.read_text()

import_anchor = "import { VENUE_TRANSFER_SITES, getPreciseVenueTransfer, getVenueSiteTransferMinutes } from './venue-travel'\n"
new_import = import_anchor + "import { BASE_END_HOUR, START_HOUR, clockMinutes, endLabel, screeningAbsoluteWindow, screeningEndOffsetMinutes, screeningsOverlap, timetableDate, timetableEndMinutes, timetableStartMinutes } from './screening-time'\n"
if import_anchor not in text:
    raise SystemExit('import anchor missing')
text = text.replace(import_anchor, new_import, 1)

for constant in ["const START_HOUR = 8\n", "const BASE_END_HOUR = 24\n", "const FALLBACK_RUNTIME = 120\n"]:
    if constant not in text:
        raise SystemExit(f'constant missing: {constant.strip()}')
    text = text.replace(constant, '', 1)

old_helpers = '''function toMinutes(time: string) {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function endMinutes(film: Film, screening: Screening) {
  const start = toMinutes(screening.start)
  if (screening.end) {
    let end = toMinutes(screening.end)
    if (end <= start) end += 24 * 60
    return end
  }
  return start + (film.runtime ?? FALLBACK_RUNTIME)
}

function endLabel(film: Film, screening: Screening) {
  const end = endMinutes(film, screening)
  const normalized = end % (24 * 60)
  const h = Math.floor(normalized / 60)
  const m = normalized % 60
  const label = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  return screening.end ? label : `${label} 예상`
}

'''
if old_helpers not in text:
    raise SystemExit('legacy time helpers missing')
text = text.replace(old_helpers, '', 1)

old_dates = "  const dates = useMemo(() => Array.from(new Set(selectedItems.map(({ screening }) => screening.date))).sort(), [selectedItems])\n"
new_dates = "  const dates = useMemo(() => Array.from(new Set(selectedItems.map(({ screening }) => timetableDate(screening)))).sort(), [selectedItems])\n"
if old_dates not in text:
    raise SystemExit('dates block missing')
text = text.replace(old_dates, new_dates, 1)

old_end_hour = '''  const timetableEndHour = useMemo(() => {
    const latestEndMinutes = selectedItems.reduce(
      (latest, { film, screening }) => Math.max(latest, endMinutes(film, screening)),
      BASE_END_HOUR * 60,
    )
    return Math.max(BASE_END_HOUR, Math.ceil(latestEndMinutes / 60))
  }, [selectedItems])
'''
new_end_hour = '''  const timetableEndHour = useMemo(() => {
    const latestEndMinutes = selectedItems.reduce(
      (latest, { film, screening }) => Math.max(latest, timetableEndMinutes(film, screening)),
      BASE_END_HOUR * 60,
    )
    return Math.max(BASE_END_HOUR, Math.ceil(latestEndMinutes / 60))
  }, [selectedItems])
'''
if old_end_hour not in text:
    raise SystemExit('end hour block missing')
text = text.replace(old_end_hour, new_end_hour, 1)

old_conflict = '''  const conflictingSelections = useCallback((film: Film, screening: Screening) => {
    const start = toMinutes(screening.start)
    const end = endMinutes(film, screening)
    return selectedItems.filter(({ film: otherFilm, screening: other }) => {
      if (other.id === screening.id || other.date !== screening.date) return false
      return start < endMinutes(otherFilm, other) && toMinutes(other.start) < end
    })
  }, [selectedItems])
'''
new_conflict = '''  const conflictingSelections = useCallback((film: Film, screening: Screening) => (
    selectedItems.filter(({ film: otherFilm, screening: other }) => screeningsOverlap(film, screening, otherFilm, other))
  ), [selectedItems])
'''
if old_conflict not in text:
    raise SystemExit('conflict block missing')
text = text.replace(old_conflict, new_conflict, 1)

old_transition = '''  const transitionWarning = useCallback((film: Film, screening: Screening) => {
    if (!userSettings.showTransferWarnings) return null
    const start = toMinutes(screening.start)
    const end = endMinutes(film, screening)

    for (const { film: otherFilm, screening: other } of selectedItems) {
      if (other.id === screening.id || other.date !== screening.date) continue
      const otherStart = toMinutes(other.start)
      const otherEnd = endMinutes(otherFilm, other)

      if (end <= otherStart) {
        const transfer = transferBuffer(screening.venue, other.venue, userSettings)
        if (transfer.minutes === 0) continue
        const gap = otherStart - end
        if (gap < transfer.minutes) return {
          otherFilm,
          other,
          gap,
          buffer: transfer.minutes,
          routeLabel: transfer.routeLabel,
          transferDetail: transfer.transferDetail,
          precise: transfer.precise,
        }
      } else if (otherEnd <= start) {
        const transfer = transferBuffer(other.venue, screening.venue, userSettings)
        if (transfer.minutes === 0) continue
        const gap = start - otherEnd
        if (gap < transfer.minutes) return {
          otherFilm,
          other,
          gap,
          buffer: transfer.minutes,
          routeLabel: transfer.routeLabel,
          transferDetail: transfer.transferDetail,
          precise: transfer.precise,
        }
      }
    }
    return null
  }, [selectedItems, userSettings])
'''
new_transition = '''  const transitionWarning = useCallback((film: Film, screening: Screening) => {
    if (!userSettings.showTransferWarnings) return null
    const currentWindow = screeningAbsoluteWindow(film, screening)

    for (const { film: otherFilm, screening: other } of selectedItems) {
      if (other.id === screening.id) continue
      const otherWindow = screeningAbsoluteWindow(otherFilm, other)

      if (currentWindow.end <= otherWindow.start) {
        const transfer = transferBuffer(screening.venue, other.venue, userSettings)
        if (transfer.minutes === 0) continue
        const gap = otherWindow.start - currentWindow.end
        if (gap < transfer.minutes) return {
          otherFilm,
          other,
          gap,
          buffer: transfer.minutes,
          routeLabel: transfer.routeLabel,
          transferDetail: transfer.transferDetail,
          precise: transfer.precise,
        }
      } else if (otherWindow.end <= currentWindow.start) {
        const transfer = transferBuffer(other.venue, screening.venue, userSettings)
        if (transfer.minutes === 0) continue
        const gap = currentWindow.start - otherWindow.end
        if (gap < transfer.minutes) return {
          otherFilm,
          other,
          gap,
          buffer: transfer.minutes,
          routeLabel: transfer.routeLabel,
          transferDetail: transfer.transferDetail,
          precise: transfer.precise,
        }
      }
    }
    return null
  }, [selectedItems, userSettings])
'''
if old_transition not in text:
    raise SystemExit('transition block missing')
text = text.replace(old_transition, new_transition, 1)

old_ics = '''      const start = toMinutes(screening.start)
      const end = endMinutes(film, screening)
'''
new_ics = '''      const start = clockMinutes(screening.start)
      const end = screeningEndOffsetMinutes(film, screening)
'''
if old_ics not in text:
    raise SystemExit('ICS time lines missing')
text = text.replace(old_ics, new_ics, 1)

old_filter = "                {selectedItems.filter(({ screening }) => screening.date === date).map(({ film, screening }) => {\n"
new_filter = "                {selectedItems.filter(({ screening }) => timetableDate(screening) === date).map(({ film, screening }) => {\n"
if old_filter not in text:
    raise SystemExit('timetable date filter missing')
text = text.replace(old_filter, new_filter, 1)

old_render_times = '''                  const start = toMinutes(screening.start)
                  const end = endMinutes(film, screening)
'''
new_render_times = '''                  const start = timetableStartMinutes(screening)
                  const end = timetableEndMinutes(film, screening)
'''
if old_render_times not in text:
    raise SystemExit('render time lines missing')
text = text.replace(old_render_times, new_render_times, 1)

if 'toMinutes(' in text or 'endMinutes(' in text:
    raise SystemExit('legacy time helper usage remains')

path.write_text(text)
