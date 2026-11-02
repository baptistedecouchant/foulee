-- Foulée : schéma initial.
-- Règle de sécurité centrale : le téléphone ne peut JAMAIS écrire de points,
-- de validations ni d'activités. Tout passe par les fonctions serveur
-- (rôle service), après l'analyse anti-triche.

create extension if not exists pgcrypto;

-- ---------- Profils ----------
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  -- score de confiance global, abaissé par les activités refusées
  trust_level smallint not null default 100 check (trust_level between 0 and 100),
  rewards_suspended boolean not null default false
);

-- ---------- Objectifs et plans ----------
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  goal_mode text not null check (goal_mode in ('chrono', 'distance')),
  sport text not null default 'running',
  distance_km numeric(6,3) not null check (distance_km > 0 and distance_km <= 250),
  target_time_sec integer check (target_time_sec > 0),
  event_date date not null,
  start_date date not null,
  sessions_per_week smallint not null check (sessions_per_week between 2 and 5),
  level jsonb not null,
  plan jsonb not null,            -- sortie complète du moteur (@foulee/core buildPlan)
  ai_enrichment jsonb,            -- textes du coach IA, jamais les allures
  status text not null default 'active' check (status in ('active', 'done', 'abandoned')),
  created_at timestamptz not null default now(),
  check (goal_mode = 'distance' or target_time_sec is not null)
);
create unique index one_active_plan_per_user on public.plans (user_id) where status = 'active';

create table public.planned_sessions (
  id text not null,               -- ex. w3s2
  plan_id uuid not null references public.plans on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  week smallint not null,
  date date not null,
  type text not null,
  title text not null,
  duration_sec integer not null,
  distance_m integer not null,
  base_points integer not null,
  steps jsonb not null,
  sent_to_watch_at timestamptz,
  primary key (plan_id, id)
);
create index on public.planned_sessions (user_id, date);

-- ---------- Connexions aux montres et apps ----------
-- Les jetons OAuth ne sont JAMAIS lisibles par le client : ils sont stockés
-- chiffrés dans Supabase Vault ; la table ne garde que la référence.
create table public.device_connections (
  user_id uuid not null references auth.users on delete cascade,
  provider text not null check (provider in ('garmin', 'strava', 'apple_health', 'health_connect', 'coros', 'polar', 'suunto')),
  external_user_id text,
  vault_secret_id uuid,
  scopes text[],
  connected_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (user_id, provider)
);
create unique index on public.device_connections (provider, external_user_id) where external_user_id is not null;

-- ---------- Activités et contrôle anti-triche ----------
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  source text not null,
  external_id text not null,
  start_time timestamptz not null,
  duration_sec integer not null,
  distance_m integer not null,
  manual boolean not null,
  indoor boolean not null default false,
  device_name text,
  track_fingerprint text,
  trust_verdict text not null check (trust_verdict in ('trusted', 'review', 'rejected')),
  trust_score smallint not null,
  trust_flags jsonb not null default '[]',
  duplicate_of uuid references public.activities,
  received_at timestamptz not null default now(),
  unique (source, external_id)
);
create index on public.activities (user_id, start_time desc);
-- Une même trace ne peut rapporter qu'une fois, tous comptes confondus.
create unique index unique_track_fingerprint on public.activities (track_fingerprint)
  where track_fingerprint is not null and duplicate_of is null and trust_verdict <> 'rejected';

create table public.session_validations (
  plan_id uuid not null,
  session_id text not null,
  user_id uuid not null references auth.users on delete cascade,
  activity_id uuid not null references public.activities,
  status text not null check (status in ('validee', 'partielle', 'non_validee', 'refusee', 'en_revue')),
  score numeric(3,2) not null,
  volume_score numeric(3,2) not null,
  intensity_score numeric(3,2) not null,
  points integer not null,
  feedback text not null,
  created_at timestamptz not null default now(),
  primary key (plan_id, session_id),
  foreign key (plan_id, session_id) references public.planned_sessions (plan_id, id) on delete cascade
);

-- ---------- Points : journal en écriture seule ----------
create table public.points_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('session', 'week', 'plan', 'goal', 'redeem', 'adjustment')),
  label text not null,
  points integer not null,
  ref text not null,              -- clé d'idempotence (ex. plan:session, plan:week-3)
  created_at timestamptz not null default now(),
  unique (user_id, kind, ref)
);

create view public.points_balance with (security_invoker = true) as
  select user_id, coalesce(sum(points), 0)::integer as balance
  from public.points_ledger group by user_id;

-- ---------- Récompenses ----------
create table public.partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('brand', 'retailer', 'race', 'employer', 'insurer')),
  active boolean not null default true
);

create table public.rewards (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners,
  title text not null,
  description text,
  cost_points integer not null check (cost_points > 0),
  value_eur numeric(8,2),
  stock integer,                  -- null = illimité
  active boolean not null default true
);

create table public.reward_codes (
  id uuid primary key default gen_random_uuid(),
  reward_id uuid not null references public.rewards,
  code text not null,             -- code fourni par le partenaire
  redeemed_by uuid references auth.users,
  redeemed_at timestamptz
);

create table public.redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  reward_id uuid not null references public.rewards,
  code_id uuid references public.reward_codes,
  cost_points integer not null,
  created_at timestamptz not null default now()
);

-- ---------- RLS : chacun ne lit que ses propres données ----------
alter table public.profiles enable row level security;
alter table public.plans enable row level security;
alter table public.planned_sessions enable row level security;
alter table public.device_connections enable row level security;
alter table public.activities enable row level security;
alter table public.session_validations enable row level security;
alter table public.points_ledger enable row level security;
alter table public.partners enable row level security;
alter table public.rewards enable row level security;
alter table public.reward_codes enable row level security;
alter table public.redemptions enable row level security;

create policy "profil : lecture" on public.profiles for select using (auth.uid() = id);
create policy "profil : nom" on public.profiles for update using (auth.uid() = id)
  with check (auth.uid() = id);
-- trust_level et rewards_suspended ne doivent pas être modifiables par l'utilisateur
revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;

create policy "plans : lecture" on public.plans for select using (auth.uid() = user_id);
create policy "séances : lecture" on public.planned_sessions for select using (auth.uid() = user_id);
create policy "connexions : lecture" on public.device_connections for select using (auth.uid() = user_id);
create policy "activités : lecture" on public.activities for select using (auth.uid() = user_id);
create policy "validations : lecture" on public.session_validations for select using (auth.uid() = user_id);
create policy "points : lecture" on public.points_ledger for select using (auth.uid() = user_id);
create policy "échanges : lecture" on public.redemptions for select using (auth.uid() = user_id);
create policy "catalogue : lecture" on public.rewards for select using (active);
create policy "partenaires : lecture" on public.partners for select using (active);
-- reward_codes : aucune policy → illisible par les clients (codes livrés via redemptions)

-- Aucune policy insert/update/delete sur activités, validations, points :
-- seules les fonctions serveur (service_role, qui contourne la RLS) écrivent.

-- ---------- Échange de points : atomique, sans solde négatif ----------
create or replace function public.redeem_reward(p_user uuid, p_reward uuid)
returns table (redemption_id uuid, code text)
language plpgsql security definer set search_path = public as $$
declare
  v_cost integer;
  v_balance integer;
  v_code record;
  v_red uuid;
begin
  -- verrou par utilisateur : empêche deux échanges simultanés de dépasser le solde
  perform pg_advisory_xact_lock(hashtext(p_user::text));

  if (select rewards_suspended from profiles where id = p_user) then
    raise exception 'rewards_suspended';
  end if;

  select cost_points into v_cost from rewards where id = p_reward and active for update;
  if v_cost is null then raise exception 'reward_unavailable'; end if;

  select coalesce(sum(points), 0) into v_balance from points_ledger where user_id = p_user;
  if v_balance < v_cost then raise exception 'insufficient_points'; end if;

  select * into v_code from reward_codes
    where reward_id = p_reward and redeemed_by is null
    limit 1 for update skip locked;
  if v_code.id is null then raise exception 'out_of_stock'; end if;

  update reward_codes set redeemed_by = p_user, redeemed_at = now() where id = v_code.id;
  insert into redemptions (user_id, reward_id, code_id, cost_points)
    values (p_user, p_reward, v_code.id, v_cost) returning id into v_red;
  insert into points_ledger (user_id, kind, label, points, ref)
    values (p_user, 'redeem', 'Échange de récompense', -v_cost, v_red::text);

  return query select v_red, v_code.code;
end $$;

revoke all on function public.redeem_reward(uuid, uuid) from public, anon, authenticated;

-- Mise à jour d'un jeton OAuth chiffré (Supabase Vault), réservée aux fonctions serveur.
create or replace function public.update_vault_secret(p_id uuid, p_secret text)
returns void language sql security definer set search_path = public, vault as $$
  select vault.update_secret(p_id, p_secret);
$$;
revoke all on function public.update_vault_secret(uuid, text) from public, anon, authenticated;

-- Profil créé automatiquement à l'inscription.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id) values (new.id);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
