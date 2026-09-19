export type AppTab = 'films' | 'timetable' | 'curator' | 'settings'

type LiquidTabBarProps = {
  activeTab: AppTab
  timetableCount: number
  onOpenFilms: () => void
  onOpenTimetable: () => void
  onOpenCurator: () => void
  onOpenSettings: () => void
}

const items = [
  { id: 'films', label: '영화 찾기', icon: 'search' },
  { id: 'timetable', label: '내 시간표', icon: 'calendar' },
  { id: 'curator', label: 'AI 도슨트', icon: 'sparkles' },
  { id: 'settings', label: '설정', icon: 'settings' },
] as const

function TabIcon({ name }: { name: typeof items[number]['icon'] }) {
  if (name === 'search') return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.6" /><path d="m16 16 4 4" /></svg>
  if (name === 'calendar') return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="15" rx="3" /><path d="M8 3.5v4M16 3.5v4M3.5 10h17M8 14h3M13 14h3M8 17h3" /></svg>
  if (name === 'sparkles') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8c.7 4.5 2.7 6.5 7.2 7.2-4.5.7-6.5 2.7-7.2 7.2-.7-4.5-2.7-6.5-7.2-7.2C9.3 9.3 11.3 7.3 12 2.8Z" /><path d="M19 15.5c.3 2 1.2 2.9 3.2 3.2-2 .3-2.9 1.2-3.2 3.2-.3-2-1.2-2.9-3.2-3.2 2-.3 2.9-1.2 3.2-3.2Z" /></svg>
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></svg>
}

export default function LiquidTabBar({ activeTab, timetableCount, onOpenFilms, onOpenTimetable, onOpenCurator, onOpenSettings }: LiquidTabBarProps) {
  const handlers = { films: onOpenFilms, timetable: onOpenTimetable, curator: onOpenCurator, settings: onOpenSettings }

  return (
    <nav className="liquid-tab-bar" aria-label="주요 메뉴">
      <div className="liquid-tab-bar-surface">
        {items.map((item) => {
          const active = activeTab === item.id
          return <button key={item.id} type="button" className={active ? 'active' : ''} aria-current={active ? 'page' : undefined} onClick={handlers[item.id]}>
            <span className="liquid-tab-icon"><TabIcon name={item.icon} />{item.id === 'timetable' && timetableCount > 0 && <b aria-label={`${timetableCount}개 일정`}>{timetableCount > 99 ? '99+' : timetableCount}</b>}</span>
            <span>{item.label}</span>
          </button>
        })}
      </div>
    </nav>
  )
}
