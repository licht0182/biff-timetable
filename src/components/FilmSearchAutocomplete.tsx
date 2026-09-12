import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { Film, Screening } from './film-types'

type Suggestion = {
  film: Film
  earliest: Screening
  matchLabel: string
}

type Props = {
  query: string
  suggestions: Suggestion[]
  onQueryChange: (value: string) => void
  onSelect: (film: Film) => void
  formatDate: (date: string, compact?: boolean) => string
}

const LISTBOX_ID = 'film-search-suggestions'

export default function FilmSearchAutocomplete({
  query,
  suggestions,
  onQueryChange,
  onSelect,
  formatDate,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const hasQuery = query.trim().length > 0
  const showPanel = open && hasQuery

  useEffect(() => {
    setActiveIndex(-1)
    if (!hasQuery) setOpen(false)
  }, [query, hasQuery])

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
        setActiveIndex(-1)
      }
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [])

  const choose = (film: Film) => {
    onQueryChange(film.title)
    onSelect(film)
    setOpen(false)
    setActiveIndex(-1)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false)
      setActiveIndex(-1)
      return
    }

    if (event.key === 'Tab') {
      setOpen(false)
      setActiveIndex(-1)
      return
    }

    if (event.key === 'ArrowDown') {
      if (!hasQuery || suggestions.length === 0) return
      event.preventDefault()
      setOpen(true)
      setActiveIndex((current) => current < suggestions.length - 1 ? current + 1 : 0)
      return
    }

    if (event.key === 'ArrowUp') {
      if (!hasQuery || suggestions.length === 0) return
      event.preventDefault()
      setOpen(true)
      setActiveIndex((current) => current > 0 ? current - 1 : suggestions.length - 1)
      return
    }

    if (event.key === 'Enter' && showPanel && activeIndex >= 0) {
      const suggestion = suggestions[activeIndex]
      if (!suggestion) return
      event.preventDefault()
      choose(suggestion.film)
    }
  }

  return (
    <div className="film-search-autocomplete" ref={rootRef}>
      <input
        value={query}
        onChange={(event) => {
          onQueryChange(event.target.value)
          setOpen(true)
        }}
        onFocus={() => {
          if (hasQuery) setOpen(true)
        }}
        onKeyDown={handleKeyDown}
        placeholder="제목, 감독, 국가, 장르 검색"
        aria-label="영화 검색"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showPanel}
        aria-controls={LISTBOX_ID}
        aria-activedescendant={activeIndex >= 0 ? `film-search-option-${activeIndex}` : undefined}
      />

      {showPanel && (
        <div className="film-search-suggestions" id={LISTBOX_ID} role="listbox" aria-label="영화 검색 미리보기">
          {suggestions.length > 0 ? suggestions.map((suggestion, index) => {
            const { film, earliest, matchLabel } = suggestion
            const meta = [film.director, film.section].filter(Boolean).join(' · ')
            return (
              <button
                type="button"
                id={`film-search-option-${index}`}
                className={`film-search-suggestion ${activeIndex === index ? 'active' : ''}`}
                role="option"
                aria-selected={activeIndex === index}
                key={film.id}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(film)}
              >
                <span className="film-search-suggestion-main">
                  <strong>{film.title}</strong>
                  {film.englishTitle && <em>{film.englishTitle}</em>}
                </span>
                <span className="film-search-suggestion-match">{matchLabel}</span>
                {meta && <span className="film-search-suggestion-meta">{meta}</span>}
                <span className="film-search-suggestion-screening">
                  {formatDate(earliest.date, true)} {earliest.start} · {earliest.venue}{earliest.gv ? ' · GV' : ''}
                </span>
              </button>
            )
          }) : (
            <div className="film-search-no-suggestions" role="status">
              현재 필터 조건에서 일치하는 영화가 없습니다.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
