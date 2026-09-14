import { memo } from 'react'
import BookingStatusSelect from './BookingStatusSelect'
import type { BookingPriority, Film, Screening, TicketStatus, TravelWarning } from './film-types'

type ScreeningRowProps = {
  film: Film
  screening: Screening
  isSelected: boolean
  isAlternative: boolean
  hasConflict: boolean
  travel: TravelWarning | null
  status: Exclude<TicketStatus, 'none'>
  priority?: BookingPriority
  formatDate: (date: string, compact?: boolean) => string
  endLabel: (film: Film, screening: Screening) => string
  onToggle: (film: Film, screening: Screening) => void
  onBookingChange: (screeningId: string, status: Exclude<TicketStatus, 'none'>, priority?: BookingPriority) => void
}

function ScreeningRow({
  film,
  screening,
  isSelected,
  isAlternative,
  hasConflict,
  travel,
  status,
  priority,
  formatDate,
  endLabel,
  onToggle,
  onBookingChange,
}: ScreeningRowProps) {
  const rowNote = isAlternative
    ? '현재 시간표 회차 실패 시 예매 대안으로 저장되어 있습니다.'
    : hasConflict
      ? '내 시간표의 다른 일정과 시간이 겹칩니다.'
      : travel
        ? `${travel.routeLabel ? `${travel.routeLabel} · ` : ''}이동 여유 ${travel.gap}분 · 필요 ${travel.buffer}분`
        : ''
  const rowNoteTitle = travel?.transferDetail && !isAlternative ? `${rowNote}\n${travel.transferDetail}` : rowNote || undefined
  const alternativeLabel = priority === 2 ? '② 대안' : priority === 3 ? '③ 대안' : '대안'

  return (
    <div className={`screening-row ${hasConflict ? 'conflict' : ''} ${travel ? 'travel-warning' : ''} ${isAlternative ? 'booking-alternative' : ''}`}>
      <div>
        <strong>{screening.code ? `[${screening.code}] ` : ''}{formatDate(screening.date)} {screening.start}</strong>
        <span>{screening.venue} · {screening.start}–{endLabel(film, screening)}{screening.gv ? ' · GV' : ''}</span>
        <small className={`screening-note ${travel && !hasConflict ? 'travel-text' : ''}`} title={rowNoteTitle}>{rowNote}</small>
      </div>
      <div className={`screening-actions ${isSelected ? 'selected-actions' : ''} ${isAlternative ? 'alternative-actions' : ''}`}>
        {isSelected && (
          <BookingStatusSelect
            status={status}
            priority={priority}
            ariaLabel={`${film.title} 예매 상태와 우선순위`}
            onChange={(nextStatus, nextPriority) => onBookingChange(screening.id, nextStatus, nextPriority)}
          />
        )}
        <button
          className={isSelected ? 'selected' : isAlternative ? 'alternative' : ''}
          onClick={() => onToggle(film, screening)}
          aria-label={isAlternative ? `${film.title} ${alternativeLabel} 해제` : undefined}
        >
          {isSelected ? '선택됨' : isAlternative ? alternativeLabel : '+ 추가'}
        </button>
      </div>
    </div>
  )
}

export default memo(ScreeningRow)
