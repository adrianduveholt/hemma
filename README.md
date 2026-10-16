# Hemma – matinventering

PWA för att hålla koll på maten hemma. Ren HTML/JS utan byggsteg, all data i IndexedDB.

- `app/` – det som publiceras (index.html, app.js, db.js, catalog.js, styles.css, sw.js, manifest)
- `app/catalog.js` – startkatalogen med vanliga livsmedel (namn, kategori, enhet, plats, hållbarhet)
- `tools/make_icons.py` – ritar PNG-ikonerna, kör `py -I tools/make_icons.py`

Lokalt: `py -m http.server 8135 --directory app` och öppna http://localhost:8135.
Höj `VERSION` i `app/sw.js` vid varje ändring, annars kan en installerad app visa gammal cache offline.

## Status
- Fas 1 klar: smart namninmatning (felstavningstolerant, lär sig av användning), mängd med enhet,
  "hur mycket finns kvar" 25/50/75 %/slut, slängd, öppnad (förkortar hållbarhet), frys in,
  platser, bäst före, foto, Ät först-lista, ångra, säkerhetskopia som JSON.
- Synk (fas 2, kod klar): `app/sync.js` + `supabase/schema.sql`. Utkorg i IndexedDB → upsert till
  tabellen `items` (en rad per post, JSON i `data`), hämtning via `server_updated_at`-markör och realtid.
  Foton i privat bucket `photos/<hushåll>/<id>.jpg`. Inloggning med e-postkod, hushåll med inbjudningskod.
  Uppgifterna för projektet (URL + publishable key) läggs i `app/config.js`.
- Nästa: recept från ICA-länkar med automatiskt avdrag.

### Supabase-inställningar
1. Kör `supabase/schema.sql` i SQL Editor.
2. Authentication → Emails → mallen "Magic Link": lägg in `{{ .Token }}` så att mejlet innehåller koden.

Datamodellen är förberedd för synk: uuid-id, `updatedAt` och mjuk radering på alla poster;
katalogvaror har deterministiska id:n (`cat:<namn>`) så att två telefoner får samma.
