from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'missing patch target: {label}')
    return text.replace(old, new, 1)

app_path = Path('src/App.tsx')
app = app_path.read_text()

app = replace_once(
    app,
    "  const [userSettings, setUserSettings] = useState<UserTimetableSettings>(() => normalizeUserSettings(readStorage(USER_SETTINGS_KEY, DEFAULT_USER_SETTINGS)))\n",
    "  const [userSettings, setUserSettings] = useState<UserTimetableSettings>(() => normalizeUserSettings(readStorage(USER_SETTINGS_KEY, DEFAULT_USER_SETTINGS)))\n  const [timetableSelectionMode, setTimetableSelectionMode] = useState(false)\n  const [timetableDeleteSelection, setTimetableDeleteSelection] = useState<string[]>([])\n",
    'selection state',
)

app = replace_once(
    app,
    "  useEffect(() => {\n    if (!detailFilm) return\n    const closeOnEscape = (event: KeyboardEvent) => {\n      if (event.key === 'Escape') setDetailFilm(null)\n    }\n    window.addEventListener('keydown', closeOnEscape)\n    return () => window.removeEventListener('keydown', closeOnEscape)\n  }, [detailFilm])\n",
    "  useEffect(() => {\n    if (!detailFilm) return\n    const closeOnEscape = (event: KeyboardEvent) => {\n      if (event.key === 'Escape') setDetailFilm(null)\n    }\n    window.addEventListener('keydown', closeOnEscape)\n    return () => window.removeEventListener('keydown', closeOnEscape)\n  }, [detailFilm])\n\n  useEffect(() => {\n    if (activeTab === 'timetable' && !settingsOpen) return\n    setTimetableSelectionMode(false)\n    setTimetableDeleteSelection([])\n  }, [activeTab, settingsOpen])\n\n  useEffect(() => {\n    setTimetableDeleteSelection((current) => {\n      const next = current.filter((id) => selected.includes(id))\n      return next.length === current.length ? current : next\n    })\n    if (selected.length === 0) setTimetableSelectionMode(false)\n  }, [selected])\n",
    'selection cleanup effects',
)

app = replace_once(
    app,
    "  function clearSelected() {\n    setSelected([])\n    setTicketStatus({})\n  }\n",
    "  function clearSelected() {\n    setSelected([])\n    setTicketStatus({})\n    setTimetableSelectionMode(false)\n    setTimetableDeleteSelection([])\n  }\n\n  function toggleTimetableSelectionMode() {\n    if (timetableSelectionMode) {\n      setTimetableSelectionMode(false)\n      setTimetableDeleteSelection([])\n      return\n    }\n    setTimetableSelectionMode(true)\n  }\n\n  function toggleTimetableDeleteSelection(screeningId: string) {\n    if (!timetableSelectionMode) return\n    setTimetableDeleteSelection((current) => current.includes(screeningId)\n      ? current.filter((id) => id !== screeningId)\n      : [...current, screeningId])\n  }\n\n  function deleteTimetableSelection() {\n    const count = timetableDeleteSelection.length\n    if (!count) return\n    const confirmed = window.confirm(`선택한 ${count}개 회차를 정말 삭제하시겠습니까?\\n삭제하면 해당 회차의 예매 상태도 함께 제거됩니다.`)\n    if (!confirmed) return\n\n    const targets = new Set(timetableDeleteSelection)\n    setSelected((current) => current.filter((id) => !targets.has(id)))\n    setTicketStatus((current) => {\n      const next = { ...current }\n      for (const id of targets) delete next[id]\n      return next\n    })\n    setTimetableDeleteSelection([])\n    setTimetableSelectionMode(false)\n    setToast(`${count}개 회차를 시간표에서 삭제했습니다.`)\n  }\n",
    'selection functions',
)

app = replace_once(
    app,
    "      {activeTab === 'films' && !settingsOpen && dataNote && <div className=\"notice\">{dataNote}{dataSource && <> <a href={dataSource} target=\"_blank\" rel=\"noreferrer\">공식 시간표 ↗</a></>}</div>}\n",
    "      {activeTab === 'films' && !settingsOpen && dataNote && <div className=\"notice film-data-notice\">{dataNote}{dataSource && <> <a href={dataSource} target=\"_blank\" rel=\"noreferrer\">공식 시간표 ↗</a></>}</div>}\n",
    'notice class',
)

app = replace_once(
    app,
    "          <div className=\"timetable-actions enhanced-timetable-actions\">\n            <div><p>선택한 회차의 종료시간과 브라우저 크기에 맞춰 시간표 범위를 자동 조정합니다.</p><span className=\"booking-summary\">예매 완료 {bookedCount} · 예정 {plannedCount}</span></div>\n            <div className=\"timetable-action-buttons\">\n              <button onClick={exportIcs}>캘린더</button>\n              <details className=\"backup-menu\"><summary>백업</summary><div><button onClick={exportBackup}>JSON 저장</button><button onClick={() => importInputRef.current?.click()}>가져오기</button></div></details>\n              <button onClick={clearSelected}>전체 비우기</button>\n            </div>\n",
    "          <div className=\"timetable-actions enhanced-timetable-actions\">\n            <div><span className=\"booking-summary\">{timetableSelectionMode ? `삭제할 회차 ${timetableDeleteSelection.length}개 선택` : `예매 완료 ${bookedCount} · 예정 ${plannedCount}`}</span></div>\n            <div className=\"timetable-action-buttons\">\n              <button onClick={exportIcs}>캘린더</button>\n              <details className=\"backup-menu\"><summary>백업</summary><div><button onClick={exportBackup}>JSON 저장</button><button onClick={() => importInputRef.current?.click()}>가져오기</button></div></details>\n              <button type=\"button\" className={`timetable-selection-button ${timetableSelectionMode ? 'active' : ''}`} onClick={toggleTimetableSelectionMode}>{timetableSelectionMode ? '선택 취소' : '선택'}</button>\n              {timetableSelectionMode && <button type=\"button\" className=\"timetable-delete-button\" onClick={deleteTimetableSelection} disabled={timetableDeleteSelection.length === 0}>삭제 {timetableDeleteSelection.length}</button>}\n              <button onClick={clearSelected}>전체 비우기</button>\n            </div>\n",
    'timetable actions',
)

app = replace_once(
    app,
    "          <div className={`timetable-scroll ${timetableMetrics.dense ? 'dense' : ''} ${timetableMetrics.ultraDense ? 'ultra-dense' : ''}`}>\n",
    "          <div className={`timetable-scroll ${timetableMetrics.dense ? 'dense' : ''} ${timetableMetrics.ultraDense ? 'ultra-dense' : ''} ${timetableSelectionMode ? 'timetable-selection-mode' : ''}`}>\n",
    'selection mode class',
)

app = replace_once(
    app,
    "                  const status = ticketStatus[screening.id] ?? 'planned'\n                  const statusPrefix = userSettings.showBookingStatusInTimetable ? (status === 'booked' ? '✓ ' : status === 'planned' ? '○ ' : '') : ''\n                  return <button\n                    className={`event-block status-${status} ${travel ? 'has-travel-warning' : ''}`}\n                    key={screening.id}\n                    style={{ top: `${top}px`, height: `${height}px` }}\n                    title={`${film.title} · ${screening.start}–${endLabel(film, screening)} · ${screening.venue}${travel ? ` · 이동 여유 ${travel.gap}분/권장 ${travel.buffer}분` : ''}\\n클릭하면 시간표에서 제거됩니다.`}\n                    onClick={() => toggle(screening)}\n                  >\n                    <strong>{statusPrefix}{film.title}</strong>\n",
    "                  const status = ticketStatus[screening.id] ?? 'planned'\n                  const statusPrefix = userSettings.showBookingStatusInTimetable ? (status === 'booked' ? '✓ ' : status === 'planned' ? '○ ' : '') : ''\n                  const isMarkedForDelete = timetableDeleteSelection.includes(screening.id)\n                  return <button\n                    type=\"button\"\n                    className={`event-block status-${status} ${travel ? 'has-travel-warning' : ''} ${timetableSelectionMode ? 'delete-selectable' : ''} ${isMarkedForDelete ? 'selected-for-delete' : ''}`}\n                    key={screening.id}\n                    style={{ top: `${top}px`, height: `${height}px` }}\n                    title={`${film.title} · ${screening.start}–${endLabel(film, screening)} · ${screening.venue}${travel ? ` · 이동 여유 ${travel.gap}분/권장 ${travel.buffer}분` : ''}${timetableSelectionMode ? `\\n${isMarkedForDelete ? '삭제 선택됨 · 클릭하여 선택 해제' : '삭제할 회차로 선택하려면 클릭'}` : ''}`}\n                    onClick={() => toggleTimetableDeleteSelection(screening.id)}\n                    tabIndex={timetableSelectionMode ? 0 : -1}\n                    aria-pressed={timetableSelectionMode ? isMarkedForDelete : undefined}\n                  >\n                    {timetableSelectionMode && <span className=\"event-select-indicator\" aria-hidden=\"true\">{isMarkedForDelete ? '✓' : ''}</span>}\n                    <strong>{statusPrefix}{film.title}</strong>\n",
    'event selection interaction',
)

app_path.write_text(app)

main_path = Path('src/main.tsx')
main = main_path.read_text()
main = replace_once(main, "import './timetable-readonly'\n", '', 'remove readonly runtime import')
main_path.write_text(main)

readonly_css = Path('src/timetable-readonly.css')
readonly_css.write_text(""".event-block{
  cursor:default !important;
  pointer-events:none;
}

.event-block:hover{
  filter:none !important;
  transform:none !important;
}

.timetable-selection-mode .event-block{
  cursor:pointer !important;
  pointer-events:auto;
}

.timetable-selection-mode .event-block:hover{
  filter:brightness(.97) !important;
  transform:none !important;
}

.timetable-selection-mode .event-block strong{
  padding-right:15px;
}

.timetable-selection-mode .event-block.has-travel-warning:after{
  display:none;
}

.event-block.selected-for-delete{
  outline:2px solid var(--accent);
  outline-offset:-2px;
  box-shadow:inset 0 0 0 2px rgba(198,41,23,.95),inset 0 0 0 999px rgba(255,255,255,.16) !important;
}

.event-block .event-select-indicator{
  position:absolute;
  top:3px;
  right:3px;
  z-index:4;
  display:flex;
  align-items:center;
  justify-content:center;
  width:12px;
  height:12px;
  margin:0;
  border:1px solid rgba(198,41,23,.58);
  border-radius:50%;
  background:rgba(255,255,255,.9);
  color:transparent;
  font-size:8px;
  font-weight:900;
  line-height:1;
  opacity:1;
  overflow:visible;
  text-overflow:clip;
}

.event-block.selected-for-delete .event-select-indicator{
  border-color:var(--accent);
  background:var(--accent);
  color:#fff;
}

.timetable-scroll.ultra-dense .event-block .event-select-indicator{
  top:2px;
  right:2px;
  width:10px;
  height:10px;
  font-size:7px;
}
""")

features_path = Path('src/features.css')
features = features_path.read_text()
features = replace_once(
    features,
    ".enhanced-timetable-actions>div:first-child{display:flex;align-items:center;min-width:max-content}\n.enhanced-timetable-actions>div:first-child p{display:none}\n.booking-summary{font-size:10px;color:#777;font-weight:700;white-space:nowrap}\n.timetable-action-buttons{display:flex;align-items:center;gap:5px;min-width:0;flex-wrap:nowrap}\n.timetable-action-buttons>*{flex:0 0 auto}\n.timetable-action-buttons>button,.backup-menu>summary{min-height:30px;padding:0 9px;font-size:10px;line-height:1;white-space:nowrap;display:inline-flex;align-items:center;justify-content:center}\n",
    ".enhanced-timetable-actions>div:first-child{display:flex;align-items:center;min-width:max-content}\n.booking-summary{font-size:10px;color:#777;font-weight:700;white-space:nowrap}\n.timetable-action-buttons{display:flex;align-items:center;gap:5px;min-width:0;flex-wrap:nowrap}\n.timetable-action-buttons>*{flex:0 0 auto}\n.timetable-action-buttons>button,.timetable-action-buttons>.backup-menu>summary{min-height:30px;padding:0 9px;font-family:inherit;font-size:10px!important;font-weight:700;line-height:1;white-space:nowrap;display:inline-flex;align-items:center;justify-content:center}\n",
    'desktop action typography',
)
features = replace_once(
    features,
    ".backup-menu>summary{list-style:none;border:1px solid #e2e2e2;border-radius:5px;background:#fff;color:#777;font-weight:700;cursor:pointer;user-select:none}\n",
    ".backup-menu>summary{list-style:none;border:1px solid #e2e2e2;border-radius:5px;background:#fff;color:#777;font-family:inherit;font-size:10px!important;font-weight:700;line-height:1;cursor:pointer;user-select:none}\n",
    'backup typography',
)
features = replace_once(
    features,
    ".transfer-note{margin:5px 2px 0;color:#9a9a9a;font-size:9px;line-height:1.3}\n",
    ".transfer-note{margin:5px 2px 0;color:#9a9a9a;font-size:9px;line-height:1.3}\n.timetable-selection-button.active{border-color:#e5a79f!important;background:var(--accent-soft)!important;color:var(--accent)!important}\n.timetable-delete-button{border-color:#e5b0aa!important;background:#fff8f7!important;color:#a92a1b!important}\n.timetable-delete-button:disabled{border-color:#e2e2e2!important;background:#f7f7f7!important;color:#b8b8b8!important;cursor:not-allowed!important}\n@media(min-width:701px){.film-data-notice{background:#fff;border:1px solid var(--line);border-radius:8px;padding:14px;margin-bottom:10px;line-height:1.5;box-shadow:none}}\n",
    'selection controls and notice',
)
features = replace_once(
    features,
    "  .enhanced-timetable-actions{align-items:center;gap:8px}\n  .booking-summary{font-size:9px}\n  .timetable-action-buttons{gap:4px;overflow:visible}\n  .timetable-action-buttons>button,.backup-menu>summary{min-height:30px;font-size:10px;padding:0 8px}\n",
    "  .enhanced-timetable-actions{align-items:stretch;gap:4px;flex-wrap:wrap}\n  .enhanced-timetable-actions>div:first-child{width:100%;min-width:0}\n  .booking-summary{font-size:9px}\n  .timetable-action-buttons{width:100%;gap:4px;overflow:visible;justify-content:flex-end;flex-wrap:wrap}\n  .timetable-action-buttons>button,.timetable-action-buttons>.backup-menu>summary{min-height:30px;font-size:10px!important;padding:0 7px}\n",
    'mobile actions layout',
)
features_path.write_text(features)
