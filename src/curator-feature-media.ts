export type CuratorFeatureMedia = {
  slug: string
  imageSrc: string
  imageAlt: string
  credit: string
  filmTitle: string
}

// Remote film-photo references from public/films-2026.json. Copyright notices
// are reproduced from each film's media.photoCopyrightNotices.
export const CURATOR_FEATURE_MEDIA: readonly CuratorFeatureMedia[] = [
  {
    slug: 'director-guide-2026-koreeda-hirokazu',
    imageSrc: 'https://d2j6u4o1bq9z89.cloudfront.net/9611_DATA/FILM_PHOTO/2026_MS8H_SL8F/1786100358.jpg',
    imageAlt: '〈룩백〉 영화 스틸',
    credit: '© Tatsuki Fujimoto/SHUEISHA ©2026 K2 Pictures · SHUEISHA',
    filmTitle: '룩백',
  },
  {
    slug: 'director-guide-2026-majid-majidi',
    imageSrc: 'https://d2j6u4o1bq9z89.cloudfront.net/9611_DATA/FILM_PHOTO/2026_MS8H_SL8F/1788153786.jpg',
    imageAlt: '〈빵과 책〉 영화 스틸',
    credit: '© Mani Majidi',
    filmTitle: '빵과 책',
  },
  {
    slug: 'director-guide-2026-cristian-mungiu',
    imageSrc: 'https://d2j6u4o1bq9z89.cloudfront.net/9611_DATA/FILM_PHOTO/2026_MS8H_SL8F/1783477110.jpg',
    imageAlt: '〈피오르〉 영화 스틸',
    credit: '© Tudor Panduru',
    filmTitle: '피오르',
  },
  {
    slug: 'director-guide-2026-na-hong-jin',
    imageSrc: 'https://d2j6u4o1bq9z89.cloudfront.net/9611_DATA/FILM_PHOTO/2026_MS8H_SL8F/1786672419.jpg',
    imageAlt: '〈호프〉 영화 스틸',
    credit: '© 2026 PLUS M ENTERTAINMENT, FORGED FILMS CO LTD, AND NA HONG-JIN. ALL RIGHTS RESERVED.',
    filmTitle: '호프',
  },
  {
    slug: 'director-guide-2026-pawel-pawlikowski',
    imageSrc: 'https://d2j6u4o1bq9z89.cloudfront.net/9611_DATA/FILM_PHOTO/2026_MS8H_SL8F/1785398550.jpg',
    imageAlt: '〈파더랜드〉 영화 스틸',
    credit: '© Agata Grzybowska',
    filmTitle: '파더랜드',
  },
  {
    slug: 'director-guide-2026-tsai-ming-liang',
    imageSrc: 'https://d2j6u4o1bq9z89.cloudfront.net/9611_DATA/FILM_PHOTO/2026_MS8H_SL8F/1786641221.jpg',
    imageAlt: '〈더스트〉 영화 스틸',
    credit: '© Homegreen Films',
    filmTitle: '더스트',
  },
  {
    slug: 'director-guide-2026-andrey-zvyagintsev',
    imageSrc: 'https://d2j6u4o1bq9z89.cloudfront.net/9611_DATA/FILM_PHOTO/2026_MS8H_SL8F/1784515019.jpg',
    imageAlt: '〈미노타우로스〉 영화 스틸',
    credit: '© Anna Matveeva',
    filmTitle: '미노타우로스',
  },
  {
    slug: 'director-guide-2026-lee-chang-dong',
    imageSrc: 'https://d2j6u4o1bq9z89.cloudfront.net/9611_DATA/FILM_PHOTO/2026_MS8H_SL8F/1785389350.jpg',
    imageAlt: '〈가능한 사랑〉 영화 스틸',
    credit: '© Netflix',
    filmTitle: '가능한 사랑',
  },
]

export function featureMediaFor(slug: string): CuratorFeatureMedia | undefined {
  return CURATOR_FEATURE_MEDIA.find((media) => media.slug === slug)
}
