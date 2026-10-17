-- Hemma: ICA-butikens erbjudanden.
-- Butikernas erbjudandesidor på ica.se är publika; databasen hämtar dem (webbläsaren får inte, CORS)
-- och sparar en kopia i några timmar så att hushållets telefoner inte hämtar samma sida om och om igen.

create extension if not exists http with schema extensions;

create table if not exists public.ica_cache (
  key text primary key,
  fetched_at timestamptz not null default now(),
  payload text not null
);
-- Ingen policy: tabellen läses och skrivs bara av funktionerna nedan.
alter table public.ica_cache enable row level security;

-- Hämtar en ica.se-sida, eller ger den sparade kopian om den är nyare än max_age.
create or replace function public.ica_get_cached(p_key text, p_url text, p_max_age interval)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  cached ica_cache;
  res extensions.http_response;
begin
  select * into cached from ica_cache where key = p_key;
  if cached.key is not null and cached.fetched_at > now() - p_max_age then
    return cached.payload;
  end if;
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '15000');
  perform extensions.http_set_curlopt('CURLOPT_USERAGENT', 'Mozilla/5.0 (Hemma)');
  res := extensions.http_get(p_url);
  if res.status <> 200 then
    if cached.key is not null then return cached.payload; end if;
    raise exception 'ICA svarade med status %', res.status;
  end if;
  insert into ica_cache (key, fetched_at, payload) values (p_key, now(), res.content)
    on conflict (key) do update set fetched_at = excluded.fetched_at, payload = excluded.payload;
  return res.content;
end $$;
revoke all on function public.ica_get_cached(text, text, interval) from public, anon, authenticated;

-- Sök butik i ICA:s sitemap över butikssidor: /butiker/<typ>/<ort>/<butik>-<nr>/.
-- Svaret är "<ort>/<butik>-<nr>", t.ex. "lund/ica-kvantum-brunnshog-1086002".
create or replace function public.search_ica_stores(p_query text)
returns setof text language plpgsql security definer set search_path = public, extensions as $$
declare
  page text;
  q text := lower(trim(p_query));
begin
  if auth.uid() is null then raise exception 'Inte inloggad'; end if;
  if length(q) < 2 then return; end if;
  page := ica_get_cached('stores', 'https://www.ica.se/butiker/sitemap.xml', interval '7 days');
  -- Alla sökord ska finnas i typ, ort eller butiksnamn: "kvantum lund" → kvantum/lund/ica-kvantum-…
  return query
    select distinct m[2] || '/' || m[3]
    from regexp_matches(page, 'https://www\.ica\.se/butiker/([a-z]+)/([a-z0-9-]+)/([a-z0-9-]+-[0-9]+)/', 'g') as m
    where (select bool_and((m[1] || '-' || m[2] || '-' || m[3]) like '%' || w || '%')
           from unnest(string_to_array(translate(q, 'åäöé ', 'aaoe-'), '-')) as w where w <> '')
    limit 25;
end $$;
revoke all on function public.search_ica_stores(text) from public, anon;
grant execute on function public.search_ica_stores(text) to authenticated;

-- Butikens erbjudanden: bara den del av sidan där erbjudandena ligger (window.__INITIAL_DATA__).
create or replace function public.fetch_ica_offers(p_store text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  page text;
  a int;
  b int;
begin
  if auth.uid() is null then raise exception 'Inte inloggad'; end if;
  if p_store !~ '^[a-z0-9-]+-[0-9]+$' then raise exception 'Okänd butik'; end if;
  page := ica_get_cached('offers:' || p_store, 'https://www.ica.se/erbjudanden/' || p_store || '/', interval '6 hours');
  a := strpos(page, 'window.__INITIAL_DATA__');
  if a = 0 then return page; end if;
  b := strpos(substr(page, a), '</script>');
  return substr(page, a, case when b > 0 then b else length(page) end);
end $$;
revoke all on function public.fetch_ica_offers(text) from public, anon;
grant execute on function public.fetch_ica_offers(text) to authenticated;
