import { useEffect, useMemo, useState } from 'react'

type Screening = { id: string; date: string; start: string; end?: string; venue: string; gv?: boolean; code?: string }
type Film = { id: string; title: string; englishTitle?: string; director?: string; country?: string; section?: string; runtime?: number; url?: string; screenings: Screening[] }
type FilmData = { films: Film[]; note?: string; source?: string }

const STORAGE_KEY = 'biff-timetable:selected-screenings:v1'
const HOUR_HEIGHT = 72
const START_HOUR = 8
const END_HOUR = 27
const FALLBACK_RUNTIME = 120

function toMinutes(time: string) {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function endMinutes(film: Film, screening: Screening) {
  const start = toMinutes(screening.start)
  if (screening.end) {
    let end = toMinutes(screening.end)
    if (end <= start) end += 24 * 60
    return end
  }
  return start + (film.runtime ?? FALLBACK_RUNTIME)
}

function endLabel(film: Film, screening: Screening) {
  const end = endMinutes(film, screening)
  const normalized = end % (24 * 60)
  const h = Math.floor(normalized / 60)
  const m = normalized % 60
  const label = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  return screening.end ? label : `${label} 예상`
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short' }).format(new Date(`${date}T00:00:00`))
}

export default function App() {
  const [films, setFilms] = useState<Film[]>([])
  const [dataNote, setDataNote] = useState('')
  const [dataSource, setDataSource] = useState('')
  const [selected, setSelected] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') } catch { return [] }
  })
  const [query, setQuery] = useState('')
  const [section, setSection] = useState('전체')
  const [activeTab, setActiveTab] = useState<'films' | 'timetable'>('films')
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}screenings.json`)
      .then((res) => { if (!res.ok) throw new Error('상영 데이터를 불러오지 못했습니다.'); return res.json() })
      .then((data: FilmData) => {
        setFilms(data.films)
        setDataNote(data.note ?? '')
        setDataSource(data.source ?? '')
      })
      .catch((err: Error) => setLoadError(err.message))
  }, [])

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(selected)) }, [selected])

  const sections = useMemo(() => ['전체', ...Array.from(new Set(films.map((f) => f.section).filter(Boolean) as string[]))], [films])
  const filteredFilms = useMemo(() => {
    const q = query.trim().toLowerCase()
    return films.filter((film) => {
      const haystack = [film.title, film.englishTitle, film.director, film.country].filter(Boolean).join(' ').toLowerCase()
      return (section === '전체' || film.section === section) && (!q || haystack.includes(q))
    })
  }, [films, query, section])

  const selectedItems = useMemo(() => films.flatMap((film) => film.screenings.filter((s) => selected.includes(s.id)).map((screening) => ({ film, screening }))), [films, selected])
  const dates = useMemo(() => Array.from(new Set(selectedItems.map(({ screening }) => screening.date))).sort(), [selectedItems])

  function conflicts(film: Film, screening: Screening) {
    const start = toMinutes(screening.start)
    const end = endMinutes(film, screening)
    return selectedItems.some(({ film: otherFilm, screening: other }) => {
      if (other.id === screening.id || other.date !== screening.date) return false
      return start < endMinutes(otherFilm, other) && toMinutes(other.start) < end
    })
  }

  function toggle(screening: Screening) {
    setSelected((current) => current.includes(screening.id) ? current.filter((id) => id !== screening.id) : [...current, screening.id])
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div><p className="eyebrow">BUSAN INTERNATIONAL FILM FESTIVAL</p><h1>BIFF Timetable</h1><p className="subtitle">상영작을 고르고 나만의 영화제 시간표를 만드세요.</p></div>
        <div className="selection-count">선택 {selected.length}회</div>
      </header>

      <nav className="tabs" aria-label="주요 메뉴">
        <button className={activeTab === 'films' ? 'active' : ''} onClick={() => setActiveTab('films')}>영화 찾기</button>
        <button className={activeTab === 'timetable' ? 'active' : ''} onClick={() => setActiveTab('timetable')}>내 시간표</button>
      </nav>

      {dataNote && <div className="notice">{dataNote}{dataSource && <> <a href={dataSource} target="_blank" rel="noreferrer">공식 시간표 ↗</a></>}</div>}
      {loadError && <div className="notice error">{loadError}</div>}

      {activeTab === 'films' ? <main>
        <section className="controls">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="제목, 감독, 국가 검색" aria-label="영화 검색" />
          <div className="chips">{sections.map((item) => <button key={item} className={section === item ? 'active' : ''} onClick={() => setSection(item)}>{item}</button>)}</div>
        </section>

        <section className="film-list">
          {filteredFilms.map((film) => <article className="film-card" key={film.id}>
            <div className="film-heading">
              <div><span className="section-label">{film.section ?? '섹션 미정'}</span><h2>{film.title}</h2>{film.englishTitle && <p className="english-title">{film.englishTitle}</p>}<p className="meta">{[film.director, film.country, film.runtime ? `${film.runtime}분` : undefined].filter(Boolean).join(' · ')}</p></div>
              {film.url && <a className="detail-link" href={film.url} target="_blank" rel="noreferrer">작품정보 ↗</a>}
            </div>
            <div className="screenings">{film.screenings.map((screening) => {
              const isSelected = selected.includes(screening.id)
              const hasConflict = !isSelected && conflicts(film, screening)
              return <div className={`screening-row ${hasConflict ? 'conflict' : ''}`} key={screening.id}>
                <div><strong>{screening.code ? `[${screening.code}] ` : ''}{formatDate(screening.date)} {screening.start}</strong><span>{screening.venue} · {screening.start}–{endLabel(film, screening)}{screening.gv ? ' · GV' : ''}</span>{hasConflict && <small>선택한 회차와 시간이 겹칩니다.</small>}</div>
                <button className={isSelected ? 'selected' : ''} onClick={() => toggle(screening)}>{isSelected ? '선택됨' : '+ 추가'}</button>
              </div>
            })}</div>
          </article>)}
          {!filteredFilms.length && !loadError && <div className="empty">검색 결과가 없습니다.</div>}
        </section>
      </main> : <main className="timetable-page">
        {selectedItems.length === 0 ? <div className="empty timetable-empty"><strong>아직 선택한 상영 회차가 없습니다.</strong><span>영화 찾기에서 원하는 회차를 추가해 주세요.</span><button onClick={() => setActiveTab('films')}>영화 찾기</button></div> : <>
          <div className="timetable-actions"><p>선택한 회차는 이 브라우저에 자동 저장됩니다.</p><button onClick={() => setSelected([])}>전체 비우기</button></div>
          <div className="timetable-scroll"><div className="timetable" style={{ minWidth: `${80 + dates.length * 190}px`, gridTemplateColumns: `80px repeat(${dates.length}, minmax(190px, 1fr))` }}>
            <div className="corner" />{dates.map((date) => <div className="date-head" key={date}>{formatDate(date)}</div>)}
            <div className="time-axis">{Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i).map((hour) => <div key={hour} style={{ top: `${(hour - START_HOUR) * HOUR_HEIGHT}px` }}>{hour < 24 ? String(hour).padStart(2, '0') : String(hour - 24).padStart(2, '0')}:00</div>)}</div>
            {dates.map((date) => <div className="day-column" key={date}>{Array.from({ length: END_HOUR - START_HOUR }, (_, i) => <div className="hour-line" key={i} style={{ top: `${i * HOUR_HEIGHT}px` }} />)}
              {selectedItems.filter(({ screening }) => screening.date === date).map(({ film, screening }) => {
                const start = toMinutes(screening.start), end = endMinutes(film, screening)
                const top = ((start - START_HOUR * 60) / 60) * HOUR_HEIGHT
                const height = Math.max(((end - start) / 60) * HOUR_HEIGHT, 48)
                return <button className="event-block" key={screening.id} style={{ top: `${top}px`, height: `${height}px` }} title="클릭하면 시간표에서 제거됩니다." onClick={() => toggle(screening)}><strong>{film.title}</strong><span>{screening.start}–{endLabel(film, screening)}</span><span>{screening.venue}</span></button>
              })}
            </div>)}
          </div></div>
        </>}
      </main>}
    </div>
  )
}
