export interface ScheduleDayTarget {
  householdNannyId: string
  day: Date
  startsAt: Date
  endsAt: Date
  notes: string | null
  scheduleBlockId: string | null
}

export interface ReportLateTarget {
  scheduleBlockId: string
  day: Date
  scheduledEnd: Date
  actualEndsAt: string | null
  notes: string | null
}
