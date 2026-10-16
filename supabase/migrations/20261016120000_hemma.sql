-- Hemma: databas för synk mellan hushållets telefoner.
-- Kör hela filen en gång i Supabase → SQL Editor → New query → Run.
-- Filen går att köra igen utan att något förstörs.

-- ---------- Hushåll ----------
create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Hemma',
  invite_code text not null unique default upper(substr(md5(random()::text), 1, 6)),
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- security definer så att policyn inte rekurserar via household_members egen RLS.
create or replace function public.is_member(h uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from household_members where household_id = h and user_id = auth.uid());
$$;

alter table public.households enable row level security;
alter table public.household_members enable row level security;

drop policy if exists "medlem ser sitt hushåll" on public.households;
create policy "medlem ser sitt hushåll" on public.households
  for select using (public.is_member(id));

drop policy if exists "medlem ser medlemmar" on public.household_members;
create policy "medlem ser medlemmar" on public.household_members
  for select using (public.is_member(household_id));

-- Skapa och gå med sker bara via de här funktionerna.
create or replace function public.create_household(p_name text default 'Hemma')
returns public.households language plpgsql security definer set search_path = public as $$
declare h households;
begin
  if auth.uid() is null then raise exception 'Inte inloggad'; end if;
  insert into households (name) values (coalesce(nullif(trim(p_name), ''), 'Hemma')) returning * into h;
  insert into household_members (household_id, user_id) values (h.id, auth.uid());
  return h;
end $$;

create or replace function public.join_household(p_code text)
returns public.households language plpgsql security definer set search_path = public as $$
declare h households;
begin
  if auth.uid() is null then raise exception 'Inte inloggad'; end if;
  select * into h from households where invite_code = upper(trim(p_code));
  if h.id is null then raise exception 'Okänd kod'; end if;
  insert into household_members (household_id, user_id) values (h.id, auth.uid()) on conflict do nothing;
  return h;
end $$;

-- ---------- Poster (varor, partier, händelser) ----------
-- En generisk tabell: appens poster ligger som JSON i data. kind = products | lots | events.
create table if not exists public.items (
  household_id uuid not null references public.households on delete cascade,
  kind text not null,
  id text not null,
  data jsonb not null,
  client_updated_at timestamptz not null,
  server_updated_at timestamptz not null default now(),
  primary key (household_id, kind, id)
);
create index if not exists items_pull on public.items (household_id, server_updated_at);

-- Senaste ändringen vinner. En äldre ändring som kommer fram sent skriver inte över en nyare.
create or replace function public.items_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.client_updated_at < old.client_updated_at then
    return null;
  end if;
  new.server_updated_at := clock_timestamp();
  return new;
end $$;

drop trigger if exists items_guard on public.items;
create trigger items_guard before insert or update on public.items
  for each row execute function public.items_guard();

alter table public.items enable row level security;
drop policy if exists "medlem läser" on public.items;
create policy "medlem läser" on public.items for select using (public.is_member(household_id));
drop policy if exists "medlem skapar" on public.items;
create policy "medlem skapar" on public.items for insert with check (public.is_member(household_id));
drop policy if exists "medlem ändrar" on public.items;
create policy "medlem ändrar" on public.items for update using (public.is_member(household_id)) with check (public.is_member(household_id));

-- Realtid: den andra telefonen får ändringar direkt.
do $$ begin
  alter publication supabase_realtime add table public.items;
exception when duplicate_object then null;
end $$;

-- ---------- Foton ----------
-- Privat bucket. Sökväg: <household_id>/<photo_id>.jpg
insert into storage.buckets (id, name, public) values ('photos', 'photos', false)
  on conflict (id) do nothing;

drop policy if exists "medlem läser foton" on storage.objects;
create policy "medlem läser foton" on storage.objects for select
  using (bucket_id = 'photos' and public.is_member(((storage.foldername(name))[1])::uuid));
drop policy if exists "medlem laddar upp foton" on storage.objects;
create policy "medlem laddar upp foton" on storage.objects for insert
  with check (bucket_id = 'photos' and public.is_member(((storage.foldername(name))[1])::uuid));
