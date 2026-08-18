-- Auto-finalize pay periods after a parent-configured edit deadline.
-- Also make payroll advance repayments idempotent when backfill already exists.

ALTER TABLE employment_settings
  ADD COLUMN IF NOT EXISTS auto_finalize_pay_periods BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_finalize_grace_days INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS payroll_hours_basis hours_basis_type NOT NULL DEFAULT 'scheduled';

ALTER TABLE employment_settings
  DROP CONSTRAINT IF EXISTS employment_settings_auto_finalize_grace_days_check;

ALTER TABLE employment_settings
  ADD CONSTRAINT employment_settings_auto_finalize_grace_days_check
  CHECK (auto_finalize_grace_days >= 0 AND auto_finalize_grace_days <= 28);

COMMENT ON COLUMN employment_settings.auto_finalize_pay_periods IS
  'When true, completed pay periods are closed automatically after the edit deadline.';
COMMENT ON COLUMN employment_settings.auto_finalize_grace_days IS
  'Calendar days after the pay period ends during which hours can still be changed.';
COMMENT ON COLUMN employment_settings.payroll_hours_basis IS
  'Hours basis used when auto-finalizing a pay period.';

CREATE OR REPLACE FUNCTION record_advance_repayments(
  p_household_id UUID,
  p_period_start DATE,
  p_repayments JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item JSONB;
  v_advance_id UUID;
  v_amount INTEGER;
  v_existing INTEGER;
  v_count INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT is_parent_role(p_household_id) THEN
    RAISE EXCEPTION 'Only parents can record repayments';
  END IF;

  IF p_repayments IS NULL OR jsonb_array_length(p_repayments) = 0 THEN
    RETURN 0;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_repayments)
  LOOP
    v_advance_id := (v_item->>'advance_id')::UUID;
    v_amount := (v_item->>'amount_cents')::INTEGER;

    IF v_amount IS NULL OR v_amount <= 0 THEN
      CONTINUE;
    END IF;

    SELECT COALESCE(SUM(amount_cents), 0) INTO v_existing
    FROM advance_repayments
    WHERE payment_advance_id = v_advance_id
      AND pay_period_start = p_period_start;

    v_amount := v_amount - v_existing;
    IF v_amount <= 0 THEN
      CONTINUE;
    END IF;

    PERFORM apply_advance_payment(
      v_advance_id,
      v_amount,
      p_period_start,
      'payroll',
      p_period_start,
      NULL
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION auto_finalize_pay_period(
  p_household_id UUID,
  p_household_nanny_id UUID,
  p_period_start DATE,
  p_period_end DATE,
  p_hours_basis hours_basis_type,
  p_snapshot JSONB,
  p_repayments JSONB DEFAULT '[]'::jsonb
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings employment_settings%ROWTYPE;
  v_close_id UUID;
  v_item JSONB;
  v_advance_id UUID;
  v_amount INTEGER;
  v_existing INTEGER;
  v_advance payment_advances%ROWTYPE;
  v_repay INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT is_household_member(p_household_id) THEN
    RAISE EXCEPTION 'Not a household member';
  END IF;
  IF p_period_start IS NULL OR p_period_end IS NULL OR p_period_end < p_period_start THEN
    RAISE EXCEPTION 'Invalid pay period';
  END IF;
  IF p_period_end >= CURRENT_DATE THEN
    RAISE EXCEPTION 'Pay period has not ended';
  END IF;

  SELECT * INTO v_settings
  FROM employment_settings
  WHERE household_id = p_household_id
    AND household_nanny_id = p_household_nanny_id
  ORDER BY effective_from DESC, created_at DESC
  LIMIT 1;

  IF v_settings.id IS NULL OR NOT v_settings.auto_finalize_pay_periods THEN
    RAISE EXCEPTION 'Auto-finalize is not enabled';
  END IF;

  IF CURRENT_DATE <= (p_period_end + v_settings.auto_finalize_grace_days) THEN
    RAISE EXCEPTION 'Edit deadline has not passed';
  END IF;

  INSERT INTO pay_period_closes (
    household_id,
    household_nanny_id,
    period_start,
    period_end,
    hours_basis,
    closed_by,
    snapshot
  )
  VALUES (
    p_household_id,
    p_household_nanny_id,
    p_period_start,
    p_period_end,
    p_hours_basis,
    auth.uid(),
    COALESCE(p_snapshot, '{}'::jsonb)
  )
  ON CONFLICT (household_id, household_nanny_id, period_start) DO NOTHING
  RETURNING id INTO v_close_id;

  IF v_close_id IS NULL THEN
    RETURN 0;
  END IF;

  IF v_settings.auto_record_advance_repayments
    AND p_repayments IS NOT NULL
    AND jsonb_typeof(p_repayments) = 'array'
    AND jsonb_array_length(p_repayments) > 0
  THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_repayments)
    LOOP
      v_advance_id := (v_item->>'advance_id')::UUID;
      v_amount := (v_item->>'amount_cents')::INTEGER;
      IF v_advance_id IS NULL OR v_amount IS NULL OR v_amount <= 0 THEN
        CONTINUE;
      END IF;

      SELECT * INTO v_advance FROM payment_advances WHERE id = v_advance_id;
      IF v_advance.id IS NULL
        OR v_advance.household_id <> p_household_id
        OR v_advance.household_nanny_id <> p_household_nanny_id
        OR v_advance.status <> 'open'
      THEN
        CONTINUE;
      END IF;

      SELECT COALESCE(SUM(amount_cents), 0) INTO v_existing
      FROM advance_repayments
      WHERE payment_advance_id = v_advance_id
        AND pay_period_start = p_period_start;

      v_repay := LEAST(v_amount - v_existing, v_advance.balance_cents);
      IF v_repay <= 0 THEN
        CONTINUE;
      END IF;

      INSERT INTO advance_repayments (
        payment_advance_id,
        household_id,
        amount_cents,
        paid_on,
        source,
        pay_period_start,
        notes
      )
      VALUES (
        v_advance_id,
        p_household_id,
        v_repay,
        p_period_start,
        'payroll',
        p_period_start,
        'Recorded on auto-finalize'
      );

      UPDATE payment_advances
      SET
        balance_cents = balance_cents - v_repay,
        status = CASE WHEN balance_cents - v_repay <= 0 THEN 'applied'::advance_status ELSE status END,
        applied_pay_period_start = COALESCE(applied_pay_period_start, p_period_start),
        updated_at = now()
      WHERE id = v_advance_id;
    END LOOP;
  END IF;

  RETURN 1;
END;
$$;

GRANT EXECUTE ON FUNCTION auto_finalize_pay_period(
  UUID, UUID, DATE, DATE, hours_basis_type, JSONB, JSONB
) TO authenticated;
