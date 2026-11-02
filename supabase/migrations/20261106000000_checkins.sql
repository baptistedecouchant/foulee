-- Série de connexion : un enregistrement par jour d'ouverture de l'app.
-- Écrit uniquement par la fonction serveur `check-in` (date du serveur, pas du téléphone).
create table public.daily_checkins (
  user_id uuid not null references auth.users on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.daily_checkins enable row level security;
create policy "connexions quotidiennes : lecture" on public.daily_checkins for select using (auth.uid() = user_id);
