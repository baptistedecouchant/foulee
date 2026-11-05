-- Remplacer une photo (upsert) demande aussi le droit de lire son propre dossier.
drop policy if exists "media : lecture de mon dossier" on storage.objects;
create policy "media : lecture de mon dossier" on storage.objects for select to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
