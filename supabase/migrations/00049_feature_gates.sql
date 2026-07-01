-- Reusable feature gating: open to all, or allowlisted users only.

CREATE TABLE feature_gates (
  feature_key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT,
  open_to_all BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE feature_gate_allowlist (
  feature_key TEXT NOT NULL REFERENCES feature_gates(feature_key) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (feature_key, user_id)
);

CREATE INDEX idx_feature_gate_allowlist_user ON feature_gate_allowlist(user_id);

CREATE OR REPLACE FUNCTION user_has_feature_for_user(p_user_id UUID, p_feature_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT fg.open_to_all OR EXISTS (
        SELECT 1 FROM feature_gate_allowlist a
        WHERE a.feature_key = fg.feature_key AND a.user_id = p_user_id
      )
      FROM feature_gates fg
      WHERE fg.feature_key = p_feature_key
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION user_has_feature_for_user(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION user_has_feature_for_user(UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION user_has_feature(p_feature_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_has_feature_for_user(auth.uid(), p_feature_key);
$$;

GRANT EXECUTE ON FUNCTION user_has_feature(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION list_feature_gates_admin()
RETURNS TABLE (
  feature_key TEXT,
  label TEXT,
  description TEXT,
  open_to_all BOOLEAN,
  allowlist_user_ids UUID[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT user_has_feature_for_user(auth.uid(), 'feature_gate_admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN QUERY
  SELECT
    fg.feature_key,
    fg.label,
    fg.description,
    fg.open_to_all,
    COALESCE(
      array_agg(a.user_id ORDER BY a.created_at) FILTER (WHERE a.user_id IS NOT NULL),
      ARRAY[]::UUID[]
    ) AS allowlist_user_ids
  FROM feature_gates fg
  LEFT JOIN feature_gate_allowlist a ON a.feature_key = fg.feature_key
  GROUP BY fg.feature_key, fg.label, fg.description, fg.open_to_all
  ORDER BY fg.feature_key;
END;
$$;

GRANT EXECUTE ON FUNCTION list_feature_gates_admin() TO authenticated;

CREATE OR REPLACE FUNCTION update_feature_gate(
  p_feature_key TEXT,
  p_open_to_all BOOLEAN,
  p_user_ids UUID[] DEFAULT ARRAY[]::UUID[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT user_has_feature_for_user(auth.uid(), 'feature_gate_admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM feature_gates WHERE feature_key = p_feature_key) THEN
    RAISE EXCEPTION 'Unknown feature: %', p_feature_key;
  END IF;

  UPDATE feature_gates
  SET open_to_all = p_open_to_all, updated_at = now()
  WHERE feature_key = p_feature_key;

  DELETE FROM feature_gate_allowlist WHERE feature_key = p_feature_key;

  IF NOT p_open_to_all AND p_user_ids IS NOT NULL AND array_length(p_user_ids, 1) > 0 THEN
    INSERT INTO feature_gate_allowlist (feature_key, user_id)
    SELECT p_feature_key, uid
    FROM unnest(p_user_ids) AS uid
    WHERE uid IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION update_feature_gate(TEXT, BOOLEAN, UUID[]) TO authenticated;

CREATE OR REPLACE FUNCTION search_users_for_feature_gate(p_query TEXT, p_limit INT DEFAULT 20)
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  display_name TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q TEXT := lower(trim(p_query));
BEGIN
  IF NOT user_has_feature_for_user(auth.uid(), 'feature_gate_admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF length(q) < 2 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email::TEXT,
    COALESCE(p.display_name, split_part(u.email, '@', 1))::TEXT
  FROM auth.users u
  LEFT JOIN profiles p ON p.id = u.id
  WHERE lower(u.email) LIKE '%' || q || '%'
     OR lower(COALESCE(p.display_name, '')) LIKE '%' || q || '%'
  ORDER BY u.email
  LIMIT LEAST(GREATEST(p_limit, 1), 50);
END;
$$;

GRANT EXECUTE ON FUNCTION search_users_for_feature_gate(TEXT, INT) TO authenticated;

CREATE OR REPLACE FUNCTION get_feature_gate_users(p_user_ids UUID[])
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  display_name TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT user_has_feature_for_user(auth.uid(), 'feature_gate_admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_user_ids IS NULL OR array_length(p_user_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email::TEXT,
    COALESCE(p.display_name, split_part(u.email, '@', 1))::TEXT
  FROM auth.users u
  LEFT JOIN profiles p ON p.id = u.id
  WHERE u.id = ANY (p_user_ids)
  ORDER BY u.email;
END;
$$;

GRANT EXECUTE ON FUNCTION get_feature_gate_users(UUID[]) TO authenticated;

INSERT INTO feature_gates (feature_key, label, description, open_to_all) VALUES
  (
    'feature_gate_admin',
    'Feature gate admin',
    'Manage feature rollouts and user allowlists',
    true
  ),
  (
    'gusto_payroll',
    'Gusto payroll',
    'Gusto Embedded payroll integration',
    false
  )
ON CONFLICT (feature_key) DO NOTHING;

ALTER TABLE feature_gates ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_gate_allowlist ENABLE ROW LEVEL SECURITY;
