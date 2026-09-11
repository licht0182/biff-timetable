export type VenueSiteId = 'bcc' | 'cgv' | 'lotte' | 'kofic' | 'dsu' | 'media'

type VenueSite = {
  id: VenueSiteId
  label: string
  shortLabel: string
  address: string
  internalWalkMinutes: number
}

export type PreciseVenueTransfer = {
  minutes: number
  routeLabel: string
  detail: string
  precise: true
  fromSite: VenueSiteId
  toSite: VenueSiteId
}

export const REST_BREAK_MINUTES = 5

/*
 * BIFF 2026 공식 센텀권 상영관을 기준으로 한 이동 여유입니다.
 * 공식 상영관: 영화의전당, CGV센텀시티, 롯데시네마 센텀시티,
 * 영화진흥위원회 표준시사실, 소향씨어터 우리은행홀, 부산시청자미디어센터 공개홀.
 *
 * 계산 원칙은 사용자가 실제로 걸어야 하는 시간 + 고정 휴게시간 5분입니다.
 * 서로 다른 시설은 시설 출입구 사이 도보시간을, 같은 시설의 다른 관/층은 내부 도보시간을 사용합니다.
 * 완전히 같은 상영관은 도보 0분 + 휴게 5분으로 transfer-buffer.ts에서 처리합니다.
 */
export const VENUE_TRANSFER_SITES: readonly VenueSite[] = [
  {
    id: 'bcc',
    label: '영화의전당',
    shortLabel: '영화의전당',
    address: '부산 해운대구 수영강변대로 120',
    internalWalkMinutes: 5,
  },
  {
    id: 'cgv',
    label: 'CGV센텀시티',
    shortLabel: 'CGV',
    address: '부산 해운대구 센텀남대로 35 신세계백화점 7층',
    internalWalkMinutes: 4,
  },
  {
    id: 'lotte',
    label: '롯데시네마 센텀시티',
    shortLabel: '롯데',
    address: '부산 해운대구 센텀남대로 59 롯데백화점 8·9층',
    internalWalkMinutes: 5,
  },
  {
    id: 'kofic',
    label: '영화진흥위원회 표준시사실',
    shortLabel: '영진위',
    address: '부산 해운대구 수영강변대로 130',
    internalWalkMinutes: 3,
  },
  {
    id: 'dsu',
    label: '소향씨어터 우리은행홀',
    shortLabel: '소향',
    address: '부산 해운대구 센텀중앙로 55',
    internalWalkMinutes: 5,
  },
  {
    id: 'media',
    label: '부산시청자미디어센터 공개홀',
    shortLabel: '미디어',
    address: '부산 해운대구 센텀중앙로 42',
    internalWalkMinutes: 3,
  },
] as const

const SITE_BY_ID = Object.fromEntries(VENUE_TRANSFER_SITES.map((site) => [site.id, site])) as Record<VenueSiteId, VenueSite>

/* 시설 출입구 사이의 도보 시간(분). 교차로 대기와 실제 보행 동선을 고려한 센텀권 이동 기준입니다. */
const OUTDOOR_WALK_MINUTES: Record<VenueSiteId, Partial<Record<VenueSiteId, number>>> = {
  bcc: { cgv: 6, lotte: 8, kofic: 3, dsu: 4, media: 6 },
  cgv: { bcc: 6, lotte: 4, kofic: 9, dsu: 10, media: 8 },
  lotte: { bcc: 8, cgv: 4, kofic: 11, dsu: 10, media: 7 },
  kofic: { bcc: 3, cgv: 9, lotte: 11, dsu: 4, media: 8 },
  dsu: { bcc: 4, cgv: 10, lotte: 10, kofic: 4, media: 5 },
  media: { bcc: 6, cgv: 8, lotte: 7, kofic: 8, dsu: 5 },
}

export function resolveVenueSite(venue: string): VenueSite | null {
  if (venue.startsWith('영화의전당')) return SITE_BY_ID.bcc
  if (venue.startsWith('CGV센텀시티') || venue.startsWith('CGV 센텀시티')) return SITE_BY_ID.cgv
  if (venue.startsWith('롯데시네마 센텀시티') || venue.startsWith('롯데시네마 센텀')) return SITE_BY_ID.lotte
  if (venue.includes('영화진흥위원회')) return SITE_BY_ID.kofic
  if (venue.includes('소향씨어터') || venue.startsWith('동서대학교-경남정보대학교')) return SITE_BY_ID.dsu
  if (venue.includes('시청자미디어센터')) return SITE_BY_ID.media
  return null
}

export function getVenueSiteTransferMinutes(fromSite: VenueSiteId, toSite: VenueSiteId) {
  const from = SITE_BY_ID[fromSite]
  if (fromSite === toSite) return from.internalWalkMinutes + REST_BREAK_MINUTES
  const walk = OUTDOOR_WALK_MINUTES[fromSite][toSite]
  if (walk == null) return null
  return walk + REST_BREAK_MINUTES
}

export function getPreciseVenueTransfer(fromVenue: string, toVenue: string): PreciseVenueTransfer | null {
  if (fromVenue === toVenue) return null

  const from = resolveVenueSite(fromVenue)
  const to = resolveVenueSite(toVenue)
  if (!from || !to) return null

  if (from.id === to.id) {
    const minutes = from.internalWalkMinutes + REST_BREAK_MINUTES
    return {
      minutes,
      routeLabel: `${from.shortLabel} 내부`,
      detail: `${from.label} 내부 도보 ${from.internalWalkMinutes}분 + 휴게 ${REST_BREAK_MINUTES}분 = ${minutes}분`,
      precise: true,
      fromSite: from.id,
      toSite: to.id,
    }
  }

  const walkMinutes = OUTDOOR_WALK_MINUTES[from.id][to.id]
  if (walkMinutes == null) return null

  const minutes = walkMinutes + REST_BREAK_MINUTES
  return {
    minutes,
    routeLabel: `${from.shortLabel} → ${to.shortLabel}`,
    detail: `${from.label} → ${to.label} 도보 ${walkMinutes}분 + 휴게 ${REST_BREAK_MINUTES}분 = ${minutes}분`,
    precise: true,
    fromSite: from.id,
    toSite: to.id,
  }
}
