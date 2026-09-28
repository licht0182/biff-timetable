import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import '../global-search.css'

type GlobalSearchOverlayProps = {
  initialQuery: string
  onClose: () => void
  onRestoreFocus: () => void
  onSearch: (query: string) => void
  onOpenFilmSearch: () => void
  onOpenFilters: () => void
  onOpenTimetable: () => void
  onOpenCurator: () => void
  onOpenSettings: () => void
}

export default function GlobalSearchOverlay({
  initialQuery,
  onClose,
  onRestoreFocus,
  onSearch,
  onOpenFilmSearch,
  onOpenFilters,
  onOpenTimetable,
  onOpenCurator,
  onOpenSettings,
}: GlobalSearchOverlayProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const quickLinksRef = useRef<HTMLDivElement>(null)
  const restoreFocusRef = useRef(true)
  const navigationFocusRef = useRef<'search' | 'filters' | 'navigation' | null>(null)
  const [draft, setDraft] = useState(initialQuery)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    dialog.showModal()
    inputRef.current?.focus()
    return () => {
      dialog.close()
      if (restoreFocusRef.current) {
        onRestoreFocus()
      } else {
        window.requestAnimationFrame(() => {
          if (navigationFocusRef.current === 'search') {
            document.querySelector<HTMLInputElement>('.film-search-autocomplete input')?.focus()
          } else if (navigationFocusRef.current === 'filters') {
            const mobile = window.matchMedia('(max-width: 700px)').matches
            const target = mobile
              ? document.querySelector<HTMLElement>('#film-advanced-filters.mobile-open')
              : document.querySelector<HTMLElement>('#film-advanced-filters select')
            target?.focus()
          } else if (navigationFocusRef.current === 'navigation') {
            const buttons = document.querySelectorAll<HTMLButtonElement>('.tabs button[aria-current="page"], .liquid-tab-bar button[aria-current="page"]')
            Array.from(buttons).find((button) => button.getClientRects().length > 0)?.focus()
          }
        })
      }
    }
  }, [])

  const navigate = (action: () => void, focusTarget: 'search' | 'filters' | 'navigation') => {
    restoreFocusRef.current = false
    navigationFocusRef.current = focusTarget
    action()
  }

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = draft.trim()
    if (value) navigate(() => onSearch(value), 'search')
    else navigate(onOpenFilmSearch, 'search')
  }

  const moveQuickLinkFocus = (event: KeyboardEvent<HTMLElement>, direction: 1 | -1) => {
    const links = Array.from(quickLinksRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])
    if (!links.length) return
    const index = links.indexOf(document.activeElement as HTMLButtonElement)
    const next = index < 0 ? (direction === 1 ? 0 : links.length - 1) : (index + direction + links.length) % links.length
    event.preventDefault()
    links[next].focus()
  }

  return createPortal(
    <dialog
      ref={dialogRef}
      className="global-search-dialog"
      aria-labelledby="global-search-title"
      aria-describedby="global-search-description"
      onCancel={(event) => { event.preventDefault(); onClose() }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <div className="global-search-panel">
        <div className="global-search-heading">
          <div><p>빠른 이동</p><h2 id="global-search-title">전체 검색</h2></div>
          <button type="button" className="global-search-close" aria-label="전체 검색 닫기" onClick={onClose}>닫기</button>
        </div>
        <p id="global-search-description" className="global-search-description">영화를 검색하거나 원하는 메뉴로 바로 이동하세요.</p>
        <form className="global-search-form" onSubmit={submitSearch}>
          <label htmlFor="global-search-input">영화 검색</label>
          <div className="global-search-input-row">
            <input ref={inputRef} id="global-search-input" type="search" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'ArrowDown') moveQuickLinkFocus(event, 1) }} placeholder="제목, 감독, 국가, 장르" autoComplete="off" />
            <button type="submit">검색</button>
          </div>
        </form>
        <div ref={quickLinksRef} className="global-search-quick-links" onKeyDown={(event) => {
          if (event.key === 'ArrowDown') moveQuickLinkFocus(event, 1)
          if (event.key === 'ArrowUp') moveQuickLinkFocus(event, -1)
        }}>
          <p>바로 가기</p>
            <button type="button" onClick={() => navigate(onOpenFilmSearch, 'search')}>영화 찾기 <span>영화 검색 입력으로 이동</span></button>
            <button type="button" onClick={() => navigate(onOpenFilters, 'filters')}>상세 필터 <span>날짜·상영관·시간대</span></button>
            <button type="button" onClick={() => navigate(onOpenTimetable, 'navigation')}>내 시간표 <span>선택한 일정 보기</span></button>
            <button type="button" onClick={() => navigate(onOpenCurator, 'navigation')}>AI 도슨트 <span>영화 소개와 추천</span></button>
            <button type="button" onClick={() => navigate(onOpenSettings, 'navigation')}>설정 <span>이동 시간과 화면 표시</span></button>
        </div>
      </div>
    </dialog>,
    document.body,
  )
}
