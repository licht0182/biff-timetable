import type { BookingPlanMap, BookingPriority, Film, Screening, TicketStatusMap } from './film-types'

type BookingPlanItem = { film: Film; screening: Screening }

type BookingPlanPanelProps = {
  items: BookingPlanItem[]
  bookingPlan: BookingPlanMap
  ticketStatus: TicketStatusMap
  formatDate: (date: string, compact?: boolean) => string
}

const PRIORITIES: BookingPriority[] = [1, 2, 3]

export default function BookingPlanPanel({
  items,
  bookingPlan,
  ticketStatus,
  formatDate,
}: BookingPlanPanelProps) {
  const plannedItems = items.filter(({ screening }) => bookingPlan[screening.id])
  if (!plannedItems.length) return null

  const counts = PRIORITIES.map((priority) => (
    plannedItems.filter(({ screening }) => bookingPlan[screening.id]?.priority === priority).length
  ))

  return (
    <details className="booking-plan-panel">
      <summary>
        <span>예매 계획</span>
        <small>{`1순위 ${counts[0]} · 2순위 ${counts[1]} · 3순위 ${counts[2]}`}</small>
      </summary>
      <div className="booking-plan-groups">
        {PRIORITIES.map((priority) => {
          const group = plannedItems.filter(({ screening }) => bookingPlan[screening.id]?.priority === priority)
          return (
            <section className="booking-plan-group" key={priority}>
              <h3><span aria-hidden="true">{priority === 1 ? '①' : priority === 2 ? '②' : '③'}</span> {priority}순위</h3>
              {group.length ? <div className="booking-plan-list">
                {group.map(({ film, screening }) => {
                  const status = ticketStatus[screening.id] ?? 'planned'
                  return <article className={`booking-plan-item status-${status}`} key={screening.id}>
                    <strong>{film.title}</strong>
                    <span>{formatDate(screening.date)} {screening.start} · {screening.venue}</span>
                    {status === 'booked' && <em className="booking-plan-status booked">예매 완료</em>}
                    {status === 'failed' && <em className="booking-plan-status failed">예매 실패</em>}
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
