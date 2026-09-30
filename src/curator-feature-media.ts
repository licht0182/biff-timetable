export type CuratorFeatureMedia = {
  slug: string
  tone: 'wine' | 'forest' | 'ocean' | 'indigo'
  filmTitle: string
}

// Original typography and geometric artwork only. No official film photographs.
export const CURATOR_FEATURE_MEDIA: readonly CuratorFeatureMedia[] = [
  { slug: 'director-guide-2026-koreeda-hirokazu', tone: 'wine', filmTitle: '룩백' },
  { slug: 'director-guide-2026-majid-majidi', tone: 'forest', filmTitle: '빵과 책' },
  { slug: 'director-guide-2026-cristian-mungiu', tone: 'ocean', filmTitle: '피오르' },
  { slug: 'director-guide-2026-na-hong-jin', tone: 'wine', filmTitle: '호프' },
  { slug: 'director-guide-2026-pawel-pawlikowski', tone: 'indigo', filmTitle: '파더랜드' },
  { slug: 'director-guide-2026-tsai-ming-liang', tone: 'forest', filmTitle: '더스트' },
  { slug: 'director-guide-2026-andrey-zvyagintsev', tone: 'ocean', filmTitle: '미노타우로스' },
  { slug: 'director-guide-2026-lee-chang-dong', tone: 'indigo', filmTitle: '가능한 사랑' },
]

export function featureMediaFor(slug: string): CuratorFeatureMedia | undefined {
  return CURATOR_FEATURE_MEDIA.find((media) => media.slug === slug)
}
