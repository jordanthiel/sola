import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import type { HouseholdNanny } from '@/types/household-nanny'
import type { NannyScheduleTemplate } from '@/types/schedule-template'
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

export function useHouseholdNannies() {
  const { activeHousehold } = useHousehold()
  return useQuery({
    queryKey: ['household_nannies', activeHousehold?.id],
    enabled: !!activeHousehold,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('household_nannies')
        .select('*')
        .eq('household_id', activeHousehold!.id)
        .order('first_name')
      if (error) throw error
      return data as HouseholdNanny[]
    },
  })
}

export function useNannies() {
  return useHouseholdNannies()
}

export function useMyHouseholdNanny() {
  const { activeHousehold } = useHousehold()
  const { user } = useAuth()
  return useQuery({
    queryKey: ['my_household_nanny', activeHousehold?.id, user?.id],
    enabled: !!activeHousehold && !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('household_nannies')
        .select('*')
        .eq('household_id', activeHousehold!.id)
        .eq('user_id', user!.id)
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

export function useScheduleTemplates(householdNannyId?: string) {
  const { activeHousehold, isNanny } = useHousehold()
  const { data: myNanny, isFetched: myNannyFetched } = useMyHouseholdNanny()
  const effectiveId = isNanny ? myNanny?.id : householdNannyId

  return useQuery({
    queryKey: ['schedule_templates', activeHousehold?.id, effectiveId ?? 'all'],
    enabled: !!activeHousehold && (!isNanny || myNannyFetched),
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

export function useScheduleBlocks(from?: string, to?: string) {
  const { activeHousehold, isNanny } = useHousehold()
  const { data: myNanny, isFetched: myNannyFetched } = useMyHouseholdNanny()

  return useQuery({
    queryKey: ['schedule', activeHousehold?.id, from, to, isNanny ? myNanny?.id ?? 'none' : 'all'],
    enabled: !!activeHousehold && (!isNanny || myNannyFetched),
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

export function useChildActivities(childId?: string) {
  const { activeHousehold } = useHousehold()
  return useQuery({
    queryKey: ['activities', activeHousehold?.id, childId],
    enabled: !!activeHousehold,
    queryFn: async () => {
      let q = supabase
        .from('child_activities')
        .select('*')
        .eq('household_id', activeHousehold!.id)
        .order('occurred_at', { ascending: false })
        .limit(50)
      if (childId) q = q.eq('child_id', childId)
      const { data: activities, error } = await q
      if (error) throw error
      if (!activities?.length) return []

      const childIds = [...new Set(activities.map((a) => a.child_id))]
      const { data: kids } = await supabase.from('children').select('id, name').in('id', childIds)
      const childMap = Object.fromEntries((kids ?? []).map((c) => [c.id, c]))

      return activities.map((a) => ({
        ...a,
        children: childMap[a.child_id] ? { name: childMap[a.child_id].name } : null,
      })) as (ChildActivity & { children: { name: string } | null })[]
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
