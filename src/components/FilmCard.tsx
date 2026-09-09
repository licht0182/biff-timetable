import { memo } from 'react'
import ScreeningRow from './ScreeningRow'
import type { Film, Screening, TicketStatus, TicketStatusMap, TravelWarning } from './film-types'

type FilmCardProps = {
  film: Film
  screenings: Screening[]
  isFavorite: boolean
  selectedSet: ReadonlySet<string>
  ticketStatus: TicketStatusMap
  hasConflict: (film: Film, screening: Screening) => boolean
  transitionWarning: (film: Film, screening: Screening) => TravelWarning | null
  formatDate: (date: string, compact?: boolean) => string
  endLabel: (film: Film, screening: Screening) => string
  onFavorite: (filmId: string) => void
  onDetail: (film: Film) => void
  onToggleScreening: (film: Film, screening: Screening) => void
  onStatusChange: (screeningId: string, status: TicketStatus) => void
}

function FilmCard({
  film,
  screenings,
  isFavorite,
  selectedSet,
  ticketStatus,
  hasConflict,
  transitionWarning,
  formatDate,
  endLabel,
  onFavorite,
  onDetail,
  onToggleScreening,
  onStatusChange,
}: FilmCardProps) {
  return (
    <article className="film-card">
      <div className="film-heading">
        <div>
          <span className="section-label">{film.section ?? '섹션 미정'}</span>
          <h2>{film.title}</h2>
          {film.englishTitle && <p className="english-title">{film.englishTitle}</p>}
          {film.genre && <p className="genre-meta">{film.genre}</p>}
          <p className="meta">{[film.director, film.country, film.runtime ? `${film.runtime}분` : undefined].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="film-actions">
          <button
            className={`favorite-button ${isFavorite ? 'active' : ''}`}
            onClick={() => onFavorite(film.id)}
            aria-label={`${film.title} 관심작 ${isFavorite ? '해제' : '추가'}`}
          >
            {isFavorite ? '★' : '☆'}
          </button>
          <button className="detail-button" onClick={() => onDetail(film)}>상세</button>
          {film.url && <a className="detail-link" href={film.url} target="_blank" rel="noreferrer">공식정보 ↗</a>}
        </div>
      </div>
      <div className="screenings">
        {screenings.map((screening) => {
          const isSelected = selectedSet.has(screening.id)
          const conflict = !isSelected && hasConflict(film, screening)
          const travel = !conflict ? transitionWarning(film, screening) : null
          const status = ticketStatus[screening.id] ?? 'planned'
          return (
            <ScreeningRow
              key={screening.id}
              film={film}
              screening={screening}
              isSelected={isSelected}
              hasConflict={conflict}
              travel={travel}
              status={status}
              formatDate={formatDate}
              endLabel={endLabel}
              onToggle={onToggleScreening}
              onStatusChange={onStatusChange}
            />
          )
        })}
      </div>
    </article>
  )
}

export default memo(FilmCard)
