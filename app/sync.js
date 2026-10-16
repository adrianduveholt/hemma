'use strict';
// Synk mot Supabase. Lokala ändringar ligger i utkorgen och skickas upp när det finns nät.
// Andras ändringar hämtas från tabellen items och kommer dessutom direkt via realtid.
// Senaste ändringen (updatedAt) vinner, både här och i databasens trigger.
const Sync = (() => {
  const cfg = window.HEMMA_CONFIG || {};
  const enabled = !!(cfg.supabaseUrl && cfg.supabaseKey && window.supabase);
  const client = enabled
    ? supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } })
    : null;
  const status = { enabled, user: null, household: null, pending: 0, lastSync: null, error: null, busy: false, online: navigator.onLine };
  const listeners = new Set();
  let onData = () => {};
  let channel = null;
  let pushTimer = null;
  let dataTimer = null;
  let again = false;

  const emit = () => listeners.forEach(fn => fn(status));
  const meta = async (key, value) => {
    if (value === undefined) return (await db.get('meta', key))?.value;
    await db.put('meta', { id: key, value });
  };
  const stamp = r => r.updatedAt || r.ts || '1970-01-01T00:00:00.000Z';
  const dataChanged = () => { clearTimeout(dataTimer); dataTimer = setTimeout(() => onData(), 150); };

  async function countPending() {
    status.pending = (await db.all('outbox')).length;
  }

  // ---------- Upp ----------
  async function push() {
    const hh = status.household.id;
    const entries = await db.all('outbox');
    const rows = [], done = [];
    for (const e of entries) {
      if (e.kind === 'photo') {
        const ph = await db.get('photos', e.recId);
        if (ph) {
          const { error } = await client.storage.from('photos')
            .upload(`${hh}/${e.recId}.jpg`, ph.blob, { contentType: 'image/jpeg', upsert: false });
          // Finns bilden redan uppe räknas det som klart.
          if (error && !/exists|duplicate/i.test(error.message)) throw error;
        }
        done.push(e);
        continue;
      }
      const rec = await db.get(e.kind, e.recId);
      if (rec) rows.push({ household_id: hh, kind: e.kind, id: rec.id, data: rec, client_updated_at: stamp(rec) });
      done.push(e);
    }
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await client.from('items').upsert(rows.slice(i, i + 200), { onConflict: 'household_id,kind,id' });
      if (error) throw error;
    }
    // Ta bara bort det som skickats – en ändring som kom under uppladdningen ligger kvar.
    for (const e of done) {
      const cur = await db.get('outbox', e.id);
      if (cur && cur.at === e.at) await db.remove('outbox', e.id);
    }
  }

  // ---------- Ner ----------
  async function apply(row) {
    if (!SYNC_STORES.includes(row.kind)) return false;
    const local = await db.get(row.kind, row.id);
    if (local && stamp(local) >= stamp(row.data)) return false;
    await db.put(row.kind, row.data, { silent: true });
    return true;
  }

  async function pull() {
    const hh = status.household.id;
    const key = 'cursor:' + hh;
    let cursor = (await meta(key)) || '1970-01-01T00:00:00Z';
    let changed = false;
    for (;;) {
      const { data, error } = await client.from('items')
        .select('kind,id,data,server_updated_at')
        .eq('household_id', hh).gt('server_updated_at', cursor)
        .order('server_updated_at').limit(1000);
      if (error) throw error;
      for (const row of data) if (await apply(row)) changed = true;
      if (data.length) { cursor = data[data.length - 1].server_updated_at; await meta(key, cursor); }
      if (data.length < 1000) break;
    }
    if (await fetchMissingPhotos()) changed = true;
    if (changed) dataChanged();
  }

  async function fetchMissingPhotos() {
    const hh = status.household.id;
    const lots = (await db.all('lots')).filter(l => l.photoId && l.status === 'active' && !l.deleted);
    let got = false;
    for (const l of lots) {
      if (await db.get('photos', l.photoId)) continue;
      const { data, error } = await client.storage.from('photos').download(`${hh}/${l.photoId}.jpg`);
      if (error || !data) continue; // Bilden är kanske inte uppladdad än – försöker igen nästa gång.
      await db.put('photos', { id: l.photoId, blob: data, updatedAt: new Date().toISOString() });
      got = true;
    }
    return got;
  }

  // ---------- Styrning ----------
  async function syncNow() {
    if (!enabled || !status.user || !status.household) return;
    if (status.busy) { again = true; return; }
    status.busy = true; emit();
    try {
      await push();
      await pull();
      status.lastSync = new Date();
      status.error = null;
    } catch (e) {
      status.error = e.message || String(e);
    } finally {
      status.busy = false;
      await countPending();
      emit();
      if (again) { again = false; syncNow(); }
    }
  }

  function schedulePush() {
    countPending().then(emit);
    clearTimeout(pushTimer);
    pushTimer = setTimeout(syncNow, 800);
  }

  function subscribe() {
    if (channel) client.removeChannel(channel);
    const hh = status.household.id;
    channel = client.channel('items-' + hh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items', filter: `household_id=eq.${hh}` }, async payload => {
        if (payload.new && await apply(payload.new)) {
          if (payload.new.kind === 'lots' && payload.new.data.photoId) await fetchMissingPhotos();
          dataChanged();
        }
      })
      .subscribe(state => {
        // När anslutningen kommer tillbaka kan ändringar ha missats – hämta ikapp.
        if (state === 'SUBSCRIBED') syncNow();
      });
  }

  async function start() {
    const { data, error } = await client.from('households').select('id,name,invite_code').eq('id', status.household.id).maybeSingle();
    if (!error && data) { status.household = data; await meta('household', data); }
    if (!error && !data) { status.household = null; await meta('household', null); emit(); return; }
    subscribe();
    syncNow();
  }

  // Lägg allt lokalt i utkorgen – används när telefonen går med i ett hushåll.
  async function queueAll() {
    const now = Date.now();
    const entries = [];
    for (const p of await db.all('products')) if (p.custom || p.uses) entries.push({ kind: 'products', recId: p.id });
    for (const l of await db.all('lots')) entries.push({ kind: 'lots', recId: l.id });
    for (const e of await db.all('events')) entries.push({ kind: 'events', recId: e.id });
    for (const r of await db.all('recipes')) entries.push({ kind: 'recipes', recId: r.id });
    for (const ph of await db.all('photos')) entries.push({ kind: 'photo', recId: ph.id });
    await db.putMany('outbox', entries.map(e => ({ ...e, id: e.kind + '|' + e.recId, at: now })));
  }

  async function setHousehold(h) {
    status.household = { id: h.id, name: h.name, invite_code: h.invite_code };
    await meta('household', status.household);
    await queueAll();
    await start();
    emit();
  }

  return {
    status,
    get enabled() { return enabled; },
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    schedulePush,
    syncNow,

    async init(onDataCb) {
      onData = onDataCb;
      await countPending();
      if (!enabled) { emit(); return; }
      const { data } = await client.auth.getSession();
      status.user = data.session?.user || null;
      status.household = (await meta('household')) || null;
      client.auth.onAuthStateChange((_ev, session) => { status.user = session?.user || null; emit(); });
      window.addEventListener('online', () => { status.online = true; emit(); syncNow(); });
      window.addEventListener('offline', () => { status.online = false; emit(); });
      document.addEventListener('visibilitychange', () => { if (!document.hidden) syncNow(); });
      emit();
      if (status.user && status.household) start();
    },

    async fetchRecipe(url) {
      const { data, error } = await client.rpc('fetch_recipe', { p_url: url });
      if (error) throw error;
      return data;
    },

    async queuePhoto(id) {
      await db.put('outbox', { id: 'photo|' + id, kind: 'photo', recId: id, at: Date.now() });
      schedulePush();
    },

    // E-post + lösenord: fungerar inne i den installerade appen, där en mejllänk skulle öppnas i webbläsaren i stället.
    async signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      status.user = data.user;
      emit();
    },
    async signUp(email, password) {
      const { data, error } = await client.auth.signUp({ email, password });
      if (error) throw error;
      // Utan session är e-postbekräftelse påslagen i Supabase.
      if (!data.session) throw new Error('Email not confirmed');
      status.user = data.user;
      emit();
    },
    async createHousehold(name) {
      const { data, error } = await client.rpc('create_household', { p_name: name });
      if (error) throw error;
      await setHousehold(data);
    },
    async joinHousehold(code) {
      const { data, error } = await client.rpc('join_household', { p_code: code });
      if (error) throw error;
      await setHousehold(data);
    },
    async signOut() {
      if (channel) client.removeChannel(channel);
      channel = null;
      await client.auth.signOut();
      status.user = null;
      status.household = null;
      await meta('household', null);
      emit();
    },
  };
})();
window.Sync = Sync;
