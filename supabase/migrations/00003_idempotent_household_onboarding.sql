-- Idempotent onboarding: safe retries, repair orphans, profile upsert on signup

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO UPDATE
    SET display_name = COALESCE(EXCLUDED.display_name, profiles.display_name),
        updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION create_household_with_owner(
  p_name TEXT,
  p_timezone TEXT DEFAULT 'America/New_York'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hid UUID;
  existing_household UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Already in a household as owner/parent: update details and return (retry-safe)
  SELECT hm.household_id INTO existing_household
  FROM household_members hm
  WHERE hm.user_id = auth.uid()
    AND hm.status = 'active'
    AND hm.role IN ('owner'::member_role, 'parent'::member_role)
  ORDER BY hm.created_at
  LIMIT 1;

  IF existing_household IS NOT NULL THEN
    UPDATE households
    SET name = p_name, timezone = p_timezone, updated_at = now()
    WHERE id = existing_household;
    RETURN existing_household;
  END IF;

  -- Repair orphan: household created but membership row missing
  SELECT h.id INTO hid
  FROM households h
  WHERE h.created_by = auth.uid()
    AND NOT EXISTS (
      SELECT 1
      FROM household_members hm
      WHERE hm.household_id = h.id
        AND hm.user_id = auth.uid()
    )
  ORDER BY h.created_at DESC
  LIMIT 1;

  IF hid IS NOT NULL THEN
    UPDATE households
    SET name = p_name, timezone = p_timezone, updated_at = now()
    WHERE id = hid;

    INSERT INTO household_members (household_id, user_id, role, status)
    VALUES (hid, auth.uid(), 'owner', 'active')
    ON CONFLICT (household_id, user_id) DO UPDATE
      SET role = 'owner', status = 'active';

    RETURN hid;
  END IF;

  INSERT INTO households (name, timezone, created_by)
  VALUES (p_name, p_timezone, auth.uid())
  RETURNING id INTO hid;

  INSERT INTO household_members (household_id, user_id, role, status)
  VALUES (hid, auth.uid(), 'owner'::member_role, 'active');

  RETURN hid;
END;
$$;

GRANT EXECUTE ON FUNCTION create_household_with_owner(TEXT, TEXT) TO authenticated;
