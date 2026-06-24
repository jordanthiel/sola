import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { mergeScheduleWithTemplates } from '@/lib/schedule'
import type { ScheduleCoverageItem } from '@/lib/plan-attendee'
import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import type { HouseholdNanny } from '@/types/household-nanny'
import type { NannyScheduleTemplate } from '@/types/schedule-template'
import type { AdvanceRepayment } from '@/types/advance-repayment'
import type {
  Child,
  ChildActivity,
  EmploymentSetting,
  HouseholdMember,
  PaymentAdvance,
  Profile,
  ScheduleBlock,
  TimeEntry,
  TimeOffRequest,
  PtoBalance,
} from '@/types/database'

export function useHouseholdNannies(options?: { includeDeactivated?: boolean }) {
  const { activeHousehold } = useHousehold()
  const includeDeactivated = options?.includeDeactivated ?? false
  return useQuery({
    queryKey: ['household_nannies', activeHousehold?.id, includeDeactivated],
    enabled: !!activeHousehold,
    queryFn: async () => {
      let query = supabase
        .from('household_nannies')
        .select('*')
        .eq('household_id', activeHousehold!.id)
        .order('first_name')
      if (!includeDeactivated) {
        query = query.is('deactivated_at', null)
      }
      const { data, error } = await query
      if (error) throw error
      return data as HouseholdNanny[]
    },
  })
}

/** Active nannies only — payroll, schedule, time off, etc. */
export function useNannies() {
  return useHouseholdNannies()
}

export function useMyHouseholdNanny() {
  const { activeHousehold, nannyPreviewId, isNannyPreview } = useHousehold()
  const { user } = useAuth()
  return useQuery({
    queryKey: ['my_household_nanny', activeHousehold?.id, user?.id, nannyPreviewId],
    enabled: !!activeHousehold && (!!user || isNannyPreview),
    queryFn: async () => {
      if (isNannyPreview && nannyPreviewId) {
        const { data, error } = await supabase
          .from('household_nannies')
          .select('*')
          .eq('household_id', activeHousehold!.id)
          .eq('id', nannyPreviewId)
          .maybeSingle()
        if (error) throw error
        return data as HouseholdNanny | null
      }

      const { data, error } = await supabase
        .from('household_nannies')
        .select('*')
        .eq('household_id', activeHousehold!.id)
        .eq('user_id', user!.id)
        .not('claimed_at', 'is', null)
        .maybeSingle()
      if (error) throw error
      return data as HouseholdNanny | null
    },
  })
}

export function useMembers() {
  const { activeHousehold } = useHousehold()
  return useQuery({
    queryKey: ['members', activeHousehold?.id],
    enabled: !!activeHousehold,
    queryFn: async () => {
      const { data: members, error: mErr } = await supabase
        .from('household_members')
        .select('*')
        .eq('household_id', activeHousehold!.id)
        .eq('status', 'active')
      if (mErr) throw mErr
      if (!members?.length) return []

      const userIds = members.map((m) => m.user_id)
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', userIds)

      const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]))
      return members.map((m) => ({
        ...m,
        profiles: profileMap[m.user_id] ?? null,
      })) as (HouseholdMember & { profiles: Pick<Profile, 'display_name'> | null })[]
    },
  })
}

export function useScheduleTemplates(
  householdNannyId?: string,
  options?: { enabled?: boolean },
) {
  const { activeHousehold, isNanny } = useHousehold()
  const { data: myNanny, isFetched: myNannyFetched } = useMyHouseholdNanny()
  const effectiveId = isNanny ? myNanny?.id : householdNannyId

  return useQuery({
    queryKey: ['schedule_templates', activeHousehold?.id, effectiveId ?? 'all'],
    enabled:
      (options?.enabled ?? true) && !!activeHousehold && (!isNanny || myNannyFetched),
    queryFn: async () => {
      let q = supabase
        .from('nanny_schedule_templates')
        .select('*')
        .eq('household_id', activeHousehold!.id)
        .order('day_of_week')
      if (effectiveId) q = q.eq('household_nanny_id', effectiveId)
      const { data, error } = await q
      if (error) throw error
      return data as NannyScheduleTemplate[]
    },
  })
}

export function useMergedSchedule(range?: { from: Date; to: Date }) {
  const fromIso = range?.from.toISOString()
  const toIso = range?.to.toISOString()
  const { data: blocks, isLoading: blocksLoading } = useScheduleBlocks(fromIso, toIso)
  const { data: templates, isLoading: templatesLoading } = useScheduleTemplates()
  const { data: nannies } = useNannies()

  const merged = useMemo(() => {
    if (!range || !blocks || !nannies?.length) return [] as ScheduleCoverageItem[]
    return mergeScheduleWithTemplates(
      blocks,
      templates ?? [],
      range.from,
      range.to,
      nannies.map((n) => n.id),
    )
  }, [blocks, templates, nannies, range])

  return {
    data: merged,
    isLoading: blocksLoading || templatesLoading,
  }
}

export function useScheduleBlocks(
  from?: string,
  to?: string,
  options?: { enabled?: boolean },
) {
  const { activeHousehold, isNanny } = useHousehold()
  const { data: myNanny, isFetched: myNannyFetched } = useMyHouseholdNanny()

  return useQuery({
    queryKey: ['schedule', activeHousehold?.id, from, to, isNanny ? myNanny?.id ?? 'none' : 'all'],
    enabled:
      (options?.enabled ?? true) && !!activeHousehold && (!isNanny || myNannyFetched),
    queryFn: async () => {
      if (isNanny && !myNanny) return [] as ScheduleBlock[]

      let q = supabase
        .from('schedule_blocks')
        .select('*')
        .eq('household_id', activeHousehold!.id)
        .order('starts_at', { ascending: true })
      if (from) q = q.gte('starts_at', from)
      if (to) q = q.lte('starts_at', to)
      if (isNanny && myNanny) q = q.eq('household_nanny_id', myNanny.id)
      const { data, error } = await q
      if (error) throw error
      return data as ScheduleBlock[]
    },
  })
}

export function useTimeEntries(from?: string, to?: string, householdNannyId?: string) {
  const { activeHousehold } = useHousehold()
  const { data: myNanny } = useMyHouseholdNanny()
  const { isNanny } = useHousehold()
  const effectiveNannyId = isNanny ? myNanny?.id : householdNannyId

  return useQuery({
    queryKey: ['time_entries', activeHousehold?.id, from, to, effectiveNannyId],
    enabled: !!activeHousehold,
    queryFn: async () => {
      let q = supabase
        .from('time_entries')
        .select('*')
        .eq('household_id', activeHousehold!.id)
        .order('clock_in', { ascending: false })
      if (from) q = q.gte('clock_in', from)
      if (to) q = q.lte('clock_in', to)
      if (effectiveNannyId) q = q.eq('household_nanny_id', effectiveNannyId)
      const { data, error } = await q
      if (error) throw error
      return data as TimeEntry[]
    },
  })
}

export function useActiveClockEntry() {
  const { activeHousehold } = useHousehold()
  const { data: myNanny } = useMyHouseholdNanny()

  return useQuery({
    queryKey: ['active_clock', activeHousehold?.id, myNanny?.id],
    enabled: !!activeHousehold && !!myNanny?.user_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('time_entries')
        .select('*')
        .eq('household_id', activeHousehold!.id)
        .eq('household_nanny_id', myNanny!.id)
        .is('clock_out', null)
        .maybeSingle()
      if (error) throw error
      return data as TimeEntry | null
    },
  })
}

export function useEmploymentSettings(householdNannyId?: string) {
  const { activeHousehold } = useHousehold()
  return useQuery({
    queryKey: ['employment', activeHousehold?.id, householdNannyId],
    enabled: !!activeHousehold,
    queryFn: async () => {
      let q = supabase
        .from('employment_settings')
        .select('*')
        .eq('household_id', activeHousehold!.id)
        .order('effective_from', { ascending: false })
        .order('created_at', { ascending: false })
      if (householdNannyId) q = q.eq('household_nanny_id', householdNannyId)
      const { data, error } = await q
      if (error) throw error
      return data as EmploymentSetting[]
    },
  })
}

export function usePaymentAdvances(householdNannyId?: string) {
  const { activeHousehold } = useHousehold()
  return useQuery({
    queryKey: ['advances', activeHousehold?.id, householdNannyId],
    enabled: !!activeHousehold,
    queryFn: async () => {
      let q = supabase
        .from('payment_advances')
        .select('*')
        .eq('household_id', activeHousehold!.id)
        .order('issued_on', { ascending: false })
      if (householdNannyId) q = q.eq('household_nanny_id', householdNannyId)
      const { data, error } = await q
      if (error) throw error
      return data as PaymentAdvance[]
    },
  })
}

export function useAdvanceRepayments(householdNannyId?: string) {
  const { activeHousehold } = useHousehold()
  return useQuery({
    queryKey: ['advance_repayments', activeHousehold?.id, householdNannyId],
    enabled: !!activeHousehold && !!householdNannyId,
    queryFn: async () => {
      const { data: advances, error: aErr } = await supabase
        .from('payment_advances')
        .select('id')
        .eq('household_id', activeHousehold!.id)
        .eq('household_nanny_id', householdNannyId!)
      if (aErr) throw aErr
      if (!advances?.length) return [] as AdvanceRepayment[]

      const ids = advances.map((a) => a.id)
      const { data, error } = await supabase
        .from('advance_repayments')
        .select('*')
        .in('payment_advance_id', ids)
        .order('paid_on', { ascending: false })
      if (error) throw error
      return data as AdvanceRepayment[]
    },
  })
}

export function useTimeOffRequests() {
  const { activeHousehold } = useHousehold()
  const { data: myNanny } = useMyHouseholdNanny()
  const { isNanny } = useHousehold()

  return useQuery({
    queryKey: ['time_off', activeHousehold?.id, isNanny ? myNanny?.id : 'all'],
    enabled: !!activeHousehold,
    queryFn: async () => {
      let q = supabase
        .from('time_off_requests')
        .select('*')
        .eq('household_id', activeHousehold!.id)
        .order('created_at', { ascending: false })
      if (isNanny && myNanny) q = q.eq('household_nanny_id', myNanny.id)
      const { data, error } = await q
      if (error) throw error
      return data as TimeOffRequest[]
    },
  })
}

export function usePtoBalances() {
  const { activeHousehold } = useHousehold()
  return useQuery({
    queryKey: ['pto_balances', activeHousehold?.id],
    enabled: !!activeHousehold,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pto_balances')
        .select('*')
        .eq('household_id', activeHousehold!.id)
      if (error) throw error
      return data as PtoBalance[]
    },
  })
}

export function useChildren() {
  const { activeHousehold } = useHousehold()
  return useQuery({
    queryKey: ['children', activeHousehold?.id],
    enabled: !!activeHousehold,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('children')
        .select('*')
        .eq('household_id', activeHousehold!.id)
        .order('name')
      if (error) throw error
      return data as Child[]
    },
  })
}

export function useChildActivities(
  childId?: string,
  range?: { from: string; to: string },
) {
  const { activeHousehold } = useHousehold()
  return useQuery({
    queryKey: ['activities', activeHousehold?.id, childId, range?.from, range?.to],
    enabled: !!activeHousehold,
    queryFn: async () => {
      let q = supabase
        .from('child_activities')
        .select('*')
        .eq('household_id', activeHousehold!.id)
        .order('occurred_at', { ascending: false })
      if (range) {
        q = q.gte('occurred_at', range.from).lte('occurred_at', range.to)
      } else {
        q = q.limit(50)
      }
      if (childId) q = q.eq('child_id', childId)
      const { data: activities, error } = await q
      if (error) throw error
      if (!activities?.length) return []

      const childIds = [...new Set(activities.map((a) => a.child_id))]
      const { data: kids } = await supabase
        .from('children')
        .select('id, name, color_key')
        .in('id', childIds)
      const childMap = Object.fromEntries((kids ?? []).map((c) => [c.id, c]))

      return activities.map((a) => ({
        ...a,
        children: childMap[a.child_id]
          ? { name: childMap[a.child_id].name, color_key: childMap[a.child_id].color_key }
          : null,
      })) as (ChildActivity & {
        children: { name: string; color_key: Child['color_key'] } | null
      })[]
    },
  })
}

export function usePendingTimeOff() {
  const { activeHousehold, isParent } = useHousehold()
  return useQuery({
    queryKey: ['pending_time_off', activeHousehold?.id],
    enabled: !!activeHousehold && isParent,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('time_off_requests')
        .select('*')
        .eq('household_id', activeHousehold!.id)
        .eq('status', 'pending')
      if (error) throw error
      return data as TimeOffRequest[]
    },
  })
}
