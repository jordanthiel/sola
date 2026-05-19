export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type MemberRole = 'owner' | 'parent' | 'nanny'
export type MemberStatus = 'active' | 'invited'
export type ScheduleStatus = 'scheduled' | 'cancelled'
export type TimeEntrySource = 'manual' | 'clock'
export type PayPeriodType = 'weekly' | 'biweekly' | 'monthly'
export type AdvanceStatus = 'open' | 'applied' | 'void'
export type TimeOffType = 'sick' | 'pto' | 'unpaid'
export type TimeOffStatus = 'pending' | 'approved' | 'denied'
export type ActivityType = 'meal' | 'nap' | 'outdoor' | 'learning' | 'appointment' | 'other'
export type MoodType = 'happy' | 'calm' | 'fussy' | 'tired' | 'sick'

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          display_name: string | null
          avatar_url: string | null
          notifications_read_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          display_name?: string | null
          avatar_url?: string | null
          notifications_read_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          display_name?: string | null
          avatar_url?: string | null
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
        }
        Insert: {
          id?: string
          name: string
          timezone?: string
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          timezone?: string
          created_by?: string | null
          created_at?: string
          updated_at?: string
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
          claimed_at: string | null
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
          claimed_at?: string | null
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
          claimed_at?: string | null
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
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          nanny_user_id?: string
          hourly_rate_cents?: number
          overtime_multiplier?: number
          standard_hours_per_week?: number
          pay_period?: PayPeriodType
          effective_from?: string
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
          date_of_birth: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          household_id: string
          name: string
          date_of_birth?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          name?: string
          date_of_birth?: string | null
          notes?: string | null
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
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          nanny_user_id?: string
          starts_at?: string
          ends_at?: string
          actual_ends_at?: string | null
          actual_notes?: string | null
          break_minutes?: number
          notes?: string | null
          status?: ScheduleStatus
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
      payment_advances: {
        Row: {
          id: string
          household_id: string
          household_nanny_id: string | null
          nanny_user_id: string | null
          amount_cents: number
          issued_on: string
          reason: string | null
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
          issued_on?: string
          reason?: string | null
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
          issued_on?: string
          reason?: string | null
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
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          nanny_user_id?: string
          type?: TimeOffType
          starts_on?: string
          ends_on?: string
          hours?: number
          status?: TimeOffStatus
          notes?: string | null
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
          nanny_user_id: string
          sick_hours_accrued?: number
          pto_hours_accrued?: number
          sick_hours_used?: number
          pto_hours_used?: number
          updated_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          nanny_user_id?: string
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
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          id: string
          household_id: string
          title: string
          storage_path: string
          uploaded_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          household_id: string
          title: string
          storage_path: string
          uploaded_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          title?: string
          storage_path?: string
          uploaded_by?: string | null
          created_at?: string
        }
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
        }
        Returns: string
      }
      create_nanny_claim_link: {
        Args: { p_household_nanny_id: string }
        Returns: string
      }
      claim_nanny_profile: {
        Args: { p_claim_token: string }
        Returns: string
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
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

export type Profile = Database['public']['Tables']['profiles']['Row']
export type Household = Database['public']['Tables']['households']['Row']
export type HouseholdMember = Database['public']['Tables']['household_members']['Row']
export type HouseholdInvite = Database['public']['Tables']['household_invites']['Row']
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
