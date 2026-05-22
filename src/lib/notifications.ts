import { FunctionsHttpError } from '@supabase/supabase-js'
import { buildInviteEmailHtml, buildNotificationEmailHtml } from '@/lib/email-templates'
import { supabase } from '@/lib/supabase'
import type { NotificationCategories, NotificationCategory } from '@/types/features'

async function edgeFunctionErrorMessage(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError && error.context) {
    try {
      const body = (await error.context.clone().json()) as { error?: string; skipped?: boolean }
      if (body?.error) return body.error
    } catch {
      /* fall through */
    }
  }
  if (error instanceof Error) return error.message
  return 'Email could not be sent. Check that supabase functions serve is running.'
}

export const DEFAULT_CATEGORIES: NotificationCategories = {
  schedule: true,
  time_off: true,
  payroll: true,
  feed: true,
  incidents: true,
  plans: true,
  invites: true,
  general: true,
}

export async function createHouseholdNotification(params: {
  householdId: string
  category: NotificationCategory
  title: string
  body?: string
  link?: string
  excludeUserId?: string
  targetUserIds?: string[]
}) {
  const { error } = await supabase.rpc('create_household_notification', {
    p_household_id: params.householdId,
    p_category: params.category,
    p_title: params.title,
    p_body: params.body ?? null,
    p_link: params.link ?? null,
    p_metadata: null,
    p_exclude_user_id: params.excludeUserId ?? null,
    p_target_user_ids: params.targetUserIds ?? null,
  })
  if (error) throw error
}

export async function sendInviteEmail(params: {
  to: string
  subject: string
  inviteUrl: string
  householdName: string
  inviteType: 'parent' | 'nanny'
}) {
  const { html, text } = buildInviteEmailHtml({
    householdName: params.householdName,
    inviteType: params.inviteType,
    inviteUrl: params.inviteUrl,
  })
  const { data, error } = await supabase.functions.invoke('send-email', {
    body: { to: params.to, subject: params.subject, html, text },
  })
  if (error) throw new Error(await edgeFunctionErrorMessage(error))
  const result = data as { ok?: boolean; skipped?: boolean; error?: string }
  if (result?.skipped) {
    throw new Error(
      result.error ?? 'Email is not configured. Set RESEND_API_KEY on the send-email function.',
    )
  }
  if (result?.error) throw new Error(result.error)
  return result
}

export async function sendNotificationEmail(params: {
  to: string
  subject: string
  body: string
  link?: string
  notificationId?: string
}) {
  const appUrl = window.location.origin
  const { html, text } = buildNotificationEmailHtml({
    subject: params.subject,
    body: params.body,
    appUrl,
    link: params.link,
  })
  const { data, error } = await supabase.functions.invoke('send-email', {
    body: {
      to: params.to,
      subject: params.subject,
      html,
      text,
      notificationId: params.notificationId,
    },
  })
  if (error) throw new Error(await edgeFunctionErrorMessage(error))
  return data as { ok?: boolean; skipped?: boolean }
}

export function parseMentions(text: string): string[] {
  const matches = text.match(/@\[([^\]]+)\]\(([a-f0-9-]{36})\)/g) ?? []
  return matches.map((m) => {
    const idMatch = m.match(/\(([a-f0-9-]{36})\)/)
    return idMatch?.[1] ?? ''
  }).filter(Boolean)
}

export function formatMentionDisplay(name: string, userId: string): string {
  return `@[${name}](${userId})`
}
