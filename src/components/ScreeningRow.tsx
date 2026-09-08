import { memo } from 'react'
import type { Film, Screening, TicketStatus, TravelWarning } from './film-types'

type ScreeningRowProps = {
  film: Film
  screening: Screening
  isSelected: boolean
  hasConflict: boolean
  travel: TravelWarning | null
  status: Exclude<TicketStatus, 'none'>
  formatDate: (date: string, compact?: boolean) => string
  endLabel: (film: Film, screening: Screening) => string
  onToggle: (film: Film, screening: Screening) => void
  onStatusChange: (screeningId: string, status: TicketStatus) => void
}

function ScreeningRow({
  film,
  screening,
  isSelected,
  hasConflict,
  travel,
  status,
  formatDate,
  endLabel,
  onToggle,
  onStatusChange,
}: ScreeningRowProps) {
  const rowNote = hasConflict
    ? '선택한 회차와 시간이 겹칩니다.'
    : travel
      ? `이동 여유 ${travel.gap}분 · 권장 ${travel.buffer}분`
      : ''

  return (
    <div className={`screening-row ${hasConflict ? 'conflict' : ''} ${travel ? 'travel-warning' : ''}`}>
      <div>
        <strong>{screening.code ? `[${screening.code}] ` : ''}{formatDate(screening.date)} {screening.start}</strong>
        <span>{screening.venue} · {screening.start}–{endLabel(film, screening)}{screening.gv ? ' · GV' : ''}</span>
        <small className={`screening-note ${travel ? 'travel-text' : ''}`} title={rowNote || undefined}>{rowNote}</small>
      </div>
      <div className="screening-actions">
        {isSelected && (
          <select
            className={`ticket-select ${status}`}
            value={status}
            onChange={(event) => onStatusChange(screening.id, event.target.value as TicketStatus)}
            aria-label={`${film.title} 예매 상태`}
          >
            <option value="planned">예매 예정</option>
            <option value="booked">예매 완료</option>
          </select>
        )}
        <button className={isSelected ? 'selected' : ''} onClick={() => onToggle(film, screening)}>
          {isSelected ? '선택됨' : '+ 추가'}
        </button>
      </div>
    </div>
  )
}

export default memo(ScreeningRow)
