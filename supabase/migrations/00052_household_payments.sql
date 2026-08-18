-- Replace Gusto Embedded with free mark-as-paid + paid NannyKeeper household payroll.

-- ---------------------------------------------------------------------------
-- Feature gate: rename gusto_payroll → household_payroll
-- ---------------------------------------------------------------------------
INSERT INTO feature_gates (feature_key, label, description, open_to_all)
VALUES (
  'household_payroll',
  'Household payroll (NannyKeeper)',
  'Paid-tier compliant household payroll via NannyKeeper (tax calc, run, W-2, Schedule H, ACH)',
  false
)
ON CONFLICT (feature_key) DO NOTHING;

INSERT INTO feature_gate_allowlist (feature_key, user_id)
SELECT 'household_payroll', user_id
FROM feature_gate_allowlist
WHERE feature_key = 'gusto_payroll'
ON CONFLICT DO NOTHING;

DELETE FROM feature_gate_allowlist WHERE feature_key = 'gusto_payroll';
DELETE FROM feature_gates WHERE feature_key = 'gusto_payroll';

-- ---------------------------------------------------------------------------
-- Drop Gusto tables / view / enum
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS gusto_companies_public;
DROP TABLE IF EXISTS gusto_webhook_events;
DROP TABLE IF EXISTS gusto_employees;
DROP TABLE IF EXISTS gusto_companies;
DROP TYPE IF EXISTS gusto_onboarding_status;

-- ---------------------------------------------------------------------------
-- Vendor-neutral payroll_runs
-- ---------------------------------------------------------------------------
ALTER TABLE payroll_runs
  RENAME COLUMN gusto_payroll_uuid TO external_payroll_id;

ALTER TABLE payroll_runs
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'nannykeeper';

COMMENT ON COLUMN payroll_runs.provider IS 'Payroll provider key, e.g. nannykeeper or manual';

-- ---------------------------------------------------------------------------
-- NannyKeeper employer / employee links
-- ---------------------------------------------------------------------------
CREATE TABLE nk_employers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL UNIQUE REFERENCES households(id) ON DELETE CASCADE,
  employer_id TEXT NOT NULL,
  state TEXT NOT NULL,
  admin_email TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE nk_employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_nanny_id UUID NOT NULL UNIQUE REFERENCES household_nannies(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  employer_row_id UUID NOT NULL REFERENCES nk_employers(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL,
  email TEXT,
  portal_url TEXT,
  onboarding_status TEXT NOT NULL DEFAULT 'created',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_nk_employees_household ON nk_employees(household_id);

ALTER TABLE nk_employers ENABLE ROW LEVEL SECURITY;
ALTER TABLE nk_employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY nk_employers_select ON nk_employers
  FOR SELECT USING (is_household_member(household_id));

CREATE POLICY nk_employers_parent ON nk_employers
  FOR ALL USING (is_parent_role(household_id));

CREATE POLICY nk_employees_select ON nk_employees
  FOR SELECT USING (is_household_member(household_id));

CREATE POLICY nk_employees_parent ON nk_employees
  FOR ALL USING (is_parent_role(household_id));
