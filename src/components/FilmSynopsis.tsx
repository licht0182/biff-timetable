import { useState } from 'react'

type Props = { text: string }

export default function FilmSynopsis({ text }: Props) {
  const [expanded, setExpanded] = useState(false)
  const canCollapse = text.length > 220

  return (
    <section className="film-synopsis" aria-labelledby="film-synopsis-title">
      <h3 id="film-synopsis-title">작품 소개</h3>
      <p id="film-synopsis-text" className={`synopsis ${canCollapse && !expanded ? 'is-collapsed' : ''}`}>{text}</p>
      {canCollapse && <button
        type="button"
        className="film-synopsis-toggle"
        aria-controls="film-synopsis-text"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >{expanded ? '줄거리 접기' : '줄거리 더 읽기'}</button>}
    </section>
  )
}
