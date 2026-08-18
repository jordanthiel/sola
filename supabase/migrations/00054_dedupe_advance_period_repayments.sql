-- Remove backfill rows that duplicate an in-app payroll repayment for the same
-- pay period, restore advance balances, and keep pre-platform backfill from
-- being recorded again once payroll exists for that period.

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
  v_period_start DATE;
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

  v_period_start := COALESCE(p_pay_period_start, CASE WHEN p_source = 'payroll' THEN p_paid_on ELSE NULL END);

  IF p_source = 'backfill' AND v_period_start IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM advance_repayments
      WHERE payment_advance_id = p_advance_id
        AND source = 'payroll'
        AND COALESCE(pay_period_start, paid_on) = v_period_start
    ) THEN
      RAISE EXCEPTION 'This pay period already has a payroll repayment';
    END IF;
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

-- Payroll is dated on period start; backfill was dated on period end (weekly +6, biweekly +13).
WITH dups AS (
  SELECT DISTINCT ON (b.id)
    b.id,
    b.payment_advance_id,
    b.amount_cents
  FROM advance_repayments b
  INNER JOIN advance_repayments p
    ON p.payment_advance_id = b.payment_advance_id
   AND p.source = 'payroll'
  WHERE b.source = 'backfill'
    AND (
      (
        b.pay_period_start IS NOT NULL
        AND b.pay_period_start = COALESCE(p.pay_period_start, p.paid_on)
      )
      OR b.paid_on = (COALESCE(p.pay_period_start, p.paid_on) + 6)
      OR b.paid_on = (COALESCE(p.pay_period_start, p.paid_on) + 13)
    )
  ORDER BY b.id
),
updated AS (
  UPDATE payment_advances pa
  SET
    balance_cents = LEAST(pa.amount_cents, pa.balance_cents + d.total_cents),
    status = CASE
      WHEN pa.status = 'void' THEN pa.status
      WHEN LEAST(pa.amount_cents, pa.balance_cents + d.total_cents) > 0 THEN 'open'::advance_status
      ELSE pa.status
    END,
    updated_at = now()
  FROM (
    SELECT payment_advance_id, SUM(amount_cents)::integer AS total_cents
    FROM dups
    GROUP BY payment_advance_id
  ) d
  WHERE pa.id = d.payment_advance_id
  RETURNING pa.id
),
deleted AS (
  DELETE FROM advance_repayments ar
  USING dups
  WHERE ar.id = dups.id
  RETURNING ar.id
)
SELECT
  (SELECT count(*) FROM deleted) AS removed_backfill_rows,
  (SELECT count(*) FROM updated) AS advances_restored;

-- Collapse extra backfill rows for the same period (keep the earliest).
WITH extra AS (
  SELECT id, payment_advance_id, amount_cents
  FROM (
    SELECT
      id,
      payment_advance_id,
      amount_cents,
      ROW_NUMBER() OVER (
        PARTITION BY payment_advance_id, pay_period_start
        ORDER BY created_at, id
      ) AS rn
    FROM advance_repayments
    WHERE source = 'backfill'
      AND pay_period_start IS NOT NULL
  ) ranked
  WHERE rn > 1
),
updated AS (
  UPDATE payment_advances pa
  SET
    balance_cents = LEAST(pa.amount_cents, pa.balance_cents + d.total_cents),
    status = CASE
      WHEN pa.status = 'void' THEN pa.status
      WHEN LEAST(pa.amount_cents, pa.balance_cents + d.total_cents) > 0 THEN 'open'::advance_status
      ELSE pa.status
    END,
    updated_at = now()
  FROM (
    SELECT payment_advance_id, SUM(amount_cents)::integer AS total_cents
    FROM extra
    GROUP BY payment_advance_id
  ) d
  WHERE pa.id = d.payment_advance_id
  RETURNING pa.id
),
deleted AS (
  DELETE FROM advance_repayments ar
  USING extra
  WHERE ar.id = extra.id
  RETURNING ar.id
)
SELECT count(*) FROM deleted;

CREATE UNIQUE INDEX IF NOT EXISTS advance_repayments_one_backfill_per_period
  ON advance_repayments (payment_advance_id, pay_period_start)
  WHERE pay_period_start IS NOT NULL AND source = 'backfill';
