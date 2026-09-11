import { useEffect, useMemo, useState } from 'react'
import { CURATOR_ARTICLES, type CuratorArticle } from '../curator-content'

type Props = {
  onOpenFilms: () => void
}

function scrollPageTop(behavior: ScrollBehavior = 'auto') {
  window.scrollTo({ top: 0, left: 0, behavior })
}

function ArticleDetail({ article, onBack, onOpenFilms }: { article: CuratorArticle; onBack: () => void; onOpenFilms: () => void }) {
  return (
    <main className="curator-page curator-detail-page">
      <div className="curator-reading-shell">
        <button type="button" className="curator-back" onClick={onBack}>← 목록으로</button>
        <article className="curator-article">
          <header className="curator-article-header">
            <span className="curator-category">{article.category}</span>
            <h2>{article.title}</h2>
            <p className="curator-deck">{article.deck}</p>
            <div className="curator-meta">
              <span>AI 도슨트 편집부</span>
              <span>예상 읽는 시간 : 약 {article.readingMinutes}분</span>
            </div>
            <div className="curator-tags">{article.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>
          </header>

          <div className="curator-body">
            <p className="curator-lead">{article.lead}</p>
            {article.highlight && <blockquote>{article.highlight}</blockquote>}
            {article.sections.map((section) => (
              <section key={section.heading}>
                <h3>{section.heading}</h3>
                {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                {section.stats && (
                  <div className="curator-stats" aria-label={`${section.heading} 통계`}>
                    {section.stats.map((stat) => (
                      <div className="curator-stat" key={`${stat.label}-${stat.value}`}>
                        <strong>{stat.value}</strong>
                        <span>{stat.label}</span>
                      </div>
                    ))}
                  </div>
                )}
                {section.bullets && <ul>{section.bullets.map((item) => <li key={item}>{item}</li>)}</ul>}
                {section.films && (
                  <div className="curator-film-guides">
                    {section.films.map((film) => (
                      <article className="curator-film-guide" key={`${film.title}-${film.englishTitle ?? ''}`}>
                        <div className="curator-film-guide-heading">
                          <div>
                            <h4>{film.title}</h4>
                            {film.englishTitle && <span>{film.englishTitle}</span>}
                          </div>
                          {film.meta && <p>{film.meta}</p>}
                        </div>
                        <p>{film.description}</p>
                        {film.tags && (
                          <div className="curator-film-guide-tags">
                            {film.tags.map((tag) => <span key={tag}>#{tag}</span>)}
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>

          {!article.analysisOnly && (
            <footer className="curator-article-footer">
              <div>
                <strong>이제 실제 회차에 적용해 보세요.</strong>
                <p>후보작을 영화 찾기에서 확인하고, 겹침과 이동시간까지 포함해 내 시간표에서 검증할 수 있습니다.</p>
              </div>
              <button type="button" onClick={onOpenFilms}>영화 찾기로 이동</button>
            </footer>
          )}
        </article>
        <p className="curator-disclaimer">AI 도슨트의 글은 작품 선택을 돕기 위한 편집 분석이며 BIFF 공식 안내가 아닙니다. 작품·상영 정보는 BIFF 공식 정보를 우선 확인해 주세요.</p>
        <div className="curator-detail-actions">
          <button type="button" className="curator-top-button" onClick={() => scrollPageTop('smooth')}>↑ 맨 위로</button>
        </div>
      </div>
    </main>
  )
}

const CATEGORY_ORDER = [
  '2026 섹션 가이드',
  '10/9–12 특별 분석',
  '선택 전략',
  '관람 경험',
  '시간표 설계',
]

export default function CuratorPage({ onOpenFilms }: Props) {
  const [activeSlug, setActiveSlug] = useState<string | null>(null)
  const activeArticle = useMemo(
    () => CURATOR_ARTICLES.find((article) => article.slug === activeSlug) ?? null,
    [activeSlug],
  )
  const articleGroups = useMemo(() => {
    const groups = new Map<string, CuratorArticle[]>()
    for (const article of CURATOR_ARTICLES) {
      const items = groups.get(article.category) ?? []
      items.push(article)
      groups.set(article.category, items)
    }

    return Array.from(groups.entries())
      .map(([category, articles]) => ({ category, articles }))
      .sort((a, b) => {
        const aIndex = CATEGORY_ORDER.indexOf(a.category)
        const bIndex = CATEGORY_ORDER.indexOf(b.category)
        const aOrder = aIndex === -1 ? CATEGORY_ORDER.length : aIndex
        const bOrder = bIndex === -1 ? CATEGORY_ORDER.length : bIndex
        return aOrder - bOrder || a.category.localeCompare(b.category, 'ko')
      })
  }, [])

  useEffect(() => {
    if (activeSlug) scrollPageTop()
  }, [activeSlug])

  if (activeArticle) {
    return <ArticleDetail article={activeArticle} onBack={() => setActiveSlug(null)} onOpenFilms={onOpenFilms} />
  }

  return (
    <main className="curator-page">
      <section className="curator-hero">
        <div>
          <p className="curator-kicker">AI DOCENT · BIFF EDITORIAL</p>
          <h2>영화 고르기 전에 읽는 BIFF 분석</h2>
          <p>공식 작품 데이터와 프로그램 노트를 바탕으로 각 섹션의 흐름, 감독의 시선, 주제와 형식을 비교해 상영작을 깊이 있게 읽습니다.</p>
        </div>
        <span className="curator-edition">2026</span>
      </section>

      <section className="curator-latest" aria-labelledby="curator-latest-title">
        <div className="curator-section-heading">
          <div><p>DOCENT COLUMNS</p><h3 id="curator-latest-title">AI 도슨트 칼럼</h3></div>
          <span>{CURATOR_ARTICLES.length}개의 칼럼 · {articleGroups.length}개 분류</span>
        </div>

        <div className="curator-groups">
          {articleGroups.map((group, index) => {
            const groupTitleId = `curator-group-${index}`
            return (
              <section className="curator-group" key={group.category} aria-labelledby={groupTitleId}>
                <div className="curator-group-heading">
                  <h4 id={groupTitleId}>{group.category}</h4>
                  <span>{group.articles.length}개</span>
                </div>
                <div className="curator-grid">
                  {group.articles.map((article) => (
                    <button type="button" className="curator-card" key={article.slug} onClick={() => setActiveSlug(article.slug)}>
                      <h3>{article.title}</h3>
                      <p>{article.deck}</p>
                      <div className="curator-card-tags">{article.tags.slice(0, 2).map((tag) => <span key={tag}>#{tag}</span>)}</div>
                      <div className="curator-card-meta"><span>예상 읽는 시간 : 약 {article.readingMinutes}분</span></div>
                    </button>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      </section>

      <section className="curator-method">
        <div>
          <p className="curator-kicker">HOW IT WORKS</p>
          <h3>AI 도슨트는 이렇게 글을 만듭니다</h3>
        </div>
        <ol>
          <li><strong>공식 정보 확인</strong><span>작품·섹션·감독·프로그램 노트처럼 변할 수 있는 사실은 공식 정보를 기준으로 정리합니다.</span></li>
          <li><strong>섹션 내부 비교</strong><span>국가, 주제, 러닝타임, 형식과 프로그램 노트를 함께 보며 작품들이 만드는 공통점과 차이를 읽습니다.</span></li>
          <li><strong>판단 근거 분리</strong><span>확인된 사실과 도슨트의 해석·추천을 구분해 과도한 확신을 피합니다.</span></li>
        </ol>
      </section>

      <p className="curator-disclaimer">2026 공식 작품 데이터베이스와 프로그램 노트를 바탕으로 섹션별 분석 칼럼을 순차적으로 추가합니다. 섹션 가이드는 상영 일정이 아니라 작품 자체의 주제와 형식, 감독의 시선을 분석하는 데 초점을 둡니다.</p>
    </main>
  )
}
