import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import type {
  AppNotification,
  ChildEmergencyContact,
  ExtendedChild,
  FeedPostWithAuthor,
  HouseholdDocument,
  HoursBasis,
  Incident,
  NotificationCategories,
  NotificationPreference,
  PayPeriodClose,
  PayrollLineItem,
  RecurringChildPlan,
} from '@/types/features'
import { DEFAULT_CATEGORIES } from '@/lib/notifications'
import {
  mentionNamesFromText,
  nannyNamesByUserId,
  resolveUserDisplayName,
} from '@/lib/user-display-names'

export function useNotificationPreferences() {
  const { activeHousehold } = useHousehold()
  const { user } = useAuth()
  return useQuery({
    queryKey: ['notification_prefs', activeHousehold?.id, user?.id],
    enabled: !!activeHousehold && !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('household_id', activeHousehold!.id)
        .eq('user_id', user!.id)
        .maybeSingle()
      if (error) throw error
      if (!data) {
        return {
          user_id: user!.id,
          household_id: activeHousehold!.id,
          email_enabled: true,
          in_app_enabled: true,
          categories: DEFAULT_CATEGORIES,
          updated_at: new Date().toISOString(),
        } satisfies NotificationPreference
      }
      const row = data as NotificationPreference
      return {
        ...row,
        categories: { ...DEFAULT_CATEGORIES, ...(row.categories as NotificationCategories) },
      }
    },
  })
}

export function useNotifications() {
  const { user } = useAuth()
  const { data: prefs } = useNotificationPreferences()
  const inAppEnabled = prefs?.in_app_enabled ?? true
  return useQuery({
    queryKey: ['notifications', user?.id, inAppEnabled],
    enabled: !!user && inAppEnabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data as AppNotification[]
    },
  })
}

export function useUnreadNotificationCount() {
  const { user } = useAuth()
  const { data: prefs } = useNotificationPreferences()
  const inAppEnabled = prefs?.in_app_enabled ?? true
  return useQuery({
    queryKey: ['notifications_unread', user?.id, inAppEnabled],
    enabled: !!user && inAppEnabled,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user!.id)
        .is('read_at', null)
      if (error) throw error
      return count ?? 0
    },
  })
}

export function useDocuments() {
  const { activeHousehold } = useHousehold()
  return useQuery({
    queryKey: ['documents', activeHousehold?.id],
    enabled: !!activeHousehold,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('household_id', activeHousehold!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as HouseholdDocument[]
    },
  })
}

export function useRecurringPlans() {
  const { activeHousehold } = useHousehold()
  return useQuery({
    queryKey: ['recurring_plans', activeHousehold?.id],
    enabled: !!activeHousehold,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recurring_child_plans')
        .select('*')
        .eq('household_id', activeHousehold!.id)
        .order('day_of_week')
      if (error) throw error
      return data as RecurringChildPlan[]
    },
  })
}

export function usePayrollLineItems(householdNannyId?: string, periodStart?: string) {
  const { activeHousehold } = useHousehold()
  return useQuery({
    queryKey: ['payroll_line_items', activeHousehold?.id, householdNannyId, periodStart],
    enabled: !!activeHousehold && !!householdNannyId && !!periodStart,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payroll_line_items')
        .select('*')
        .eq('household_id', activeHousehold!.id)
        .eq('household_nanny_id', householdNannyId!)
        .eq('pay_period_start', periodStart!)
      if (error) throw error
      return data as PayrollLineItem[]
    },
  })
}

export function usePayPeriodCloses(householdNannyId?: string) {
  const { activeHousehold } = useHousehold()
  return useQuery({
    queryKey: ['pay_period_closes', activeHousehold?.id, householdNannyId],
    enabled: !!activeHousehold,
    queryFn: async () => {
      let q = supabase
        .from('pay_period_closes')
        .select('*')
        .eq('household_id', activeHousehold!.id)
        .order('period_start', { ascending: false })
      if (householdNannyId) q = q.eq('household_nanny_id', householdNannyId)
      const { data, error } = await q
      if (error) throw error
      return data as unknown as PayPeriodClose[]
    },
  })
}

export function usePayPeriodClose(
  householdNannyId?: string,
  periodStart?: string,
) {
  const { activeHousehold } = useHousehold()
  return useQuery({
    queryKey: ['pay_period_close', activeHousehold?.id, householdNannyId, periodStart],
    enabled: !!activeHousehold && !!householdNannyId && !!periodStart,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pay_period_closes')
        .select('*')
        .eq('household_id', activeHousehold!.id)
        .eq('household_nanny_id', householdNannyId!)
        .eq('period_start', periodStart!)
        .maybeSingle()
      if (error) throw error
      return data as unknown as PayPeriodClose | null
    },
  })
}

export function useFeedPosts() {
  const { activeHousehold } = useHousehold()
  return useQuery({
    queryKey: ['feed', activeHousehold?.id],
    enabled: !!activeHousehold,
    queryFn: async () => {
      const { data: posts, error } = await supabase
        .from('feed_posts')
        .select('*')
        .eq('household_id', activeHousehold!.id)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      if (!posts?.length) return [] as FeedPostWithAuthor[]

      const authorIds = [...new Set(posts.map((p) => p.author_id))]
      const postIds = posts.map((p) => p.id)
      const { data: mentions } = await supabase
        .from('feed_mentions')
        .select('post_id, mentioned_user_id')
        .in('post_id', postIds)

      const mentionUserIds = [...new Set((mentions ?? []).map((m) => m.mentioned_user_id))]
      const allUserIds = [...new Set([...authorIds, ...mentionUserIds])]

      const [{ data: profiles }, { data: householdNannies }] = await Promise.all([
        allUserIds.length
          ? supabase.from('profiles').select('id, display_name').in('id', allUserIds)
          : Promise.resolve({ data: [] as { id: string; display_name: string | null }[] }),
        supabase
          .from('household_nannies')
          .select('user_id, first_name, last_name')
          .eq('household_id', activeHousehold!.id)
          .not('user_id', 'is', null),
      ])

      const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]))
      const nannyByUserId = nannyNamesByUserId(householdNannies ?? [])
      const mentionNames = Object.assign(
        {},
        ...posts.map((p) => mentionNamesFromText(p.body)),
      )

      const nameSources = { profileMap, nannyByUserId, mentionNames }

      return posts.map((p) => ({
        ...p,
        author: {
          display_name: resolveUserDisplayName(p.author_id, nameSources),
        },
        mentions: (mentions ?? [])
          .filter((m) => m.post_id === p.id)
          .map((m) => ({
            mentioned_user_id: m.mentioned_user_id,
            display_name: resolveUserDisplayName(m.mentioned_user_id, nameSources),
          })),
      })) as FeedPostWithAuthor[]
    },
  })
}

export function useIncidents() {
  const { activeHousehold } = useHousehold()
  return useQuery({
    queryKey: ['incidents', activeHousehold?.id],
    enabled: !!activeHousehold,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('incidents')
        .select('*')
        .eq('household_id', activeHousehold!.id)
        .order('occurred_at', { ascending: false })
      if (error) throw error
      return data as Incident[]
    },
  })
}

export function useEmergencyContacts(childId?: string) {
  return useQuery({
    queryKey: ['emergency_contacts', childId],
    enabled: !!childId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('child_emergency_contacts')
        .select('*')
        .eq('child_id', childId!)
        .order('name')
      if (error) throw error
      return data as ChildEmergencyContact[]
    },
  })
}

export function useExtendedChildren() {
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
      return data as ExtendedChild[]
    },
  })
}

export function useMyNannyHouseholds() {
  const { user } = useAuth()
  const { isNanny } = useHousehold()
  return useQuery({
    queryKey: ['nanny_households', user?.id],
    enabled: !!user && isNanny,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('household_nannies')
        .select('*, households(id, name, timezone)')
        .eq('user_id', user!.id)
        .not('claimed_at', 'is', null)
      if (error) throw error
      return data
    },
  })
}

export function useMarkNotificationRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['notifications_unread'] })
    },
  })
}

export function useSaveNotificationPreferences() {
  const { activeHousehold } = useHousehold()
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (prefs: Partial<NotificationPreference>) => {
      const { error } = await supabase.from('notification_preferences').upsert({
        user_id: user!.id,
        household_id: activeHousehold!.id,
        email_enabled: prefs.email_enabled ?? true,
        in_app_enabled: prefs.in_app_enabled ?? true,
        categories: prefs.categories ?? DEFAULT_CATEGORIES,
        updated_at: new Date().toISOString(),
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notification_prefs'] }),
  })
}

export function useHoursBasisPreference() {
  const key = 'nanny_payroll_hours_basis'
  const stored = (localStorage.getItem(key) as HoursBasis) || 'scheduled'
  return {
    hoursBasis: stored,
    setHoursBasis: (v: HoursBasis) => localStorage.setItem(key, v),
  }
}
