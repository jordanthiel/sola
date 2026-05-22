-- In-app (and email-eligible) notifications for schedule, time off, payroll, plans, invites, general

-- Helpers
CREATE OR REPLACE FUNCTION household_caregiver_user_ids(p_household_id UUID)
RETURNS UUID[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    array_agg(DISTINCT hm.user_id) FILTER (WHERE hm.user_id IS NOT NULL),
    '{}'::uuid[]
  )
  FROM household_members hm
  WHERE hm.household_id = p_household_id
    AND hm.status = 'active'
    AND hm.role IN ('owner', 'parent');
$$;

CREATE OR REPLACE FUNCTION nanny_user_id_for_profile(p_household_nanny_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT hn.user_id
  FROM household_nannies hn
  WHERE hn.id = p_household_nanny_id
    AND hn.deactivated_at IS NULL;
$$;

-- Insert when in-app or email is enabled; respect category toggles
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
      AND hn.deactivated_at IS NULL
      AND (p_exclude_user_id IS NULL OR hn.user_id <> p_exclude_user_id)
      AND (p_target_user_ids IS NULL OR hn.user_id = ANY(p_target_user_ids))
  LOOP
    SELECT * INTO v_prefs
    FROM notification_preferences
    WHERE user_id = v_user_id AND household_id = p_household_id;

    IF NOT FOUND THEN
      v_prefs.in_app_enabled := true;
      v_prefs.email_enabled := true;
      v_prefs.categories := '{
        "schedule": true,
        "time_off": true,
        "payroll": true,
        "feed": true,
        "incidents": true,
        "plans": true,
        "invites": true,
        "general": true
      }'::jsonb;
    END IF;

    IF NOT v_prefs.in_app_enabled AND NOT v_prefs.email_enabled THEN
      CONTINUE;
    END IF;

    v_cats := COALESCE(v_prefs.categories, '{}'::jsonb);
    IF v_cats ? v_cat_key AND (v_cats->>v_cat_key)::boolean = false THEN
      CONTINUE;
    END IF;

    INSERT INTO notification_preferences (user_id, household_id)
    VALUES (v_user_id, p_household_id)
    ON CONFLICT DO NOTHING;

    INSERT INTO notifications (household_id, user_id, category, title, body, link, metadata)
    VALUES (p_household_id, v_user_id, p_category, p_title, p_body, p_link, p_metadata);
  END LOOP;
END;
$$;

-- Schedule
CREATE OR REPLACE FUNCTION notify_schedule_block()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_body TEXT;
BEGIN
  v_body := to_char(NEW.starts_at, 'Mon FMDD, YYYY HH12:MI AM') || ' – '
    || to_char(NEW.ends_at, 'HH12:MI AM');

  IF TG_OP = 'INSERT' AND NEW.status = 'scheduled' THEN
    PERFORM create_household_notification(
      NEW.household_id,
      'schedule',
      'New shift scheduled',
      v_body,
      '/schedule',
      jsonb_build_object('schedule_block_id', NEW.id),
      auth.uid(),
      NULL
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
      PERFORM create_household_notification(
        NEW.household_id,
        'schedule',
        'Shift cancelled',
        v_body,
        '/schedule',
        jsonb_build_object('schedule_block_id', NEW.id),
        auth.uid(),
        NULL
      );
    ELSIF NEW.actual_ends_at IS DISTINCT FROM OLD.actual_ends_at AND NEW.actual_ends_at IS NOT NULL THEN
      PERFORM create_household_notification(
        NEW.household_id,
        'schedule',
        'Shift hours updated',
        'Actual end: ' || to_char(NEW.actual_ends_at, 'Mon FMDD, YYYY HH12:MI AM'),
        '/schedule',
        jsonb_build_object('schedule_block_id', NEW.id),
        auth.uid(),
        NULL
      );
    ELSIF NEW.status = 'scheduled'
      AND (
        NEW.starts_at IS DISTINCT FROM OLD.starts_at
        OR NEW.ends_at IS DISTINCT FROM OLD.ends_at
        OR NEW.notes IS DISTINCT FROM OLD.notes
      )
    THEN
      PERFORM create_household_notification(
        NEW.household_id,
        'schedule',
        'Schedule updated',
        v_body,
        '/schedule',
        jsonb_build_object('schedule_block_id', NEW.id),
        auth.uid(),
        NULL
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_schedule_block_notify ON schedule_blocks;
CREATE TRIGGER trg_schedule_block_notify
  AFTER INSERT OR UPDATE ON schedule_blocks
  FOR EACH ROW
  EXECUTE FUNCTION notify_schedule_block();

-- Time off
CREATE OR REPLACE FUNCTION notify_time_off_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nanny_uid UUID;
  v_body TEXT;
  v_caregivers UUID[];
BEGIN
  v_nanny_uid := COALESCE(NEW.nanny_user_id, nanny_user_id_for_profile(NEW.household_nanny_id));
  v_body := initcap(NEW.type::text) || ': '
    || to_char(NEW.starts_on, 'Mon FMDD') || ' – ' || to_char(NEW.ends_on, 'Mon FMDD')
    || ' (' || NEW.hours::text || 'h)';

  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    v_caregivers := household_caregiver_user_ids(NEW.household_id);
    IF v_nanny_uid IS NOT NULL AND auth.uid() = v_nanny_uid THEN
      PERFORM create_household_notification(
        NEW.household_id,
        'time_off',
        'New time off request',
        v_body,
        '/time-off',
        jsonb_build_object('time_off_id', NEW.id),
        auth.uid(),
        v_caregivers
      );
    ELSIF v_nanny_uid IS NOT NULL THEN
      PERFORM create_household_notification(
        NEW.household_id,
        'time_off',
        'Time off logged for you',
        v_body,
        '/time-off',
        jsonb_build_object('time_off_id', NEW.id),
        auth.uid(),
        ARRAY[v_nanny_uid]
      );
    ELSE
      PERFORM create_household_notification(
        NEW.household_id,
        'time_off',
        'New time off entry',
        v_body,
        '/time-off',
        jsonb_build_object('time_off_id', NEW.id),
        auth.uid(),
        NULL
      );
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND NEW.status IS DISTINCT FROM OLD.status
    AND NEW.status IN ('approved', 'denied')
  THEN
    IF v_nanny_uid IS NOT NULL THEN
      PERFORM create_household_notification(
        NEW.household_id,
        'time_off',
        CASE NEW.status
          WHEN 'approved' THEN 'Time off approved'
          ELSE 'Time off denied'
        END,
        v_body,
        '/time-off',
        jsonb_build_object('time_off_id', NEW.id),
        auth.uid(),
        ARRAY[v_nanny_uid]
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_time_off_notify ON time_off_requests;
CREATE TRIGGER trg_time_off_notify
  AFTER INSERT OR UPDATE ON time_off_requests
  FOR EACH ROW
  EXECUTE FUNCTION notify_time_off_request();

-- Payroll line items
CREATE OR REPLACE FUNCTION notify_payroll_line_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nanny_uid UUID;
  v_body TEXT;
BEGIN
  v_nanny_uid := nanny_user_id_for_profile(NEW.household_nanny_id);
  v_body := initcap(replace(NEW.item_type::text, '_', ' '))
    || COALESCE(': ' || NEW.description, '');

  PERFORM create_household_notification(
    NEW.household_id,
    'payroll',
    'Payroll item added',
    v_body,
    '/payroll',
    jsonb_build_object('line_item_id', NEW.id),
    auth.uid(),
    CASE WHEN v_nanny_uid IS NOT NULL THEN ARRAY[v_nanny_uid] ELSE NULL END
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payroll_line_item_notify ON payroll_line_items;
CREATE TRIGGER trg_payroll_line_item_notify
  AFTER INSERT ON payroll_line_items
  FOR EACH ROW
  EXECUTE FUNCTION notify_payroll_line_item();

-- Pay period close / paid
CREATE OR REPLACE FUNCTION notify_pay_period_close()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nanny_uid UUID;
  v_period TEXT;
BEGIN
  v_nanny_uid := nanny_user_id_for_profile(NEW.household_nanny_id);
  v_period := to_char(NEW.period_start, 'Mon FMDD') || ' – ' || to_char(NEW.period_end, 'Mon FMDD, YYYY');

  IF TG_OP = 'INSERT' THEN
    PERFORM create_household_notification(
      NEW.household_id,
      'payroll',
      'Pay period closed',
      v_period,
      '/payroll',
      jsonb_build_object('pay_period_close_id', NEW.id),
      auth.uid(),
      CASE WHEN v_nanny_uid IS NOT NULL THEN ARRAY[v_nanny_uid] ELSE NULL END
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND NEW.paid_at IS NOT NULL
    AND OLD.paid_at IS NULL
  THEN
    PERFORM create_household_notification(
      NEW.household_id,
      'payroll',
      'Pay period marked paid',
      v_period,
      '/payroll',
      jsonb_build_object('pay_period_close_id', NEW.id),
      auth.uid(),
      CASE WHEN v_nanny_uid IS NOT NULL THEN ARRAY[v_nanny_uid] ELSE NULL END
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pay_period_close_notify ON pay_period_closes;
CREATE TRIGGER trg_pay_period_close_notify
  AFTER INSERT OR UPDATE ON pay_period_closes
  FOR EACH ROW
  EXECUTE FUNCTION notify_pay_period_close();

-- Kids' plans / activities (skip auto-generated recurring instances)
CREATE OR REPLACE FUNCTION notify_child_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.recurring_plan_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  PERFORM create_household_notification(
    NEW.household_id,
    'plans',
    'Activity logged: ' || NEW.title,
    left(COALESCE(NEW.description, ''), 200),
    '/activities',
    jsonb_build_object('activity_id', NEW.id),
    NEW.logged_by,
    NULL
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_child_activity_notify ON child_activities;
CREATE TRIGGER trg_child_activity_notify
  AFTER INSERT ON child_activities
  FOR EACH ROW
  EXECUTE FUNCTION notify_child_activity();

CREATE OR REPLACE FUNCTION notify_recurring_child_plan()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM create_household_notification(
      NEW.household_id,
      'plans',
      'Recurring plan added',
      NEW.title,
      '/activities',
      jsonb_build_object('recurring_plan_id', NEW.id),
      NEW.created_by,
      NULL
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND (
      NEW.title IS DISTINCT FROM OLD.title
      OR NEW.enabled IS DISTINCT FROM OLD.enabled
      OR NEW.day_of_week IS DISTINCT FROM OLD.day_of_week
      OR NEW.start_time IS DISTINCT FROM OLD.start_time
      OR NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes
    )
  THEN
    PERFORM create_household_notification(
      NEW.household_id,
      'plans',
      CASE WHEN NEW.enabled THEN 'Recurring plan updated' ELSE 'Recurring plan disabled' END,
      NEW.title,
      '/activities',
      jsonb_build_object('recurring_plan_id', NEW.id),
      auth.uid(),
      NULL
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recurring_plan_notify ON recurring_child_plans;
CREATE TRIGGER trg_recurring_plan_notify
  AFTER INSERT OR UPDATE ON recurring_child_plans
  FOR EACH ROW
  EXECUTE FUNCTION notify_recurring_child_plan();

-- Invites: member accepted via token
CREATE OR REPLACE FUNCTION accept_household_invite(invite_token TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv household_invites%ROWTYPE;
  user_email TEXT;
  v_member_name TEXT;
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

  UPDATE profiles
  SET
    account_kind = CASE WHEN inv.role = 'nanny' THEN 'nanny' ELSE 'family' END::account_kind,
    updated_at = now()
  WHERE id = auth.uid();

  INSERT INTO household_members (household_id, user_id, role, status)
  VALUES (inv.household_id, auth.uid(), inv.role, 'active')
  ON CONFLICT (household_id, user_id) DO UPDATE SET role = inv.role, status = 'active';

  UPDATE household_invites SET accepted_at = now() WHERE id = inv.id;

  IF inv.role = 'nanny' THEN
    INSERT INTO pto_balances (household_id, nanny_user_id)
    VALUES (inv.household_id, auth.uid())
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT COALESCE(display_name, split_part(user_email, '@', 1))
  INTO v_member_name
  FROM profiles
  WHERE id = auth.uid();

  PERFORM create_household_notification(
    inv.household_id,
    'invites',
    CASE inv.role
      WHEN 'nanny' THEN 'Nanny joined your household'
      ELSE 'New member joined your household'
    END,
    v_member_name || ' accepted their invite.',
    '/settings',
    jsonb_build_object('invite_id', inv.id, 'role', inv.role),
    auth.uid(),
    NULL
  );

  RETURN inv.household_id;
END;
$$;

-- Nanny claimed profile (fresh link only)
CREATE OR REPLACE FUNCTION claim_nanny_profile(p_claim_token TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nanny household_nannies%ROWTYPE;
  v_user_email TEXT;
  v_household_id UUID;
  v_fresh_claim BOOLEAN := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_claim_token IS NULL OR length(trim(p_claim_token)) = 0 THEN
    RAISE EXCEPTION 'Invalid or expired claim link';
  END IF;

  UPDATE profiles SET account_kind = 'nanny', updated_at = now() WHERE id = auth.uid();

  SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();

  SELECT * INTO v_nanny
  FROM household_nannies
  WHERE user_id = auth.uid()
    AND claimed_at IS NOT NULL
    AND deactivated_at IS NULL
  ORDER BY claimed_at DESC
  LIMIT 1;

  IF v_nanny.id IS NOT NULL THEN
    RETURN v_nanny.household_id;
  END IF;

  SELECT hm.household_id INTO v_household_id
  FROM household_members hm
  WHERE hm.user_id = auth.uid()
    AND hm.status = 'active'
    AND hm.role = 'nanny'
  ORDER BY hm.created_at DESC
  LIMIT 1;

  IF v_household_id IS NOT NULL THEN
    UPDATE household_nannies hn
    SET
      user_id = auth.uid(),
      claimed_at = COALESCE(hn.claimed_at, now()),
      claim_token = NULL,
      claim_token_expires_at = NULL,
      updated_at = now()
    FROM auth.users u
    WHERE hn.household_id = v_household_id
      AND hn.deactivated_at IS NULL
      AND lower(hn.email) = lower(u.email)
      AND u.id = auth.uid();
    RETURN v_household_id;
  END IF;

  SELECT * INTO v_nanny
  FROM household_nannies
  WHERE claim_token = p_claim_token
    AND deactivated_at IS NULL;

  IF v_nanny.id IS NULL THEN
    SELECT * INTO v_nanny
    FROM household_nannies
    WHERE lower(email) = lower(v_user_email)
      AND user_id = auth.uid()
      AND claimed_at IS NOT NULL
      AND deactivated_at IS NULL
    ORDER BY claimed_at DESC
    LIMIT 1;

    IF v_nanny.id IS NOT NULL THEN
      RETURN v_nanny.household_id;
    END IF;

    RAISE EXCEPTION 'Invalid or expired claim link';
  END IF;

  IF lower(v_nanny.email) <> lower(v_user_email) THEN
    RAISE EXCEPTION 'Sign in with the email on file for this nanny profile (%)', v_nanny.email;
  END IF;

  IF v_nanny.user_id IS NOT NULL AND v_nanny.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'This invite has already been claimed by another account';
  END IF;

  v_fresh_claim := v_nanny.claimed_at IS NULL OR v_nanny.user_id IS NULL;

  UPDATE household_nannies
  SET
    user_id = auth.uid(),
    claimed_at = COALESCE(claimed_at, now()),
    claim_token = NULL,
    claim_token_expires_at = NULL,
    updated_at = now()
  WHERE id = v_nanny.id;

  INSERT INTO household_members (household_id, user_id, role, status)
  VALUES (v_nanny.household_id, auth.uid(), 'nanny', 'active')
  ON CONFLICT (household_id, user_id) DO UPDATE
    SET role = 'nanny', status = 'active';

  PERFORM sync_nanny_child_records(v_nanny.id, auth.uid());

  UPDATE household_invites SET accepted_at = now()
  WHERE household_id = v_nanny.household_id
    AND lower(email) = lower(v_nanny.email)
    AND accepted_at IS NULL;

  IF v_fresh_claim THEN
    PERFORM create_household_notification(
      v_nanny.household_id,
      'invites',
      'Nanny linked their account',
      trim(v_nanny.first_name || ' ' || v_nanny.last_name) || ' joined the household.',
      '/settings/nannies/' || v_nanny.id,
      jsonb_build_object('household_nanny_id', v_nanny.id),
      auth.uid(),
      NULL
    );
  END IF;

  RETURN v_nanny.household_id;
END;
$$;

-- Deactivation
CREATE OR REPLACE FUNCTION deactivate_household_nanny(p_household_nanny_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_household_id UUID;
  v_user_id UUID;
  v_name TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT household_id, user_id, trim(first_name || ' ' || last_name)
  INTO v_household_id, v_user_id, v_name
  FROM household_nannies
  WHERE id = p_household_nanny_id;

  IF v_household_id IS NULL THEN
    RAISE EXCEPTION 'Nanny not found';
  END IF;

  IF NOT is_parent_role(v_household_id) THEN
    RAISE EXCEPTION 'Only parents can deactivate nannies';
  END IF;

  IF EXISTS (
    SELECT 1 FROM household_nannies
    WHERE id = p_household_nanny_id AND deactivated_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'This nanny is already deactivated';
  END IF;

  -- Notify while nanny is still active (deactivated profiles are excluded from delivery)
  PERFORM create_household_notification(
    v_household_id,
    'general',
    'Nanny profile deactivated',
    COALESCE(v_name, 'Nanny') || ' no longer has household access.',
    '/settings',
    jsonb_build_object('household_nanny_id', p_household_nanny_id),
    auth.uid(),
    NULL
  );

  UPDATE household_nannies
  SET
    deactivated_at = now(),
    deactivated_by = auth.uid(),
    claim_token = NULL,
    claim_token_expires_at = NULL,
    claim_invite_sent_at = NULL,
    claim_invite_sent_by = NULL,
    updated_at = now()
  WHERE id = p_household_nanny_id;

  IF v_user_id IS NOT NULL THEN
    UPDATE household_members
    SET status = 'inactive'
    WHERE household_id = v_household_id
      AND user_id = v_user_id
      AND role = 'nanny';
  END IF;
END;
$$;

-- Realtime for in-app bell + email dispatch while app is open
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;
