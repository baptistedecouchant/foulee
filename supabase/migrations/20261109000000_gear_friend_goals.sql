-- Équipement (chaussures, attribution des courses) suivi d'un téléphone à l'autre,
-- et choix de partager ses objectifs avec ses amis.
alter table public.profiles add column if not exists gear jsonb not null default '{}'::jsonb
  check (jsonb_typeof(gear) = 'object' and pg_column_size(gear) < 60000);
alter table public.profiles add column if not exists share_goals boolean not null default true;
grant update (gear, share_goals) on public.profiles to authenticated;
