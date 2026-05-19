export interface NannyScheduleTemplate {
  id: string
  household_id: string
  household_nanny_id: string
  day_of_week: number
  start_time: string
  end_time: string
  enabled: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export type DayScheduleDraft = {
  day_of_week: number
  enabled: boolean
  start_time: string
  end_time: string
}

export const WEEKDAYS: { dow: number; label: string; short: string }[] = [
  { dow: 0, label: 'Sunday', short: 'Sun' },
  { dow: 1, label: 'Monday', short: 'Mon' },
  { dow: 2, label: 'Tuesday', short: 'Tue' },
  { dow: 3, label: 'Wednesday', short: 'Wed' },
  { dow: 4, label: 'Thursday', short: 'Thu' },
  { dow: 5, label: 'Friday', short: 'Fri' },
  { dow: 6, label: 'Saturday', short: 'Sat' },
]

export const DEFAULT_DAY: DayScheduleDraft = {
  day_of_week: 1,
  enabled: false,
  start_time: '09:00',
  end_time: '17:00',
}

export function emptyWeekDraft(): DayScheduleDraft[] {
  return WEEKDAYS.map((d) => ({
    ...DEFAULT_DAY,
    day_of_week: d.dow,
    enabled: d.dow >= 1 && d.dow <= 5,
  }))
}

export function draftFromTemplates(templates: NannyScheduleTemplate[]): DayScheduleDraft[] {
  const draft = emptyWeekDraft()
  for (const t of templates) {
    const i = draft.findIndex((d) => d.day_of_week === t.day_of_week)
    if (i >= 0) {
      draft[i] = {
        day_of_week: t.day_of_week,
        enabled: t.enabled,
        start_time: t.start_time.slice(0, 5),
        end_time: t.end_time.slice(0, 5),
      }
    }
  }
  return draft
}
