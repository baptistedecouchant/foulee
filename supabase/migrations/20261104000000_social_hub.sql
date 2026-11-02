-- Hub social : joueurs, amis, messages (et invitations à courir), défis entre joueurs.
-- Principe de confidentialité : on ne voit les statistiques et on n'écrit qu'à ses AMIS.

-- ---------- Profil public ----------
alter table public.profiles add column if not exists friend_code text unique;
alter table public.profiles add column if not exists city text;
alter table public.profiles add column if not exists avatar_color text default '#3A4BFF';

create or replace function public.gen_friend_code() returns text language sql as $$
  select upper(substr(translate(encode(extensions.gen_random_bytes(6), 'base64'), '+/=0O1Il', ''), 1, 6));
$$;
update public.profiles set friend_code = public.gen_friend_code() where friend_code is null;
alter table public.profiles alter column friend_code set default public.gen_friend_code();

grant update (display_name, city, avatar_color) on public.profiles to authenticated;

-- ---------- Amis ----------
create table public.friendships (
  user_a uuid not null references auth.users on delete cascade,
  user_b uuid not null references auth.users on delete cascade,
  requested_by uuid not null references auth.users on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
alter table public.friendships enable row level security;
create policy "amis : lecture" on public.friendships for select using (auth.uid() in (user_a, user_b));

create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from friendships
    where user_a = least(a, b) and user_b = greatest(a, b) and status = 'accepted'
  );
$$;

-- Les amis voient le profil public de l'autre.
create policy "profil : amis" on public.profiles for select using (public.are_friends(auth.uid(), id));

-- ---------- Blocages et signalements (obligatoires pour l'App Store) ----------
create table public.blocks (
  blocker uuid not null references auth.users on delete cascade,
  blocked uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked)
);
alter table public.blocks enable row level security;
create policy "blocages : lecture" on public.blocks for select using (auth.uid() = blocker);

create table public.reports (
  id bigint generated always as identity primary key,
  reporter uuid not null references auth.users on delete cascade,
  reported uuid not null references auth.users on delete cascade,
  message_id uuid,
  reason text not null check (char_length(reason) <= 500),
  created_at timestamptz not null default now(),
  handled boolean not null default false
);
alter table public.reports enable row level security;

-- ---------- Messages ----------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'direct' check (kind in ('direct', 'challenge')),
  challenge_id uuid,
  created_at timestamptz not null default now()
);
create table public.conversation_members (
  conversation_id uuid not null references public.conversations on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations on delete cascade,
  sender_id uuid not null references auth.users on delete cascade,
  kind text not null default 'text' check (kind in ('text', 'run_invite', 'run_reply', 'challenge')),
  body text not null check (char_length(body) between 1 and 1000),
  payload jsonb,
  created_at timestamptz not null default now()
);
create index on public.messages (conversation_id, created_at);

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

create or replace function public.is_member(conv uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from conversation_members where conversation_id = conv and user_id = auth.uid());
$$;

create policy "conversations : membres" on public.conversations for select using (public.is_member(id));
create policy "membres : membres" on public.conversation_members for select using (public.is_member(conversation_id));
create policy "membres : lu" on public.conversation_members for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "messages : lecture" on public.messages for select using (public.is_member(conversation_id));
-- Écrire : être membre, signer en son nom, et ne pas être bloqué par un autre membre.
create policy "messages : envoi" on public.messages for insert with check (
  sender_id = auth.uid()
  and public.is_member(conversation_id)
  and not exists (
    select 1 from conversation_members m join blocks b on b.blocker = m.user_id and b.blocked = auth.uid()
    where m.conversation_id = messages.conversation_id
  )
);

-- Limite anti-spam : 30 messages par minute et par personne.
create or replace function public.messages_rate_limit() returns trigger language plpgsql as $$
begin
  if (select count(*) from messages where sender_id = new.sender_id and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'rate_limited';
  end if;
  return new;
end $$;
create trigger messages_rate_limit before insert on public.messages for each row execute function public.messages_rate_limit();

-- Messages en temps réel.
alter publication supabase_realtime add table public.messages;

-- ---------- Défis ----------
create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  template_id text not null,
  created_by uuid not null references auth.users on delete cascade,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'finished', 'cancelled')),
  created_at timestamptz not null default now()
);
create table public.challenge_participants (
  challenge_id uuid not null references public.challenges on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  status text not null default 'invited' check (status in ('invited', 'accepted', 'declined')),
  final_value numeric,
  rewarded boolean not null default false,
  primary key (challenge_id, user_id)
);
alter table public.challenges enable row level security;
alter table public.challenge_participants enable row level security;

create or replace function public.in_challenge(ch uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from challenge_participants where challenge_id = ch and user_id = auth.uid());
$$;
create policy "défis : participants" on public.challenges for select using (public.in_challenge(id));
create policy "participants : participants" on public.challenge_participants for select using (public.in_challenge(challenge_id));
-- Création, réponses et classements passent par la fonction serveur `hub`.

alter table public.points_ledger drop constraint if exists points_ledger_kind_check;
alter table public.points_ledger add constraint points_ledger_kind_check
  check (kind in ('session', 'week', 'plan', 'goal', 'redeem', 'adjustment', 'challenge'));
