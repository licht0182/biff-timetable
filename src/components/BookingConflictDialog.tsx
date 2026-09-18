import { useState } from 'react'
import type { BookingPriority, Film, Screening } from './film-types'

type ConflictItem = { film: Film; screening: Screening }

type BookingConflictDialogProps = {
  film: Film
  screening: Screening
  overlapping: ConflictItem[]
  alternativeOverlaps: Array<ConflictItem & { priority: BookingPriority }>
  minimumPriority: BookingPriority | null
  formatDate: (date: string, compact?: boolean) => string
  endLabel: (film: Film, screening: Screening) => string
  onSaveAlternative: (priority: BookingPriority) => void
  onClose: () => void
}

export default function BookingConflictDialog({
  film,
  screening,
  overlapping,
  alternativeOverlaps,
  minimumPriority,
  formatDate,
  endLabel,
  onSaveAlternative,
  onClose,
}: BookingConflictDialogProps) {
  const [priority, setPriority] = useState<BookingPriority>(minimumPriority ?? 3)
  const canSave = minimumPriority !== null

  return (
    <div className="booking-conflict-backdrop" onMouseDown={onClose}>
      <section
        className="booking-conflict-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-conflict-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="booking-conflict-head">
          <div>
            <span>예매 대안</span>
            <h2 id="booking-conflict-title">시간이 겹치는 회차입니다</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="예매 대안 창 닫기">×</button>
        </div>

        <p className="booking-conflict-guide">실제 시간표에는 동시에 넣지 않고, 예매 실패에 대비한 대안으로만 저장할 수 있습니다.</p>

        <div className="booking-conflict-current">
          <strong>현재 시간표와 겹침</strong>
          {overlapping.map(({ film: otherFilm, screening: other }) => (
            <div key={other.id}>
              <b>{otherFilm.title}</b>
              <span>{formatDate(other.date)} {other.start}–{endLabel(otherFilm, other)} · {other.venue}</span>
            </div>
          ))}
        </div>

        {alternativeOverlaps.length > 0 && <div className="booking-conflict-current booking-conflict-alternatives">
          <strong>기존 예매 대안과도 시간 겹침</strong>
          {alternativeOverlaps.map(({ film: otherFilm, screening: other, priority: otherPriority }) => (
            <div key={other.id}>
              <b>{otherFilm.title}</b>
              <span>{otherPriority}순위 · {formatDate(other.date)} {other.start}–{endLabel(otherFilm, other)} · {other.venue}</span>
            </div>
          ))}
        </div>}

        <div className="booking-conflict-candidate">
          <strong>대안 후보</strong>
          <b>{film.title}</b>
          <span>{formatDate(screening.date)} {screening.start}–{endLabel(film, screening)} · {screening.venue}</span>
        </div>

        {canSave ? (
          <label className="booking-conflict-priority">
            <span>대안 우선순위</span>
            <select value={priority} onChange={(event) => setPriority(Number(event.target.value) as BookingPriority)}>
              {minimumPriority! <= 2 && <option value={2}>2순위</option>}
              <option value={3}>3순위</option>
            </select>
            <small>겹치는 현재 회차와 기존 대안보다 낮은 우선순위만 선택할 수 있습니다.</small>
          </label>
        ) : (
          <div className="booking-conflict-limit" role="status">
            겹치는 현재 회차 또는 기존 대안 중 3순위가 있어 4순위 대안을 만들 수 없습니다. 기존 회차의 우선순위를 조정하거나 대안을 해제한 뒤 다시 시도해 주세요.
          </div>
        )}

        <div className="booking-conflict-actions">
          <button type="button" className="secondary" onClick={onClose}>취소</button>
          <button type="button" className="primary" disabled={!canSave} onClick={() => canSave && onSaveAlternative(priority)}>
            {canSave ? `${priority}순위 대안으로 저장` : '대안 저장 불가'}
          </button>
        </div>
      </section>
    </div>
  )
}
