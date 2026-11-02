-- Identité et consentements, demandés dès la création du compte.
alter table public.profiles add column if not exists first_name text check (char_length(first_name) between 1 and 50);
alter table public.profiles add column if not exists last_name text check (char_length(last_name) between 1 and 50);
alter table public.profiles add column if not exists birth_date date;
-- Consentements (RGPD : données de santé = consentement explicite, horodaté)
alter table public.profiles add column if not exists terms_accepted_at timestamptz;
alter table public.profiles add column if not exists health_consent_at timestamptz;

-- Âge minimum : 15 ans (majorité numérique en France), date plausible.
create or replace function public.check_birth_date() returns trigger language plpgsql as $$
begin
  if new.birth_date is not null and (new.birth_date > current_date - interval '15 years' or new.birth_date < date '1900-01-01') then
    raise exception 'invalid_birth_date';
  end if;
  return new;
end $$;
drop trigger if exists profiles_birth_date on public.profiles;
create trigger profiles_birth_date before insert or update of birth_date on public.profiles
  for each row execute function public.check_birth_date();

-- L'utilisateur peut compléter sa fiche (jamais son solde, sa confiance ou ses récompenses).
grant update (display_name, city, avatar_color, first_name, last_name, birth_date, terms_accepted_at, health_consent_at)
  on public.profiles to authenticated;

-- À l'inscription : on recopie ce que l'app a envoyé (e-mail + mot de passe) ou ce que fournit
-- Google / Apple (prénom, nom). La date de naissance et les consentements sont demandés ensuite
-- si le fournisseur ne les donne pas.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  first text := nullif(coalesce(m->>'first_name', m->>'given_name', split_part(coalesce(m->>'full_name', m->>'name', ''), ' ', 1)), '');
  last text := nullif(coalesce(m->>'last_name', m->>'family_name', nullif(substr(coalesce(m->>'full_name', m->>'name', ''), length(split_part(coalesce(m->>'full_name', m->>'name', ''), ' ', 1)) + 2), '')), '');
  birth date;
begin
  begin
    birth := nullif(m->>'birth_date', '')::date;
  exception when others then
    birth := null;
  end;
  insert into profiles (id, display_name, first_name, last_name, birth_date, terms_accepted_at, health_consent_at)
  values (
    new.id,
    left(first, 24),
    left(first, 50),
    left(last, 50),
    case when birth <= current_date - interval '15 years' then birth end,
    case when (m->>'terms_accepted')::boolean then now() end,
    case when (m->>'health_consent')::boolean then now() end
  )
  on conflict (id) do nothing;
  return new;
end $$;
