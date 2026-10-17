'use strict';
// Erbjudanden från hushållets ICA-butik. Butikens erbjudandesida på ica.se är publik;
// databasen hämtar den (högst var sjätte timme) och här plockas erbjudandena ut och
// matchas mot det ni bryr er om: inköpslistan, alltid hemma-varor och sådant ni brukar köpa.

const OFFERS_MAX_AGE = 6 * 3600 * 1000;
let offersLoading = null;

// ---------- Hushållets inställningar (synkas) ----------
async function saveSettings(changes) {
  const s = { ...(state.settings || {}), ...changes, id: 'household', updatedAt: new Date().toISOString() };
  await db.put('settings', s);
  state.settings = s;
}

// "lund/ica-kvantum-brunnshog-1086002" eller bara butiksdelen → "ICA Kvantum Brunnshog".
function storeLabel(slug) {
  const store = slug.split('/').pop();
  return store.replace(/-\d+$/, '').split('-')
    .map(w => w === 'ica' ? 'ICA' : w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
function storeCity(hit) {
  const city = hit.includes('/') ? hit.split('/')[0] : '';
  return city ? city.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : '';
}

// ---------- Tolka sidan ----------
// Sidan bär sin data som ett JavaScript-objekt (inte ren JSON), så varje erbjudande
// plockas ut för sig: {"id":"…","details":{…}} med strängmedveten parentesräkning.
function objectAt(s, i) {
  let depth = 0, inStr = false, escaped = false;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (inStr) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return s.slice(i, j + 1);
  }
  return null;
}

function parseOffers(text) {
  const out = new Map();
  for (const m of text.matchAll(/\{"id":"\d+","details":\{/g)) {
    const raw = objectAt(text, m.index);
    if (!raw) continue;
    let o;
    try { o = JSON.parse(raw.replace(/(?<=[:\[,])undefined(?=[,\]}])/g, 'null')); } catch { continue; }
    const d = o.details || {};
    if (!d.name || !d.mechanicInfo) continue;
    out.set(o.id, {
      id: o.id, name: d.name, brand: d.brand || '', size: d.packageInformation || '',
      price: d.mechanicInfo, info: d.customerInformation || '',
      validTo: (o.validTo || '').slice(0, 10) || null,
      regular: o.stores?.[0]?.referencePriceText || '',
      eans: (o.eans || []).map(e => e.id),
      category: o.category?.articleGroupName || '',
    });
  }
  return [...out.values()];
}

// ---------- Hämta ----------
async function loadOffers(force = false) {
  const slug = state.settings?.icaStore;
  if (!slug || !Sync.enabled || !Sync.status.user) return null;
  const mem = state.offers;
  if (!force && mem?.slug === slug && Date.now() - mem.at < OFFERS_MAX_AGE) return mem;
  if (!force && !mem) {
    const cached = (await db.get('meta', 'offers'))?.value;
    if (cached?.slug === slug) {
      state.offers = cached;
      if (Date.now() - cached.at < OFFERS_MAX_AGE) return cached;
    }
  }
  if (offersLoading) return offersLoading;
  offersLoading = (async () => {
    try {
      const text = await Sync.fetchIcaOffers(slug);
      const value = { slug, at: Date.now(), list: parseOffers(text || '') };
      state.offers = value;
      await db.put('meta', { id: 'offers', value });
      if (state.view === 'shop') renderShop();
      return value;
    } catch (e) {
      // Spara misslyckandet också, så att varje utritning inte försöker igen direkt.
      state.offers = { slug, at: Date.now(), list: state.offers?.list || [], error: e.message };
      return state.offers;
    } finally {
      offersLoading = null;
    }
  })();
  return offersLoading;
}

// ---------- Matcha mot det ni bryr er om ----------
function interestReasons() {
  const why = new Map();
  const set = (id, r) => { if (id && !why.has(id)) why.set(id, r); };
  for (const i of openItems()) set(i.productId, 'På listan');
  for (const l of state.lots) if (l.low) set(l.productId, 'Snart slut');
  for (const p of state.products.values()) {
    if (p.deleted || p.hidden) continue;
    if (p.minQty > 0) set(p.id, 'Alltid hemma');
  }
  for (const p of state.products.values()) {
    if (!p.deleted && !p.hidden && (p.uses || 0) >= 3) set(p.id, 'Brukar köpas');
  }
  return why;
}

// Räknas ut en gång per utritning av Inköp (renderShop nollställer state.offerHits).
function relevantOffers() {
  if (state.offerHits) return state.offerHits;
  state.offerHits = computeOfferHits();
  return state.offerHits;
}

function computeOfferHits() {
  const list = state.offers?.slug === state.settings?.icaStore ? state.offers?.list || [] : [];
  if (!list.length) return [];
  const why = interestReasons();
  const interesting = [...why.keys()].map(id => state.products.get(id)).filter(Boolean);
  const byEan = new Map();
  for (const p of state.products.values()) for (const b of p.barcodes || []) byEan.set(b.code, p);
  const onList = new Set(openItems().map(i => i.productId));
  const hits = [];
  for (const offer of list) {
    // Streckkoden säger exakt vilken vara det är; annars namnet, men bara mot varor ni bryr er om.
    let product = offer.eans.map(e => byEan.get(e)).find(Boolean) || null;
    let reason = product ? (why.get(product.id) || 'Har köpts förut') : null;
    if (!product) {
      const ing = parseIngredient(offer.name);
      let best = null, bestScore = 59;
      for (const p of interesting) {
        const s = Math.max(...ing.alts.map(a => productScore(a, p)));
        if (s > bestScore) { bestScore = s; best = p; }
      }
      product = best;
      reason = best ? why.get(best.id) : null;
    }
    if (product) hits.push({ offer, product, reason, onList: onList.has(product.id) });
  }
  // Viktigast först: på listan, sedan alltid hemma, snart slut, brukar köpas.
  const rank = { 'På listan': 0, 'Snart slut': 1, 'Alltid hemma': 2, 'Brukar köpas': 3, 'Har köpts förut': 4 };
  return hits.sort((a, b) => (rank[a.reason] ?? 9) - (rank[b.reason] ?? 9) || a.offer.name.localeCompare(b.offer.name, 'sv'));
}

function offerFor(productId) {
  return productId ? relevantOffers().find(h => h.product.id === productId)?.offer : null;
}

// ---------- Visning i Inköp ----------
function offersOpen() { try { return localStorage.getItem('hemma-offers-open') !== '0'; } catch { return true; } }
function setOffersOpen(v) { try { localStorage.setItem('hemma-offers-open', v ? '1' : '0'); } catch {} }

function offersHtml() {
  const slug = state.settings?.icaStore;
  if (!slug) {
    return `<button class="offers-hint" data-shop-act="pick-store">🏷 Välj er ICA-butik för att se erbjudanden på era varor</button>`;
  }
  const hits = relevantOffers();
  if (!state.offers && offersLoading) return `<p class="meta">Hämtar erbjudanden från ${esc(storeLabel(slug))}…</p>`;
  if (!hits.length) return '';
  const open = offersOpen();
  return `<div class="emptied-box offers-box ${open ? 'open' : ''}">
    <button class="emptied-head" data-shop-act="offers-toggle" aria-expanded="${open}">
      <span>🏷 Erbjudanden för er · ${esc(storeLabel(slug))}</span><span class="count">${hits.length}</span><span class="chev" aria-hidden="true">›</span>
    </button>
    ${open ? `<div class="emptied-list">${hits.map((h, k) => `
      <div class="emptied-row offer-row">
        <div class="emptied-name"><b>${esc(h.offer.name)}</b> ${esc(h.offer.size)} · <b class="price">${esc(h.offer.price)}</b>
          <div class="offer-sub">${[h.offer.brand, h.offer.regular.replace(/\.$/, ''), h.offer.validTo ? `t.o.m. ${shortDate(h.offer.validTo)}` : '', h.reason].filter(Boolean).map(esc).join(' · ')}</div></div>
        ${h.onList ? '<span class="on-list" title="Står på listan">✓</span>'
          : `<button class="icon-mini add" data-offer-add="${k}" aria-label="Lägg ${esc(h.product.name)} på listan">+</button>`}
      </div>`).join('')}</div>
    <div class="emptied-all"><a class="link-btn quiet" href="https://www.ica.se/erbjudanden/${esc(slug)}/" target="_blank" rel="noopener">Alla erbjudanden i butiken</a></div>` : ''}
  </div>`;
}

async function addFromOffer(k) {
  const h = relevantOffers()[k];
  if (!h) return;
  await addShopping({ product: h.product, name: h.product.name, note: `Extrapris ${h.offer.price}${h.offer.validTo ? ` t.o.m. ${shortDate(h.offer.validTo)}` : ''}` });
  updateShopBadge();
  renderShop();
  toast(`${h.product.name} på listan`);
}

// ---------- Välj butik (Mer) ----------
function storeCardHtml() {
  const slug = state.settings?.icaStore;
  if (!Sync.enabled) return '';
  return `<div class="card" id="store-card">
    <h3>ICA-butik</h3>
    <p>${slug ? `Erbjudanden hämtas från <b>${esc(storeLabel(slug))}</b>. Gäller hela hushållet.`
      : 'Välj butiken ni handlar i, så visas dess erbjudanden på varor ni brukar köpa.'}</p>
    ${Sync.status.user ? `<div class="field"><input id="store-q" type="search" placeholder="Sök butik, t.ex. kvantum lund" autocomplete="off"></div>
      <div id="store-results"></div>` : '<p class="meta">Logga in i Delat hushåll först.</p>'}
  </div>`;
}

function bindStoreCard(root) {
  const q = root.querySelector('#store-q');
  if (!q) return;
  let timer;
  q.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const box = root.querySelector('#store-results');
      if (q.value.trim().length < 2) { box.innerHTML = ''; return; }
      box.innerHTML = '<p class="meta">Söker…</p>';
      try {
        const slugs = await Sync.searchIcaStores(q.value.trim());
        box.innerHTML = slugs.length ? `<div class="list">${slugs.map(s => `
          <button class="row" data-store="${esc(s.split('/').pop())}"><span class="thumb">🛒</span>
            <div class="r-main"><div class="r-name">${esc(storeLabel(s))}</div><div class="r-sub">${esc(storeCity(s))}</div></div></button>`).join('')}</div>`
          : '<p class="meta">Ingen butik matchade. Prova ort eller butikstyp, t.ex. ”maxi lund”.</p>';
      } catch (e) {
        box.innerHTML = `<p class="meta">${/schema cache|Could not find/.test(e.message) ? 'Erbjudandefunktionen är inte installerad i Supabase än.' : esc(e.message)}</p>`;
      }
    }, 350);
  });
  root.querySelector('#store-results').addEventListener('click', async e => {
    const b = e.target.closest('[data-store]');
    if (!b) return;
    await saveSettings({ icaStore: b.dataset.store });
    state.offers = null;
    toast(`Erbjudanden från ${storeLabel(b.dataset.store)}`);
    renderMore();
    loadOffers(true);
  });
}

// ---------- Alla erbjudanden ----------
// Visas i Inköp när man växlar till "Erbjudanden". Erbjudanden som matchar era varor märks "För er".
const offerFilter = { q: '', cat: 'Alla' };
// Avdelningar som inte är mat hamnar sist.
const NONFOOD = ['Hem & fritid', 'Hälsa & skönhet', 'Djur'];
function catOrder(a, b) {
  const r = c => (c === 'För er' ? -1 : NONFOOD.includes(c) ? 1 + NONFOOD.indexOf(c) : 0);
  return r(a) - r(b) || a.localeCompare(b, 'sv');
}
// Hopfällda avdelningar kommer man ihåg per telefon.
function collapsedCats() {
  try { return new Set(JSON.parse(localStorage.getItem('hemma-offer-collapsed') || '[]')); } catch { return new Set(); }
}
function saveCollapsed(set) {
  try { localStorage.setItem('hemma-offer-collapsed', JSON.stringify([...set])); } catch {}
}
function toggleOfferCat(name) {
  const set = collapsedCats();
  set.has(name) ? set.delete(name) : set.add(name);
  saveCollapsed(set);
  renderShop();
}
function setAllOfferCats(collapse, names) {
  saveCollapsed(collapse ? new Set(names) : new Set());
  renderShop();
}

// Koppla ett erbjudande till en vara i katalogen (streckkod först, annars namn).
// Resultatet sparas tills Inköp ritas om från början, så att sökningen går snabbt.
const offerProductCache = new Map();
function productForOffer(offer) {
  if (offerProductCache.has(offer.id)) return offerProductCache.get(offer.id);
  const p = findProductForOffer(offer);
  offerProductCache.set(offer.id, p);
  return p;
}
function findProductForOffer(offer) {
  for (const p of state.products.values()) {
    if (!p.deleted && p.barcodes?.some(b => offer.eans.includes(b.code))) return p;
  }
  const ing = parseIngredient(offer.name);
  let best = null, bestScore = 59;
  for (const p of state.products.values()) {
    if (p.deleted || p.hidden) continue;
    const s = Math.max(...ing.alts.map(a => productScore(a, p)));
    if (s > bestScore) { bestScore = s; best = p; }
  }
  return best;
}

function shopModeHtml() {
  if (!state.settings?.icaStore) return '';
  const n = state.offers?.list?.length || 0;
  const mode = state.shopMode || 'list';
  return `<div class="seg" role="tablist">
    <button role="tab" class="${mode === 'list' ? 'on' : ''}" data-shop-mode="list">Inköpslista</button>
    <button role="tab" class="${mode === 'offers' ? 'on' : ''}" data-shop-mode="offers">Erbjudanden${n ? ` · ${n}` : ''}</button>
  </div>`;
}

function renderAllOffers(el) {
  const slug = state.settings?.icaStore;
  const list = state.offers?.slug === slug ? state.offers?.list || [] : [];
  if (!list.length) {
    el.innerHTML = shopModeHtml() + (offersLoading
      ? '<p class="meta">Hämtar erbjudanden…</p>'
      : emptyHtml('🏷', 'Inga erbjudanden hittades', state.offers?.error ? `Kunde inte hämta: ${esc(state.offers.error)}` : 'Försök igen om en stund.'));
    return;
  }
  const mine = new Set(relevantOffers().map(h => h.offer.id));
  const onList = new Set(openItems().map(i => i.productId).filter(Boolean));
  const onListNames = new Set(openItems().map(i => norm(i.name)));
  const cats = [...new Set(list.map(o => o.category).filter(Boolean))].sort(catOrder);
  const q = norm(offerFilter.q);
  const shown = list
    .filter(o => offerFilter.cat === 'Alla' || (offerFilter.cat === 'För er' ? mine.has(o.id) : o.category === offerFilter.cat))
    .filter(o => !q || norm(`${o.name} ${o.brand}`).includes(q))
    .sort((a, b) => (mine.has(b.id) - mine.has(a.id)) || catOrder(a.category, b.category) || a.name.localeCompare(b.name, 'sv'));

  const groups = [];
  for (const o of shown) {
    const g = mine.has(o.id) && offerFilter.cat === 'Alla' ? 'För er' : o.category || 'Övrigt';
    if (!groups.length || groups[groups.length - 1].name !== g) groups.push({ name: g, items: [] });
    groups[groups.length - 1].items.push(o);
  }
  // Vid sökning eller vald avdelning visas allt utfällt, annars som man lämnade det.
  const collapsed = q || offerFilter.cat !== 'Alla' ? new Set() : collapsedCats();
  const allCollapsed = groups.length && groups.every(g => collapsed.has(g.name));

  el.innerHTML = `${shopModeHtml()}
    <div class="offer-tools"><input id="offer-q" type="search" placeholder="Sök bland erbjudandena" value="${esc(offerFilter.q)}" autocomplete="off">
      ${!q && offerFilter.cat === 'Alla' && groups.length > 1 ? `<button class="link-btn quiet" data-offer-all="${allCollapsed ? 'open' : 'close'}">${allCollapsed ? 'Fäll ut' : 'Fäll ihop'}</button>` : ''}</div>
    <div class="filters">${['Alla', ...(mine.size ? ['För er'] : []), ...cats].map(c =>
      `<button class="chip ${c === offerFilter.cat ? 'on' : ''}" data-offer-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    ${groups.map(g => `<button class="group group-toggle ${collapsed.has(g.name) ? 'closed' : ''}" data-offer-group="${esc(g.name)}" aria-expanded="${!collapsed.has(g.name)}">
        <h2><span class="chev" aria-hidden="true">›</span> ${esc(g.name)}</h2><span class="count">${g.items.length}</span></button>
      ${collapsed.has(g.name) ? '' : `<div class="list">${g.items.map(o => {
        const p = productForOffer(o);
        const listed = p ? onList.has(p.id) : onListNames.has(norm(o.name));
        return `<div class="emptied-row offer-row">
          <span class="thumb small">${iconFor(o.name, p?.category || o.category)}</span>
          <div class="emptied-name"><b>${esc(o.name)}</b> ${esc(o.size)} · <b class="price">${esc(o.price)}</b>${mine.has(o.id) ? ' <span class="offer-tag">För er</span>' : ''}
            <div class="offer-sub">${[o.brand, o.regular.replace(/\.$/, ''), o.validTo ? `t.o.m. ${shortDate(o.validTo)}` : '', o.info].filter(Boolean).map(esc).join(' · ')}</div></div>
          ${listed ? '<span class="on-list" title="Står på listan">✓</span>'
            : `<button class="icon-mini add" data-offer-any="${esc(o.id)}" aria-label="Lägg ${esc(o.name)} på listan">+</button>`}
        </div>`;
      }).join('')}</div>`}`).join('') || '<p class="meta">Inga erbjudanden matchar.</p>'}
    <p class="meta"><a href="https://www.ica.se/erbjudanden/${esc(slug)}/" target="_blank" rel="noopener">Öppna erbjudandena på ica.se</a></p>`;

  el.dataset.groups = JSON.stringify(groups.map(g => g.name));
  const input = el.querySelector('#offer-q');
  input.addEventListener('input', () => {
    offerFilter.q = input.value;
    const pos = input.selectionStart;
    renderAllOffers(el);
    const again = el.querySelector('#offer-q');
    again.focus();
    again.setSelectionRange(pos, pos);
  });
}

async function addAnyOffer(id) {
  const offer = state.offers?.list?.find(o => o.id === id);
  if (!offer) return;
  const product = productForOffer(offer);
  const name = product ? product.name : [offer.name, offer.size].filter(Boolean).join(' ');
  // ICA:s avdelning → inköpslistans butiksordning, för varor som inte finns i katalogen.
  const ICA_AISLE = { 'Mejeri': 'Mejeri', 'Frukt & Grönt': 'Grönsaker', 'Bröd, kex & bageri': 'Bröd', 'Djupfryst': 'Fryst',
    'Färskvaror': 'Kött', 'Skafferivaror': 'Skafferi', 'Dryck': 'Dryck', 'Kött, chark & fågel': 'Kött', 'Fisk & skaldjur': 'Fisk & skaldjur' };
  const item = await addShopping({ product, name, category: ICA_AISLE[offer.category] || null, note: `Extrapris ${offer.price}${offer.validTo ? ` t.o.m. ${shortDate(offer.validTo)}` : ''}${offer.brand ? ` · ${offer.brand}` : ''}` });
  updateShopBadge();
  renderShop();
  toast(`${item.name} på listan`, { type: 'shop-added', itemId: item.id });
}
