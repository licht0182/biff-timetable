import { useEffect, useRef, useState, type KeyboardEvent, type TouchEvent } from 'react'
import type { CuratorArticle } from '../curator-content'
import type { CuratorFeatureMedia } from '../curator-feature-media'
import CuratorArtwork from './CuratorArtwork'
import '../curator-gallery.css'

type GalleryStory = { article: CuratorArticle; media: CuratorFeatureMedia }

type Props = {
  stories: readonly GalleryStory[]
  onOpenArticle: (slug: string) => void
  onOpenFilm: (title: string) => void
}

export default function CuratorGallery({ stories, onOpenArticle, onOpenFilm }: Props) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ))
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => {
      setReducedMotion(preference.matches)
      if (preference.matches) setPlaying(false)
    }
    update()
    preference.addEventListener('change', update)
    return () => preference.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const stopWhenHidden = () => {
      if (document.hidden) setPlaying(false)
    }
    document.addEventListener('visibilitychange', stopWhenHidden)
    return () => document.removeEventListener('visibilitychange', stopWhenHidden)
  }, [])

  useEffect(() => {
    if (!playing || reducedMotion || stories.length < 2) return
    const timer = window.setInterval(() => setActiveIndex((current) => (current + 1) % stories.length), 6000)
    return () => window.clearInterval(timer)
  }, [playing, reducedMotion, stories.length])

  if (stories.length < 2) return null

  const current = stories[activeIndex % stories.length]
  const select = (index: number) => {
    setPlaying(false)
    setActiveIndex((index + stories.length) % stories.length)
  }
  const handleKeys = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      select(activeIndex + (event.key === 'ArrowRight' ? 1 : -1))
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      select(event.key === 'Home' ? 0 : stories.length - 1)
    }
  }
  const handleTouchStart = (event: TouchEvent<HTMLElement>) => {
    const touch = event.touches[0]
    touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null
  }
  const handleTouchEnd = (event: TouchEvent<HTMLElement>) => {
    const start = touchStart.current
    const end = event.changedTouches[0]
    touchStart.current = null
    if (!start || !end) return
    const dx = end.clientX - start.x
    const dy = end.clientY - start.y
    if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      select(activeIndex + (dx < 0 ? 1 : -1))
    }
  }

  return (
    <section
      className="curator-gallery"
      role="region"
      aria-roledescription="캐러셀"
      aria-labelledby="curator-gallery-title"
      onMouseEnter={() => setPlaying(false)}
      onFocusCapture={(event) => {
        if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setPlaying(false)
      }}
    >
      <div className="curator-gallery-heading">
        <div><p>DIRECTOR SPOTLIGHT</p><h2 id="curator-gallery-title">감독의 시선으로 고르는 영화</h2></div>
        <p>작품과 칼럼을 넘겨 보며 마음에 드는 영화를 찾아보세요.</p>
      </div>
      <div className="curator-gallery-stage" role="group" aria-label="추천 이야기 키보드 탐색" tabIndex={0} onKeyDown={handleKeys} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <article className="curator-gallery-card" aria-live={playing ? 'off' : 'polite'} aria-atomic="true">
          <figure className="curator-gallery-image">
            <CuratorArtwork media={current.media} />
            <figcaption>{current.media.filmTitle} · BIFF TIMETABLE</figcaption>
          </figure>
          <div className="curator-gallery-copy">
            <span className="curator-category">{current.article.category}</span>
            <h3>{current.article.title}</h3>
            <p>{current.article.deck}</p>
            <div className="curator-gallery-actions">
              <button type="button" className="curator-gallery-primary" onClick={() => onOpenArticle(current.article.slug)}>칼럼 읽기</button>
              <button type="button" className="curator-gallery-secondary" onClick={() => onOpenFilm(current.media.filmTitle)}>영화 찾기</button>
            </div>
          </div>
        </article>
      </div>
      <div className="curator-gallery-controls">
        <div className="curator-gallery-pager" role="group" aria-label="추천 칼럼 선택">
          {stories.map(({ article }, index) => (
            <button
              key={article.slug}
              type="button"
              className={index === activeIndex ? 'active' : ''}
              aria-label={`${index + 1}번 이야기: ${article.title}`}
              aria-current={index === activeIndex ? 'true' : undefined}
              onClick={() => select(index)}
            >{index + 1}</button>
          ))}
        </div>
        <span className="curator-gallery-position" role="status" aria-live={playing ? 'off' : 'polite'} aria-atomic="true">{activeIndex + 1} / {stories.length}</span>
        <div className="curator-gallery-transport" role="group" aria-label="갤러리 조작">
          <button type="button" onClick={() => select(activeIndex - 1)} aria-label="이전 추천">이전</button>
          <button type="button" onClick={() => select(activeIndex + 1)} aria-label="다음 추천">다음</button>
          <button type="button" onClick={() => setPlaying((currentPlaying) => !currentPlaying)} disabled={reducedMotion} aria-pressed={playing} aria-label={playing ? '자동 넘김 일시정지' : '자동 넘김 시작'}>{playing ? '일시정지' : '자동 넘김'}</button>
        </div>
      </div>
      {reducedMotion && <p className="curator-gallery-motion-note">움직임 줄이기 설정에서는 자동 넘김을 사용하지 않습니다.</p>}
    </section>
  )
}
