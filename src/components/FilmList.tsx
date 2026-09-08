import { Virtuoso } from 'react-virtuoso'
import FilmCard from './FilmCard'
import type { Film, Screening, TicketStatus, TicketStatusMap, TravelWarning } from './film-types'

type FilmListProps = {
  films: Film[]
  favoriteSet: ReadonlySet<string>
  selectedSet: ReadonlySet<string>
  ticketStatus: TicketStatusMap
  visibleScreenings: (film: Film) => Screening[]
  hasConflict: (film: Film, screening: Screening) => boolean
  transitionWarning: (film: Film, screening: Screening) => TravelWarning | null
  formatDate: (date: string, compact?: boolean) => string
  endLabel: (film: Film, screening: Screening) => string
  onFavorite: (filmId: string) => void
  onDetail: (film: Film) => void
  onToggleScreening: (film: Film, screening: Screening) => void
  onStatusChange: (screeningId: string, status: TicketStatus) => void
}

export default function FilmList({
  films,
  favoriteSet,
  selectedSet,
  ticketStatus,
  visibleScreenings,
  hasConflict,
  transitionWarning,
  formatDate,
  endLabel,
  onFavorite,
  onDetail,
  onToggleScreening,
  onStatusChange,
}: FilmListProps) {
  return (
    <section className="film-list-shell" data-total-films={films.length}>
      <Virtuoso
        className="film-list virtual-film-list"
        data={films}
        useWindowScroll
        increaseViewportBy={{ top: 600, bottom: 1000 }}
        computeItemKey={(_, film) => film.id}
        itemContent={(_, film) => (
          <div className="film-list-item">
            <FilmCard
              film={film}
              screenings={visibleScreenings(film)}
              isFavorite={favoriteSet.has(film.id)}
              selectedSet={selectedSet}
              ticketStatus={ticketStatus}
              hasConflict={hasConflict}
              transitionWarning={transitionWarning}
              formatDate={formatDate}
              endLabel={endLabel}
              onFavorite={onFavorite}
              onDetail={onDetail}
              onToggleScreening={onToggleScreening}
              onStatusChange={onStatusChange}
            />
          </div>
        )}
      />
    </section>
  )
}
