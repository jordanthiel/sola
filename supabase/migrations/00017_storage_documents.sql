-- Storage bucket for household documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'household-documents',
  'household-documents',
  false,
  10485760,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY household_docs_select ON storage.objects FOR SELECT
  USING (
    bucket_id = 'household-documents'
    AND is_household_member((storage.foldername(name))[1]::uuid)
  );

CREATE POLICY household_docs_insert ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'household-documents'
    AND is_household_member((storage.foldername(name))[1]::uuid)
  );

CREATE POLICY household_docs_delete ON storage.objects FOR DELETE
  USING (
    bucket_id = 'household-documents'
    AND is_parent_role((storage.foldername(name))[1]::uuid)
  );
