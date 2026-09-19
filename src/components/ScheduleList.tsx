import { useState } from 'react'
import type { CustomEvent } from '../custom-events'
import { customEventCategoryLabel, customEventDisplayRange, customEventTimetableDate, customEventTimetableStartMinutes } from '../custom-events'
import { endLabel, screeningsOverlap, timetableDate, timetableStartMinutes } from '../screening-time'
import type { BookingPlanMap, BookingPriority, Film, Screening, TicketStatusMap } from './film-types'

type ScreeningItem = { film: Film; screening: Screening }

type ScheduleListProps = {
  items: ScreeningItem[]
  selectedSet: ReadonlySet<string>
  nextFallbackIds: ReadonlySet<string>
  bookingPlan: BookingPlanMap
  ticketStatus: TicketStatusMap
  customEvents: CustomEvent[]
  selectionMode: boolean
  deleteSelection: ReadonlySet<string>
  onOpenScreening: (film: Film, screening: Screening) => void
  onOpenCustomEvent: (event: CustomEvent) => void
  onRemoveScreening: (screeningId: string) => void
  onRemoveCustomEvent: (event: CustomEvent) => void
  onApplyAlternative: (screeningId: string) => void
  onToggleDeleteSelection: (itemId: string) => void
}

type ScreeningListItem = ScreeningItem & {
  kind: 'screening'
  priority?: BookingPriority
  alternative: boolean
  nextFallback: boolean
}

type CustomListItem = { kind: 'custom'; event: CustomEvent }
type ScheduleBlock =
  | { kind: 'screenings'; start: number; items: ScreeningListItem[] }
  | { kind: 'custom'; start: number; item: CustomListItem }

function formatListDate(date: string) {
  const value = new Date(`${date}T00:00:00`)
  const weekdays = ['일', '월', '화', '수', '목', '금', '토']
  return { date: `${value.getMonth() + 1}/${value.getDate()}`, weekday: weekdays[value.getDay()] }
}

function priorityLabel(priority?: BookingPriority) {
  return priority ? `${priority}순위` : '우선순위 미지정'
}

function groupOverlappingScreenings(items: ScreeningListItem[]) {
  const sorted = [...items].sort((a, b) => timetableStartMinutes(a.screening) - timetableStartMinutes(b.screening) || a.screening.id.localeCompare(b.screening.id))
  const visited = new Set<string>()
  const groups: ScreeningListItem[][] = []

  for (const seed of sorted) {
    if (visited.has(seed.screening.id)) continue
    const group: ScreeningListItem[] = []
    const queue = [seed]
    visited.add(seed.screening.id)

    while (queue.length) {
      const current = queue.shift()!
      group.push(current)
      for (const candidate of sorted) {
        if (visited.has(candidate.screening.id)) continue
        if (!screeningsOverlap(current.film, current.screening, candidate.film, candidate.screening)) continue
        visited.add(candidate.screening.id)
        queue.push(candidate)
      }
    }

    groups.push(group.sort((a, b) => timetableStartMinutes(a.screening) - timetableStartMinutes(b.screening) || a.screening.id.localeCompare(b.screening.id)))
  }

  return groups
}

export default function ScheduleList({
  items,
  selectedSet,
  nextFallbackIds,
  bookingPlan,
  ticketStatus,
  customEvents,
  selectionMode,
  deleteSelection,
  onOpenScreening,
  onOpenCustomEvent,
  onRemoveScreening,
  onRemoveCustomEvent,
  onApplyAlternative,
  onToggleDeleteSelection,
}: ScheduleListProps) {
  const screenings: ScreeningListItem[] = items.flatMap(({ film, screening }) => {
    const plan = bookingPlan[screening.id]
    const alternative = !selectedSet.has(screening.id) && Boolean(plan?.fallbackFor?.length)
    if (!selectedSet.has(screening.id) && !alternative) return []
    return [{
      kind: 'screening' as const,
      film,
      screening,
      priority: plan?.priority,
      alternative,
      nextFallback: nextFallbackIds.has(screening.id),
    }]
  })

  const dates = Array.from(new Set([
    ...screenings.map(({ screening }) => timetableDate(screening)),
    ...customEvents.map((event) => customEventTimetableDate(event)),
  ])).sort()
  const [requestedDate, setRequestedDate] = useState('')
  const selectedDate = dates.includes(requestedDate) ? requestedDate : dates[0]
  const dateCounts = new Map(dates.map((date) => [
    date,
    screenings.filter(({ screening }) => timetableDate(screening) === date).length
      + customEvents.filter((event) => customEventTimetableDate(event) === date).length,
  ]))

  const screeningGroups = groupOverlappingScreenings(screenings.filter(({ screening }) => timetableDate(screening) === selectedDate))
  const blocks: ScheduleBlock[] = [
    ...screeningGroups.map((group): ScheduleBlock => ({
      kind: 'screenings',
      start: Math.min(...group.map(({ screening }) => timetableStartMinutes(screening))),
      items: group,
    })),
    ...customEvents
      .filter((event) => customEventTimetableDate(event) === selectedDate)
      .map((event): ScheduleBlock => ({ kind: 'custom', start: customEventTimetableStartMinutes(event), item: { kind: 'custom', event } })),
  ].sort((a, b) => a.start - b.start || a.kind.localeCompare(b.kind))
  const heading = formatListDate(selectedDate)

  return <div className={`schedule-list ${selectionMode ? 'schedule-list-selection-mode' : ''}`}>
    <div className="schedule-date-tabs" role="tablist" aria-label="날짜별 시간표">
      {dates.map((date) => {
        const label = formatListDate(date)
        const active = date === selectedDate
        return <button type="button" className={`schedule-date-tab ${active ? 'active' : ''}`} role="tab" aria-selected={active} aria-controls={`schedule-panel-${date}`} id={`schedule-tab-${date}`} key={date} onClick={() => setRequestedDate(date)}>
          <strong>{label.date}</strong><span className={`weekday-${label.weekday}`}>{label.weekday}</span><em>{dateCounts.get(date)}개</em>
        </button>
      })}
    </div>
    {selectedDate && <section className="schedule-list-day" id={`schedule-panel-${selectedDate}`} role="tabpanel" aria-labelledby={`schedule-tab-${selectedDate}`}>
        <h2 id={`schedule-date-${selectedDate}`}><span>{heading.date}</span> <em className={`weekday-${heading.weekday}`}>{heading.weekday}</em><small>{dateCounts.get(selectedDate)}개 일정</small></h2>
        <div className="schedule-list-blocks">
          {blocks.map((block) => {
            if (block.kind === 'custom') {
              const { event } = block.item
              const selected = deleteSelection.has(event.id)
              return <article className={`schedule-list-row schedule-custom-row ${selected ? 'selected-for-delete' : ''}`} key={event.id}>
                <div className="schedule-list-time"><strong>{event.start}</strong><span>~{customEventDisplayRange(event).split('–')[1]}</span></div>
                <button type="button" className="schedule-list-main" onClick={() => selectionMode ? onToggleDeleteSelection(event.id) : onOpenCustomEvent(event)} aria-pressed={selectionMode ? selected : undefined}>
                  <span className="schedule-priority-dot priority-custom" aria-label="사용자 일정" />
                  <span className="schedule-list-copy"><strong>{event.title}</strong><span>{customEventCategoryLabel(event.category)}{event.location ? ` · ${event.location}` : ''}</span></span>
                </button>
                <button type="button" className="schedule-list-remove" onClick={() => selectionMode ? onToggleDeleteSelection(event.id) : onRemoveCustomEvent(event)} aria-label={selectionMode ? `${event.title} 삭제 ${selected ? '선택 해제' : '선택'}` : `${event.title} 일정 삭제`}>{selectionMode ? (selected ? '완료' : '선택') : '삭제'}</button>
              </article>
            }

            const conflict = block.items.length > 1
            return <section className={`schedule-screening-group ${conflict ? 'has-conflict' : ''}`} key={block.items.map(({ screening }) => screening.id).join('-')}>
              {conflict && <h3><span>일정 충돌</span> 같은 시간대에 {block.items.length}개 일정이 있습니다</h3>}
              {block.items.map(({ film, screening, priority, alternative, nextFallback }) => {
                const status = ticketStatus[screening.id] ?? 'planned'
                const selected = deleteSelection.has(screening.id)
                return <article className={`schedule-list-row status-${status} ${alternative ? 'is-alternative' : ''} ${selected ? 'selected-for-delete' : ''}`} data-screening-id={screening.id} key={screening.id}>
                  <div className="schedule-list-time"><strong>{screening.start}</strong><span>~{endLabel(film, screening)}</span></div>
                  <button type="button" className="schedule-list-main" onClick={() => selectionMode ? onToggleDeleteSelection(screening.id) : onOpenScreening(film, screening)} aria-pressed={selectionMode ? selected : undefined}>
                    <span className={`schedule-priority-dot priority-${priority ?? 'none'}`} aria-label={priorityLabel(priority)} />
                    <span className="schedule-list-copy">
                      <strong>{film.title}</strong>
                      <span>{screening.venue}{screening.gv ? ' · GV' : ''}{screening.code ? ` · ${screening.code}` : ''}</span>
                      <span className="schedule-row-badges">
                        {alternative && <em>{nextFallback ? '다음 예매 대안' : '예매 대안'}</em>}
                        {status === 'booked' && <em className="booked">예매 완료</em>}
                        {status === 'failed' && <em className="failed">예매 실패</em>}
                      </span>
                    </span>
                  </button>
                  <div className="schedule-row-actions">
                    {nextFallback && !selectionMode && <button type="button" className="schedule-apply-alternative" onClick={() => onApplyAlternative(screening.id)}>시간표에 적용</button>}
                    <button type="button" className="schedule-list-remove" onClick={() => selectionMode ? onToggleDeleteSelection(screening.id) : onRemoveScreening(screening.id)} aria-label={selectionMode ? `${film.title} 삭제 ${selected ? '선택 해제' : '선택'}` : `${film.title} 시간표에서 삭제`}>{selectionMode ? (selected ? '완료' : '선택') : '삭제'}</button>
                  </div>
                </article>
              })}
            </section>
          })}
        </div>
      </section>}
  </div>
}
