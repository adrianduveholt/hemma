-- Hemma: hämta recept från ICA.
-- Webbläsaren får inte läsa ica.se direkt (CORS), så databasen hämtar sidan och
-- lämnar tillbaka receptdatan (schema.org/JSON-LD) som finns inbäddad i den.

create extension if not exists http with schema extensions;

create or replace function public.fetch_recipe(p_url text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  url text := trim(p_url);
  res extensions.http_response;
  loc text;
  parts text[];
  piece text;
  body text;
  blocks jsonb := '[]'::jsonb;
  hops int := 0;
begin
  if auth.uid() is null then raise exception 'Inte inloggad'; end if;

  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '10000');
  perform extensions.http_set_curlopt('CURLOPT_USERAGENT', 'Mozilla/5.0 (Hemma receptimport)');

  loop
    -- Bara ICA:s egna adresser, så att funktionen inte kan användas för att hämta annat.
    if url !~* '^https://([a-z0-9-]+\.)*(ica\.se|icanet\.se|ica\.app\.link)(/|$)' then
      raise exception 'Bara länkar till ica.se stöds';
    end if;
    res := extensions.http_get(url);
    exit when res.status not in (301, 302, 303, 307, 308);
    hops := hops + 1;
    if hops > 4 then raise exception 'För många omdirigeringar'; end if;
    select h.value into loc from unnest(res.headers) h where lower(h.field) = 'location' limit 1;
    if loc is null then exit; end if;
    url := case when loc ~* '^https?://' then loc
                else regexp_replace(url, '^(https://[^/]+).*$', '\1') || loc end;
  end loop;

  if res.status <> 200 then raise exception 'ICA svarade med status %', res.status; end if;

  -- Plocka ut alla <script type="application/ld+json">-block med vanliga strängoperationer.
  parts := string_to_array(res.content, 'application/ld+json');
  for i in 2 .. coalesce(array_length(parts, 1), 0) loop
    piece := parts[i];
    body := split_part(substr(piece, strpos(piece, '>') + 1), '</script>', 1);
    begin
      blocks := blocks || jsonb_build_array(body::jsonb);
    exception when others then
      null; -- Trasigt block, hoppa över.
    end;
  end loop;

  return jsonb_build_object('url', url, 'blocks', blocks);
end $$;

revoke all on function public.fetch_recipe(text) from public, anon;
grant execute on function public.fetch_recipe(text) to authenticated;
