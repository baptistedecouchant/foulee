-- Profil sportif : poids et taille (personnalisation des plans), une séance par semaine possible,
-- jours d'entraînement choisis.
alter table public.profiles add column if not exists weight_kg numeric(5,1) check (weight_kg between 25 and 250);
alter table public.profiles add column if not exists height_cm smallint check (height_cm between 100 and 230);
grant update (weight_kg, height_cm) on public.profiles to authenticated;

alter table public.plans drop constraint if exists plans_sessions_per_week_check;
alter table public.plans add constraint plans_sessions_per_week_check check (sessions_per_week between 1 and 5);
alter table public.plans add column if not exists training_days smallint[];
