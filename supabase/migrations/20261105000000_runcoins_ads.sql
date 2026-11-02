-- Économie RunCoin (100 RC = 1 €) : pubs récompensées vérifiées et challenges sponsorisés.

-- Pubs regardées, enregistrées UNIQUEMENT par la fonction ad-reward après vérification de Google.
create table public.ad_views (
  transaction_id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  ad_unit text,
  reward_amount integer,
  created_at timestamptz not null default now()
);
create index on public.ad_views (user_id, created_at);
alter table public.ad_views enable row level security;
create policy "pubs : lecture" on public.ad_views for select using (auth.uid() = user_id);

-- Types de gains possibles dans le journal
alter table public.points_ledger drop constraint if exists points_ledger_kind_check;
alter table public.points_ledger add constraint points_ledger_kind_check
  check (kind in ('session', 'week', 'ad', 'sponsored', 'redeem', 'adjustment', 'plan', 'goal', 'challenge'));

-- Challenges sponsorisés par des marques (remplacent la rotation par défaut quand ils existent).
create table public.sponsored_challenges (
  id uuid primary key default gen_random_uuid(),
  week_start date not null unique,
  partner_id uuid references public.partners,
  title text not null,
  description text not null,
  metric text not null check (metric in ('distance', 'sessions', 'longest')),
  target numeric not null,
  reward_rc integer not null default 20,
  budget_eur numeric(10,2), -- montant payé par la marque
  created_at timestamptz not null default now()
);
alter table public.sponsored_challenges enable row level security;
create policy "challenges sponsorisés : lecture" on public.sponsored_challenges for select using (true);

-- Boutique : lien ou code affilié tracké du partenaire (commission sur l'achat).
alter table public.rewards add column if not exists affiliate_url text;
alter table public.rewards add column if not exists kind text not null default 'voucher' check (kind in ('voucher', 'discount', 'race'));

-- Suivi du coût pour l'entreprise : RunCoins en circulation (dette envers les utilisateurs).
create or replace view public.runcoin_liability as
  select
    coalesce(sum(points) filter (where points > 0), 0) as rc_distributed,
    coalesce(-sum(points) filter (where points < 0), 0) as rc_redeemed,
    coalesce(sum(points), 0) as rc_outstanding,
    round(coalesce(sum(points), 0) / 100.0, 2) as eur_outstanding
  from public.points_ledger;
revoke all on public.runcoin_liability from anon, authenticated;
