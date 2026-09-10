import { useMemo, useState } from 'react'
import { CURATOR_ARTICLES, type CuratorArticle } from '../curator-content'

type Props = {
  onOpenFilms: () => void
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
              <span>AI 큐레이터 편집부</span>
              <span>약 {article.readingMinutes}분</span>
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
                {section.bullets && <ul>{section.bullets.map((item) => <li key={item}>{item}</li>)}</ul>}
              </section>
            ))}
          </div>

          <footer className="curator-article-footer">
            <div>
              <strong>이제 실제 회차에 적용해 보세요.</strong>
              <p>후보작을 영화 찾기에서 확인하고, 겹침과 이동시간까지 포함해 내 시간표에서 검증할 수 있습니다.</p>
            </div>
            <button type="button" onClick={onOpenFilms}>영화 찾기로 이동</button>
          </footer>
        </article>
        <p className="curator-disclaimer">AI 큐레이터의 글은 작품 선택을 돕기 위한 편집 분석이며 BIFF 공식 안내가 아닙니다. 작품·상영 정보는 BIFF 공식 정보를 우선 확인해 주세요.</p>
      </div>
    </main>
  )
}

export default function CuratorPage({ onOpenFilms }: Props) {
  const [activeSlug, setActiveSlug] = useState<string | null>(null)
  const activeArticle = useMemo(
    () => CURATOR_ARTICLES.find((article) => article.slug === activeSlug) ?? null,
    [activeSlug],
  )

  if (activeArticle) {
    return <ArticleDetail article={activeArticle} onBack={() => setActiveSlug(null)} onOpenFilms={onOpenFilms} />
  }

  const [featured, ...articles] = CURATOR_ARTICLES

  return (
    <main className="curator-page">
      <section className="curator-hero">
        <div>
          <p className="curator-kicker">AI CURATOR · BIFF EDITORIAL</p>
          <h2>영화 고르기 전에 읽는 BIFF 분석</h2>
          <p>작품의 유명세만 나열하지 않고, 회차 희소성·GV·동선·관람 경험까지 함께 보면서 영화제에서 무엇을 우선할지 정리합니다.</p>
        </div>
        <span className="curator-edition">2026</span>
      </section>

      <section className="curator-featured" aria-labelledby="curator-featured-title">
        <div className="curator-section-heading">
          <div><p>FEATURED</p><h3 id="curator-featured-title">먼저 읽을 글</h3></div>
          <span>{CURATOR_ARTICLES.length}개의 칼럼</span>
        </div>
        <button type="button" className="curator-featured-card" onClick={() => setActiveSlug(featured.slug)}>
          <span className="curator-category">{featured.category}</span>
          <h3>{featured.title}</h3>
          <p>{featured.deck}</p>
          <div className="curator-card-meta"><span>약 {featured.readingMinutes}분</span></div>
          <strong>칼럼 읽기 →</strong>
        </button>
      </section>

      <section className="curator-latest" aria-labelledby="curator-latest-title">
        <div className="curator-section-heading">
          <div><p>LATEST COLUMNS</p><h3 id="curator-latest-title">큐레이터 칼럼</h3></div>
        </div>
        <div className="curator-grid">
          {articles.map((article) => (
            <button type="button" className="curator-card" key={article.slug} onClick={() => setActiveSlug(article.slug)}>
              <span className="curator-category">{article.category}</span>
              <h3>{article.title}</h3>
              <p>{article.deck}</p>
              <div className="curator-card-tags">{article.tags.slice(0, 2).map((tag) => <span key={tag}>#{tag}</span>)}</div>
              <div className="curator-card-meta"><span>약 {article.readingMinutes}분</span></div>
            </button>
          ))}
        </div>
      </section>

      <section className="curator-method">
        <div>
          <p className="curator-kicker">HOW IT WORKS</p>
          <h3>AI 큐레이터는 이렇게 글을 만듭니다</h3>
        </div>
        <ol>
          <li><strong>공식 정보 확인</strong><span>작품·섹션·상영 회차처럼 변할 수 있는 사실은 공식 정보를 기준으로 정리합니다.</span></li>
          <li><strong>선택 가치 분석</strong><span>작품성뿐 아니라 희소성, GV, 회차 대체 가능성, 동선을 함께 봅니다.</span></li>
          <li><strong>판단 근거 분리</strong><span>확인된 사실과 큐레이터의 해석·추천을 구분해 과도한 확신을 피합니다.</span></li>
        </ol>
      </section>

      <p className="curator-disclaimer">현재 첫 공개 칼럼은 영화제 선택법을 다루는 편집 가이드입니다. 2026 공식 작품·상영 정보가 확정되는 대로 작품별·섹션별 분석 칼럼을 같은 형식으로 추가할 수 있습니다.</p>
    </main>
  )
}
