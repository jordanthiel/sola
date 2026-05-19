import {
  addDays,
  format,
  isSameDay,
  parseISO,
  setHours,
  setMinutes,
  startOfDay,
} from 'date-fns'
import type { NannyScheduleTemplate } from '@/types/schedule-template'
import type { ScheduleBlock } from '@/types/database'

export interface TemplateOccurrence {
  id: string
  household_nanny_id: string
  starts_at: Date
  ends_at: Date
  notes: string | null
  isTemplate: true
  day_of_week: number
}

function parseTimeOnDate(date: Date, timeStr: string): Date {
  const [h, m] = timeStr.split(':').map(Number)
  return setMinutes(setHours(startOfDay(date), h), m)
}

export function expandTemplateOccurrences(
  templates: NannyScheduleTemplate[],
  householdNannyId: string,
  from: Date,
  to: Date,
): TemplateOccurrence[] {
  const enabled = templates.filter((t) => t.enabled && t.household_nanny_id === householdNannyId)
  const out: TemplateOccurrence[] = []
  let cursor = startOfDay(from)
  const end = startOfDay(to)

  while (cursor <= end) {
    const dow = cursor.getDay()
    const tpl = enabled.find((t) => t.day_of_week === dow)
    if (tpl) {
      let start = parseTimeOnDate(cursor, tpl.start_time.slice(0, 5))
      let endDt = parseTimeOnDate(cursor, tpl.end_time.slice(0, 5))
      if (endDt <= start) {
        endDt = addDays(endDt, 1)
      }
      out.push({
        id: `tpl-${tpl.id}-${format(cursor, 'yyyy-MM-dd')}`,
        household_nanny_id: householdNannyId,
        starts_at: start,
        ends_at: endDt,
        notes: tpl.notes,
        isTemplate: true,
        day_of_week: dow,
      })
    }
    cursor = addDays(cursor, 1)
  }

  return out
}

export function blockCoversDay(block: ScheduleBlock, day: Date): boolean {
  const start = parseISO(block.starts_at)
  return isSameDay(start, day) && block.status === 'scheduled'
}

export function mergeScheduleWithTemplates(
  blocks: ScheduleBlock[],
  templates: NannyScheduleTemplate[],
  from: Date,
  to: Date,
  nannyIds: string[],
): Array<
  | (ScheduleBlock & { isTemplate?: false })
  | TemplateOccurrence
> {
  const real = blocks.filter((b) => b.status === 'scheduled')
  const merged: Array<ScheduleBlock | TemplateOccurrence> = [...real]

  for (const nannyId of nannyIds) {
    const occurrences = expandTemplateOccurrences(templates, nannyId, from, to)
    for (const occ of occurrences) {
      const hasBlock = real.some(
        (b) =>
          b.household_nanny_id === nannyId && blockCoversDay(b, occ.starts_at),
      )
      if (!hasBlock) {
        merged.push(occ)
      }
    }
  }

  return merged.sort(
    (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
  )
}

export function isTemplateOccurrence(
  item: ScheduleBlock | TemplateOccurrence,
): item is TemplateOccurrence {
  return 'isTemplate' in item && item.isTemplate === true
}
