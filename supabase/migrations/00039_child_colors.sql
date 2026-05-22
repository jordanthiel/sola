-- Per-child calendar color (palette key)

ALTER TABLE children
  ADD COLUMN IF NOT EXISTS color_key TEXT;

UPDATE children c
SET color_key = palette.colors[1 + (numbered.idx % array_length(palette.colors, 1))]
FROM (
  SELECT
    id,
    (ROW_NUMBER() OVER (PARTITION BY household_id ORDER BY created_at, name) - 1)::INTEGER AS idx
  FROM children
  WHERE color_key IS NULL
) AS numbered,
(
  SELECT ARRAY['blue', 'green', 'orange', 'purple', 'rose', 'teal', 'amber', 'indigo']::TEXT[] AS colors
) AS palette
WHERE c.id = numbered.id;

ALTER TABLE children
  ALTER COLUMN color_key SET NOT NULL;

ALTER TABLE children
  ADD CONSTRAINT children_color_key_check
  CHECK (
    color_key IN ('blue', 'green', 'orange', 'purple', 'rose', 'teal', 'amber', 'indigo')
  );

COMMENT ON COLUMN children.color_key IS
  'Palette key for calendar/UI color. Assigned automatically on insert.';

CREATE OR REPLACE FUNCTION assign_child_color_key()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_palette TEXT[] := ARRAY['blue', 'green', 'orange', 'purple', 'rose', 'teal', 'amber', 'indigo'];
  v_count INTEGER;
BEGIN
  IF NEW.color_key IS NOT NULL AND btrim(NEW.color_key) <> '' THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO v_count
  FROM children
  WHERE household_id = NEW.household_id;

  NEW.color_key := v_palette[1 + (v_count % array_length(v_palette, 1))];
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS children_assign_color_key ON children;

CREATE TRIGGER children_assign_color_key
  BEFORE INSERT ON children
  FOR EACH ROW
  EXECUTE FUNCTION assign_child_color_key();
