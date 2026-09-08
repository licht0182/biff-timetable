from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'missing patch target: {label}')
    return text.replace(old, new, 1)


def replace_between(text: str, start: str, end: str, replacement: str, label: str) -> str:
    start_at = text.find(start)
    if start_at < 0:
        raise SystemExit(f'missing patch start: {label}')
    end_at = text.find(end, start_at)
    if end_at < 0:
        raise SystemExit(f'missing patch end: {label}')
    return text[:start_at] + replacement + text[end_at:]


path = Path('src/App.tsx')
app = path.read_text()

app = replace_once(
    app,
    "import type { Film, Screening, TicketStatus, TicketStatusMap } from './components/film-types'\n",
    "import type { Film, Screening, TicketStatus, TicketStatusMap } from './components/film-types'\nimport { VENUE_TRANSFER_SITES, getPreciseVenueTransfer, getVenueSiteTransferMinutes } from './venue-travel'\n",
    'venue travel import',
)

old_transfer = """function venueCluster(venue: string) {\n  if (venue.startsWith('영화의전당')) return '영화의전당'\n  if (venue.startsWith('CGV 센텀시티')) return 'CGV 센텀시티'\n  if (venue.startsWith('롯데시네마 센텀')) return '롯데시네마 센텀시티'\n  if (venue.includes('소향씨어터')) return '소향씨어터'\n  return venue\n}\n\nfunction transferBufferMinutes(a: string, b: string, settings: UserTimetableSettings) {\n  if (a === b) return settings.sameVenueMinutes\n  if (venueCluster(a) === venueCluster(b)) return settings.sameClusterMinutes\n  return settings.differentVenueMinutes\n}\n"""
new_transfer = """function venueCluster(venue: string) {\n  if (venue.startsWith('영화의전당')) return '영화의전당'\n  if (venue.startsWith('CGV센텀시티') || venue.startsWith('CGV 센텀시티')) return 'CGV센텀시티'\n  if (venue.startsWith('롯데시네마 센텀')) return '롯데시네마 센텀시티'\n  if (venue.includes('소향씨어터') || venue.startsWith('동서대학교-경남정보대학교')) return '동서대 센텀캠퍼스'\n  if (venue.includes('영화진흥위원회')) return '영화진흥위원회'\n  if (venue.includes('시청자미디어센터')) return '시청자미디어센터'\n  return venue\n}\n\nfunction transferBuffer(fromVenue: string, toVenue: string, settings: UserTimetableSettings) {\n  if (fromVenue === toVenue) {\n    return {\n      minutes: settings.sameVenueMinutes,\n      routeLabel: '동일 상영관',\n      transferDetail: `같은 상영관 연속 관람 기본 여유 ${settings.sameVenueMinutes}분`,\n      precise: false,\n    }\n  }\n\n  const precise = getPreciseVenueTransfer(fromVenue, toVenue)\n  if (precise) {\n    return {\n      minutes: precise.minutes,\n      routeLabel: precise.routeLabel,\n      transferDetail: precise.detail,\n      precise: true,\n    }\n  }\n\n  const sameCluster = venueCluster(fromVenue) === venueCluster(toVenue)\n  const minutes = sameCluster ? settings.sameClusterMinutes : settings.differentVenueMinutes\n  return {\n    minutes,\n    routeLabel: `${fromVenue} → ${toVenue}`,\n    transferDetail: `정밀 이동시간 미등록 조합 · ${sameCluster ? '같은 시설' : '다른 시설'} 기본값 ${minutes}분 적용`,\n    precise: false,\n  }\n}\n"""
app = replace_once(app, old_transfer, new_transfer, 'transfer calculation')

old_warning = """  const transitionWarning = useCallback((film: Film, screening: Screening) => {\n    if (!userSettings.showTransferWarnings) return null\n    const start = toMinutes(screening.start)\n    const end = endMinutes(film, screening)\n\n    for (const { film: otherFilm, screening: other } of selectedItems) {\n      if (other.id === screening.id || other.date !== screening.date) continue\n      const otherStart = toMinutes(other.start)\n      const otherEnd = endMinutes(otherFilm, other)\n      const buffer = transferBufferMinutes(screening.venue, other.venue, userSettings)\n      if (buffer === 0) continue\n\n      if (end <= otherStart) {\n        const gap = otherStart - end\n        if (gap < buffer) return { otherFilm, other, gap, buffer }\n      } else if (otherEnd <= start) {\n        const gap = start - otherEnd\n        if (gap < buffer) return { otherFilm, other, gap, buffer }\n      }\n    }\n    return null\n  }, [selectedItems, userSettings])\n"""
new_warning = """  const transitionWarning = useCallback((film: Film, screening: Screening) => {\n    if (!userSettings.showTransferWarnings) return null\n    const start = toMinutes(screening.start)\n    const end = endMinutes(film, screening)\n\n    for (const { film: otherFilm, screening: other } of selectedItems) {\n      if (other.id === screening.id || other.date !== screening.date) continue\n      const otherStart = toMinutes(other.start)\n      const otherEnd = endMinutes(otherFilm, other)\n\n      if (end <= otherStart) {\n        const transfer = transferBuffer(screening.venue, other.venue, userSettings)\n        if (transfer.minutes === 0) continue\n        const gap = otherStart - end\n        if (gap < transfer.minutes) return {\n          otherFilm,\n          other,\n          gap,\n          buffer: transfer.minutes,\n          routeLabel: transfer.routeLabel,\n          transferDetail: transfer.transferDetail,\n          precise: transfer.precise,\n        }\n      } else if (otherEnd <= start) {\n        const transfer = transferBuffer(other.venue, screening.venue, userSettings)\n        if (transfer.minutes === 0) continue\n        const gap = start - otherEnd\n        if (gap < transfer.minutes) return {\n          otherFilm,\n          other,\n          gap,\n          buffer: transfer.minutes,\n          routeLabel: transfer.routeLabel,\n          transferDetail: transfer.transferDetail,\n          precise: transfer.precise,\n        }\n      }\n    }\n    return null\n  }, [selectedItems, userSettings])\n"""
app = replace_once(app, old_warning, new_warning, 'chronological travel warning')

settings_start = '        <section className="settings-card">\n          <div className="settings-card-head"><div><h3>이동 시간</h3>'
settings_end = '        <section className="settings-card">\n          <div className="settings-card-head"><div><h3>시간표 표시</h3>'
settings_block = """        <section className=\"settings-card\">\n          <div className=\"settings-card-head\"><div><h3>이동 시간</h3><p>등록된 BIFF 센텀권 상영관은 실제 출발 → 도착 방향에 따라 정밀 이동시간을 적용합니다.</p></div></div>\n          <div className=\"precise-transfer-panel\">\n            <strong>방향별 권장 이동시간</strong>\n            <div className=\"travel-matrix-wrap\">\n              <table className=\"travel-matrix\" aria-label=\"상영관 방향별 권장 이동시간\">\n                <thead><tr><th>출발 ↓ / 도착 →</th>{VENUE_TRANSFER_SITES.map((site) => <th key={site.id} title={site.label}>{site.shortLabel}</th>)}</tr></thead>\n                <tbody>{VENUE_TRANSFER_SITES.map((from) => <tr key={from.id}><th title={from.label}>{from.shortLabel}</th>{VENUE_TRANSFER_SITES.map((to) => {\n                  const minutes = getVenueSiteTransferMinutes(from.id, to.id)\n                  return <td key={to.id} title={`${from.label} → ${to.label}`}>{minutes == null ? '—' : `${minutes}분`}</td>\n                })}</tr>)}</tbody>\n              </table>\n            </div>\n            <p className=\"precise-transfer-note\">퇴장·건물 내부 이동 + 시설 간 도보 + 목적지 입장 시간을 합산한 보수적 최소값입니다. 대각선은 같은 시설 안의 다른 관/층 이동 기준이며, 같은 정확한 상영관은 아래 ‘동일한 관’ 값을 사용합니다.</p>\n          </div>\n          <div className=\"settings-list\">\n            <label className=\"settings-number-row\"><span><strong>동일한 관</strong><small>완전히 같은 상영관에서 연속 관람할 때의 여유</small></span><span className=\"settings-number-control\"><input type=\"number\" min=\"0\" max=\"120\" step=\"5\" inputMode=\"numeric\" value={userSettings.sameVenueMinutes} onChange={(event) => setUserSettings((current) => ({ ...current, sameVenueMinutes: clampSetting(event.target.value, current.sameVenueMinutes, 120) }))} /><em>분</em></span></label>\n            <label className=\"settings-number-row\"><span><strong>미등록 같은 시설</strong><small>새 관명 등으로 정밀 매칭이 되지 않지만 같은 시설로 판단될 때</small></span><span className=\"settings-number-control\"><input type=\"number\" min=\"0\" max=\"180\" step=\"5\" inputMode=\"numeric\" value={userSettings.sameClusterMinutes} onChange={(event) => setUserSettings((current) => ({ ...current, sameClusterMinutes: clampSetting(event.target.value, current.sameClusterMinutes, 180) }))} /><em>분</em></span></label>\n            <label className=\"settings-number-row\"><span><strong>미등록 다른 시설</strong><small>정밀 이동시간 데이터에 없는 새로운 상영관 조합의 안전 기본값</small></span><span className=\"settings-number-control\"><input type=\"number\" min=\"0\" max=\"240\" step=\"5\" inputMode=\"numeric\" value={userSettings.differentVenueMinutes} onChange={(event) => setUserSettings((current) => ({ ...current, differentVenueMinutes: clampSetting(event.target.value, current.differentVenueMinutes, 240) }))} /><em>분</em></span></label>\n            <label className=\"settings-toggle-row\"><span><strong>이동 여유 경고 표시</strong><small>실제 회차 순서의 출발지 → 도착지 이동시간보다 여유가 짧으면 표시합니다.</small></span><span className=\"settings-switch\"><input type=\"checkbox\" checked={userSettings.showTransferWarnings} onChange={(event) => setUserSettings((current) => ({ ...current, showTransferWarnings: event.target.checked }))} /><i /></span></label>\n          </div>\n        </section>\n"""
app = replace_between(app, settings_start, settings_end, settings_block, 'settings transfer section')

app = replace_once(
    app,
    "${travel ? ` · 이동 여유 ${travel.gap}분/권장 ${travel.buffer}분` : ''}",
    "${travel ? ` · ${travel.routeLabel ? `${travel.routeLabel} · ` : ''}이동 여유 ${travel.gap}분/필요 ${travel.buffer}분${travel.transferDetail ? ` · ${travel.transferDetail}` : ''}` : ''}",
    'timetable travel title',
)

app = replace_once(
    app,
    "{userSettings.showTransferWarnings && <p className=\"transfer-note\">이동 여유 경고 기준: 동일 상영관 {userSettings.sameVenueMinutes}분 · 같은 상영관군 {userSettings.sameClusterMinutes}분 · 다른 상영관 {userSettings.differentVenueMinutes}분.</p>}",
    "{userSettings.showTransferWarnings && <p className=\"transfer-note\">이동시간은 등록된 센텀권 상영관의 출발 → 도착 방향별 정밀값을 우선 사용합니다. 같은 정확한 관 {userSettings.sameVenueMinutes}분 · 미등록 같은 시설 {userSettings.sameClusterMinutes}분 · 미등록 다른 시설 {userSettings.differentVenueMinutes}분.</p>}",
    'timetable transfer note',
)

path.write_text(app)
