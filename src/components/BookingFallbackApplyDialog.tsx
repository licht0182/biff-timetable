import type { CustomEvent } from '../custom-events'
import type { Film, Screening, TicketStatusMap } from './film-types'

type TimetableItem = { film: Film; screening: Screening }

type BookingFallbackApplyDialogProps = {
  candidate: TimetableItem
  conflicts: TimetableItem[]
  customOverlaps: CustomEvent[]
  ticketStatus: TicketStatusMap
  formatDate: (date: string, compact?: boolean) => string
  endLabel: (film: Film, screening: Screening) => string
  onApply: () => void
  onClose: () => void
}

export default function BookingFallbackApplyDialog({
  candidate,
  conflicts,
  customOverlaps,
  ticketStatus,
  formatDate,
  endLabel,
  onApply,
  onClose,
}: BookingFallbackApplyDialogProps) {
  const bookedConflicts = conflicts.filter(({ screening }) => ticketStatus[screening.id] === 'booked')
  const replaceableConflicts = conflicts.filter(({ screening }) => ticketStatus[screening.id] !== 'booked')
  const blocked = bookedConflicts.length > 0

  return (
    <div className="booking-apply-backdrop" onMouseDown={onClose}>
      <section
        className="booking-apply-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-apply-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="booking-apply-head">
          <div>
            <span>다음 예매 대안</span>
            <h2 id="booking-apply-title">시간표에 적용하시겠습니까?</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="대안 적용 창 닫기">×</button>
        </div>

        <div className="booking-apply-candidate">
          <strong>{candidate.film.title}</strong>
          <span>{formatDate(candidate.screening.date)} {candidate.screening.start}–{endLabel(candidate.film, candidate.screening)} · {candidate.screening.venue}</span>
        </div>

        {replaceableConflicts.length > 0 && (
          <div className="booking-apply-section">
            <strong>적용하면 시간표에서 교체됩니다</strong>
            {replaceableConflicts.map(({ film, screening }) => (
              <div key={screening.id}>
                <b>{ticketStatus[screening.id] === 'failed' ? '× ' : ''}{film.title}</b>
                <span>{formatDate(screening.date)} {screening.start}–{endLabel(film, screening)} · {screening.venue}</span>
              </div>
            ))}
          </div>
        )}

        {customOverlaps.length > 0 && (
          <div className="booking-apply-section warning">
            <strong>사용자 일정과 시간이 겹칩니다</strong>
            {customOverlaps.map((event) => (
              <div key={event.id}>
                <b>◆ {event.title}</b>
                <span>{formatDate(event.date)} {event.start}–{event.end}{event.location ? ` · ${event.location}` : ''}</span>
              </div>
            ))}
            <small>사용자 일정은 삭제하지 않고 그대로 유지됩니다.</small>
          </div>
        )}

        {bookedConflicts.length > 0 && (
          <div className="booking-apply-blocked" role="alert">
            <strong>예매 완료 회차와 충돌하여 적용할 수 없습니다.</strong>
            {bookedConflicts.map(({ film, screening }) => (
              <span key={screening.id}>✓ {film.title} · {formatDate(screening.date)} {screening.start}</span>
            ))}
          </div>
        )}

        {!blocked && (
          <p className="booking-apply-guide">
            적용 후 대안 회차는 실제 시간표에 들어가며 예매 상태는 “예매 예정”으로 시작합니다.
          </p>
        )}

        <div className="booking-apply-actions">
          <button type="button" className="secondary" onClick={onClose}>취소</button>
          <button type="button" className="primary" disabled={blocked} onClick={onApply}>
            {blocked ? '적용 불가' : '시간표에 적용'}
          </button>
        </div>
      </section>
    </div>
  )
}
