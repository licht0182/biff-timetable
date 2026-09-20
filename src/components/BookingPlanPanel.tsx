import { bookingPrioritySymbol } from '../booking-plan'
import { BOOKING_PRIORITIES, type BookingPlanMap, type Film, type Screening, type TicketStatusMap } from './film-types'

type BookingPlanItem = { film: Film; screening: Screening }

type BookingPlanPanelProps = {
  items: BookingPlanItem[]
  selectedSet: ReadonlySet<string>
  nextFallbackIds: ReadonlySet<string>
  bookingPlan: BookingPlanMap
  ticketStatus: TicketStatusMap
  formatDate: (date: string, compact?: boolean) => string
  onRemoveAlternative: (screeningId: string) => void
  onApplyAlternative: (screeningId: string) => void
}

export default function BookingPlanPanel({
  items,
  selectedSet,
  nextFallbackIds,
  bookingPlan,
  ticketStatus,
  formatDate,
  onRemoveAlternative,
  onApplyAlternative,
}: BookingPlanPanelProps) {
  const plannedItems = items.filter(({ screening }) => bookingPlan[screening.id])
  if (!plannedItems.length) return null

  const itemByScreeningId = new Map(items.map((item) => [item.screening.id, item]))
  const groups = BOOKING_PRIORITIES.map((priority) => ({
    priority,
    items: plannedItems.filter(({ screening }) => bookingPlan[screening.id]?.priority === priority),
  })).filter(({ items: groupItems }) => groupItems.length > 0)
  const summary = groups.length <= 4
    ? groups.map(({ priority, items: groupItems }) => `${priority}순위 ${groupItems.length}`).join(' · ')
    : `${groups[0].priority}~${groups[groups.length - 1].priority}순위 · 총 ${plannedItems.length}`

  return (
    <details className="layout-surface booking-plan-panel">
      <summary>
        <span>예매 계획</span>
        <small aria-live="polite">{`${summary}${nextFallbackIds.size ? ` · 다음 대안 ${nextFallbackIds.size}` : ''}`}</small>
      </summary>
      <div className="booking-plan-groups">
        {groups.map(({ priority, items: group }) => {
          return (
            <section className="booking-plan-group" key={priority}>
              <h3><span aria-hidden="true">{bookingPrioritySymbol(priority)}</span> {priority}순위</h3>
              {group.length ? <div className="booking-plan-list">
                {group.map(({ film, screening }) => {
                  const status = ticketStatus[screening.id] ?? 'planned'
                  const entry = bookingPlan[screening.id]
                  const isAlternative = Boolean(entry?.fallbackFor?.length) && !selectedSet.has(screening.id)
                  const isNextFallback = isAlternative && nextFallbackIds.has(screening.id)
                  const fallbackTitles = entry?.fallbackFor
                    ?.map((id) => itemByScreeningId.get(id)?.film.title)
                    .filter((title): title is string => Boolean(title)) ?? []

                  return <article className={`booking-plan-item status-${status} ${isAlternative ? 'is-alternative' : ''} ${isNextFallback ? 'is-next-fallback' : ''}`} key={screening.id}>
                    <div className="booking-plan-item-main">
                      <strong>{film.title}</strong>
                      <span>{formatDate(screening.date)} {screening.start} · {screening.venue}</span>
                      {isAlternative && <em className="booking-plan-alternative">{isNextFallback ? '다음 대안' : status === 'failed' ? '실패한 대안' : '대안'}</em>}
                      {status === 'booked' && <em className="booking-plan-status booked">예매 완료</em>}
                      {status === 'failed' && <em className="booking-plan-status failed">예매 실패</em>}
                      {isAlternative && fallbackTitles.length > 0 && (
                        <small className="booking-plan-fallback">↳ {fallbackTitles.join(', ')} 실패 시 대안</small>
                      )}
                    </div>
                    {isAlternative && (
                      <div className="booking-plan-item-actions">
                        {isNextFallback && (
                          <button
                            type="button"
                            className="booking-plan-apply"
                            onClick={() => onApplyAlternative(screening.id)}
                            aria-label={`${film.title} 시간표에 적용`}
                          >
                            시간표에 적용
                          </button>
                        )}
                        <button
                          type="button"
                          className="booking-plan-remove"
                          onClick={() => onRemoveAlternative(screening.id)}
                          aria-label={`${film.title} 대안 해제`}
                        >
                          대안 해제
                        </button>
                      </div>
                    )}
                  </article>
                })}
              </div> : <p className="booking-plan-empty">지정된 회차가 없습니다.</p>}
            </section>
          )
        })}
      </div>
    </details>
  )
}
