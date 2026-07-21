export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type AccountKind = 'unset' | 'family' | 'nanny'
export type MemberRole = 'owner' | 'parent' | 'nanny'
export type MemberStatus = 'active' | 'invited' | 'inactive'
export type ScheduleStatus = 'scheduled' | 'cancelled'
export type TimeEntrySource = 'manual' | 'clock'
export type PayPeriodType = 'weekly' | 'biweekly' | 'monthly'
export type PayReportingMode = 'all_over' | 'all_under' | 'split' | 'regular_over_ot_under'
export type AdvanceStatus = 'open' | 'applied' | 'void'
export type AdvanceRepaymentMode = 'per_paycheck' | 'overtime_only'
export type TimeOffType = 'sick' | 'pto' | 'unpaid' | 'vacation'
export type TimeOffStatus = 'pending' | 'approved' | 'denied'
export type ActivityType =
  | 'meal'
  | 'nap'
  | 'outdoor'
  | 'learning'
  | 'appointment'
  | 'gymnastics'
  | 'library'
  | 'class'
  | 'playdate'
  | 'other'
export type MoodType = 'happy' | 'calm' | 'fussy' | 'tired' | 'sick'

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          display_name: string | null
          avatar_url: string | null
          account_kind: AccountKind
          notifications_read_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          display_name?: string | null
          avatar_url?: string | null
          account_kind?: AccountKind
          notifications_read_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          display_name?: string | null
          avatar_url?: string | null
          account_kind?: AccountKind
          notifications_read_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      households: {
        Row: {
          id: string
          name: string
          timezone: string
          created_by: string | null
          created_at: string
          updated_at: string
          onboarding_completed_at: string | null
        }
        Insert: {
          id?: string
          name: string
          timezone?: string
          created_by?: string | null
          created_at?: string
          updated_at?: string
          onboarding_completed_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          timezone?: string
          created_by?: string | null
          created_at?: string
          updated_at?: string
          onboarding_completed_at?: string | null
        }
        Relationships: []
      }
      household_members: {
        Row: {
          id: string
          household_id: string
          user_id: string
          role: MemberRole
          status: MemberStatus
          created_at: string
        }
        Insert: {
          id?: string
          household_id: string
          user_id: string
          role?: MemberRole
          status?: MemberStatus
          created_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          user_id?: string
          role?: MemberRole
          status?: MemberStatus
          created_at?: string
        }
        Relationships: []
      }
      household_nannies: {
        Row: {
          id: string
          household_id: string
          first_name: string
          last_name: string
          email: string
          phone: string | null
          notes: string | null
          user_id: string | null
          claim_token: string | null
          claim_token_expires_at: string | null
          claim_invite_sent_at: string | null
          claim_invite_sent_by: string | null
          claimed_at: string | null
          deactivated_at: string | null
          deactivated_by: string | null
          start_date: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          household_id: string
          first_name: string
          last_name: string
          email: string
          phone?: string | null
          notes?: string | null
          user_id?: string | null
          claim_token?: string | null
          claim_token_expires_at?: string | null
          claim_invite_sent_at?: string | null
          claim_invite_sent_by?: string | null
          claimed_at?: string | null
          deactivated_at?: string | null
          deactivated_by?: string | null
          start_date?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          first_name?: string
          last_name?: string
          email?: string
          phone?: string | null
          notes?: string | null
          user_id?: string | null
          claim_token?: string | null
          claim_token_expires_at?: string | null
          claim_invite_sent_at?: string | null
          claim_invite_sent_by?: string | null
          claimed_at?: string | null
          deactivated_at?: string | null
          deactivated_by?: string | null
          start_date?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      household_invites: {
        Row: {
          id: string
          household_id: string
          email: string
          role: MemberRole
          token: string
          invited_by: string | null
          expires_at: string
          accepted_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          household_id: string
          email: string
          role?: MemberRole
          token?: string
          invited_by?: string | null
          expires_at?: string
          accepted_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          email?: string
          role?: MemberRole
          token?: string
          invited_by?: string | null
          expires_at?: string
          accepted_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      household_holidays: {
        Row: {
          household_id: string
          holiday_key: string
          enabled: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          household_id: string
          holiday_key: string
          enabled: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          household_id?: string
          holiday_key?: string
          enabled?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      employment_settings: {
        Row: {
          id: string
          household_id: string
          household_nanny_id: string | null
          nanny_user_id: string | null
          hourly_rate_cents: number
          overtime_multiplier: number
          standard_hours_per_week: number
          pay_period: PayPeriodType
          effective_from: string
          employment_type: string
          tax_withholding_notes: string | null
          pay_reporting_mode: PayReportingMode
          over_table_percent: number
          auto_record_advance_repayments: boolean
          overnight_rate_cents: number | null
          overnight_start_time: string
          overnight_end_time: string
          vacation_daily_rate_cents: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          household_id: string
          household_nanny_id: string
          nanny_user_id?: string | null
          hourly_rate_cents?: number
          overtime_multiplier?: number
          standard_hours_per_week?: number
          pay_period?: PayPeriodType
          effective_from?: string
          employment_type?: string
          tax_withholding_notes?: string | null
          pay_reporting_mode?: PayReportingMode
          over_table_percent?: number
          auto_record_advance_repayments?: boolean
          overnight_rate_cents?: number | null
          overnight_start_time?: string
          overnight_end_time?: string
          vacation_daily_rate_cents?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          household_nanny_id?: string
          nanny_user_id?: string
          hourly_rate_cents?: number
          overtime_multiplier?: number
          standard_hours_per_week?: number
          pay_period?: PayPeriodType
          effective_from?: string
          employment_type?: string
          tax_withholding_notes?: string | null
          pay_reporting_mode?: PayReportingMode
          over_table_percent?: number
          auto_record_advance_repayments?: boolean
          overnight_rate_cents?: number | null
          overnight_start_time?: string
          overnight_end_time?: string
          vacation_daily_rate_cents?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      children: {
        Row: {
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
        Insert: {
          id?: string
          household_id: string
          name: string
          color_key?: string
          date_of_birth?: string | null
          notes?: string | null
          allergies?: string | null
          medications?: string | null
          routines?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          name?: string
          color_key?: string
          date_of_birth?: string | null
          notes?: string | null
          allergies?: string | null
          medications?: string | null
          routines?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      nanny_schedule_templates: {
        Row: {
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
        Insert: {
          id?: string
          household_id: string
          household_nanny_id: string
          day_of_week: number
          start_time: string
          end_time: string
          enabled?: boolean
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          household_nanny_id?: string
          day_of_week?: number
          start_time?: string
          end_time?: string
          enabled?: boolean
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      schedule_blocks: {
        Row: {
          id: string
          household_id: string
          household_nanny_id: string | null
          nanny_user_id: string | null
          starts_at: string
          ends_at: string
          actual_ends_at: string | null
          actual_notes: string | null
          break_minutes: number
          notes: string | null
          status: ScheduleStatus
          is_overnight: boolean
          overnight_rate_cents: number | null
          overnight_start_time: string | null
          overnight_end_time: string | null
          holiday_worked: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          household_id: string
          household_nanny_id: string
          nanny_user_id?: string | null
          starts_at: string
          ends_at: string
          actual_ends_at?: string | null
          actual_notes?: string | null
          break_minutes?: number
          notes?: string | null
          status?: ScheduleStatus
          is_overnight?: boolean
          overnight_rate_cents?: number | null
          overnight_start_time?: string | null
          overnight_end_time?: string | null
          holiday_worked?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          household_nanny_id?: string
          nanny_user_id?: string
          starts_at?: string
          ends_at?: string
          actual_ends_at?: string | null
          actual_notes?: string | null
          break_minutes?: number
          notes?: string | null
          status?: ScheduleStatus
          is_overnight?: boolean
          overnight_rate_cents?: number | null
          overnight_start_time?: string | null
          overnight_end_time?: string | null
          holiday_worked?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      time_entries: {
        Row: {
          id: string
          household_id: string
          household_nanny_id: string | null
          nanny_user_id: string | null
          schedule_block_id: string | null
          clock_in: string
          clock_out: string | null
          break_minutes: number
          source: TimeEntrySource
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          household_id: string
          household_nanny_id: string
          nanny_user_id?: string | null
          schedule_block_id?: string | null
          clock_in: string
          clock_out?: string | null
          break_minutes?: number
          source?: TimeEntrySource
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          nanny_user_id?: string
          schedule_block_id?: string | null
          clock_in?: string
          clock_out?: string | null
          break_minutes?: number
          source?: TimeEntrySource
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      overtime_adjustments: {
        Row: {
          id: string
          household_id: string
          nanny_user_id: string
          pay_period_start: string
          regular_minutes: number
          overtime_minutes: number
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          household_id: string
          nanny_user_id: string
          pay_period_start: string
          regular_minutes?: number
          overtime_minutes?: number
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          nanny_user_id?: string
          pay_period_start?: string
          regular_minutes?: number
          overtime_minutes?: number
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      advance_repayments: {
        Row: {
          id: string
          payment_advance_id: string
          household_id: string
          amount_cents: number
          paid_on: string
          source: 'payroll' | 'manual' | 'backfill'
          pay_period_start: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          payment_advance_id: string
          household_id: string
          amount_cents: number
          paid_on?: string
          source: 'payroll' | 'manual' | 'backfill'
          pay_period_start?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          payment_advance_id?: string
          household_id?: string
          amount_cents?: number
          paid_on?: string
          source?: 'payroll' | 'manual' | 'backfill'
          pay_period_start?: string | null
          notes?: string | null
          created_at?: string
        }
        Relationships: []
      }
      payment_advances: {
        Row: {
          id: string
          household_id: string
          household_nanny_id: string | null
          nanny_user_id: string | null
          amount_cents: number
          balance_cents: number
          issued_on: string
          reason: string | null
          repayment_mode: AdvanceRepaymentMode
          repayment_per_paycheck_cents: number | null
          status: AdvanceStatus
          applied_pay_period_start: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          household_id: string
          household_nanny_id: string
          nanny_user_id?: string | null
          amount_cents: number
          balance_cents?: number
          issued_on?: string
          reason?: string | null
          repayment_mode?: AdvanceRepaymentMode
          repayment_per_paycheck_cents?: number | null
          status?: AdvanceStatus
          applied_pay_period_start?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          nanny_user_id?: string
          amount_cents?: number
          balance_cents?: number
          issued_on?: string
          reason?: string | null
          repayment_mode?: AdvanceRepaymentMode
          repayment_per_paycheck_cents?: number | null
          status?: AdvanceStatus
          applied_pay_period_start?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      time_off_requests: {
        Row: {
          id: string
          household_id: string
          household_nanny_id: string | null
          nanny_user_id: string | null
          type: TimeOffType
          starts_on: string
          ends_on: string
          hours: number
          status: TimeOffStatus
          notes: string | null
          nanny_joins_vacation: boolean
          vacation_daily_rate_cents: number | null
          review_notes: string | null
          reviewed_by: string | null
          reviewed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          household_id: string
          household_nanny_id: string
          nanny_user_id?: string | null
          type: TimeOffType
          starts_on: string
          ends_on: string
          hours: number
          status?: TimeOffStatus
          notes?: string | null
          nanny_joins_vacation?: boolean
          vacation_daily_rate_cents?: number | null
          review_notes?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          household_nanny_id?: string
          nanny_user_id?: string
          type?: TimeOffType
          starts_on?: string
          ends_on?: string
          hours?: number
          status?: TimeOffStatus
          notes?: string | null
          nanny_joins_vacation?: boolean
          vacation_daily_rate_cents?: number | null
          review_notes?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      pto_balances: {
        Row: {
          id: string
          household_id: string
          household_nanny_id: string | null
          nanny_user_id: string | null
          sick_hours_accrued: number
          pto_hours_accrued: number
          sick_hours_used: number
          pto_hours_used: number
          updated_at: string
        }
        Insert: {
          id?: string
          household_id: string
          household_nanny_id: string
          nanny_user_id?: string | null
          sick_hours_accrued?: number
          pto_hours_accrued?: number
          sick_hours_used?: number
          pto_hours_used?: number
          updated_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          household_nanny_id?: string
          nanny_user_id?: string | null
          sick_hours_accrued?: number
          pto_hours_accrued?: number
          sick_hours_used?: number
          pto_hours_used?: number
          updated_at?: string
        }
        Relationships: []
      }
      child_activities: {
        Row: {
          id: string
          household_id: string
          child_id: string
          logged_by: string
          activity_type: ActivityType
          title: string
          description: string | null
          occurred_at: string
          duration_minutes: number | null
          mood: MoodType | null
          plan_group_id: string | null
          recurring_plan_id: string | null
          attendee_user_id: string | null
          attendee_household_nanny_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          household_id: string
          child_id: string
          logged_by: string
          activity_type?: ActivityType
          title: string
          description?: string | null
          occurred_at?: string
          duration_minutes?: number | null
          mood?: MoodType | null
          plan_group_id?: string | null
          recurring_plan_id?: string | null
          attendee_user_id?: string | null
          attendee_household_nanny_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          child_id?: string
          logged_by?: string
          activity_type?: ActivityType
          title?: string
          description?: string | null
          occurred_at?: string
          duration_minutes?: number | null
          mood?: MoodType | null
          plan_group_id?: string | null
          recurring_plan_id?: string | null
          attendee_user_id?: string | null
          attendee_household_nanny_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      child_activity_children: {
        Row: { activity_id: string; child_id: string }
        Insert: { activity_id: string; child_id: string }
        Update: { activity_id?: string; child_id?: string }
        Relationships: []
      }
      documents: {
        Row: {
          id: string
          household_id: string
          title: string
          storage_path: string
          category: string
          mime_type: string | null
          file_size: number | null
          household_nanny_id: string | null
          uploaded_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          household_id: string
          title: string
          storage_path: string
          category?: string
          mime_type?: string | null
          file_size?: number | null
          household_nanny_id?: string | null
          uploaded_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          title?: string
          storage_path?: string
          category?: string
          mime_type?: string | null
          file_size?: number | null
          household_nanny_id?: string | null
          uploaded_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      recurring_child_plans: {
        Row: {
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
        Insert: {
          id?: string
          household_id: string
          title: string
          activity_type?: ActivityType
          description?: string | null
          day_of_week: number
          start_time: string
          duration_minutes?: number
          child_ids: string[]
          enabled?: boolean
          repeat_starts_on?: string | null
          repeat_ends_on?: string | null
          created_by?: string | null
          attendee_user_id?: string | null
          attendee_household_nanny_id?: string | null
        }
        Update: {
          enabled?: boolean
          repeat_starts_on?: string | null
          repeat_ends_on?: string | null
          last_generated_through?: string | null
          attendee_user_id?: string | null
          attendee_household_nanny_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      child_emergency_contacts: {
        Row: {
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
        Insert: {
          id?: string
          child_id: string
          name: string
          relationship?: string | null
          phone?: string | null
          email?: string | null
          is_authorized_pickup?: boolean
          notes?: string | null
        }
        Update: Partial<{
          name: string
          relationship: string | null
          phone: string | null
          email: string | null
          is_authorized_pickup: boolean
          notes: string | null
        }>
        Relationships: []
      }
      incidents: {
        Row: {
          id: string
          household_id: string
          child_id: string | null
          reported_by: string
          occurred_at: string
          severity: string
          title: string
          description: string
          follow_up: string | null
          created_at: string
        }
        Insert: {
          id?: string
          household_id: string
          child_id?: string | null
          reported_by: string
          occurred_at?: string
          severity?: string
          title: string
          description: string
          follow_up?: string | null
        }
        Update: Partial<{
          follow_up: string | null
        }>
        Relationships: []
      }
      payroll_line_items: {
        Row: {
          id: string
          household_id: string
          household_nanny_id: string
          pay_period_start: string
          item_type: string
          amount_cents: number
          description: string | null
          miles: number | null
          rate_per_mile_cents: number | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          household_id: string
          household_nanny_id: string
          pay_period_start: string
          item_type: string
          amount_cents: number
          description?: string | null
          miles?: number | null
          rate_per_mile_cents?: number | null
          created_by?: string | null
        }
        Update: never
        Relationships: []
      }
      pay_period_closes: {
        Row: {
          id: string
          household_id: string
          household_nanny_id: string
          period_start: string
          period_end: string
          hours_basis: string
          closed_at: string
          closed_by: string | null
          snapshot: Json
          paid_at: string | null
          paid_amount_cents: number | null
          notes: string | null
        }
        Insert: {
          id?: string
          household_id: string
          household_nanny_id: string
          period_start: string
          period_end: string
          hours_basis: string
          closed_by?: string | null
          snapshot: Json
          paid_at?: string | null
          paid_amount_cents?: number | null
          notes?: string | null
        }
        Update: Partial<{
          paid_at: string | null
          paid_amount_cents: number | null
          notes: string | null
        }>
        Relationships: []
      }
      notification_preferences: {
        Row: {
          user_id: string
          household_id: string
          email_enabled: boolean
          in_app_enabled: boolean
          categories: Json
          updated_at: string
        }
        Insert: {
          user_id: string
          household_id: string
          email_enabled?: boolean
          in_app_enabled?: boolean
          categories?: Json
          updated_at?: string
        }
        Update: Partial<{
          email_enabled: boolean
          in_app_enabled: boolean
          categories: Json
          updated_at: string
        }>
        Relationships: []
      }
      notifications: {
        Row: {
          id: string
          household_id: string
          user_id: string
          category: string
          title: string
          body: string | null
          link: string | null
          metadata: Json | null
          read_at: string | null
          email_sent_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          household_id: string
          user_id: string
          category: string
          title: string
          body?: string | null
          link?: string | null
          metadata?: Json | null
        }
        Update: Partial<{ read_at: string | null; email_sent_at: string | null }>
        Relationships: []
      }
      feed_posts: {
        Row: {
          id: string
          household_id: string
          author_id: string
          body: string
          is_urgent: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          household_id: string
          author_id: string
          body: string
          is_urgent?: boolean
        }
        Update: Partial<{ body: string; is_urgent: boolean }>
        Relationships: []
      }
      feed_mentions: {
        Row: { post_id: string; mentioned_user_id: string }
        Insert: { post_id: string; mentioned_user_id: string }
        Update: never
        Relationships: []
      }
      payroll_runs: {
        Row: {
          id: string
          household_id: string
          household_nanny_id: string
          pay_period_close_id: string
          provider: string
          external_payroll_id: string | null
          status: string
          company_debit_cents: number | null
          net_pay_cents: number | null
          tax_debit_cents: number | null
          preview_payload: Json | null
          error_message: string | null
          submitted_at: string | null
          paid_at: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      nk_employers: {
        Row: {
          id: string
          household_id: string
          employer_id: string
          state: string
          admin_email: string
          first_name: string
          last_name: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          household_id: string
          employer_id: string
          state: string
          admin_email: string
          first_name: string
          last_name: string
        }
        Update: Partial<{
          state: string
          admin_email: string
          first_name: string
          last_name: string
          updated_at: string
        }>
        Relationships: []
      }
      nk_employees: {
        Row: {
          id: string
          household_nanny_id: string
          household_id: string
          employer_row_id: string
          employee_id: string
          email: string | null
          portal_url: string | null
          onboarding_status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          household_nanny_id: string
          household_id: string
          employer_row_id: string
          employee_id: string
          email?: string | null
          portal_url?: string | null
          onboarding_status?: string
        }
        Update: Partial<{
          email: string | null
          portal_url: string | null
          onboarding_status: string
          updated_at: string
        }>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      accept_household_invite: {
        Args: { invite_token: string }
        Returns: string
      }
      create_household_with_owner: {
        Args: { p_name: string; p_timezone?: string }
        Returns: string
      }
      create_nanny_invite: {
        Args: { p_household_id: string; p_email: string }
        Returns: string
      }
      create_household_member_invite: {
        Args: { p_household_id: string; p_email: string; p_role?: 'owner' | 'parent' | 'nanny' }
        Returns: string
      }
      add_nanny_by_email: {
        Args: { p_household_id: string; p_email: string }
        Returns: string
      }
      create_household_nanny: {
        Args: {
          p_household_id: string
          p_first_name: string
          p_last_name: string
          p_email: string
          p_phone?: string
          p_notes?: string
          p_start_date?: string
        }
        Returns: string
      }
      create_nanny_claim_link: {
        Args: { p_household_nanny_id: string }
        Returns: string
      }
      record_nanny_claim_invite_sent: {
        Args: { p_household_nanny_id: string }
        Returns: undefined
      }
      update_unclaimed_nanny_email: {
        Args: { p_household_nanny_id: string; p_email: string }
        Returns: undefined
      }
      deactivate_household_nanny: {
        Args: { p_household_nanny_id: string }
        Returns: undefined
      }
      claim_nanny_profile: {
        Args: { p_claim_token: string }
        Returns: string
      }
      complete_household_onboarding: {
        Args: { p_household_id: string }
        Returns: undefined
      }
      list_my_households: {
        Args: Record<string, never>
        Returns: {
          id: string
          name: string
          timezone: string
          created_by: string | null
          created_at: string
          updated_at: string
          onboarding_completed_at: string | null
          member_role: MemberRole
        }[]
      }
      get_my_session_context: {
        Args: Record<string, never>
        Returns: {
          account_kind: AccountKind
          household_id: string | null
          household_name: string | null
          member_role: MemberRole | null
          has_household_access: boolean
        }[]
      }
      ensure_schedule_from_templates: {
        Args: {
          p_household_id: string
          p_household_nanny_id: string
          p_weeks?: number
        }
        Returns: number
      }
      upsert_schedule_day: {
        Args: {
          p_household_id: string
          p_household_nanny_id: string
          p_work_date: string
          p_starts_at: string
          p_ends_at: string
          p_notes?: string | null
          p_is_overnight?: boolean
          p_overnight_rate_cents?: number | null
          p_overnight_start_time?: string | null
          p_overnight_end_time?: string | null
          p_holiday_worked?: boolean
        }
        Returns: string
      }
      report_shift_late: {
        Args: {
          p_schedule_block_id: string
          p_actual_ends_at: string
          p_notes?: string | null
        }
        Returns: string
      }
      record_advance_repayments: {
        Args: {
          p_household_id: string
          p_period_start: string
          p_repayments: { advance_id: string; amount_cents: number }[]
        }
        Returns: number
      }
      apply_advance_payment: {
        Args: {
          p_advance_id: string
          p_amount_cents: number
          p_paid_on: string
          p_source: 'payroll' | 'manual' | 'backfill'
          p_pay_period_start?: string | null
          p_notes?: string | null
        }
        Returns: string
      }
      create_household_notification: {
        Args: {
          p_household_id: string
          p_category: string
          p_title: string
          p_body?: string | null
          p_link?: string | null
          p_metadata?: Json | null
          p_exclude_user_id?: string | null
          p_target_user_ids?: string[] | null
        }
        Returns: void
      }
      generate_recurring_child_plans: {
        Args: { p_household_id: string; p_through_date?: string }
        Returns: number
      }
      user_has_feature: {
        Args: { p_feature_key: string }
        Returns: boolean
      }
      list_feature_gates_admin: {
        Args: Record<string, never>
        Returns: {
          feature_key: string
          label: string
          description: string | null
          open_to_all: boolean
          allowlist_user_ids: string[]
        }[]
      }
      update_feature_gate: {
        Args: {
          p_feature_key: string
          p_open_to_all: boolean
          p_user_ids?: string[]
        }
        Returns: undefined
      }
      search_users_for_feature_gate: {
        Args: { p_query: string; p_limit?: number }
        Returns: {
          user_id: string
          email: string
          display_name: string
        }[]
      }
      get_feature_gate_users: {
        Args: { p_user_ids: string[] }
        Returns: {
          user_id: string
          email: string
          display_name: string
        }[]
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

export type Profile = Database['public']['Tables']['profiles']['Row']
export type Household = Database['public']['Tables']['households']['Row']
export type HouseholdMember = Database['public']['Tables']['household_members']['Row']
export type HouseholdInvite = Database['public']['Tables']['household_invites']['Row']
export type HouseholdHoliday = Database['public']['Tables']['household_holidays']['Row']
export type EmploymentSetting = Database['public']['Tables']['employment_settings']['Row']
export type Child = Database['public']['Tables']['children']['Row']
export type ScheduleBlock = Database['public']['Tables']['schedule_blocks']['Row']
export type TimeEntry = Database['public']['Tables']['time_entries']['Row']
export type PaymentAdvance = Database['public']['Tables']['payment_advances']['Row']
export type TimeOffRequest = Database['public']['Tables']['time_off_requests']['Row']
export type PtoBalance = Database['public']['Tables']['pto_balances']['Row']
export type ChildActivity = Database['public']['Tables']['child_activities']['Row']

export type HouseholdMemberWithProfile = HouseholdMember & {
  profiles: Pick<Profile, 'display_name'> | null
}
