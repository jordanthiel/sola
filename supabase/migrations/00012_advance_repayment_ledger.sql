CREATE TYPE advance_repayment_source AS ENUM ('payroll', 'manual', 'backfill');

CREATE TABLE advance_repayments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_advance_id UUID NOT NULL REFERENCES payment_advances(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  paid_on DATE NOT NULL DEFAULT CURRENT_DATE,
  source advance_repayment_source NOT NULL,
  pay_period_start DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_advance_repayments_advance ON advance_repayments(payment_advance_id, paid_on DESC);

ALTER TABLE advance_repayments ENABLE ROW LEVEL SECURITY;

CREATE POLICY ar_select ON advance_repayments FOR SELECT USING (is_household_member(household_id));
CREATE POLICY ar_parent ON advance_repayments FOR ALL USING (is_parent_role(household_id));

-- Apply a payment and reduce advance balance (single source of truth)
CREATE OR REPLACE FUNCTION apply_advance_payment(
  p_advance_id UUID,
  p_amount_cents INTEGER,
  p_paid_on DATE,
  p_source advance_repayment_source,
  p_pay_period_start DATE DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_advance payment_advances%ROWTYPE;
  v_amount INTEGER;
  v_repayment_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_advance FROM payment_advances WHERE id = p_advance_id;
  IF v_advance.id IS NULL THEN
    RAISE EXCEPTION 'Advance not found';
  END IF;

  IF p_source = 'manual' OR p_source = 'backfill' THEN
    IF NOT is_parent_role(v_advance.household_id) THEN
      RAISE EXCEPTION 'Only parents can record manual or backfill payments';
    END IF;
  ELSIF p_source = 'payroll' THEN
    IF NOT is_parent_role(v_advance.household_id) THEN
      RAISE EXCEPTION 'Only parents can record payroll repayments';
    END IF;
  END IF;

  IF v_advance.status <> 'open' THEN
    RAISE EXCEPTION 'Advance is not open for repayment';
  END IF;

  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be positive';
  END IF;

  v_amount := LEAST(p_amount_cents, v_advance.balance_cents);

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
    p_advance_id,
    v_advance.household_id,
    v_amount,
    COALESCE(p_paid_on, CURRENT_DATE),
    p_source,
    p_pay_period_start,
    p_notes
  )
  RETURNING id INTO v_repayment_id;

  UPDATE payment_advances
  SET
    balance_cents = balance_cents - v_amount,
    status = CASE WHEN balance_cents - v_amount <= 0 THEN 'applied'::advance_status ELSE status END,
    applied_pay_period_start = COALESCE(p_pay_period_start, applied_pay_period_start),
    updated_at = now()
  WHERE id = p_advance_id;

  RETURN v_repayment_id;
END;
$$;

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

GRANT EXECUTE ON FUNCTION apply_advance_payment(UUID, INTEGER, DATE, advance_repayment_source, DATE, TEXT) TO authenticated;
