from pathlib import Path
import re

app = Path('src/App.tsx')
text = app.read_text()

text = text.replace(
"type TimetableItem = { film: Film; screening: Screening }\n",
"""type TimetableItem = { film: Film; screening: Screening }
type UserTimetableSettings = {
  sameVenueMinutes: number
  sameClusterMinutes: number
  differentVenueMinutes: number
  showTransferWarnings: boolean
  showVenueInTimetable: boolean
  showBookingStatusInTimetable: boolean
}
""",
1,
)

text = text.replace(
"const TICKET_STATUS_KEY = 'biff-timetable:ticket-status:v1'\n",
"""const TICKET_STATUS_KEY = 'biff-timetable:ticket-status:v1'
const USER_SETTINGS_KEY = 'biff-timetable:user-settings:v1'
const DEFAULT_USER_SETTINGS: UserTimetableSettings = {
  sameVenueMinutes: 0,
  sameClusterMinutes: 10,
  differentVenueMinutes: 30,
  showTransferWarnings: true,
  showVenueInTimetable: true,
  showBookingStatusInTimetable: true,
}
""",
1,
)

marker = """function toMinutes(time: string) {
"""
helper = """function clampSetting(value: unknown, fallback: number, max: number) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.max(0, Math.min(max, Math.round(number)))
}

function normalizeUserSettings(value: unknown): UserTimetableSettings {
  const source = value && typeof value === 'object' ? value as Partial<UserTimetableSettings> : {}
  return {
    sameVenueMinutes: clampSetting(source.sameVenueMinutes, DEFAULT_USER_SETTINGS.sameVenueMinutes, 120),
    sameClusterMinutes: clampSetting(source.sameClusterMinutes, DEFAULT_USER_SETTINGS.sameClusterMinutes, 180),
    differentVenueMinutes: clampSetting(source.differentVenueMinutes, DEFAULT_USER_SETTINGS.differentVenueMinutes, 240),
    showTransferWarnings: typeof source.showTransferWarnings === 'boolean' ? source.showTransferWarnings : DEFAULT_USER_SETTINGS.showTransferWarnings,
    showVenueInTimetable: typeof source.showVenueInTimetable === 'boolean' ? source.showVenueInTimetable : DEFAULT_USER_SETTINGS.showVenueInTimetable,
    showBookingStatusInTimetable: typeof source.showBookingStatusInTimetable === 'boolean' ? source.showBookingStatusInTimetable : DEFAULT_USER_SETTINGS.showBookingStatusInTimetable,
  }
}

"""
assert marker in text
text = text.replace(marker, helper + marker, 1)

old_date = """function formatDate(date: string, compact = false) {
  if (compact) {
    return new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' }).format(new Date(`${date}T00:00:00`))
  }
  return new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short' }).format(new Date(`${date}T00:00:00`))
}
"""
new_date = """function formatDate(date: string, _compact = false) {
  const value = new Date(`${date}T00:00:00`)
  const weekdays = ['일', '월', '화', '수', '목', '금', '토']
  return `${value.getMonth() + 1}월 ${value.getDate()}일 ${weekdays[value.getDay()]}`
}
"""
assert old_date in text
text = text.replace(old_date, new_date, 1)

old_buffer = """function transferBufferMinutes(a: string, b: string) {
  if (a === b) return 0
  if (venueCluster(a) === venueCluster(b)) return 10
  return 30
}
"""
new_buffer = """function transferBufferMinutes(a: string, b: string, settings: UserTimetableSettings) {
  if (a === b) return settings.sameVenueMinutes
  if (venueCluster(a) === venueCluster(b)) return settings.sameClusterMinutes
  return settings.differentVenueMinutes
}
"""
assert old_buffer in text
text = text.replace(old_buffer, new_buffer, 1)

state_marker = """  const [toast, setToast] = useState('')
"""
state_add = """  const [toast, setToast] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [userSettings, setUserSettings] = useState<UserTimetableSettings>(() => normalizeUserSettings(readStorage(USER_SETTINGS_KEY, DEFAULT_USER_SETTINGS)))
"""
assert state_marker in text
text = text.replace(state_marker, state_add, 1)

storage_marker = """  useEffect(() => { localStorage.setItem(TICKET_STATUS_KEY, JSON.stringify(ticketStatus)) }, [ticketStatus])
"""
storage_add = storage_marker + "  useEffect(() => { localStorage.setItem(USER_SETTINGS_KEY, JSON.stringify(userSettings)) }, [userSettings])\n"
assert storage_marker in text
text = text.replace(storage_marker, storage_add, 1)

transition_marker = """  function transitionWarning(film: Film, screening: Screening) {
    const start = toMinutes(screening.start)
"""
transition_new = """  function transitionWarning(film: Film, screening: Screening) {
    if (!userSettings.showTransferWarnings) return null
    const start = toMinutes(screening.start)
"""
assert transition_marker in text
text = text.replace(transition_marker, transition_new, 1)
text = text.replace("const buffer = transferBufferMinutes(screening.venue, other.venue)", "const buffer = transferBufferMinutes(screening.venue, other.venue, userSettings)", 1)

nav_old = """        <button className={activeTab === 'films' ? 'active' : ''} onClick={() => setActiveTab('films')}>영화 찾기</button>
        <button className={activeTab === 'timetable' ? 'active' : ''} onClick={() => setActiveTab('timetable')}>내 시간표</button>
"""
nav_new = """        <button className={activeTab === 'films' && !settingsOpen ? 'active' : ''} onClick={() => { setActiveTab('films'); setSettingsOpen(false) }}>영화 찾기</button>
        <button className={activeTab === 'timetable' && !settingsOpen ? 'active' : ''} onClick={() => { setActiveTab('timetable'); setSettingsOpen(false) }}>내 시간표</button>
        <button className={`settings-tab-trigger ${settingsOpen ? 'active' : ''}`} onClick={() => setSettingsOpen(true)}>설정</button>
"""
assert nav_old in text
text = text.replace(nav_old, nav_new, 1)
text = text.replace("{activeTab === 'films' && dataNote &&", "{activeTab === 'films' && !settingsOpen && dataNote &&", 1)

settings_panel = """
      {settingsOpen && <main className="biff-settings-panel react-settings-panel">
        <section className="settings-intro"><p className="settings-kicker">PERSONAL SETTINGS</p><h2>설정</h2><p>시간표 계산과 표시 방식을 현재 기기에 맞게 조정할 수 있습니다. 변경사항은 이 브라우저에 자동 저장됩니다.</p></section>
        <section className="settings-card">
          <div className="settings-card-head"><div><h3>이동 시간</h3><p>연속 상영 사이에 필요한 최소 이동 여유를 정합니다.</p></div></div>
          <div className="settings-list">
            <label className="settings-number-row"><span><strong>동일 상영관</strong><small>같은 관에서 다음 상영을 볼 때 필요한 여유</small></span><span className="settings-number-control"><input type="number" min="0" max="120" step="5" inputMode="numeric" value={userSettings.sameVenueMinutes} onChange={(event) => setUserSettings((current) => ({ ...current, sameVenueMinutes: clampSetting(event.target.value, current.sameVenueMinutes, 120) }))} /><em>분</em></span></label>
            <label className="settings-number-row"><span><strong>같은 상영관군</strong><small>영화의전당 내부처럼 같은 건물군에서 관을 이동할 때</small></span><span className="settings-number-control"><input type="number" min="0" max="180" step="5" inputMode="numeric" value={userSettings.sameClusterMinutes} onChange={(event) => setUserSettings((current) => ({ ...current, sameClusterMinutes: clampSetting(event.target.value, current.sameClusterMinutes, 180) }))} /><em>분</em></span></label>
            <label className="settings-number-row"><span><strong>서로 다른 상영관</strong><small>CGV ↔ 영화의전당처럼 상영관군이 달라질 때</small></span><span className="settings-number-control"><input type="number" min="0" max="240" step="5" inputMode="numeric" value={userSettings.differentVenueMinutes} onChange={(event) => setUserSettings((current) => ({ ...current, differentVenueMinutes: clampSetting(event.target.value, current.differentVenueMinutes, 240) }))} /><em>분</em></span></label>
            <label className="settings-toggle-row"><span><strong>이동 여유 경고 표시</strong><small>설정한 시간보다 여유가 짧은 연속 상영을 표시합니다.</small></span><span className="settings-switch"><input type="checkbox" checked={userSettings.showTransferWarnings} onChange={(event) => setUserSettings((current) => ({ ...current, showTransferWarnings: event.target.checked }))} /><i /></span></label>
          </div>
        </section>
        <section className="settings-card">
          <div className="settings-card-head"><div><h3>시간표 표시</h3><p>작은 화면에서 필요한 정보만 남길 수 있습니다.</p></div></div>
          <div className="settings-list">
            <label className="settings-toggle-row"><span><strong>상영관명 표시</strong><small>내 시간표 영화 블록 안에 상영관명을 표시합니다.</small></span><span className="settings-switch"><input type="checkbox" checked={userSettings.showVenueInTimetable} onChange={(event) => setUserSettings((current) => ({ ...current, showVenueInTimetable: event.target.checked }))} /><i /></span></label>
            <label className="settings-toggle-row"><span><strong>예매 상태 기호 표시</strong><small>예매 완료 ✓, 예매 예정 ○ 기호를 영화 제목 앞에 표시합니다.</small></span><span className="settings-switch"><input type="checkbox" checked={userSettings.showBookingStatusInTimetable} onChange={(event) => setUserSettings((current) => ({ ...current, showBookingStatusInTimetable: event.target.checked }))} /><i /></span></label>
          </div>
        </section>
        <section className="settings-card settings-reset-card"><div><h3>기본 설정</h3><p>이동 시간과 표시 설정을 처음 값으로 되돌립니다.</p></div><button type="button" className="settings-reset-button" onClick={() => setUserSettings({ ...DEFAULT_USER_SETTINGS })}>기본값으로 초기화</button></section>
      </main>}

"""
main_marker = "      {activeTab === 'films' ? <main>\n"
assert main_marker in text
text = text.replace(main_marker, settings_panel + "      {!settingsOpen && (activeTab === 'films' ? <main>\n", 1)
end_marker = "      </main>}\n\n      {detailFilm &&"
assert end_marker in text
text = text.replace(end_marker, "      </main>)}\n\n      {detailFilm &&", 1)

text = text.replace(
"const statusPrefix = status === 'booked' ? '✓ ' : status === 'planned' ? '○ ' : ''",
"const statusPrefix = userSettings.showBookingStatusInTimetable ? (status === 'booked' ? '✓ ' : status === 'planned' ? '○ ' : '') : ''",
1,
)
text = text.replace(
"{!timetableMetrics.dense && <span className=\"event-venue\">{screening.venue}</span>}",
"{userSettings.showVenueInTimetable && !timetableMetrics.dense && <span className=\"event-venue\">{screening.venue}</span>}",
1,
)
text = text.replace(
"<p className=\"transfer-note\">이동 여유 경고는 같은 건물군 10분, 서로 다른 상영관군 30분을 기본 기준으로 계산합니다.</p>",
"{userSettings.showTransferWarnings && <p className=\"transfer-note\">이동 여유 경고 기준: 동일 상영관 {userSettings.sameVenueMinutes}분 · 같은 상영관군 {userSettings.sameClusterMinutes}분 · 다른 상영관 {userSettings.differentVenueMinutes}분.</p>}",
1,
)
text = text.replace(
"{hour < 24 ? String(hour).padStart(2, '0') : String(hour - 24).padStart(2, '0')}</div>",
"{`${hour < 24 ? String(hour).padStart(2, '0') : String(hour - 24).padStart(2, '0')}시`}</div>",
1,
)

app.write_text(text)

main = Path('src/main.tsx')
main_text = main.read_text().replace("import './settings'\n", '')
main.write_text(main_text)

# Keep title fitting, but stop mutating React-owned date/time text nodes.
Path('src/timetable-display.ts').write_text("""export {}

let frame = 0

function fitEventTitle(block: HTMLElement) {
  const title = block.querySelector<HTMLElement>('strong')
  if (!title) return
  title.style.removeProperty('font-size')
  block.classList.remove('title-priority')
  if (block.scrollHeight <= block.clientHeight + 1) return
  block.classList.add('title-priority')
  let size = Number.parseFloat(getComputedStyle(title).fontSize)
  const minimum = 4.8
  while (block.scrollHeight > block.clientHeight + 1 && size > minimum) {
    size = Math.max(minimum, size - 0.4)
    title.style.fontSize = `${size}px`
  }
}

function applyTimetableDisplay() {
  document.querySelectorAll<HTMLElement>('.event-block').forEach(fitEventTitle)
}

function scheduleApply() {
  if (frame) cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => {
    frame = 0
    applyTimetableDisplay()
  })
}

const root = document.getElementById('root')
if (root) {
  new MutationObserver(scheduleApply).observe(root, { childList: true, subtree: true })
  window.addEventListener('resize', scheduleApply)
  window.addEventListener('orientationchange', scheduleApply)
  scheduleApply()
}
""")

css = Path('src/settings.css')
css_text = css.read_text()
if '.react-settings-panel{' not in css_text:
    css_text += "\n.react-settings-panel{display:block!important}\n"
css.write_text(css_text)

png = Path('src/png-export.ts')
png_text = png.read_text()
png_text = png_text.replace(
"type ExportItem = { film: Film; screening: Screening }\n",
"""type ExportItem = { film: Film; screening: Screening }
type UserTimetableSettings = {
  sameVenueMinutes: number
  sameClusterMinutes: number
  differentVenueMinutes: number
  showTransferWarnings: boolean
}
""",
1,
)
png_text = png_text.replace(
"const TICKET_STATUS_KEY = 'biff-timetable:ticket-status:v1'\n",
"""const TICKET_STATUS_KEY = 'biff-timetable:ticket-status:v1'
const USER_SETTINGS_KEY = 'biff-timetable:user-settings:v1'
const DEFAULT_USER_SETTINGS: UserTimetableSettings = {
  sameVenueMinutes: 0,
  sameClusterMinutes: 10,
  differentVenueMinutes: 30,
  showTransferWarnings: true,
}
""",
1,
)
png_text = png_text.replace(
"function transferBufferMinutes(a: string, b: string) {\n  if (a === b) return 0\n  if (venueCluster(a) === venueCluster(b)) return 10\n  return 30\n}\n",
"""function exportUserSettings() {
  const stored = readStorage<Partial<UserTimetableSettings>>(USER_SETTINGS_KEY, DEFAULT_USER_SETTINGS)
  return {
    sameVenueMinutes: Number.isFinite(Number(stored.sameVenueMinutes)) ? Math.max(0, Number(stored.sameVenueMinutes)) : DEFAULT_USER_SETTINGS.sameVenueMinutes,
    sameClusterMinutes: Number.isFinite(Number(stored.sameClusterMinutes)) ? Math.max(0, Number(stored.sameClusterMinutes)) : DEFAULT_USER_SETTINGS.sameClusterMinutes,
    differentVenueMinutes: Number.isFinite(Number(stored.differentVenueMinutes)) ? Math.max(0, Number(stored.differentVenueMinutes)) : DEFAULT_USER_SETTINGS.differentVenueMinutes,
    showTransferWarnings: typeof stored.showTransferWarnings === 'boolean' ? stored.showTransferWarnings : true,
  }
}

function transferBufferMinutes(a: string, b: string, settings: UserTimetableSettings) {
  if (a === b) return settings.sameVenueMinutes
  if (venueCluster(a) === venueCluster(b)) return settings.sameClusterMinutes
  return settings.differentVenueMinutes
}
""",
1,
)
png_text = png_text.replace(
"""function hasTransferWarning(item: ExportItem, items: ExportItem[]) {
  const start = displayStartMinutes(item.screening.start)
""",
"""function hasTransferWarning(item: ExportItem, items: ExportItem[]) {
  const settings = exportUserSettings()
  if (!settings.showTransferWarnings) return false
  const start = displayStartMinutes(item.screening.start)
""",
1,
)
png_text = png_text.replace(
"const buffer = transferBufferMinutes(item.screening.venue, other.screening.venue)",
"const buffer = transferBufferMinutes(item.screening.venue, other.screening.venue, settings)",
1,
)
png.write_text(png_text)
