import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { CUSTOM_EVENT_CATEGORIES, customEventCategoryLabel, isValidCustomEventDraft, type CustomEvent, type CustomEventDraft } from '../custom-events'

type CustomEventDialogProps = {
  mode: 'create' | 'detail' | 'edit'
  event: CustomEvent | null
  defaultDate: string
  hasConflict: boolean
  onClose: () => void
  onEdit: () => void
  onDelete: (event: CustomEvent) => void
  onSave: (draft: CustomEventDraft, editingId?: string) => boolean
}

function todayLocal() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDate(date: string) {
  const value = new Date(`${date}T00:00:00`)
  const weekdays = ['일', '월', '화', '수', '목', '금', '토']
  return `${value.getMonth() + 1}월 ${value.getDate()}일 ${weekdays[value.getDay()]}`
}

export default function CustomEventDialog({
  mode,
  event,
  defaultDate,
  hasConflict,
  onClose,
  onEdit,
  onDelete,
  onSave,
}: CustomEventDialogProps) {
  const initial = useMemo<CustomEventDraft>(() => ({
    title: event?.title ?? '',
    date: event?.date ?? defaultDate ?? todayLocal(),
    start: event?.start ?? '12:00',
    end: event?.end ?? '13:00',
    category: event?.category ?? 'personal',
    location: event?.location ?? '',
    note: event?.note ?? '',
  }), [event, defaultDate])
  const [form, setForm] = useState<CustomEventDraft>(initial)
  const [error, setError] = useState('')

  useEffect(() => {
    setForm(initial)
    setError('')
  }, [initial, mode])

  const update = <K extends keyof CustomEventDraft>(key: K, value: CustomEventDraft[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const submit = (submitEvent: FormEvent) => {
    submitEvent.preventDefault()
    const draft: CustomEventDraft = {
      ...form,
      title: form.title.trim(),
      location: form.location?.trim() || undefined,
      note: form.note?.trim() || undefined,
    }
    if (!draft.title) {
      setError('일정명을 입력해 주세요.')
      return
    }
    if (!isValidCustomEventDraft(draft)) {
      setError('종료 시간은 시작 시간보다 늦어야 합니다.')
      return
    }
    if (onSave(draft, mode === 'edit' ? event?.id : undefined)) setError('')
  }

  const titleId = 'custom-event-dialog-title'

  return <div className="modal-backdrop custom-event-backdrop" onMouseDown={onClose}>
    <section className="custom-event-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} onMouseDown={(mouseEvent) => mouseEvent.stopPropagation()}>
      <div className="custom-event-modal-head">
        <div><p className="custom-event-kicker">MY TIMETABLE</p><h2 id={titleId}>{mode === 'create' ? '일정 추가' : mode === 'edit' ? '일정 수정' : event?.title}</h2></div>
        <button type="button" className="modal-close" onClick={onClose} aria-label="일정 창 닫기">×</button>
      </div>

      {mode === 'detail' && event ? <>
        {hasConflict && <div className="custom-event-conflict-note">⚠ 다른 일정과 시간이 겹칩니다.</div>}
        <dl className="custom-event-detail-grid">
          <dt>날짜</dt><dd>{formatDate(event.date)}</dd>
          <dt>시간</dt><dd>{event.start}–{event.end}</dd>
          <dt>종류</dt><dd>{customEventCategoryLabel(event.category)}</dd>
          {event.location && <><dt>장소</dt><dd>{event.location}</dd></>}
          {event.note && <><dt>메모</dt><dd className="custom-event-note-value">{event.note}</dd></>}
        </dl>
        <div className="custom-event-detail-actions">
          <button type="button" className="custom-event-delete" onClick={() => onDelete(event)}>삭제</button>
          <button type="button" className="custom-event-edit" onClick={onEdit}>수정</button>
        </div>
      </> : <form className="custom-event-form" onSubmit={submit}>
        <label><span>일정명 *</span><input autoFocus type="text" value={form.title} onChange={(changeEvent) => update('title', changeEvent.target.value)} maxLength={80} placeholder="예: 점심 식사" /></label>
        <div className="custom-event-form-row">
          <label><span>날짜 *</span><input type="date" value={form.date} onChange={(changeEvent) => update('date', changeEvent.target.value)} required /></label>
          <label><span>종류</span><select value={form.category} onChange={(changeEvent) => update('category', changeEvent.target.value as CustomEventDraft['category'])}>{CUSTOM_EVENT_CATEGORIES.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</select></label>
        </div>
        <div className="custom-event-form-row custom-event-time-row">
          <label><span>시작 *</span><input type="time" value={form.start} onChange={(changeEvent) => update('start', changeEvent.target.value)} step="300" required /></label>
          <label><span>종료 *</span><input type="time" value={form.end} onChange={(changeEvent) => update('end', changeEvent.target.value)} step="300" required /></label>
        </div>
        <label><span>장소</span><input type="text" value={form.location ?? ''} onChange={(changeEvent) => update('location', changeEvent.target.value)} maxLength={100} placeholder="선택 입력" /></label>
        <label><span>메모</span><textarea value={form.note ?? ''} onChange={(changeEvent) => update('note', changeEvent.target.value)} maxLength={300} rows={3} placeholder="선택 입력" /></label>
        {error && <p className="custom-event-form-error" role="alert">{error}</p>}
        <div className="custom-event-form-actions"><button type="button" onClick={onClose}>취소</button><button type="submit" className="custom-event-save">{mode === 'edit' ? '저장' : '추가'}</button></div>
      </form>}
    </section>
  </div>
}
