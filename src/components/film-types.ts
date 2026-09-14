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
  genre?: string
  section?: string
  runtime?: number
  url?: string
  synopsis?: string
  language?: string
  year?: number
  screenings: Screening[]
}

export type TicketStatus = 'none' | 'planned' | 'booked' | 'failed'
export type TicketStatusMap = Record<string, Exclude<TicketStatus, 'none'>>

export type BookingPriority = 1 | 2 | 3
export type BookingPlanEntry = {
  priority: BookingPriority
  fallbackFor?: string[]
}
export type BookingPlanMap = Record<string, BookingPlanEntry>

export type TravelWarning = {
  gap: number
  buffer: number
  routeLabel?: string
  transferDetail?: string
  precise?: boolean
}
