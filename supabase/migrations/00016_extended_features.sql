-- Extended features: notifications, feed, payroll extras, child care, recurring plans, incidents

-- Enums
CREATE TYPE notification_category AS ENUM (
  'schedule', 'time_off', 'payroll', 'feed', 'incidents', 'plans', 'invites', 'general'
);
CREATE TYPE payroll_line_item_type AS ENUM ('bonus', 'mileage', 'reimbursement');
CREATE TYPE hours_basis_type AS ENUM ('scheduled', 'actual');
CREATE TYPE incident_severity AS ENUM ('minor', 'moderate', 'serious');
CREATE TYPE document_category AS ENUM (
  'contract', 'tax', 'handbook', 'medical', 'insurance', 'other'
);

-- Children care sheet
ALTER TABLE children
  ADD COLUMN IF NOT EXISTS allergies TEXT,
  ADD COLUMN IF NOT EXISTS medications TEXT,
  ADD COLUMN IF NOT EXISTS routines TEXT;

-- Employment tax notes
ALTER TABLE employment_settings
  ADD COLUMN IF NOT EXISTS tax_withholding_notes TEXT,
  ADD COLUMN IF NOT EXISTS employment_type TEXT NOT NULL DEFAULT 'household';

-- Documents metadata
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS category document_category NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS mime_type TEXT,
  ADD COLUMN IF NOT EXISTS file_size INTEGER,
  ADD COLUMN IF NOT EXISTS household_nanny_id UUID REFERENCES household_nannies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Multi-child plans
ALTER TABLE child_activities
  ADD COLUMN IF NOT EXISTS plan_group_id UUID,
  ADD COLUMN IF NOT EXISTS recurring_plan_id UUID;

CREATE TABLE child_activity_children (
  activity_id UUID NOT NULL REFERENCES child_activities(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  PRIMARY KEY (activity_id, child_id)
);

CREATE INDEX idx_child_activity_children_child ON child_activity_children(child_id);

-- Recurring kids' plans
CREATE TABLE recurring_child_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  activity_type activity_type NOT NULL DEFAULT 'other',
  description TEXT,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time TIME NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60 CHECK (duration_minutes > 0),
  child_ids UUID[] NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_generated_through DATE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_recurring_plans_household ON recurring_child_plans(household_id);

-- Emergency contacts
CREATE TABLE child_emergency_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  relationship TEXT,
  phone TEXT,
  email TEXT,
  is_authorized_pickup BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_emergency_contacts_child ON child_emergency_contacts(child_id);

-- Incidents
CREATE TABLE incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  child_id UUID REFERENCES children(id) ON DELETE SET NULL,
  reported_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  severity incident_severity NOT NULL DEFAULT 'minor',
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  follow_up TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_incidents_household ON incidents(household_id, occurred_at DESC);

-- Payroll line items
CREATE TABLE payroll_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  household_nanny_id UUID NOT NULL REFERENCES household_nannies(id) ON DELETE CASCADE,
  pay_period_start DATE NOT NULL,
  item_type payroll_line_item_type NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  description TEXT,
  miles NUMERIC(8,2),
  rate_per_mile_cents INTEGER,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payroll_line_items_period ON payroll_line_items(
  household_id, household_nanny_id, pay_period_start
);

-- Pay period closes
CREATE TABLE pay_period_closes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  household_nanny_id UUID NOT NULL REFERENCES household_nannies(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  hours_basis hours_basis_type NOT NULL DEFAULT 'scheduled',
  closed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  snapshot JSONB NOT NULL,
  paid_at TIMESTAMPTZ,
  paid_amount_cents INTEGER,
  notes TEXT,
  UNIQUE (household_id, household_nanny_id, period_start)
);

-- Notification preferences
CREATE TABLE notification_preferences (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  in_app_enabled BOOLEAN NOT NULL DEFAULT true,
  categories JSONB NOT NULL DEFAULT '{
    "schedule": true,
    "time_off": true,
    "payroll": true,
    "feed": true,
    "incidents": true,
    "plans": true,
    "invites": true,
    "general": true
  }'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, household_id)
);

-- Notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category notification_category NOT NULL DEFAULT 'general',
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  metadata JSONB,
  read_at TIMESTAMPTZ,
  email_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications(user_id) WHERE read_at IS NULL;

-- Feed
CREATE TABLE feed_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  is_urgent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_feed_posts_household ON feed_posts(household_id, created_at DESC);

CREATE TABLE feed_mentions (
  post_id UUID NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
  mentioned_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, mentioned_user_id)
);

-- RLS
ALTER TABLE child_activity_children ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_child_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE child_emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE pay_period_closes ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_mentions ENABLE ROW LEVEL SECURITY;

CREATE POLICY cac_select ON child_activity_children FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM child_activities ca
    WHERE ca.id = activity_id AND is_household_member(ca.household_id)
  ));
CREATE POLICY cac_write ON child_activity_children FOR ALL
  USING (EXISTS (
    SELECT 1 FROM child_activities ca
    WHERE ca.id = activity_id AND is_household_member(ca.household_id)
  ));

CREATE POLICY rcp_select ON recurring_child_plans FOR SELECT
  USING (is_household_member(household_id));
CREATE POLICY rcp_parent ON recurring_child_plans FOR ALL
  USING (is_parent_role(household_id));
CREATE POLICY rcp_nanny ON recurring_child_plans FOR INSERT
  WITH CHECK (is_household_member(household_id));
CREATE POLICY rcp_nanny_update ON recurring_child_plans FOR UPDATE
  USING (is_household_member(household_id));

CREATE POLICY ecc_select ON child_emergency_contacts FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM children c
    WHERE c.id = child_id AND is_household_member(c.household_id)
  ));
CREATE POLICY ecc_parent ON child_emergency_contacts FOR ALL
  USING (EXISTS (
    SELECT 1 FROM children c
    WHERE c.id = child_id AND is_parent_role(c.household_id)
  ));

CREATE POLICY inc_select ON incidents FOR SELECT
  USING (is_household_member(household_id));
CREATE POLICY inc_insert ON incidents FOR INSERT
  WITH CHECK (is_household_member(household_id) AND reported_by = auth.uid());
CREATE POLICY inc_parent ON incidents FOR UPDATE
  USING (is_parent_role(household_id));

CREATE POLICY pli_select ON payroll_line_items FOR SELECT
  USING (is_household_member(household_id));
CREATE POLICY pli_parent ON payroll_line_items FOR ALL
  USING (is_parent_role(household_id));

CREATE POLICY ppc_select ON pay_period_closes FOR SELECT
  USING (is_household_member(household_id));
CREATE POLICY ppc_parent ON pay_period_closes FOR ALL
  USING (is_parent_role(household_id));

CREATE POLICY npref_self ON notification_preferences FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY notif_self ON notifications FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY notif_self_update ON notifications FOR UPDATE
  USING (user_id = auth.uid());
CREATE POLICY notif_insert ON notifications FOR INSERT
  WITH CHECK (is_household_member(household_id));

CREATE POLICY feed_select ON feed_posts FOR SELECT
  USING (is_household_member(household_id));
CREATE POLICY feed_insert ON feed_posts FOR INSERT
  WITH CHECK (is_household_member(household_id) AND author_id = auth.uid());
CREATE POLICY feed_update ON feed_posts FOR UPDATE
  USING (author_id = auth.uid());
CREATE POLICY feed_delete ON feed_posts FOR DELETE
  USING (author_id = auth.uid() OR is_parent_role(household_id));

CREATE POLICY fm_select ON feed_mentions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM feed_posts fp
    WHERE fp.id = post_id AND is_household_member(fp.household_id)
  ));
CREATE POLICY fm_insert ON feed_mentions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM feed_posts fp
    WHERE fp.id = post_id AND is_household_member(fp.household_id)
  ));

-- Documents policies (table existed)
DROP POLICY IF EXISTS doc_select ON documents;
DROP POLICY IF EXISTS doc_all ON documents;
CREATE POLICY doc_select ON documents FOR SELECT
  USING (is_household_member(household_id));
CREATE POLICY doc_all ON documents FOR ALL
  USING (is_parent_role(household_id));
CREATE POLICY doc_nanny_insert ON documents FOR INSERT
  WITH CHECK (is_household_member(household_id));

-- Create notification for household members
CREATE OR REPLACE FUNCTION create_household_notification(
  p_household_id UUID,
  p_category notification_category,
  p_title TEXT,
  p_body TEXT DEFAULT NULL,
  p_link TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL,
  p_exclude_user_id UUID DEFAULT NULL,
  p_target_user_ids UUID[] DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_prefs notification_preferences%ROWTYPE;
  v_cats JSONB;
  v_cat_key TEXT;
BEGIN
  v_cat_key := p_category::text;

  FOR v_user_id IN
    SELECT DISTINCT hm.user_id
    FROM household_members hm
    WHERE hm.household_id = p_household_id
      AND hm.status = 'active'
      AND (p_exclude_user_id IS NULL OR hm.user_id <> p_exclude_user_id)
      AND (p_target_user_ids IS NULL OR hm.user_id = ANY(p_target_user_ids))
    UNION
    SELECT DISTINCT hn.user_id
    FROM household_nannies hn
    WHERE hn.household_id = p_household_id
      AND hn.user_id IS NOT NULL
      AND (p_exclude_user_id IS NULL OR hn.user_id <> p_exclude_user_id)
      AND (p_target_user_ids IS NULL OR hn.user_id = ANY(p_target_user_ids))
  LOOP
    SELECT * INTO v_prefs
    FROM notification_preferences
    WHERE user_id = v_user_id AND household_id = p_household_id;

    IF NOT FOUND THEN
      INSERT INTO notification_preferences (user_id, household_id)
      VALUES (v_user_id, p_household_id)
      ON CONFLICT DO NOTHING;
      v_prefs.in_app_enabled := true;
      v_prefs.categories := '{"schedule":true,"time_off":true,"payroll":true,"feed":true,"incidents":true,"plans":true,"invites":true,"general":true}'::jsonb;
    END IF;

    IF NOT v_prefs.in_app_enabled THEN
      CONTINUE;
    END IF;

    v_cats := COALESCE(v_prefs.categories, '{}'::jsonb);
    IF v_cats ? v_cat_key AND (v_cats->>v_cat_key)::boolean = false THEN
      CONTINUE;
    END IF;

    INSERT INTO notifications (household_id, user_id, category, title, body, link, metadata)
    VALUES (p_household_id, v_user_id, p_category, p_title, p_body, p_link, p_metadata);
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION create_household_notification TO authenticated;

-- Generate recurring child plans for upcoming weeks
CREATE OR REPLACE FUNCTION generate_recurring_child_plans(
  p_household_id UUID,
  p_through_date DATE DEFAULT (CURRENT_DATE + interval '56 days')::date
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan recurring_child_plans%ROWTYPE;
  v_d DATE;
  v_start TIMESTAMPTZ;
  v_group UUID;
  v_child UUID;
  v_count INTEGER := 0;
  v_from DATE;
BEGIN
  IF NOT is_household_member(p_household_id) THEN
    RAISE EXCEPTION 'Not a household member';
  END IF;

  FOR v_plan IN
    SELECT * FROM recurring_child_plans
    WHERE household_id = p_household_id AND enabled = true
  LOOP
    v_from := COALESCE(v_plan.last_generated_through, CURRENT_DATE - 1) + 1;
    IF v_from < CURRENT_DATE THEN
      v_from := CURRENT_DATE;
    END IF;

    v_d := v_from;
    WHILE v_d <= p_through_date LOOP
      IF EXTRACT(DOW FROM v_d)::int = v_plan.day_of_week THEN
        v_start := (v_d::text || ' ' || v_plan.start_time::text)::timestamptz;

        IF NOT EXISTS (
          SELECT 1 FROM child_activities ca
          WHERE ca.recurring_plan_id = v_plan.id
            AND ca.occurred_at::date = v_d
        ) THEN
          v_group := gen_random_uuid();
          FOREACH v_child IN ARRAY v_plan.child_ids LOOP
            INSERT INTO child_activities (
              household_id, child_id, logged_by, activity_type, title,
              description, occurred_at, duration_minutes, recurring_plan_id, plan_group_id
            ) VALUES (
              v_plan.household_id,
              v_child,
              COALESCE(v_plan.created_by, auth.uid()),
              v_plan.activity_type,
              v_plan.title,
              v_plan.description,
              v_start,
              v_plan.duration_minutes,
              v_plan.id,
              CASE WHEN array_length(v_plan.child_ids, 1) > 1 THEN v_group ELSE NULL END
            );
            INSERT INTO child_activity_children (activity_id, child_id)
            SELECT ca.id, v_child
            FROM child_activities ca
            WHERE ca.recurring_plan_id = v_plan.id AND ca.occurred_at::date = v_d AND ca.child_id = v_child
            ON CONFLICT DO NOTHING;
            v_count := v_count + 1;
          END LOOP;
        END IF;
      END IF;
      v_d := v_d + 1;
    END LOOP;

    UPDATE recurring_child_plans
    SET last_generated_through = p_through_date, updated_at = now()
    WHERE id = v_plan.id;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION generate_recurring_child_plans(UUID, DATE) TO authenticated;

-- Feed post with mentions triggers notifications
CREATE OR REPLACE FUNCTION notify_feed_post()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM create_household_notification(
    NEW.household_id,
    'feed',
    CASE WHEN NEW.is_urgent THEN 'Urgent: New feed post' ELSE 'New feed post' END,
    left(NEW.body, 200),
    '/feed',
    jsonb_build_object('post_id', NEW.id),
    NEW.author_id,
    NULL
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_feed_post_notify
  AFTER INSERT ON feed_posts
  FOR EACH ROW EXECUTE FUNCTION notify_feed_post();

CREATE OR REPLACE FUNCTION notify_feed_mention()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post feed_posts%ROWTYPE;
BEGIN
  SELECT * INTO v_post FROM feed_posts WHERE id = NEW.post_id;
  PERFORM create_household_notification(
    v_post.household_id,
    'feed',
    'You were mentioned',
    left(v_post.body, 200),
    '/feed',
    jsonb_build_object('post_id', NEW.post_id),
    v_post.author_id,
    ARRAY[NEW.mentioned_user_id]
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_feed_mention_notify
  AFTER INSERT ON feed_mentions
  FOR EACH ROW EXECUTE FUNCTION notify_feed_mention();

CREATE OR REPLACE FUNCTION notify_incident()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM create_household_notification(
    NEW.household_id,
    'incidents',
    'Incident reported: ' || NEW.title,
    left(NEW.description, 200),
    '/incidents',
    jsonb_build_object('incident_id', NEW.id),
    NEW.reported_by,
    NULL
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_incident_notify
  AFTER INSERT ON incidents
  FOR EACH ROW EXECUTE FUNCTION notify_incident();
