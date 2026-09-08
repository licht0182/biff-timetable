from pathlib import Path

path = Path('src/App.tsx')
text = path.read_text()

def replace_once(old: str, new: str, label: str):
    global text
    if old not in text:
        raise SystemExit(f'missing patch target: {label}')
    text = text.replace(old, new, 1)

replace_once(
    "  function toggle(screening: Screening) {\n    const isSelected = selected.includes(screening.id)\n",
    "  function toggle(film: Film, screening: Screening) {\n    const isSelected = selected.includes(screening.id)\n",
    'toggle signature',
)

replace_once(
    "    setSelected((current) => current.includes(screening.id) ? current : [...current, screening.id])\n    setTicketStatus((statuses) => ({ ...statuses, [screening.id]: 'planned' }))\n",
    "    if (conflicts(film, screening)) {\n      window.alert('이미 선택한 회차와 시간이 겹칩니다.\\n겹치는 기존 회차를 먼저 제거한 뒤 추가해 주세요.')\n      return\n    }\n\n    setSelected((current) => current.includes(screening.id) ? current : [...current, screening.id])\n    setTicketStatus((statuses) => ({ ...statuses, [screening.id]: 'planned' }))\n",
    'conflict guard',
)

replace_once(
    "  function clearSelected() {\n    setSelected([])\n    setTicketStatus({})\n    setTimetableSelectionMode(false)\n    setTimetableDeleteSelection([])\n  }\n",
    "  function clearSelected() {\n    if (!selected.length) return\n    const confirmed = window.confirm(`선택한 ${selected.length}개 회차를 모두 삭제하시겠습니까?\\n예매 상태도 함께 제거됩니다.`)\n    if (!confirmed) return\n\n    setSelected([])\n    setTicketStatus({})\n    setTimetableSelectionMode(false)\n    setTimetableDeleteSelection([])\n    setToast('선택한 모든 회차를 시간표에서 삭제했습니다.')\n  }\n",
    'clear confirmation',
)

replace_once(
    "<button className={isSelected ? 'selected' : ''} onClick={() => toggle(screening)}>{isSelected ? '선택됨' : '+ 추가'}</button>",
    "<button className={isSelected ? 'selected' : ''} onClick={() => toggle(film, screening)}>{isSelected ? '선택됨' : '+ 추가'}</button>",
    'film list toggle call',
)

replace_once(
    "<button className={isSelected ? 'selected' : ''} onClick={() => toggle(screening)}>{isSelected ? '선택됨' : '+ 추가'}</button>",
    "<button className={isSelected ? 'selected' : ''} onClick={() => toggle(detailFilm, screening)}>{isSelected ? '선택됨' : '+ 추가'}</button>",
    'modal toggle call',
)

path.write_text(text)
