-- Gusto Embedded payroll integration

CREATE TYPE gusto_onboarding_status AS ENUM (
  'pending',
  'terms_required',
  'setup_in_progress',
  'awaiting_approval',
  'approved',
  'rejected'
);

CREATE TYPE payroll_run_status AS ENUM (
  'draft',
  'previewing',
  'ready',
  'submitted',
  'processing',
  'paid',
  'failed',
  'cancelled'
);

CREATE TABLE gusto_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL UNIQUE REFERENCES households(id) ON DELETE CASCADE,
  company_uuid TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  onboarding_status gusto_onboarding_status NOT NULL DEFAULT 'pending',
  terms_accepted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  onboarding_steps JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE gusto_employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_nanny_id UUID NOT NULL UNIQUE REFERENCES household_nannies(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  employee_uuid TEXT,
  contractor_uuid TEXT,
  worker_type TEXT NOT NULL DEFAULT 'employee' CHECK (worker_type IN ('employee', 'contractor')),
  onboarding_status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_gusto_employees_household ON gusto_employees(household_id);

CREATE TABLE payroll_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  household_nanny_id UUID NOT NULL REFERENCES household_nannies(id) ON DELETE CASCADE,
  pay_period_close_id UUID NOT NULL REFERENCES pay_period_closes(id) ON DELETE CASCADE,
  gusto_payroll_uuid TEXT,
  status payroll_run_status NOT NULL DEFAULT 'draft',
  company_debit_cents INTEGER,
  net_pay_cents INTEGER,
  tax_debit_cents INTEGER,
  preview_payload JSONB,
  error_message TEXT,
  submitted_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pay_period_close_id)
);

CREATE INDEX idx_payroll_runs_household_nanny ON payroll_runs(household_id, household_nanny_id);

CREATE TABLE gusto_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_uuid TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  resource_uuid TEXT,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Safe client view (no OAuth tokens); runs as view owner so parents never read token columns
CREATE VIEW gusto_companies_public
WITH (security_invoker = false) AS
SELECT
  id,
  household_id,
  company_uuid,
  onboarding_status,
  terms_accepted_at,
  approved_at,
  onboarding_steps,
  created_at,
  updated_at
FROM gusto_companies
WHERE is_parent_role(household_id);

ALTER TABLE gusto_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE gusto_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE gusto_webhook_events ENABLE ROW LEVEL SECURITY;

-- No authenticated policies on gusto_companies (tokens); service role only

CREATE POLICY gusto_employees_select ON gusto_employees
  FOR SELECT USING (is_household_member(household_id));

CREATE POLICY gusto_employees_parent ON gusto_employees
  FOR ALL USING (is_parent_role(household_id));

CREATE POLICY payroll_runs_select ON payroll_runs
  FOR SELECT USING (is_household_member(household_id));

CREATE POLICY payroll_runs_parent ON payroll_runs
  FOR ALL USING (is_parent_role(household_id));

-- Webhooks: service role only (no policies for authenticated users)

GRANT SELECT ON gusto_companies_public TO authenticated;

COMMENT ON TABLE gusto_companies IS 'Gusto Embedded company per household; tokens server-only via Edge Functions';
COMMENT ON TABLE payroll_runs IS 'Links closed Soola pay periods to Gusto payroll runs';
