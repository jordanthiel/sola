-- Per-household nanny paid holiday configuration (federal defaults when no row)

CREATE TABLE household_holidays (
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  holiday_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, holiday_key)
);

CREATE INDEX idx_household_holidays_household ON household_holidays(household_id);

ALTER TABLE household_holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY household_holidays_select ON household_holidays
  FOR SELECT USING (is_household_member(household_id));

CREATE POLICY household_holidays_parent ON household_holidays
  FOR ALL USING (is_parent_role(household_id));
