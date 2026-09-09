import { getPreciseVenueTransfer } from './venue-travel'

export type TransferSettings = {
  sameVenueMinutes: number
  sameClusterMinutes: number
  differentVenueMinutes: number
}

export type TransferBufferResult = {
  minutes: number
  routeLabel: string
  transferDetail: string
  precise: boolean
}

function venueCluster(venue: string) {
  if (venue.startsWith('영화의전당')) return '영화의전당'
  if (venue.startsWith('CGV센텀시티') || venue.startsWith('CGV 센텀시티')) return 'CGV센텀시티'
  if (venue.startsWith('롯데시네마 센텀')) return '롯데시네마 센텀시티'
  if (venue.includes('소향씨어터') || venue.startsWith('동서대학교-경남정보대학교')) return '동서대 센텀캠퍼스'
  if (venue.includes('영화진흥위원회')) return '영화진흥위원회'
  if (venue.includes('시청자미디어센터')) return '시청자미디어센터'
  return venue
}

export function getTransferBuffer(fromVenue: string, toVenue: string, settings: TransferSettings): TransferBufferResult {
  if (fromVenue === toVenue) {
    return {
      minutes: settings.sameVenueMinutes,
      routeLabel: '동일 상영관',
      transferDetail: `같은 상영관 연속 관람 기본 여유 ${settings.sameVenueMinutes}분`,
      precise: false,
    }
  }

  const precise = getPreciseVenueTransfer(fromVenue, toVenue)
  if (precise) {
    return {
      minutes: precise.minutes,
      routeLabel: precise.routeLabel,
      transferDetail: precise.detail,
      precise: true,
    }
  }

  const sameCluster = venueCluster(fromVenue) === venueCluster(toVenue)
  const minutes = sameCluster ? settings.sameClusterMinutes : settings.differentVenueMinutes
  return {
    minutes,
    routeLabel: `${fromVenue} → ${toVenue}`,
    transferDetail: `정밀 이동시간 미등록 조합 · ${sameCluster ? '같은 시설' : '다른 시설'} 기본값 ${minutes}분 적용`,
    precise: false,
  }
}
