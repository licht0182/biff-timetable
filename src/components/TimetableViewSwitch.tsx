type TimetableViewMode = 'list' | 'grid'

type TimetableViewSwitchProps = {
  value: TimetableViewMode
  onChange: (view: TimetableViewMode) => void
}

export default function TimetableViewSwitch({ value, onChange }: TimetableViewSwitchProps) {
  return (
    <div className="timetable-view-switch" role="group" aria-label="시간표 보기 방식">
      <button type="button" className={`ui-text-chip ${value === 'list' ? 'active' : ''}`} aria-pressed={value === 'list'} onClick={() => onChange('list')}>목록</button>
      <button type="button" className={`ui-text-chip ${value === 'grid' ? 'active' : ''}`} aria-pressed={value === 'grid'} onClick={() => onChange('grid')}>시간표</button>
    </div>
  )
}
