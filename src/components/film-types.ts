export type Screening = {
  id: string
  date: string
  start: string
  end?: string
  venue: string
  gv?: boolean
  code?: string
}

export type Film = {
  id: string
  title: string
  englishTitle?: string
  director?: string
  country?: string
  section?: string
  runtime?: number
  url?: string
  synopsis?: string
  language?: string
  year?: number
  screenings: Screening[]
}

export type TicketStatus = 'none' | 'planned' | 'booked'
export type TicketStatusMap = Record<string, Exclude<TicketStatus, 'none'>>

export type TravelWarning = {
  gap: number
  buffer: number
  routeLabel?: string
  transferDetail?: string
  precise?: boolean
}
