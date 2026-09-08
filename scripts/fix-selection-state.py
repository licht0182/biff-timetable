from pathlib import Path

path = Path('src/App.tsx')
text = path.read_text()

old = """  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(selected)) }, [selected])
  useEffect(() => { localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites)) }, [favorites])
  useEffect(() => { localStorage.setItem(TICKET_STATUS_KEY, JSON.stringify(ticketStatus)) }, [ticketStatus])
"""
new = """  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(selected)) }, [selected])
  useEffect(() => { localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites)) }, [favorites])
  useEffect(() => { localStorage.setItem(TICKET_STATUS_KEY, JSON.stringify(ticketStatus)) }, [ticketStatus])

  useEffect(() => {
    setTicketStatus((current) => {
      let changed = false
      const next = { ...current }
      for (const id of selected) {
        if (next[id] !== 'planned' && next[id] !== 'booked') {
          next[id] = 'planned'
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [selected])
"""
assert old in text, 'storage effect block not found'
text = text.replace(old, new, 1)

old = """  function toggle(screening: Screening) {
    setSelected((current) => {
      if (current.includes(screening.id)) {
        setTicketStatus((statuses) => {
          const next = { ...statuses }
          delete next[screening.id]
          return next
        })
        return current.filter((id) => id !== screening.id)
      }
      return [...current, screening.id]
    })
  }
"""
new = """  function toggle(screening: Screening) {
    const isSelected = selected.includes(screening.id)

    if (isSelected) {
      setSelected((current) => current.filter((id) => id !== screening.id))
      setTicketStatus((statuses) => {
        const next = { ...statuses }
        delete next[screening.id]
        return next
      })
      return
    }

    setSelected((current) => current.includes(screening.id) ? current : [...current, screening.id])
    setTicketStatus((statuses) => ({ ...statuses, [screening.id]: 'planned' }))
  }
"""
assert old in text, 'toggle block not found'
text = text.replace(old, new, 1)

old = """      if (Array.isArray(parsed)) {
        setSelected(parsed.filter((id): id is string => typeof id === 'string' && validScreeningIds.has(id)))
        setToast('기존 형식의 선택 회차를 가져왔습니다.')
        return
      }
"""
new = """      if (Array.isArray(parsed)) {
        const nextSelected = parsed.filter((id): id is string => typeof id === 'string' && validScreeningIds.has(id))
        setSelected(nextSelected)
        setTicketStatus(Object.fromEntries(nextSelected.map((id) => [id, 'planned'])) as TicketStatusMap)
        setToast('기존 형식의 선택 회차를 가져왔습니다.')
        return
      }
"""
assert old in text, 'legacy import block not found'
text = text.replace(old, new, 1)

old = """      if (parsed.ticketStatus && typeof parsed.ticketStatus === 'object') {
        for (const [id, status] of Object.entries(parsed.ticketStatus)) {
          if (validScreeningIds.has(id) && (status === 'planned' || status === 'booked')) nextStatuses[id] = status
        }
      }

      setSelected(nextSelected)
"""
new = """      if (parsed.ticketStatus && typeof parsed.ticketStatus === 'object') {
        for (const [id, status] of Object.entries(parsed.ticketStatus)) {
          if (validScreeningIds.has(id) && (status === 'planned' || status === 'booked')) nextStatuses[id] = status
        }
      }
      for (const id of nextSelected) {
        if (!nextStatuses[id]) nextStatuses[id] = 'planned'
      }

      setSelected(nextSelected)
"""
assert old in text, 'backup status block not found'
text = text.replace(old, new, 1)

text = text.replace("const plannedCount = selected.filter((id) => ticketStatus[id] === 'planned').length", "const plannedCount = selected.filter((id) => ticketStatus[id] !== 'booked').length", 1)
text = text.replace('<div className="selection-count">선택 {selected.length}회</div>', '<div className="selection-count">총 {selected.length}개 선택</div>', 1)
text = text.replace("const status = ticketStatus[screening.id] ?? 'none'", "const status = ticketStatus[screening.id] ?? 'planned'")
text = text.replace('<option value="none">상태 없음</option><option value="planned">예매 예정</option><option value="booked">예매 완료</option>', '<option value="planned">예매 예정</option><option value="booked">예매 완료</option>', 1)

path.write_text(text)

main = Path('src/main.tsx')
main_text = main.read_text()
main_text = main_text.replace("import './ui-consistency'\n", '')
main_text = main_text.replace("import './ticket-defaults'\n", '')
main.write_text(main_text)
