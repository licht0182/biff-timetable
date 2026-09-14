import type { BookingPriority, TicketStatus } from './film-types'
import { bookingSelectValue, bookingStateFromSelectValue, type BookingSelectValue } from '../booking-plan'

type BookingStatusSelectProps = {
  status: Exclude<TicketStatus, 'none'>
  priority?: BookingPriority
  ariaLabel: string
  onChange: (status: Exclude<TicketStatus, 'none'>, priority?: BookingPriority) => void
}

export default function BookingStatusSelect({
  status,
  priority,
  ariaLabel,
  onChange,
}: BookingStatusSelectProps) {
  const value = bookingSelectValue(status, priority)

  return (
    <select
      className={`ticket-select ${status} ${priority ? `priority-${priority}` : ''}`}
      value={value}
      onChange={(event) => {
        const next = bookingStateFromSelectValue(event.target.value as BookingSelectValue, priority)
        onChange(next.status, next.priority)
      }}
      aria-label={ariaLabel}
    >
      <option value="planned">예매 예정</option>
      <option value="priority-1">1순위 · 예정</option>
      <option value="priority-2">2순위 · 예정</option>
      <option value="priority-3">3순위 · 예정</option>
      <option value="booked">예매 완료</option>
      <option value="failed">예매 실패</option>
    </select>
  )
}
