export type VenueSiteId = 'bcc' | 'cgv' | 'lotte' | 'kofic' | 'dsu' | 'media'

type VenueSite = {
  id: VenueSiteId
  label: string
  shortLabel: string
  address: string
  exitMinutes: number
  entryMinutes: number
  internalMinutes: number
}

export type PreciseVenueTransfer = {
  minutes: number
  routeLabel: string
  detail: string
  precise: true
  fromSite: VenueSiteId
  toSite: VenueSiteId
}

/*
 * BIFF 2025 센텀권 공식 상영관을 기준으로 한 보수적인 최소 이동 여유입니다.
 * 계산 원칙: 상영관 퇴장/건물 수직 이동 + 외부 도보 + 목적지 건물 진입/수직 이동.
 * 외부 도보는 공식 BIFF 행사장 지도와 각 시설의 공개 주소/좌표를 기준으로 산정했고,
 * 백화점 상층 영화관처럼 엘리베이터/에스컬레이터 이동이 필요한 곳은 별도 진입 시간을 더했습니다.
 * 실시간 보행 내비게이션 값이 아니라 영화제 시간표 연결을 위한 권장 최소 버퍼입니다.
 */
export const VENUE_TRANSFER_SITES: readonly VenueSite[] = [
  {
    id: 'bcc',
    label: '영화의전당',
    shortLabel: '영화의전당',
    address: '부산 해운대구 수영강변대로 120',
    exitMinutes: 2,
    entryMinutes: 3,
    internalMinutes: 5,
  },
  {
    id: 'cgv',
    label: 'CGV센텀시티',
    shortLabel: 'CGV',
    address: '부산 해운대구 센텀남대로 35 신세계백화점 7층',
    exitMinutes: 4,
    entryMinutes: 6,
    internalMinutes: 4,
  },
  {
    id: 'lotte',
    label: '롯데시네마 센텀시티',
    shortLabel: '롯데',
    address: '부산 해운대구 센텀남대로 59 롯데백화점 8·9층',
    exitMinutes: 5,
    entryMinutes: 7,
    internalMinutes: 5,
  },
  {
    id: 'kofic',
    label: '영화진흥위원회 표준시사실',
    shortLabel: '영진위',
    address: '부산 해운대구 수영강변대로 130',
    exitMinutes: 2,
    entryMinutes: 3,
    internalMinutes: 3,
  },
  {
    id: 'dsu',
    label: '동서대 센텀캠퍼스',
    shortLabel: '동서대',
    address: '부산 해운대구 센텀중앙로 55',
    exitMinutes: 3,
    entryMinutes: 4,
    internalMinutes: 5,
  },
  {
    id: 'media',
    label: '시청자미디어센터',
    shortLabel: '미디어',
    address: '부산 해운대구 센텀중앙로 42',
    exitMinutes: 2,
    entryMinutes: 3,
    internalMinutes: 3,
  },
] as const

const SITE_BY_ID = Object.fromEntries(VENUE_TRANSFER_SITES.map((site) => [site.id, site])) as Record<VenueSiteId, VenueSite>

/* 시설 출입구 사이의 보수적 도보 시간(분). 교차로 대기와 실제 보행 동선을 반영해 직선거리보다 여유 있게 잡았습니다. */
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
  const to = SITE_BY_ID[toSite]
  if (fromSite === toSite) return from.internalMinutes
  const walk = OUTDOOR_WALK_MINUTES[fromSite][toSite]
  if (walk == null) return null
  return from.exitMinutes + walk + to.entryMinutes
}

export function getPreciseVenueTransfer(fromVenue: string, toVenue: string): PreciseVenueTransfer | null {
  if (fromVenue === toVenue) return null

  const from = resolveVenueSite(fromVenue)
  const to = resolveVenueSite(toVenue)
  if (!from || !to) return null

  if (from.id === to.id) {
    return {
      minutes: from.internalMinutes,
      routeLabel: `${from.shortLabel} 내부`,
      detail: `${from.label} 내부 다른 상영관/층 이동 ${from.internalMinutes}분`,
      precise: true,
      fromSite: from.id,
      toSite: to.id,
    }
  }

  const walkMinutes = OUTDOOR_WALK_MINUTES[from.id][to.id]
  if (walkMinutes == null) return null

  const minutes = from.exitMinutes + walkMinutes + to.entryMinutes
  return {
    minutes,
    routeLabel: `${from.shortLabel} → ${to.shortLabel}`,
    detail: `${from.label} 퇴장 ${from.exitMinutes}분 + 시설 간 도보 ${walkMinutes}분 + ${to.label} 입장 ${to.entryMinutes}분 = ${minutes}분`,
    precise: true,
    fromSite: from.id,
    toSite: to.id,
  }
}
