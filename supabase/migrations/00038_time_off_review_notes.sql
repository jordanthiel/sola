ALTER TABLE time_off_requests
  ADD COLUMN IF NOT EXISTS review_notes TEXT;

COMMENT ON COLUMN time_off_requests.review_notes IS
  'Optional note from the parent when approving or denying a request.';

-- Include reviewer note in nanny notification when status changes
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
    IF NEW.review_notes IS NOT NULL AND btrim(NEW.review_notes) <> '' THEN
      v_body := v_body || E'\n' || NEW.review_notes;
    END IF;

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
