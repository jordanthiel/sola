import type { ActivityType } from '@/types/database'

export type NotificationCategory =
  | 'schedule'
  | 'time_off'
  | 'payroll'
  | 'feed'
  | 'incidents'
  | 'plans'
  | 'invites'
  | 'general'

export type NotificationCategories = Record<NotificationCategory, boolean>

export interface NotificationPreference {
  user_id: string
  household_id: string
  email_enabled: boolean
  in_app_enabled: boolean
  categories: NotificationCategories
  updated_at: string
}

export interface AppNotification {
  id: string
  household_id: string
  user_id: string
  category: NotificationCategory
  title: string
  body: string | null
  link: string | null
  metadata: Record<string, unknown> | null
  read_at: string | null
  email_sent_at: string | null
  created_at: string
}

export type DocumentCategory =
  | 'contract'
  | 'tax'
  | 'handbook'
  | 'medical'
  | 'insurance'
  | 'other'

export interface HouseholdDocument {
  id: string
  household_id: string
  title: string
  storage_path: string
  category: DocumentCategory
  mime_type: string | null
  file_size: number | null
  household_nanny_id: string | null
  uploaded_by: string | null
  created_at: string
  updated_at: string
}

export type PlanAttendeeFields = {
  attendee_user_id: string | null
  attendee_household_nanny_id: string | null
}

export interface RecurringChildPlan {
  id: string
  household_id: string
  title: string
  activity_type: ActivityType
  description: string | null
  day_of_week: number
  start_time: string
  duration_minutes: number
  child_ids: string[]
  enabled: boolean
  repeat_starts_on: string | null
  repeat_ends_on: string | null
  last_generated_through: string | null
  created_by: string | null
  attendee_user_id: string | null
  attendee_household_nanny_id: string | null
  created_at: string
  updated_at: string
}

export interface ChildEmergencyContact {
  id: string
  child_id: string
  name: string
  relationship: string | null
  phone: string | null
  email: string | null
  is_authorized_pickup: boolean
  notes: string | null
  created_at: string
}

export type IncidentSeverity = 'minor' | 'moderate' | 'serious'

export interface Incident {
  id: string
  household_id: string
  child_id: string | null
  reported_by: string
  occurred_at: string
  severity: IncidentSeverity
  title: string
  description: string
  follow_up: string | null
  created_at: string
}

export type PayrollLineItemType = 'bonus' | 'mileage' | 'reimbursement'
export type HoursBasis = 'scheduled' | 'actual'

export interface PayrollReportingSnapshot {
  regularOverCents: number
  regularUnderCents: number
  overtimeOverCents: number
  overtimeUnderCents: number
  lineItemsOverCents: number
  lineItemsUnderCents: number
  totalOverCents: number
  totalUnderCents: number
}

export interface PayrollLineItem {
  id: string
  household_id: string
  household_nanny_id: string
  pay_period_start: string
  item_type: PayrollLineItemType
  amount_cents: number
  description: string | null
  miles: number | null
  rate_per_mile_cents: number | null
  created_by: string | null
  created_at: string
}

export interface PayPeriodClose {
  id: string
  household_id: string
  household_nanny_id: string
  period_start: string
  period_end: string
  hours_basis: HoursBasis
  closed_at: string
  closed_by: string | null
  snapshot: PayrollSnapshot
  paid_at: string | null
  paid_amount_cents: number | null
  notes: string | null
}

export interface PayrollSnapshot {
  totalMinutes: number
  regularMinutes: number
  overtimeMinutes: number
  overnightMinutes?: number
  holidayMinutes?: number
  holidayWorkedMinutes?: number
  holidayPayCents?: number
  regularPayCents: number
  overtimePayCents: number
  overnightPayCents?: number
  vacationDays?: number
  vacationPayCents?: number
  grossPayCents: number
  lineItemsTotalCents: number
  advanceDeductionCents: number
  netPayCents: number
  hoursBasis: HoursBasis
  householdName?: string
  nannyName?: string
  periodLabel?: string
  taxWithholdingNotes?: string | null
  employmentType?: string | null
  reporting?: PayrollReportingSnapshot
  payReportingMode?: string | null
  payReportingLabel?: string | null
}

export interface FeedPost {
  id: string
  household_id: string
  author_id: string
  body: string
  is_urgent: boolean
  created_at: string
  updated_at: string
}

export interface FeedPostWithAuthor extends FeedPost {
  author?: { display_name: string | null }
  mentions?: { mentioned_user_id: string; display_name: string | null }[]
}

export interface ExtendedChild {
  id: string
  household_id: string
  name: string
  color_key: string
  date_of_birth: string | null
  notes: string | null
  allergies: string | null
  medications: string | null
  routines: string | null
  created_at: string
  updated_at: string
}
