from pathlib import Path
import re

# App.tsx: central transfer calculation + React-owned PNG trigger.
app_path = Path('src/App.tsx')
app = app_path.read_text()

old_import = "import { VENUE_TRANSFER_SITES, getPreciseVenueTransfer, getVenueSiteTransferMinutes } from './venue-travel'\n"
new_import = "import { VENUE_TRANSFER_SITES, getVenueSiteTransferMinutes } from './venue-travel'\nimport { getTransferBuffer } from './transfer-buffer'\nimport { exportTimetablePng } from './png-export'\n"
if old_import not in app:
    raise SystemExit('App venue import not found')
app = app.replace(old_import, new_import, 1)

local_transfer = re.compile(r"\nfunction venueCluster\(venue: string\) \{.*?\n\}\n\nfunction transferBuffer\(fromVenue: string, toVenue: string, settings: UserTimetableSettings\) \{.*?\n\}\n", re.S)
app, count = local_transfer.subn('\n', app, count=1)
if count != 1:
    raise SystemExit(f'App local transfer block replacement count={count}')
app = app.replace('transferBuffer(', 'getTransferBuffer(')

state_anchor = "  const [toast, setToast] = useState('')\n"
if state_anchor not in app:
    raise SystemExit('App toast state anchor missing')
app = app.replace(state_anchor, state_anchor + "  const [pngExportState, setPngExportState] = useState<'idle' | 'working' | 'ready' | 'done' | 'error'>('idle')\n", 1)

ics_anchor = "  function exportIcs() {\n"
handler = '''  async function savePng() {
    if (pngExportState === 'working' || !selectedItems.length) return
    setPngExportState('working')
    try {
      const result = await exportTimetablePng(selectedItems, ticketStatus, userSettings)
      setPngExportState(result === 'apple-ready' ? 'ready' : 'done')
      if (result === 'downloaded') setToast('시간표 PNG를 저장했습니다.')
    } catch (error) {
      console.error(error)
      setPngExportState('error')
      setToast(error instanceof Error ? error.message : 'PNG 저장에 실패했습니다.')
    } finally {
      window.setTimeout(() => setPngExportState('idle'), 1300)
    }
  }

'''
if ics_anchor not in app:
    raise SystemExit('App ICS anchor missing')
app = app.replace(ics_anchor, handler + ics_anchor, 1)

button_anchor = '''            <div className="timetable-action-buttons">
              <button onClick={exportIcs}>캘린더</button>
'''
button_replacement = '''            <div className="timetable-action-buttons">
              <button
                type="button"
                className="png-export-trigger"
                title="현재 화면 크기와 무관한 고정 레이아웃으로 시간표 PNG를 저장합니다."
                onClick={() => void savePng()}
                disabled={pngExportState === 'working'}
              >{pngExportState === 'working' ? 'PNG 생성 중…' : pngExportState === 'ready' ? 'PNG 준비 완료' : pngExportState === 'done' ? '저장 완료' : pngExportState === 'error' ? '저장 실패' : 'PNG 저장'}</button>
              <button onClick={exportIcs}>캘린더</button>
'''
if button_anchor not in app:
    raise SystemExit('App timetable button anchor missing')
app = app.replace(button_anchor, button_replacement, 1)
app_path.write_text(app)

# main.tsx: PNG export is now imported by React App, not executed as a sidecar.
main_path = Path('src/main.tsx')
main = main_path.read_text()
side_effect = "import './png-export'\n"
if side_effect not in main:
    raise SystemExit('png side-effect import missing')
main = main.replace(side_effect, '', 1)
main_path.write_text(main)

# png-export.ts: use shared time/transfer engines and expose a pure React-callable export action.
png_path = Path('src/png-export.ts')
png = png_path.read_text()

top_pattern = re.compile(r"\Aimport \{ toBlob \} from 'html-to-image'\n.*?const EXPORT_FILENAME = 'BIFF-timetable.png'\n", re.S)
new_top = '''import { toBlob } from 'html-to-image'
import type { Film, Screening, TicketStatusMap } from './components/film-types'
import { BASE_END_HOUR, START_HOUR, screeningAbsoluteWindow, timetableDate, timetableEndMinutes, timetableStartMinutes } from './screening-time'
import { getTransferBuffer, type TransferSettings } from './transfer-buffer'

type ExportItem = { film: Film; screening: Screening }
export type PngExportSettings = TransferSettings & {
  showTransferWarnings: boolean
}

const EXPORT_WIDTH = 1440
const EXPORT_AXIS_WIDTH = 72
const EXPORT_HEADER_HEIGHT = 56
const EXPORT_HOUR_HEIGHT = 58
const EXPORT_EDGE_SPACE = 16
const EXPORT_FILENAME = 'BIFF-timetable.png'
'''
png, count = top_pattern.subn(new_top, png, count=1)
if count != 1:
    raise SystemExit(f'PNG top replacement count={count}')

legacy_time_pattern = re.compile(r"\nfunction readStorage<T>\(key: string, fallback: T\): T \{.*?\n\}\n\nfunction exportEndHour", re.S)
png, count = legacy_time_pattern.subn('\nfunction exportEndHour', png, count=1)
if count != 1:
    raise SystemExit(f'PNG legacy time block replacement count={count}')
png = png.replace('displayEndMinutes(film, screening)', 'timetableEndMinutes(film, screening)')

travel_pattern = re.compile(r"\nfunction venueCluster\(venue: string\) \{.*?\n\}\n\nfunction paletteIndex", re.S)
new_travel = '''
function hasTransferWarning(item: ExportItem, items: ExportItem[], settings: PngExportSettings) {
  if (!settings.showTransferWarnings) return false
  const current = screeningAbsoluteWindow(item.film, item.screening)

  return items.some((other) => {
    if (other.screening.id === item.screening.id) return false
    const otherWindow = screeningAbsoluteWindow(other.film, other.screening)

    if (current.end <= otherWindow.start) {
      const transfer = getTransferBuffer(item.screening.venue, other.screening.venue, settings)
      return transfer.minutes > 0 && otherWindow.start - current.end < transfer.minutes
    }
    if (otherWindow.end <= current.start) {
      const transfer = getTransferBuffer(other.screening.venue, item.screening.venue, settings)
      return transfer.minutes > 0 && current.start - otherWindow.end < transfer.minutes
    }
    return false
  })
}

function paletteIndex'''
png, count = travel_pattern.subn(new_travel, png, count=1)
if count != 1:
    raise SystemExit(f'PNG travel block replacement count={count}')

png = png.replace('function buildExportBoard(items: ExportItem[], ticketStatus: TicketStatusMap) {', 'function buildExportBoard(items: ExportItem[], ticketStatus: TicketStatusMap, settings: PngExportSettings) {', 1)
png = png.replace('const dates = Array.from(new Set(items.map(({ screening }) => screening.date))).sort()', 'const dates = Array.from(new Set(items.map(({ screening }) => timetableDate(screening)))).sort()', 1)
png = png.replace(".filter(({ screening }) => screening.date === date)", ".filter(({ screening }) => timetableDate(screening) === date)")
png = png.replace('const start = displayStartMinutes(screening.start)', 'const start = timetableStartMinutes(screening)')
png = png.replace('const end = displayEndMinutes(film, screening)', 'const end = timetableEndMinutes(film, screening)')
png = png.replace("${hasTransferWarning(item, items) ? ' transfer-warning' : ''}", "${hasTransferWarning(item, items, settings) ? ' transfer-warning' : ''}")

load_pattern = re.compile(r"\nasync function loadExportItems\(\) \{.*?\n\}\n\nfunction isAppleMobile", re.S)
png, count = load_pattern.subn('\nfunction isAppleMobile', png, count=1)
if count != 1:
    raise SystemExit(f'PNG loadExportItems replacement count={count}')

export_pattern = re.compile(r"\nasync function exportPng\(button: HTMLButtonElement\) \{.*\Z", re.S)
new_export = '''
export async function exportTimetablePng(
  sourceItems: readonly ExportItem[],
  ticketStatus: TicketStatusMap,
  settings: PngExportSettings,
): Promise<'apple-ready' | 'downloaded'> {
  if (!sourceItems.length) throw new Error('저장할 시간표가 없습니다.')

  const items = [...sourceItems].sort((a, b) => (
    screeningAbsoluteWindow(a.film, a.screening).start - screeningAbsoluteWindow(b.film, b.screening).start
  ))
  let host: HTMLElement | null = null

  try {
    const board = buildExportBoard(items, ticketStatus, settings)
    host = element('div', 'png-export-host')
    host.append(board)
    document.body.append(host)

    await document.fonts?.ready
    await nextPaint()
    prepareExportBoard(board)
    await nextPaint()

    const blob = await toBlob(board, {
      backgroundColor: '#ffffff',
      cacheBust: true,
      pixelRatio: 1.5,
      width: board.scrollWidth,
      height: board.scrollHeight,
    })
    if (!blob) throw new Error('PNG 이미지를 만들지 못했습니다.')

    if (isAppleMobile()) {
      showAppleSaveSheet(blob)
      return 'apple-ready'
    }

    downloadBlob(EXPORT_FILENAME, blob)
    return 'downloaded'
  } finally {
    host?.remove()
  }
}
'''
png, count = export_pattern.subn(new_export, png, count=1)
if count != 1:
    raise SystemExit(f'PNG export block replacement count={count}')

for forbidden in ['MutationObserver', 'ensurePngButton', 'initPngExport', 'displayStartMinutes', 'displayEndMinutes', 'readStorage<', 'loadExportItems']:
    if forbidden in png:
        raise SystemExit(f'forbidden legacy PNG pattern remains: {forbidden}')

png_path.write_text(png)
