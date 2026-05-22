import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import { DEFAULT_CATEGORIES, sendNotificationEmail } from '@/lib/notifications'
import { supabase } from '@/lib/supabase'
import type { AppNotification, NotificationCategories } from '@/types/features'

async function shouldSendEmail(
  notification: Pick<AppNotification, 'household_id' | 'category' | 'email_sent_at'>,
  userId: string,
): Promise<boolean> {
  if (notification.email_sent_at) return false

  const { data, error } = await supabase
    .from('notification_preferences')
    .select('email_enabled, categories')
    .eq('household_id', notification.household_id)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) return false

  const emailEnabled = data?.email_enabled ?? true
  if (!emailEnabled) return false

  const categories = {
    ...DEFAULT_CATEGORIES,
    ...((data?.categories as NotificationCategories | null) ?? {}),
  }
  return categories[notification.category] !== false
}

export function useNotificationDelivery() {
  const { user } = useAuth()
  const { activeHousehold } = useHousehold()
  const qc = useQueryClient()

  useEffect(() => {
    if (!user?.id) return

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          const row = payload.new as AppNotification
          qc.invalidateQueries({ queryKey: ['notifications', user.id] })
          qc.invalidateQueries({ queryKey: ['notifications_unread', user.id] })

          if (!user.email || !(await shouldSendEmail(row, user.id))) return

          try {
            await sendNotificationEmail({
              to: user.email,
              subject: row.title,
              body: row.body ?? row.title,
              link: row.link ?? undefined,
              notificationId: row.id,
            })
          } catch (err) {
            console.warn('Notification email failed', err)
          }
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user?.id, user?.email, qc])

  // Catch up on unread emails when opening a household (e.g. missed while offline)
  useEffect(() => {
    if (!user?.id || !user.email || !activeHousehold?.id) return

    let cancelled = false

    async function catchUp() {
      const { data, error } = await supabase
        .from('notifications')
        .select('id, household_id, category, title, body, link, email_sent_at')
        .eq('user_id', user!.id)
        .eq('household_id', activeHousehold!.id)
        .is('email_sent_at', null)
        .order('created_at', { ascending: false })
        .limit(10)

      if (error || !data || cancelled) return

      for (const row of data) {
        const notification = row as Pick<
          AppNotification,
          'household_id' | 'category' | 'email_sent_at'
        >
        if (!(await shouldSendEmail(notification, user!.id))) continue
        try {
          await sendNotificationEmail({
            to: user!.email!,
            subject: row.title,
            body: row.body ?? row.title,
            link: row.link ?? undefined,
            notificationId: row.id,
          })
        } catch (err) {
          console.warn('Notification email catch-up failed', err)
          break
        }
      }
    }

    void catchUp()
    return () => {
      cancelled = true
    }
  }, [user?.id, user?.email, activeHousehold?.id])
}
