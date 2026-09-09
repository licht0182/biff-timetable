export type TimetableLayoutInterval<T> = {
  value: T
  start: number
  end: number
}

export type TimetableLanePlacement<T> = TimetableLayoutInterval<T> & {
  lane: number
  laneCount: number
}

function assignGroup<T>(group: TimetableLayoutInterval<T>[]) {
  const laneEnds: number[] = []
  const provisional: Array<TimetableLayoutInterval<T> & { lane: number }> = []

  for (const interval of group) {
    let lane = laneEnds.findIndex((end) => end <= interval.start)
    if (lane < 0) {
      lane = laneEnds.length
      laneEnds.push(interval.end)
    } else {
      laneEnds[lane] = interval.end
    }
    provisional.push({ ...interval, lane })
  }

  const laneCount = Math.max(1, laneEnds.length)
  return provisional.map((item): TimetableLanePlacement<T> => ({ ...item, laneCount }))
}

/**
 * Assigns the minimum number of horizontal lanes required for a set of
 * vertically positioned timetable blocks. Overlap groups are independent,
 * so non-overlapping blocks keep the full width of the day column.
 */
export function assignTimetableLanes<T>(source: readonly TimetableLayoutInterval<T>[]) {
  const sorted = [...source]
    .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start)
    .sort((a, b) => a.start - b.start || a.end - b.end)

  const result: TimetableLanePlacement<T>[] = []
  let group: TimetableLayoutInterval<T>[] = []
  let groupEnd = Number.NEGATIVE_INFINITY

  const flush = () => {
    if (!group.length) return
    result.push(...assignGroup(group))
    group = []
    groupEnd = Number.NEGATIVE_INFINITY
  }

  for (const interval of sorted) {
    if (group.length && interval.start >= groupEnd) flush()
    group.push(interval)
    groupEnd = Math.max(groupEnd, interval.end)
  }
  flush()

  return result
}
