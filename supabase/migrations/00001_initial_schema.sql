-- Nanny Management initial schema

-- Enums
CREATE TYPE member_role AS ENUM ('owner', 'parent', 'nanny');
CREATE TYPE member_status AS ENUM ('active', 'invited');
CREATE TYPE schedule_status AS ENUM ('scheduled', 'cancelled');
CREATE TYPE time_entry_source AS ENUM ('manual', 'clock');
CREATE TYPE pay_period_type AS ENUM ('weekly', 'biweekly', 'monthly');
CREATE TYPE advance_status AS ENUM ('open', 'applied', 'void');
CREATE TYPE time_off_type AS ENUM ('sick', 'pto', 'unpaid');
CREATE TYPE time_off_status AS ENUM ('pending', 'approved', 'denied');
CREATE TYPE activity_type AS ENUM ('meal', 'nap', 'outdoor', 'learning', 'appointment', 'other');
CREATE TYPE mood_type AS ENUM ('happy', 'calm', 'fussy', 'tired', 'sick');

-- Profiles
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  notifications_read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Households
CREATE TABLE households (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE household_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role member_role NOT NULL DEFAULT 'parent',
  status member_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (household_id, user_id)
);

CREATE TABLE household_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role member_role NOT NULL DEFAULT 'nanny',
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE employment_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  nanny_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hourly_rate_cents INTEGER NOT NULL DEFAULT 0,
  overtime_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.5,
  standard_hours_per_week NUMERIC(5,2) NOT NULL DEFAULT 40,
  pay_period pay_period_type NOT NULL DEFAULT 'biweekly',
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (household_id, nanny_user_id, effective_from)
);

CREATE TABLE children (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  date_of_birth DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE schedule_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  nanny_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  notes TEXT,
  status schedule_status NOT NULL DEFAULT 'scheduled',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE TABLE time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  nanny_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  schedule_block_id UUID REFERENCES schedule_blocks(id) ON DELETE SET NULL,
  clock_in TIMESTAMPTZ NOT NULL,
  clock_out TIMESTAMPTZ,
  break_minutes INTEGER NOT NULL DEFAULT 0,
  source time_entry_source NOT NULL DEFAULT 'manual',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (break_minutes >= 0),
  CHECK (clock_out IS NULL OR clock_out > clock_in)
);

CREATE TABLE overtime_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  nanny_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pay_period_start DATE NOT NULL,
  regular_minutes INTEGER NOT NULL DEFAULT 0,
  overtime_minutes INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (household_id, nanny_user_id, pay_period_start)
);

CREATE TABLE payment_advances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  nanny_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  issued_on DATE NOT NULL DEFAULT CURRENT_DATE,
  reason TEXT,
  status advance_status NOT NULL DEFAULT 'open',
  applied_pay_period_start DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (amount_cents > 0)
);

CREATE TABLE time_off_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  nanny_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type time_off_type NOT NULL,
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  hours NUMERIC(6,2) NOT NULL,
  status time_off_status NOT NULL DEFAULT 'pending',
  notes TEXT,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on)
);

CREATE TABLE pto_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  nanny_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sick_hours_accrued NUMERIC(6,2) NOT NULL DEFAULT 0,
  pto_hours_accrued NUMERIC(6,2) NOT NULL DEFAULT 0,
  sick_hours_used NUMERIC(6,2) NOT NULL DEFAULT 0,
  pto_hours_used NUMERIC(6,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (household_id, nanny_user_id)
);

CREATE TABLE child_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  logged_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_type activity_type NOT NULL DEFAULT 'other',
  title TEXT NOT NULL,
  description TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_minutes INTEGER,
  mood mood_type,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_household_members_user ON household_members(user_id);
CREATE INDEX idx_schedule_blocks_household ON schedule_blocks(household_id, starts_at);
CREATE INDEX idx_time_entries_household ON time_entries(household_id, clock_in);
CREATE INDEX idx_child_activities_household ON child_activities(household_id, occurred_at DESC);
CREATE INDEX idx_household_invites_token ON household_invites(token);

-- RLS helpers
CREATE OR REPLACE FUNCTION is_household_member(hid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM household_members
    WHERE household_id = hid
      AND user_id = auth.uid()
      AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION has_household_role(hid UUID, roles member_role[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM household_members
    WHERE household_id = hid
      AND user_id = auth.uid()
      AND status = 'active'
      AND role = ANY(roles)
  );
$$;

CREATE OR REPLACE FUNCTION is_parent_role(hid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT has_household_role(hid, ARRAY['owner', 'parent']::member_role[]);
$$;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE employment_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE children ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE overtime_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_off_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE pto_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE child_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY profiles_select ON profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY profiles_update ON profiles FOR UPDATE USING (id = auth.uid());

-- Households
CREATE POLICY households_select ON households FOR SELECT USING (is_household_member(id));
CREATE POLICY households_insert ON households FOR INSERT WITH CHECK (created_by = auth.uid());
CREATE POLICY households_update ON households FOR UPDATE USING (is_parent_role(id));

-- Household members
CREATE POLICY hm_select ON household_members FOR SELECT USING (is_household_member(household_id));
CREATE POLICY hm_insert ON household_members FOR INSERT WITH CHECK (
  is_parent_role(household_id) OR (
    user_id = auth.uid() AND role IN ('owner', 'parent')
  )
);
CREATE POLICY hm_update ON household_members FOR UPDATE USING (is_parent_role(household_id));
CREATE POLICY hm_delete ON household_members FOR DELETE USING (is_parent_role(household_id));

-- Invites
CREATE POLICY invites_select ON household_invites FOR SELECT USING (
  is_household_member(household_id) OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
);
CREATE POLICY invites_insert ON household_invites FOR INSERT WITH CHECK (is_parent_role(household_id));
CREATE POLICY invites_update ON household_invites FOR UPDATE USING (
  is_parent_role(household_id) OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
);

-- Employment settings
CREATE POLICY es_select ON employment_settings FOR SELECT USING (is_household_member(household_id));
CREATE POLICY es_all ON employment_settings FOR ALL USING (is_parent_role(household_id));

-- Children
CREATE POLICY children_select ON children FOR SELECT USING (is_household_member(household_id));
CREATE POLICY children_all ON children FOR ALL USING (is_parent_role(household_id));

-- Schedule blocks
CREATE POLICY sb_select ON schedule_blocks FOR SELECT USING (is_household_member(household_id));
CREATE POLICY sb_parent ON schedule_blocks FOR ALL USING (is_parent_role(household_id));

-- Time entries
CREATE POLICY te_select ON time_entries FOR SELECT USING (is_household_member(household_id));
CREATE POLICY te_parent ON time_entries FOR ALL USING (is_parent_role(household_id));
CREATE POLICY te_nanny_insert ON time_entries FOR INSERT WITH CHECK (
  nanny_user_id = auth.uid() AND is_household_member(household_id)
);
CREATE POLICY te_nanny_update ON time_entries FOR UPDATE USING (
  nanny_user_id = auth.uid() AND is_household_member(household_id)
);

-- Overtime adjustments
CREATE POLICY oa_select ON overtime_adjustments FOR SELECT USING (is_household_member(household_id));
CREATE POLICY oa_all ON overtime_adjustments FOR ALL USING (is_parent_role(household_id));

-- Payment advances
CREATE POLICY pa_select ON payment_advances FOR SELECT USING (is_household_member(household_id));
CREATE POLICY pa_all ON payment_advances FOR ALL USING (is_parent_role(household_id));

-- Time off
CREATE POLICY tor_select ON time_off_requests FOR SELECT USING (is_household_member(household_id));
CREATE POLICY tor_parent ON time_off_requests FOR ALL USING (is_parent_role(household_id));
CREATE POLICY tor_nanny_insert ON time_off_requests FOR INSERT WITH CHECK (
  nanny_user_id = auth.uid() AND is_household_member(household_id)
);
CREATE POLICY tor_nanny_update ON time_off_requests FOR UPDATE USING (
  nanny_user_id = auth.uid() AND status = 'pending'
);

-- PTO balances
CREATE POLICY pto_select ON pto_balances FOR SELECT USING (is_household_member(household_id));
CREATE POLICY pto_all ON pto_balances FOR ALL USING (is_parent_role(household_id));

-- Child activities
CREATE POLICY ca_select ON child_activities FOR SELECT USING (is_household_member(household_id));
CREATE POLICY ca_insert ON child_activities FOR INSERT WITH CHECK (is_household_member(household_id) AND logged_by = auth.uid());
CREATE POLICY ca_update ON child_activities FOR UPDATE USING (
  is_parent_role(household_id) OR logged_by = auth.uid()
);
CREATE POLICY ca_delete ON child_activities FOR DELETE USING (
  is_parent_role(household_id) OR logged_by = auth.uid()
);

-- Documents
CREATE POLICY doc_select ON documents FOR SELECT USING (is_household_member(household_id));
CREATE POLICY doc_all ON documents FOR ALL USING (is_parent_role(household_id));

-- Accept invite function (callable by authenticated user)
CREATE OR REPLACE FUNCTION accept_household_invite(invite_token TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv household_invites%ROWTYPE;
  user_email TEXT;
BEGIN
  SELECT email INTO user_email FROM auth.users WHERE id = auth.uid();
  SELECT * INTO inv FROM household_invites
  WHERE token = invite_token
    AND accepted_at IS NULL
    AND expires_at > now();

  IF inv.id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired invite';
  END IF;

  IF lower(inv.email) <> lower(user_email) THEN
    RAISE EXCEPTION 'Invite email does not match your account';
  END IF;

  INSERT INTO household_members (household_id, user_id, role, status)
  VALUES (inv.household_id, auth.uid(), inv.role, 'active')
  ON CONFLICT (household_id, user_id) DO UPDATE SET role = inv.role, status = 'active';

  UPDATE household_invites SET accepted_at = now() WHERE id = inv.id;

  INSERT INTO pto_balances (household_id, nanny_user_id)
  VALUES (inv.household_id, auth.uid())
  ON CONFLICT (household_id, nanny_user_id) DO NOTHING;

  RETURN inv.household_id;
END;
$$;

GRANT EXECUTE ON FUNCTION accept_household_invite(TEXT) TO authenticated;
