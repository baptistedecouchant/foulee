-- Photos : photo de profil et photos des chaussures, rangées dans le dossier de chaque utilisateur.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

drop policy if exists "media : ajout dans mon dossier" on storage.objects;
drop policy if exists "media : remplacement dans mon dossier" on storage.objects;
drop policy if exists "media : suppression dans mon dossier" on storage.objects;
create policy "media : ajout dans mon dossier" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "media : remplacement dans mon dossier" on storage.objects for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "media : suppression dans mon dossier" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

-- La photo de profil ne peut pointer que vers le dossier de l'utilisateur (pas d'image externe).
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles drop constraint if exists profiles_avatar_url_check;
alter table public.profiles add constraint profiles_avatar_url_check
  check (avatar_url is null or position('/storage/v1/object/public/media/' || id::text || '/' in avatar_url) > 0);
grant update (avatar_url) on public.profiles to authenticated;
