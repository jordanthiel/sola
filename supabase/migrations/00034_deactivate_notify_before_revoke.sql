-- Notify nanny before deactivation excludes them from delivery
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
