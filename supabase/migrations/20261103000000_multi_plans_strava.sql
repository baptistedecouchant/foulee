-- Plusieurs entraînements en parallèle (ex. un 10 km au printemps et un semi à l'automne).
drop index if exists public.one_active_plan_per_user;
alter table public.plans add column if not exists title text;
alter table public.plans add column if not exists image_key text;

-- Connexion OAuth (Strava) : jeton anti-rejeu à usage unique, valable 10 minutes.
create table public.oauth_states (
  state text primary key,
  user_id uuid not null references auth.users on delete cascade,
  provider text not null,
  return_url text not null,
  expires_at timestamptz not null default now() + interval '10 minutes'
);
alter table public.oauth_states enable row level security; -- aucune policy : serveur uniquement

-- Création d'un secret chiffré (jetons OAuth), réservée aux fonctions serveur.
create or replace function public.create_vault_secret(p_secret text, p_name text)
returns uuid language sql security definer set search_path = public, vault as $$
  select vault.create_secret(p_secret, p_name);
$$;
revoke all on function public.create_vault_secret(text, text) from public, anon, authenticated;

create or replace function public.read_vault_secret(p_id uuid)
returns text language sql security definer set search_path = public, vault as $$
  select decrypted_secret from vault.decrypted_secrets where id = p_id;
$$;
revoke all on function public.read_vault_secret(uuid) from public, anon, authenticated;

-- L'utilisateur peut déconnecter une source lui-même.
create policy "connexions : révoquer" on public.device_connections for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
revoke update on public.device_connections from authenticated;
grant update (revoked_at) on public.device_connections to authenticated;
