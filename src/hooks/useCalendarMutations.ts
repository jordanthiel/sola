import { useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import type { ActivityType, MoodType, TimeOffType } from '@/types/database'
import type { TemplateOccurrence } from '@/lib/schedule'

import { invalidateCalendarQueries } from '@/lib/invalidate-calendar'

export function useCalendarMutations() {
  const { activeHousehold } = useHousehold()
  const { user } = useAuth()
  const qc = useQueryClient()

  const upsertShift = useMutation({
    mutationFn: async (input: {
      householdNannyId: string
      workDate: Date
      startsAt: Date
      endsAt: Date
      notes: string | null
    }) => {
      const { error } = await supabase.rpc('upsert_schedule_day', {
        p_household_id: activeHousehold!.id,
        p_household_nanny_id: input.householdNannyId,
        p_work_date: format(input.workDate, 'yyyy-MM-dd'),
        p_starts_at: input.startsAt.toISOString(),
        p_ends_at: input.endsAt.toISOString(),
        p_notes: input.notes,
      })
      if (error) throw error
    },
    onSuccess: () => invalidateCalendarQueries(qc),
  })

  const cancelShift = useMutation({
    mutationFn: async (blockId: string) => {
      const { error } = await supabase
        .from('schedule_blocks')
        .update({ status: 'cancelled' })
        .eq('id', blockId)
      if (error) throw error
    },
    onSuccess: () => invalidateCalendarQueries(qc),
  })

  const reportLate = useMutation({
    mutationFn: async (input: {
      scheduleBlockId: string
      actualEndsAt: Date
      notes: string | null
    }) => {
      const { error } = await supabase.rpc('report_shift_late', {
        p_schedule_block_id: input.scheduleBlockId,
        p_actual_ends_at: input.actualEndsAt.toISOString(),
        p_notes: input.notes,
      })
      if (error) throw error
    },
    onSuccess: () => invalidateCalendarQueries(qc),
  })

  const materializeTemplate = useMutation({
    mutationFn: async (occ: TemplateOccurrence) => {
      const { data, error } = await supabase
        .from('schedule_blocks')
        .insert({
          household_id: activeHousehold!.id,
          household_nanny_id: occ.household_nanny_id,
          starts_at: occ.starts_at.toISOString(),
          ends_at: occ.ends_at.toISOString(),
          notes: occ.notes,
        })
        .select('id, ends_at, starts_at, actual_ends_at, actual_notes')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => invalidateCalendarQueries(qc),
  })

  const createTimeOff = useMutation({
    mutationFn: async (input: {
      householdNannyId: string
      type: TimeOffType
      startsOn: string
      endsOn: string
      hours: number
      notes: string | null
    }) => {
      const { error } = await supabase.from('time_off_requests').insert({
        household_id: activeHousehold!.id,
        household_nanny_id: input.householdNannyId,
        type: input.type,
        starts_on: input.startsOn,
        ends_on: input.endsOn,
        hours: input.hours,
        notes: input.notes,
      })
      if (error) throw error
    },
    onSuccess: () => invalidateCalendarQueries(qc),
  })

  const updateTimeOff = useMutation({
    mutationFn: async (input: {
      id: string
      type: TimeOffType
      startsOn: string
      endsOn: string
      hours: number
      notes: string | null
    }) => {
      const { error } = await supabase
        .from('time_off_requests')
        .update({
          type: input.type,
          starts_on: input.startsOn,
          ends_on: input.endsOn,
          hours: input.hours,
          notes: input.notes,
        })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => invalidateCalendarQueries(qc),
  })

  const reviewTimeOff = useMutation({
    mutationFn: async (input: { id: string; status: 'approved' | 'denied'; reviewNotes?: string }) => {
      const trimmed = input.reviewNotes?.trim()
      const { error } = await supabase
        .from('time_off_requests')
        .update({
          status: input.status,
          reviewed_by: user!.id,
          reviewed_at: new Date().toISOString(),
          review_notes: trimmed || null,
        })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => invalidateCalendarQueries(qc),
  })

  const deleteTimeOff = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('time_off_requests').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidateCalendarQueries(qc),
  })

  const createActivity = useMutation({
    mutationFn: async (input: {
      childId: string
      activityType: ActivityType
      title: string
      description: string | null
      occurredAt: Date
      durationMinutes: number | null
      mood: MoodType | null
      attendee_user_id?: string | null
      attendee_household_nanny_id?: string | null
    }) => {
      const { error } = await supabase.from('child_activities').insert({
        household_id: activeHousehold!.id,
        child_id: input.childId,
        logged_by: user!.id,
        activity_type: input.activityType,
        title: input.title,
        description: input.description,
        occurred_at: input.occurredAt.toISOString(),
        duration_minutes: input.durationMinutes,
        mood: input.mood,
        attendee_user_id: input.attendee_user_id ?? null,
        attendee_household_nanny_id: input.attendee_household_nanny_id ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => invalidateCalendarQueries(qc),
  })

  const updateActivity = useMutation({
    mutationFn: async (input: {
      id: string
      childId: string
      activityType: ActivityType
      title: string
      description: string | null
      occurredAt: Date
      durationMinutes: number | null
      mood: MoodType | null
      attendee_user_id?: string | null
      attendee_household_nanny_id?: string | null
    }) => {
      const { error } = await supabase
        .from('child_activities')
        .update({
          child_id: input.childId,
          activity_type: input.activityType,
          title: input.title,
          description: input.description,
          occurred_at: input.occurredAt.toISOString(),
          duration_minutes: input.durationMinutes,
          mood: input.mood,
          attendee_user_id: input.attendee_user_id ?? null,
          attendee_household_nanny_id: input.attendee_household_nanny_id ?? null,
        })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => invalidateCalendarQueries(qc),
  })

  const deleteActivity = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('child_activities').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidateCalendarQueries(qc),
  })

  return {
    upsertShift,
    cancelShift,
    reportLate,
    materializeTemplate,
    createTimeOff,
    updateTimeOff,
    reviewTimeOff,
    deleteTimeOff,
    createActivity,
    updateActivity,
    deleteActivity,
  }
}
