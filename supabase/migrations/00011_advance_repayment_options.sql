CREATE TYPE advance_repayment_mode AS ENUM ('per_paycheck', 'overtime_only');

ALTER TABLE payment_advances
  ADD COLUMN balance_cents INTEGER,
  ADD COLUMN repayment_mode advance_repayment_mode NOT NULL DEFAULT 'per_paycheck',
  ADD COLUMN repayment_per_paycheck_cents INTEGER;

UPDATE payment_advances
SET balance_cents = CASE
  WHEN status = 'applied' THEN 0
  ELSE amount_cents
END
WHERE balance_cents IS NULL;

UPDATE payment_advances
SET repayment_per_paycheck_cents = amount_cents
WHERE repayment_mode = 'per_paycheck'
  AND repayment_per_paycheck_cents IS NULL;

ALTER TABLE payment_advances
  ALTER COLUMN balance_cents SET NOT NULL;

ALTER TABLE payment_advances
  ADD CONSTRAINT payment_advances_balance_valid
  CHECK (balance_cents >= 0 AND balance_cents <= amount_cents);

ALTER TABLE payment_advances
  ADD CONSTRAINT payment_advances_repayment_per_paycheck
  CHECK (
    repayment_mode = 'overtime_only'
    OR (repayment_per_paycheck_cents IS NOT NULL AND repayment_per_paycheck_cents > 0)
  );

-- Record repayments for a pay period (reduces balances)
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
  v_balance INTEGER;
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

    SELECT balance_cents INTO v_balance
    FROM payment_advances
    WHERE id = v_advance_id
      AND household_id = p_household_id
      AND status = 'open';

    IF v_balance IS NULL THEN
      CONTINUE;
    END IF;

    v_amount := LEAST(v_amount, v_balance);

    UPDATE payment_advances
    SET
      balance_cents = balance_cents - v_amount,
      status = CASE WHEN balance_cents - v_amount <= 0 THEN 'applied'::advance_status ELSE status END,
      applied_pay_period_start = p_period_start,
      updated_at = now()
    WHERE id = v_advance_id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION record_advance_repayments(UUID, DATE, JSONB) TO authenticated;
