'use strict';

// ---------- Konstanter ----------
const PLACES = [
  { id: 'kyl', label: 'Kyl', icon: '❄️' },
  { id: 'frys', label: 'Frys', icon: '🧊' },
  { id: 'skafferi', label: 'Skafferi', icon: '🥫' },
];
const UNITS = ['g', 'kg', 'st', 'förp', 'l', 'dl'];
const QUICK_QTY = {
  g: [100, 250, 400, 500, 1000],
  kg: [0.5, 1, 1.5, 2],
  st: [1, 2, 4, 6, 12],
  'förp': [1, 2, 3],
  l: [0.5, 1, 1.5, 2],
  dl: [1, 2, 2.5, 5],
};
const STEP = { g: 50, kg: 0.5, st: 1, 'förp': 1, l: 0.5, dl: 1 };
const CATEGORY_ICON = {
  'Fisk & skaldjur': '🐟', 'Kött': '🥩', 'Mejeri': '🧀', 'Ägg': '🥚', 'Frukt': '🍎',
  'Grönsaker': '🥕', 'Bröd': '🍞', 'Skafferi': '🫙', 'Kryddor': '🧂', 'Fryst': '🧊',
  'Färdigmat': '🍱', 'Dryck': '🧃', 'Vegetariskt': '🌱', 'Rester': '🍲', 'Övrigt': '📦',
};
const CATEGORIES = Object.keys(CATEGORY_ICON);
const FREEZE_DAYS = 90;
// Ikon per vara utifrån namnet; första träffen vinner, så specifika ord står före allmänna.
// Faller tillbaka på kategorins ikon.
const NAME_ICONS = [
  [/kokos/, '🥥'], [/jordnöt|nötter|mandl|cashew/, '🥜'], [/vattenmelon/, '🍉'], [/sötpotatis/, '🍠'],
  [/vitlök/, '🧄'], [/lök|purjo|schalotten/, '🧅'], [/pommes/, '🍟'], [/potatis/, '🥔'],
  [/mjölk|yoghurt|kvarg|grädd|crème|fil$/, '🥛'], [/mjöl(?!k)|bulgur|couscous|quinoa/, '🌾'],
  [/smör|bregott|margarin/, '🧈'], [/ost$|ost\s|parmesan|mozzarella|feta|halloumi|brie|cheddar|präst|herrgård|keso|ricotta|mascarpone/, '🧀'],
  [/^ägg/, '🥚'], [/granatäpple/, '🍎'], [/äpple/, '🍎'], [/banan/, '🍌'], [/päron/, '🍐'], [/apelsin|clementin/, '🍊'],
  [/citron|lime/, '🍋'], [/avokado/, '🥑'], [/kiwi/, '🥝'], [/mango/, '🥭'], [/ananas/, '🍍'], [/vindruv|russin/, '🍇'],
  [/jordgubb/, '🍓'], [/blåbär|hallon/, '🫐'], [/melon/, '🍈'], [/persika|plommon/, '🍑'], 
  [/morot|palsternack/, '🥕'], [/tomat/, '🍅'], [/körsbär/, '🍒'], [/sparris/, '🌿'], [/gurka/, '🥒'], [/paprika(?!pulver)/, '🫑'], [/chili/, '🌶️'],
  [/broccoli/, '🥦'], [/sallad|spenat|rucola|kål/, '🥬'], [/champinjon|svamp/, '🍄'], [/majs(?!stärkelse)/, '🌽'],
  [/ärtor|haricots|bön|kikärt|lins/, '🫘'], [/aubergine/, '🍆'], [/ingefära/, '🫚'],
  [/basilika|persilja|dill|koriander|gräslök|timjan|oregano|lagerblad/, '🌿'],
  [/räk|kräft|skagen/, '🦐'], [/mussl/, '🦪'], [/lax|torsk|sej|kolja|fisk|sill|makrill|tonfisk|ansjovis|kaviar/, '🐟'],
  [/pasta|spaghetti|makaron|penne|lasagne|nudl/, '🍝'],
  [/kyckling|kalkon/, '🍗'], [/bacon|sidfläsk/, '🥓'], [/korv|chorizo|salami/, '🌭'], [/skinka|prosciutto/, '🍖'],
  [/färs|biff|entrecôte|filé|högrev|grytbit|lamm|fläsk|karré|kotlett|köttbull/, '🥩'],
  [/^ris|risotto|jasmin|basmati/, '🍚'],
  [/havregryn|müsli|flingor/, '🥣'], [/kanelbull/, '🥐'], [/tortilla|pita/, '🫓'], [/bröd|baguette|knäcke/, '🍞'],
  [/pizza/, '🍕'], [/pannkak/, '🥞'], [/glass/, '🍨'], [/choklad|nutella|kakao/, '🍫'], [/honung|sirap/, '🍯'],
  [/socker/, '🍬'], [/kaffe/, '☕'], [/^te$/, '🍵'], [/juice/, '🧃'], [/läsk/, '🥤'], [/vatten/, '💧'],
  [/öl$/, '🍺'], [/vin$/, '🍷'], [/olja/, '🫒'], [/salt$/, '🧂'], [/popcorn/, '🍿'], [/chips/, '🥔'], [/kex/, '🍪'],
  [/tofu|quorn|soja|vego|falafel/, '🌱'], [/hummus|tzatziki|ketchup|senap|majonnäs|pesto|sås|sylt/, '🥫'],
];
function iconFor(name, category) {
  const n = String(name || '').toLocaleLowerCase('sv-SE');
  for (const [re, icon] of NAME_ICONS) if (re.test(n)) return icon;
  return CATEGORY_ICON[category] || '📦';
}

// ---------- Tillstånd ----------
const state = {
  view: 'home',
  stockPlace: 'alla',
  products: new Map(),
  lots: [],
  recipes: [],
  shopping: [],
  events: [],
  recipeList: 'Alla',
  history: [],
  settings: {},
  offers: null,
  shopMode: 'list',
  extraLists: [],
  photoUrls: new Map(),
  suggestions: [],
  active: 0,
  undo: null,
};

const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Datum ----------
function todayIso() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function addDays(iso, days) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function daysBetween(fromIso, toIso) {
  return Math.round((new Date(toIso + 'T12:00:00') - new Date(fromIso + 'T12:00:00')) / 86400000);
}
function daysLeft(lot) {
  return lot.bestBefore ? daysBetween(todayIso(), lot.bestBefore) : null;
}
function shortDate(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
}
function expiryBadge(lot) {
  if (lot.low) return '<span class="badge warn">Snart slut</span>';
  const d = daysLeft(lot);
  if (d === null) return '';
  // Förbrukningsvaror håller länge; datumet är bara intressant när det närmar sig.
  if (d > 14 && isStaple(state.products.get(lot.productId))) return '';
  let cls = 'ok', text;
  if (d < 0) { cls = 'bad'; text = d === -1 ? 'Gick ut igår' : `Gick ut för ${-d} d`; }
  else if (d === 0) { cls = 'bad'; text = 'Idag'; }
  else if (d === 1) { cls = 'warn'; text = 'Imorgon'; }
  else if (d <= 3) { cls = 'warn'; text = `${d} dagar`; }
  else if (d <= 14) { text = `${d} dagar`; }
  else { cls = ''; text = shortDate(lot.bestBefore); }
  return `<span class="badge ${cls}">${text}</span>`;
}

// ---------- Mängder ----------
const nf = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 2 });
function fmtQty(qty, unit) {
  if (unit === 'g' && qty >= 1000) return `${nf.format(qty / 1000)} kg`;
  if (unit === 'förp') return `${nf.format(qty)} förp`;
  return `${nf.format(qty)} ${unit}`;
}
function roundQty(q, unit) {
  const step = { g: q < 20 ? 1 : 5, kg: 0.05, l: 0.05, dl: 0.25, st: 0.25, 'förp': 0.25 }[unit] || 0.01;
  return Math.max(0, Math.round(q / step) * step);
}
function parseNum(s) {
  const n = parseFloat(String(s).replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

// ---------- Sök ----------
function norm(s) { return s.toLocaleLowerCase('sv-SE').trim(); }

// Damerau-Levenshtein med tidig avbrytning – tål en bokstav fel, bortglömd eller omkastad.
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

function matchScore(name, q) {
  const n = norm(name);
  if (n === q) return 120;
  if (n.startsWith(q)) return 100 - Math.min(n.length - q.length, 15) * 0.5;
  const words = n.split(/[\s-]+/);
  if (words.some(w => w.startsWith(q))) return 80;
  if (n.includes(q)) return 60;
  if (q.length >= 3) {
    const max = q.length >= 6 ? 2 : 1;
    const dist = w => Math.min(editDistance(q, w.slice(0, q.length), max), editDistance(q, w.slice(0, q.length + 1), max));
    // Träff i början av namnet väger tyngre än träff på ett senare ord.
    const first = dist(n);
    const later = Math.min(...words.slice(1).map(dist), max + 1);
    if (first <= max) return 48 - first * 10;
    if (later <= max) return 40 - later * 10;
  }
  return 0;
}

function search(qRaw) {
  const q = norm(qRaw);
  if (!q) return [];
  const results = [];
  const shopping = state.view === 'shop';

  const lots = shopping ? [] : state.lots
    .map(l => ({ l, s: matchScore(l.name, q) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s || (a.l.bestBefore || '9').localeCompare(b.l.bestBefore || '9'))
    .slice(0, 4);
  if (lots.length) {
    results.push({ type: 'head', label: 'Finns hemma' });
    for (const { l } of lots) results.push({ type: 'lot', lot: l });
  }

  const prods = [...state.products.values()]
    .filter(p => !p.deleted && !p.hidden)
    .map(p => ({ p, s: matchScore(p.name, q) }))
    .filter(x => x.s > 0)
    .map(x => ({ ...x, s: x.s + Math.min((x.p.uses || 0) * 4, 30) }))
    .sort((a, b) => b.s - a.s || a.p.name.localeCompare(b.p.name, 'sv'))
    .slice(0, 8);
  results.push({ type: 'head', label: shopping ? 'Lägg på listan' : 'Lägg till' });
  for (const { p } of prods) results.push({ type: 'product', product: p });

  const exact = prods.some(x => norm(x.p.name) === q);
  if (!exact) results.push({ type: 'new', name: qRaw.trim() });
  return results;
}

function highlight(name, qRaw) {
  const q = norm(qRaw);
  const i = norm(name).indexOf(q);
  if (i < 0 || !q) return esc(name);
  return esc(name.slice(0, i)) + '<mark>' + esc(name.slice(i, i + q.length)) + '</mark>' + esc(name.slice(i + q.length));
}

function renderSuggest() {
  const ul = $('#suggest');
  const qv = $('#q').value;
  state.suggestions = search(qv);
  const pickable = state.suggestions.filter(s => s.type !== 'head');
  state.active = Math.min(state.active, pickable.length - 1);
  if (!qv.trim()) { ul.hidden = true; return; }
  let k = -1;
  ul.innerHTML = state.suggestions.map(s => {
    if (s.type === 'head') return `<li class="s-head">${s.label}</li>`;
    k++;
    const cls = k === state.active ? 'active' : '';
    if (s.type === 'lot') {
      const l = s.lot;
      return `<li class="${cls}" data-k="${k}" role="option">
        ${thumbHtml(l)}
        <div class="s-label"><div class="s-name">${highlight(l.name, qv)}</div>
        <div class="s-sub">${qtyLabel(l)} · ${placeLabel(l.place)}</div></div>
        ${expiryBadge(l)}</li>`;
    }
    if (s.type === 'product') {
      const p = s.product;
      return `<li class="${cls}" data-k="${k}" role="option">
        <span class="thumb">${iconFor(p.name, p.category)}</span>
        <div class="s-label"><div class="s-name">${highlight(p.name, qv)}</div>
        <div class="s-sub">${state.view === 'shop' ? stockHint(p) : `${esc(p.category)} · ${placeLabel(p.place)}`}</div></div>
        <span class="s-tag">${state.view === 'shop' ? '+ På listan' : '+ Lägg till'}</span></li>`;
    }
    return `<li class="${cls}" data-k="${k}" role="option">
      <span class="thumb">✨</span>
      <div class="s-label"><div class="s-name">Ny vara: ”${esc(s.name)}”</div>
      <div class="s-sub">Läggs till i din egen lista</div></div></li>`;
  }).join('');
  ul.hidden = false;
}

function pickSuggestion(k) {
  const s = state.suggestions.filter(x => x.type !== 'head')[k];
  if (!s) return;
  clearQuery();
  if (state.view === 'shop') { s.type === 'product' ? addFromSearch(s.product) : addFromSearch(null, s.name); return; }
  if (s.type === 'lot') openLotSheet(s.lot);
  else if (s.type === 'product') openAddSheet(s.product);
  else openAddSheet(null, s.name);
}

// ---------- Förbrukningsvaror ----------
// Basvaror där mängden inte är värd att räkna: bara "finns", "snart slut" eller "slut".
const STAPLE_RE = /^(salt|svartpeppar|olja|olivolja|rapsolja|sesamolja|vetemjöl|grahamsmjöl|strösocker|florsocker|farinsocker|vaniljsocker|bakpulver|majsstärkelse|vinäger|balsamvinäger|soja|buljong|fond|havregryn|torrjäst|honung|sirap|kakao|ketchup|senap|majonnäs|sweet chili|sriracha|ströbröd)$/i;
function isStaple(p) {
  if (!p) return false;
  if (p.staple != null) return p.staple;
  return p.category === 'Kryddor' || STAPLE_RE.test(p.name);
}
function qtyLabel(lot) {
  if (isStaple(state.products.get(lot.productId))) return lot.low ? 'Snart slut' : 'Finns';
  return fmtQty(lot.qty, lot.unit);
}

// Lägg på listan och fråga direkt om det som finns hemma är slut.
function openEmptyPrompt(product, lots) {
  const staple = isStaple(product);
  openSheet(`<div id="empty-prompt">
    <div class="sheet-head"><span class="thumb">${iconFor(product.name, product.category)}</span>
      <div><h3>${esc(product.name)} finns hemma</h3>
      <div class="sub">${lots.map(l => `${qtyLabel(l)} · ${placeLabel(l.place)}`).join(', ')} – är ${lots.length > 1 ? 'de' : 'den'} slut?</div></div></div>
    <button class="btn danger" data-e="empty">Slut – ta bort från lagret</button>
    <div style="height:8px"></div>
    ${staple ? `<button class="btn" data-e="low">Lite kvar – markera snart slut</button><div style="height:8px"></div>` : ''}
    <button class="btn" data-e="keep">Finns kvar</button>
  </div>`, root => {
    root.querySelector('#empty-prompt').addEventListener('click', async e => {
      const act = e.target.closest('[data-e]')?.dataset.e;
      if (!act) return;
      if (act === 'keep') { closeSheet(); return; }
      const now = new Date().toISOString();
      const befores = [], eventIds = [];
      for (const lot of lots) {
        befores.push({ ...lot });
        const updated = act === 'empty' ? { ...lot, qty: 0, status: 'used', updatedAt: now } : { ...lot, low: true, updatedAt: now };
        await db.put('lots', updated);
        state.lots = state.lots.filter(l => l.id !== lot.id);
        if (updated.status === 'active') state.lots.push(updated);
        if (act === 'empty') eventIds.push((await logEvent('used', updated, lot.qty)).id);
      }
      closeSheet();
      render();
      toast(act === 'empty' ? `${product.name} borttagen från lagret och på listan` : `${product.name}: snart slut`, { type: 'cook', befores, eventIds });
    });
  });
}

function stockHint(p) {
  const lots = state.lots.filter(l => l.productId === p.id);
  if (!lots.length) return 'Finns inte hemma';
  if (isStaple(p)) return lots.some(l => !l.low) ? 'Finns hemma' : 'Snart slut hemma';
  const total = lots.reduce((s, l) => s + l.qty, 0);
  return `Hemma: ${fmtQty(Math.round(total * 100) / 100, lots[0].unit)}`;
}

function clearQuery() {
  $('#q').value = '';
  $('#q').blur();
  $('#suggest').hidden = true;
  $('#q-clear').hidden = true;
  if (state.view === 'stock') render();
}

// ---------- Hjälpare för vy ----------
function placeLabel(id) { return PLACES.find(p => p.id === id)?.label || id; }
function thumbHtml(lot) {
  const url = lot.photoId && state.photoUrls.get(lot.photoId);
  if (url) return `<img class="thumb" src="${url}" alt="">`;
  return `<span class="thumb">${lot.category === 'Rester' ? '🍲' : iconFor(lot.name, lot.category)}</span>`;
}
function rowHtml(lot, sub) {
  return `<button class="row" data-lot="${lot.id}">
    ${thumbHtml(lot)}
    <div class="r-main"><div class="r-name">${esc(lot.name)}</div>
    <div class="r-sub">${sub ?? `${qtyLabel(lot)} · ${placeLabel(lot.place)}${lot.openedAt ? ' · öppnad' : ''}`}</div></div>
    ${expiryBadge(lot)}
  </button>`;
}
function sortByExpiry(a, b) {
  return (a.bestBefore || '9999').localeCompare(b.bestBefore || '9999') || a.name.localeCompare(b.name, 'sv');
}

// ---------- Vyer ----------
function render() {
  $('#title').textContent = { home: 'Ät först', stock: 'Lager', recipes: 'Recept', shop: 'Inköp', more: 'Mer' }[state.view];
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === state.view));
  for (const v of ['home', 'stock', 'recipes', 'shop', 'more']) $(`#view-${v}`).hidden = v !== state.view;
  if (state.view === 'home') renderHome();
  if (state.view === 'stock') renderStock();
  if (state.view === 'recipes') renderRecipes();
  if (state.view === 'shop') renderShop();
  updateShopBadge();
  if (state.view === 'more') renderMore();
}

function emptyHtml(icon, title, text) {
  return `<div class="empty"><div class="big">${icon}</div><strong>${title}</strong>${text}</div>`;
}

function renderHome() {
  const el = $('#view-home');
  const lots = [...state.lots].sort(sortByExpiry);
  if (!lots.length) {
    el.innerHTML = emptyHtml('🧺', 'Inget inlagt än', 'Skriv till exempel ”to” i fältet ovan och välj Torsk för att lägga in din första vara.');
    return;
  }
  const expired = lots.filter(l => daysLeft(l) !== null && daysLeft(l) < 0);
  const soon = lots.filter(l => { const d = daysLeft(l); return d !== null && d >= 0 && d <= 3; });
  const week = lots.filter(l => { const d = daysLeft(l); return d !== null && d > 3 && d <= 7; });
  const opened = lots.filter(l => l.openedAt && !expired.includes(l) && !soon.includes(l) && !week.includes(l));

  const section = (title, items) => items.length ? `
    <div class="group"><h2>${title}</h2><span class="count">${items.length}</span></div>
    <div class="list">${items.map(l => rowHtml(l)).join('')}</div>` : '';

  el.innerHTML = `
    <div class="stats">
      <div class="stat"><b>${lots.length}</b><span>varor hemma</span></div>
      <div class="stat"><b>${soon.length}</b><span>går ut inom 3 d</span></div>
      <div class="stat"><b>${expired.length}</b><span>har gått ut</span></div>
    </div>
    ${section('Har gått ut', expired)}
    ${section('Ät inom 3 dagar', soon)}
    ${section('Inom en vecka', week)}
    ${section('Öppnade', opened)}
    ${!expired.length && !soon.length && !week.length && !opened.length
      ? emptyHtml('✅', 'Inget brådskar', 'Ingenting går ut den närmaste veckan.') : ''}`;
}

function renderStock() {
  const el = $('#view-stock');
  const q = norm($('#q').value);
  let lots = state.lots.filter(l => state.stockPlace === 'alla' || l.place === state.stockPlace);
  if (q) lots = lots.filter(l => matchScore(l.name, q) > 0);

  const counts = Object.fromEntries(PLACES.map(p => [p.id, state.lots.filter(l => l.place === p.id).length]));
  const filters = `<div class="filters">
    <button class="chip ${state.stockPlace === 'alla' ? 'on' : ''}" data-place="alla">Alla ${state.lots.length}</button>
    ${PLACES.map(p => `<button class="chip ${state.stockPlace === p.id ? 'on' : ''}" data-place="${p.id}">${p.icon} ${p.label} ${counts[p.id]}</button>`).join('')}
  </div>`;

  if (!state.lots.length) {
    el.innerHTML = filters + emptyHtml('🧺', 'Lagret är tomt', 'Varor du lägger till hamnar här, sorterade på kyl, frys och skafferi.');
    return;
  }
  const groups = PLACES.map(p => ({ p, items: lots.filter(l => l.place === p.id).sort((a, b) => a.name.localeCompare(b.name, 'sv') || sortByExpiry(a, b)) }))
    .filter(g => g.items.length);
  el.innerHTML = `<button class="btn ai-btn" data-action="ai">✨ Receptidéer med AI</button>` + filters + (groups.length ? groups.map(g => `
    <div class="group"><h2>${g.p.icon} ${g.p.label}</h2><span class="count">${g.items.length}</span></div>
    <div class="list">${g.items.map(l => rowHtml(l)).join('')}</div>`).join('')
    : emptyHtml('🔍', 'Inga träffar', 'Ingen vara hemma matchar sökningen.'));
}

async function renderMore() {
  const el = $('#view-more');
  const events = (await db.all('events')).filter(e => !e.deleted);
  const monthStart = todayIso().slice(0, 8) + '01';
  const thisMonth = events.filter(e => e.ts.slice(0, 10) >= monthStart);
  const discarded = thisMonth.filter(e => e.type === 'discarded');
  const used = thisMonth.filter(e => e.type === 'used');
  el.innerHTML = `
    <div class="stats">
      <div class="stat"><b>${thisMonth.filter(e => e.type === 'added').length}</b><span>inlagda i månaden</span></div>
      <div class="stat"><b>${used.length}</b><span>uppätna</span></div>
      <div class="stat"><b>${discarded.length}</b><span>slängda</span></div>
    </div>
    ${discarded.length ? `<div class="card"><h3>Slängt den här månaden</h3><p>${discarded.map(e => esc(e.name)).join(', ')}</p></div>` : ''}
    <div class="card">
      <h3>Säkerhetskopia</h3>
      <p>Allt sparas just nu bara i den här telefonen. Spara en kopia ibland, eller flytta data till en annan telefon.</p>
      <div class="btn-row">
        <button class="btn" data-action="export">Spara kopia</button>
        <button class="btn" data-action="import">Läs in kopia</button>
      </div>
      <input id="import-input" type="file" accept="application/json,.json" hidden>
    </div>
    <div class="card" id="sync-card"></div>
    ${storeCardHtml()}
    <div class="card">
      <h3>Egna varor</h3>
      <p>${[...state.products.values()].filter(p => p.custom && !p.deleted).map(p => esc(p.name)).join(', ') || 'Inga egna varor än. Skriv ett namn som inte finns så skapas den.'}</p>
    </div>
    <p class="meta">Hemma · version 0.3</p>`;
  renderSyncCard();
  bindStoreCard(el);
}

// ---------- Synk-kortet ----------
const syncForm = { email: '', busy: false, error: '' };

function renderSyncCard() {
  const el = $('#sync-card');
  if (!el) return;
  const st = Sync.status;
  const err = syncForm.error ? `<p style="color:var(--bad)">${esc(syncForm.error)}</p>` : '';
  const dis = syncForm.busy ? 'disabled' : '';
  let html;
  if (!st.enabled) {
    html = `<h3>Delat hushåll</h3><p>Synk är inte inställd än – config.js saknar Supabase-uppgifter.</p>`;
  } else if (!st.user) {
    html = `<h3>Delat hushåll</h3><p>Logga in för att dela lagret med resten av hushållet. Första gången trycker du på ”Skapa konto”.</p>
      <div class="field"><input id="s-email" type="text" inputmode="email" autocomplete="email" autocapitalize="off" placeholder="namn@exempel.se" value="${esc(syncForm.email)}"></div>
      <div class="field"><input id="s-pw" type="password" autocomplete="current-password" placeholder="Lösenord, minst 6 tecken"></div>
      ${err}<div class="btn-row"><button class="btn" data-sync="signup" ${dis}>Skapa konto</button><button class="btn primary" data-sync="signin" ${dis}>Logga in</button></div>`;
  } else if (!st.household) {
    html = `<h3>Välj hushåll</h3><p>Inloggad som ${esc(st.user.email)}. Skapa ett hushåll, eller gå med i ett som någon annan redan skapat.</p>
      <div class="field"><input id="s-hname" type="text" placeholder="Namn, t.ex. Hemma" value="Hemma"></div>
      <button class="btn primary" data-sync="create" ${dis}>Skapa hushåll</button>
      <hr class="sep">
      <div class="field"><input id="s-join" type="text" placeholder="Inbjudningskod, t.ex. 3F9A2C" autocapitalize="characters"></div>
      ${err}<button class="btn" data-sync="join" ${dis}>Gå med</button>
      <p class="meta"><a href="#" data-sync="signout">Logga ut</a></p>`;
  } else {
    const line = !st.online ? 'Offline – ändringar skickas när nätet är tillbaka'
      : st.busy ? 'Synkar…'
      : st.error ? `Fel: ${st.error}`
      : st.pending ? `${st.pending} ändringar väntar`
      : st.lastSync ? `Synkad ${st.lastSync.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}` : 'Ansluter…';
    html = `<h3>${esc(st.household.name)}</h3>
      <p>Inbjudningskod: <strong style="color:var(--text);letter-spacing:.08em">${esc(st.household.invite_code || '…')}</strong><br>
      Den andra telefonen loggar in och väljer ”Gå med” med koden.</p>
      <p style="color:${st.error ? 'var(--bad)' : 'var(--muted)'}">${esc(line)}</p>
      <div class="btn-row"><button class="btn" data-sync="now">Synka nu</button><button class="btn" data-sync="signout">Logga ut</button></div>
      <p class="meta">Inloggad som ${esc(st.user.email)}</p>`;
  }
  el.innerHTML = html;
}

async function syncAction(action) {
  // Läs fälten innan kortet ritas om, annars töms de.
  const form = Object.fromEntries(['#s-email', '#s-pw', '#s-hname', '#s-join'].map(id => [id, $(id)?.value || '']));
  const val = id => form[id].trim();
  syncForm.error = '';
  syncForm.busy = true;
  renderSyncCard();
  try {
    if (action === 'signin' || action === 'signup') {
      syncForm.email = val('#s-email');
      const pw = form['#s-pw'];
      if (!/^\S+@\S+\.\S+$/.test(syncForm.email)) throw new Error('Skriv en giltig e-postadress');
      if (pw.length < 6) throw new Error('Lösenordet måste vara minst 6 tecken');
      await (action === 'signin' ? Sync.signIn(syncForm.email, pw) : Sync.signUp(syncForm.email, pw));
    }
    if (action === 'create') await Sync.createHousehold(val('#s-hname'));
    if (action === 'join') await Sync.joinHousehold(val('#s-join'));
    if (action === 'now') await Sync.syncNow();
    if (action === 'signout') await Sync.signOut();
  } catch (e) {
    const m = e.message || '';
    syncForm.error = /Okänd kod/.test(m) ? 'Hittade inget hushåll med den koden'
      : /Invalid login credentials/i.test(m) ? 'Fel e-post eller lösenord'
      : /already registered|already exists/i.test(m) ? 'Kontot finns redan – tryck Logga in'
      : /Email not confirmed/i.test(m) ? 'Kontot är skapat men måste bekräftas. Stäng av ”Confirm email” i Supabase, eller klicka på länken i mejlet och logga sedan in.'
      : /Signups not allowed/i.test(m) ? 'Nya konton är avstängda i Supabase'
      : /rate limit/i.test(m) ? 'För många försök – vänta en stund'
      : m;
  }
  syncForm.busy = false;
  renderSyncCard();
}

// ---------- Blad ----------
function openSheet(html, onMount) {
  const sheet = $('#sheet');
  sheet.innerHTML = `<div class="sheet-top"><div class="grab"></div><button class="sheet-close" type="button" aria-label="Stäng">✕</button></div>${html}`;
  sheet.hidden = false;
  sheet.scrollTop = 0;
  $('#sheet-backdrop').hidden = false;
  sheet.querySelector('.sheet-close').addEventListener('click', closeSheet);
  bindSheetDrag(sheet);
  // Telefonens bakåtknapp (Android) ska stänga bladet, inte lämna appen.
  if (!history.state?.sheet) history.pushState({ sheet: 1 }, '');
  onMount?.(sheet);
}

// Dra bladet nedåt i överkanten för att stänga det.
function bindSheetDrag(sheet) {
  const top = sheet.querySelector('.sheet-top');
  let startY = null, dy = 0;
  top.addEventListener('touchstart', e => { startY = e.touches[0].clientY; dy = 0; sheet.style.transition = 'none'; }, { passive: true });
  top.addEventListener('touchmove', e => {
    if (startY === null) return;
    dy = Math.max(0, e.touches[0].clientY - startY);
    sheet.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  top.addEventListener('touchend', () => {
    sheet.style.transition = '';
    sheet.style.transform = '';
    if (dy > 80) closeSheet();
    startY = null;
  });
}
function closeSheet() {
  state.afterAdd = null;
  state.pendingBarcode = null;
  $('#sheet').hidden = true;
  $('#sheet-backdrop').hidden = true;
  $('#sheet').innerHTML = '';
  $('#sheet').style.transform = '';
}

function chipsHtml(name, options, selected) {
  return `<div class="chips" data-chips="${name}">${options.map(o =>
    `<button type="button" class="chip ${String(o.value) === String(selected) ? 'on' : ''}" data-value="${esc(o.value)}">${o.label}</button>`).join('')}</div>`;
}
function bindChips(root, name, onPick) {
  root.querySelector(`[data-chips="${name}"]`).addEventListener('click', e => {
    const b = e.target.closest('.chip');
    if (!b) return;
    root.querySelectorAll(`[data-chips="${name}"] .chip`).forEach(c => c.classList.toggle('on', c === b));
    onPick(b.dataset.value);
  });
}

function quickQtyHtml(unit) {
  return (QUICK_QTY[unit] || []).map(v => `<button type="button" class="chip" data-q="${v}">${fmtQty(v, unit)}</button>`).join('');
}

// Bladet för att lägga till en vara (befintlig katalogvara eller helt ny).
// prefill: { qty, unit } från en skannad förpackning.
function openAddSheet(product, newName, prefill = {}) {
  const isNew = !product;
  const staple = !isNew && isStaple(product);
  const p = product || { name: newName.charAt(0).toUpperCase() + newName.slice(1), category: 'Övrigt', unit: 'st', place: 'kyl', shelfDays: 7 };
  // Förpackningens enhet till appens: 500 ml → 5 dl, 33 cl → 3,3 dl.
  let preQty = prefill.qty || null, preUnit = prefill.unit || null;
  if (preUnit === 'ml') { preQty = preQty / 100; preUnit = 'dl'; }
  if (preUnit === 'cl') { preQty = preQty / 10; preUnit = 'dl'; }
  if (preUnit && !UNITS.includes(preUnit)) preUnit = null;
  const form = {
    qty: '', unit: (isNew && preUnit) || p.unit, place: p.place, category: p.category,
    bestBefore: p.shelfDays ? addDays(todayIso(), p.shelfDays) : '',
    photoBlob: null,
  };
  const defaultBest = place => {
    if (place === 'frys' && p.place !== 'frys') return addDays(todayIso(), FREEZE_DAYS);
    return p.shelfDays ? addDays(todayIso(), p.shelfDays) : '';
  };

  openSheet(`
    <div class="sheet-head">
      <span class="thumb" id="add-thumb">${iconFor(p.name, form.category)}</span>
      <div><h3>${esc(p.name)}</h3><div class="sub">${isNew ? 'Ny vara' : esc(p.category)}</div></div>
    </div>
    ${isNew ? `<div class="field"><label for="f-cat">Kategori</label>
      <select id="f-cat">${CATEGORIES.map(c => `<option ${c === form.category ? 'selected' : ''}>${c}</option>`).join('')}</select></div>` : ''}
    ${staple ? `<p class="meta">Förbrukningsvara – appen håller bara koll på att den finns hemma.</p>` : ''}
    <div class="field" ${staple ? 'hidden' : ''}>
      <label for="f-qty">Hur mycket?</label>
      <div class="qty">
        <button type="button" class="step" data-step="-1" aria-label="Minska">−</button>
        <input id="f-qty" inputmode="decimal" placeholder="0" autocomplete="off" value="${preQty ? nf.format(Math.round(preQty * 100) / 100) : ''}">
        <button type="button" class="step" data-step="1" aria-label="Öka">+</button>
      </div>
      <div class="chips small" id="f-quick" style="margin-top:10px">${quickQtyHtml(form.unit)}</div>
    </div>
    <div class="field" ${staple ? 'hidden' : ''}><span class="label">Enhet</span>
      ${chipsHtml('unit', UNITS.map(u => ({ value: u, label: u })), form.unit)}</div>
    <div class="field"><span class="label">Var?</span>
      ${chipsHtml('place', PLACES.map(pl => ({ value: pl.id, label: `${pl.icon} ${pl.label}` })), form.place)}</div>
    <div class="field">
      <label for="f-best">Bäst före</label>
      <input id="f-best" type="date" value="${form.bestBefore}">
      <div class="chips small" id="f-best-quick" style="margin-top:10px">
        <button type="button" class="chip" data-d="3">+3 dagar</button>
        <button type="button" class="chip" data-d="7">+1 vecka</button>
        <button type="button" class="chip" data-d="30">+1 månad</button>
        <button type="button" class="chip" data-d="">Inget datum</button>
      </div>
    </div>
    <div class="field"><button type="button" class="btn" id="f-photo">📷 Ta bild</button></div>
    <button type="button" class="btn primary" id="f-save">Lägg till</button>
  `, root => {
    const qtyInput = root.querySelector('#f-qty');
    const best = root.querySelector('#f-best');
    // Med mängden ifylld från förpackningen räcker det att trycka Lägg till – inget tangentbord i vägen.
    if (staple) qtyInput.value = '1';
    else if (!preQty) qtyInput.focus();

    root.querySelectorAll('.step').forEach(b => b.addEventListener('click', () => {
      const cur = parseNum(qtyInput.value) || 0;
      qtyInput.value = nf.format(Math.max(0, cur + Number(b.dataset.step) * (STEP[form.unit] || 1)));
    }));
    root.querySelector('#f-quick').addEventListener('click', e => {
      const b = e.target.closest('[data-q]');
      if (b) qtyInput.value = nf.format(Number(b.dataset.q));
    });
    bindChips(root, 'unit', u => { form.unit = u; root.querySelector('#f-quick').innerHTML = quickQtyHtml(u); });
    bindChips(root, 'place', pl => { form.place = pl; best.value = defaultBest(pl); });
    root.querySelector('#f-best-quick').addEventListener('click', e => {
      const b = e.target.closest('[data-d]');
      if (b) best.value = b.dataset.d ? addDays(todayIso(), Number(b.dataset.d)) : '';
    });
    root.querySelector('#f-cat')?.addEventListener('change', e => {
      form.category = e.target.value;
      root.querySelector('#add-thumb').textContent = iconFor(p.name, form.category);
    });
    root.querySelector('#f-photo').addEventListener('click', async () => {
      const blob = await takePhoto();
      if (!blob) return;
      form.photoBlob = blob;
      const t = root.querySelector('#add-thumb');
      t.outerHTML = `<img class="thumb" id="add-thumb" src="${URL.createObjectURL(blob)}" alt="">`;
      root.querySelector('#f-photo').textContent = '📷 Ta om bild';
    });
    const save = async () => {
      const qty = parseNum(qtyInput.value);
      if (!(qty > 0)) { qtyInput.focus(); toast('Ange en mängd'); return; }
      await addLot(p, isNew, { ...form, qty, bestBefore: best.value || null });
    };
    root.querySelector('#f-save').addEventListener('click', save);
    qtyInput.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
  });
}

async function addLot(p, isNew, form) {
  const now = new Date().toISOString();
  let product = p;
  if (isNew) {
    product = {
      id: uuid(), name: p.name, category: form.category, unit: form.unit, place: form.place,
      shelfDays: form.bestBefore ? Math.max(1, daysBetween(todayIso(), form.bestBefore)) : null,
      openDays: null, uses: 0, custom: true,
    };
  }
  // Appen lär sig: senast använda enhet och plats blir standard för varan.
  product = { ...product, unit: form.unit, place: product.place === 'frys' || form.place !== 'frys' ? form.place : product.place, uses: (product.uses || 0) + 1, updatedAt: now };
  await db.put('products', product);
  state.products.set(product.id, product);
  const pending = state.pendingBarcode;
  if (pending) product = (await rememberBarcode(product, pending.code, pending.off)).product;

  let photoId = null;
  if (form.photoBlob) photoId = await savePhoto(form.photoBlob);

  const lot = {
    id: uuid(), productId: product.id, name: product.name, category: isNew ? form.category : product.category,
    qty: form.qty, initialQty: form.qty, unit: form.unit, place: form.place,
    addedAt: now, bestBefore: form.bestBefore, openedAt: null, photoId,
    status: 'active', updatedAt: now,
  };
  await db.put('lots', lot);
  state.lots.push(lot);
  await logEvent('added', lot, lot.qty);
  await shopOnStocked(product.id);
  const after = state.afterAdd;
  closeSheet();
  render();
  toast(`${lot.name} tillagd · ${qtyLabel(lot)}`, { type: 'remove', lot });
  after?.(lot);
}

// ---------- Förpackningar ----------
// product.pack = { qty, unit }: hur mycket en förpackning innehåller, t.ex. mjölk 1,5 l.
// Fylls i när en förpackning skannas, eller för hand under Ändra.
function packIn(product, unit) {
  if (unit === 'förp' || unit === 'st') return 1;
  const pk = product?.pack;
  if (!pk?.qty) return null;
  return convertQty(pk.qty, pk.unit, unit, product.name);
}
function packHint(lot, product, qty) {
  const pk = product?.pack;
  if (!pk?.qty || (lot.unit !== 'förp' && lot.unit !== 'st')) return '';
  return ` ≈ ${fmtQty(roundQty(qty * pk.qty, pk.unit), pk.unit)}`;
}
// Öppnar man en av flera förpackningar bryts den ut till en egen rad med kortare hållbarhet.
function splitSizeFor(lot, product) {
  const size = packIn(product, lot.unit);
  if (!size) return null;
  return lot.qty > size * 1.05 ? size : null;
}

// Ångra "öppnad": datumet tillbaka, och en utbruten förpackning läggs tillbaka i den oöppnade raden.
async function unOpen(lot) {
  const best = lot.preOpenBest !== undefined ? lot.preOpenBest : lot.bestBefore;
  const sibling = state.lots.find(l => l.id !== lot.id && l.productId === lot.productId && !l.openedAt
    && l.unit === lot.unit && l.place === lot.place && (l.bestBefore || '') === (best || ''));
  if (!sibling) {
    updateLot(lot, { openedAt: null, bestBefore: best, preOpenBest: undefined }, 'unopened', 0, `${lot.name} markerad som inte öppnad`);
    return;
  }
  const now = new Date().toISOString();
  const befores = [{ ...lot }, { ...sibling }];
  const merged = { ...sibling, qty: roundQty(sibling.qty + lot.qty, sibling.unit), updatedAt: now };
  await db.put('lots', merged);
  await db.put('lots', { ...lot, status: 'removed', deleted: true, updatedAt: now });
  state.lots = state.lots.filter(l => l.id !== lot.id && l.id !== sibling.id).concat(merged);
  closeSheet();
  render();
  toast(`${lot.name} tillbaka bland de oöppnade · ${fmtQty(merged.qty, merged.unit)}`, { type: 'cook', befores, eventIds: [] });
}

async function openOnePack(lot, size, changes) {
  const now = new Date().toISOString();
  const before = { ...lot };
  const rest = { ...lot, qty: roundQty(lot.qty - size, lot.unit), updatedAt: now };
  const opened = {
    ...lot, id: uuid(), qty: size, initialQty: size, openedAt: changes.openedAt,
    bestBefore: changes.bestBefore ?? lot.bestBefore, preOpenBest: lot.bestBefore ?? null, updatedAt: now,
  };
  await db.put('lots', rest);
  await db.put('lots', opened);
  state.lots = state.lots.filter(l => l.id !== lot.id).concat(rest, opened);
  const ev = await logEvent('opened', opened, 0);
  closeSheet();
  render();
  toast(`En förpackning öppnad${changes.bestBefore ? ` – håller till ${shortDate(changes.bestBefore)}` : ''} · ${fmtQty(rest.qty, rest.unit)} kvar oöppnat`,
    { type: 'split', before, newId: opened.id, eventId: ev.id });
}

// Bladet för en vara som finns hemma.
function openLotSheet(lot) {
  const product = state.products.get(lot.productId);
  const d = daysLeft(lot);
  const photo = lot.photoId && state.photoUrls.get(lot.photoId);
  const countable = lot.unit === 'st' || lot.unit === 'förp';
  const canFreeze = lot.place !== 'frys';
  const openDays = product?.openDays;
  const staple = isStaple(product);
  const split = lot.openedAt || staple ? null : splitSizeFor(lot, product);
  const left = f => `${fmtQty(roundQty(lot.qty * f, lot.unit), lot.unit)}${packHint(lot, product, lot.qty * f)}`;

  openSheet(`
    ${photo ? `<img class="photo-big" src="${photo}" alt="">` : ''}
    <div class="sheet-head">
      ${photo ? '' : thumbHtml(lot)}
      <div style="flex:1"><h3>${esc(lot.name)}</h3>
      <div class="sub">${staple ? qtyLabel(lot) : fmtQty(lot.qty, lot.unit)}${!staple && product?.pack?.qty && lot.unit === 'förp' ? ` à ${fmtQty(product.pack.qty, product.pack.unit)}` : ''} · ${placeLabel(lot.place)}${lot.openedAt ? ` · öppnad ${shortDate(lot.openedAt)}` : ''}</div></div>
      ${expiryBadge(lot)}
    </div>
    ${staple ? `<div class="field"><span class="label">Förbrukningsvara – bara finns eller slut</span>
      <div class="left-big two">
        <button data-act="low">Snart slut<small>${lot.low ? 'markerad · står på listan' : 'läggs på listan'}</small></button>
        <button data-act="empty">Slut<small>tas bort · läggs på listan</small></button>
      </div></div>` : ''}
    <div class="field" ${staple ? 'hidden' : ''}><span class="label">Hur mycket finns kvar?</span>
      <div class="left-big">
        <button data-left="0">Slut<small>uppäten</small></button>
        <button data-left="0.25">25 %<small>${left(0.25)}</small></button>
        <button data-left="0.5">50 %<small>${left(0.5)}</small></button>
        <button data-left="0.75">75 %<small>${left(0.75)}</small></button>
      </div>
    </div>
    ${!staple && countable && lot.qty > 1 ? `<div class="field"><button class="btn" data-act="minus1">Ta ut 1 ${lot.unit}</button></div>` : ''}
    <div class="btn-row">
      ${lot.openedAt ? '' : `<button class="btn" data-act="open">${split ? 'Öppna en förp' : 'Öppnad'}${openDays ? ` <small>(${openDays} d)</small>` : ''}</button>`}
      ${lot.openedAt ? `<button class="btn" data-act="unopen">↶ Inte öppnad</button>` : ''}
      ${canFreeze ? `<button class="btn" data-act="freeze">🧊 Frys in</button>` : ''}
    </div>
    <div class="btn-row" style="margin-top:8px">
      <button class="btn danger" data-act="discard">🗑 Slängd</button>
      <button class="btn" data-act="edit">Ändra</button>
    </div>
    <div class="btn-row" style="margin-top:8px">
      <button class="btn" data-act="shop">🛒 På listan</button>
      ${product ? `<button class="btn" data-act="min">${product.minQty ? `Alltid hemma: ${fmtQty(product.minQty, product.minUnit || product.unit)}` : 'Alltid hemma…'}</button>` : ''}
    </div>
    <p class="meta">Inlagd ${shortDate(lot.addedAt.slice(0, 10))}${lot.bestBefore ? ` · bäst före ${shortDate(lot.bestBefore)}${d < 0 ? ' – lukta och smaka, mycket är ofta ätbart efter datum' : ''}` : ''}</p>
  `, root => {
    root.querySelector('.left-big').addEventListener('click', e => {
      const b = e.target.closest('[data-left]');
      if (b) setLeft(lot, Number(b.dataset.left));
    });
    root.querySelector('[data-act="low"]')?.addEventListener('click', async () => {
      await addShopping({ product, name: lot.name, note: 'Snart slut' });
      updateLot(lot, { low: true }, 'low', 0, `${lot.name}: snart slut – på inköpslistan`);
    });
    root.querySelector('[data-act="empty"]')?.addEventListener('click', async () => {
      await addShopping({ product, name: lot.name });
      updateLot(lot, { qty: 0, status: 'used' }, 'used', lot.qty, `${lot.name} slut – på inköpslistan`);
    });
    root.querySelector('[data-act="minus1"]')?.addEventListener('click', () => updateLot(lot, { qty: lot.qty - 1 }, 'used', 1, `Tog ut 1 ${lot.unit} ${lot.name}`));
    root.querySelector('[data-act="open"]')?.addEventListener('click', () => {
      const changes = { openedAt: todayIso(), preOpenBest: lot.bestBefore ?? null };
      if (openDays) {
        const after = addDays(todayIso(), openDays);
        if (!lot.bestBefore || after < lot.bestBefore) changes.bestBefore = after;
      }
      if (split) { openOnePack(lot, split, changes); return; }
      updateLot(lot, changes, 'opened', 0, changes.bestBefore ? `Öppnad – håller till ${shortDate(changes.bestBefore)}` : `${lot.name} markerad som öppnad`);
    });
    root.querySelector('[data-act="unopen"]')?.addEventListener('click', () => unOpen(lot));
    root.querySelector('[data-act="freeze"]')?.addEventListener('click', () =>
      updateLot(lot, { place: 'frys', bestBefore: addDays(todayIso(), FREEZE_DAYS) }, 'frozen', 0, `${lot.name} infryst · håller till ${shortDate(addDays(todayIso(), FREEZE_DAYS))}`));
    root.querySelector('[data-act="discard"]').addEventListener('click', () =>
      updateLot(lot, { qty: 0, status: 'discarded' }, 'discarded', lot.qty, `${lot.name} slängd`));
    root.querySelector('[data-act="edit"]').addEventListener('click', () => openEditSheet(lot));
    root.querySelector('[data-act="shop"]').addEventListener('click', async () => {
      closeSheet();
      await addFromSearch(product || null, lot.name);
    });
    root.querySelector('[data-act="min"]')?.addEventListener('click', () => openMinSheet(product));
  });
}

function setLeft(lot, fraction) {
  if (fraction === 0) {
    updateLot(lot, { qty: 0, status: 'used' }, 'used', lot.qty, `${lot.name} slut`);
    return;
  }
  const qty = roundQty(lot.qty * fraction, lot.unit) || lot.qty * fraction;
  updateLot(lot, { qty }, 'used', lot.qty - qty, `${lot.name}: ${fmtQty(qty, lot.unit)} kvar`);
}

function openEditSheet(lot) {
  const product = state.products.get(lot.productId);
  const form = { unit: lot.unit, place: lot.place, photoBlob: null, packUnit: product?.pack?.unit || (['g', 'kg'].includes(product?.unit) ? 'g' : 'l') };
  openSheet(`
    <div class="sheet-head">${thumbHtml(lot)}<div><h3>Ändra ${esc(lot.name)}</h3></div></div>
    <div class="field"><label for="e-qty">Mängd</label>
      <div class="qty"><input id="e-qty" inputmode="decimal" value="${nf.format(lot.qty)}"></div></div>
    <div class="field"><span class="label">Enhet</span>${chipsHtml('unit', UNITS.map(u => ({ value: u, label: u })), lot.unit)}</div>
    <div class="field"><span class="label">Var?</span>${chipsHtml('place', PLACES.map(pl => ({ value: pl.id, label: `${pl.icon} ${pl.label}` })), lot.place)}</div>
    <div class="field"><label for="e-best">Bäst före</label><input id="e-best" type="date" value="${lot.bestBefore || ''}"></div>
    ${product ? `<div class="field"><label class="check-line"><input type="checkbox" id="e-staple" ${isStaple(product) ? 'checked' : ''}>
      <span>Förbrukningsvara – räkna inte mängd, bara finns/slut</span></label></div>` : ''}
    ${product ? `<div class="field"><label for="e-pack">En förpackning innehåller</label>
      <div class="qty"><input id="e-pack" inputmode="decimal" placeholder="t.ex. 1,5" value="${product.pack?.qty ? nf.format(product.pack.qty) : ''}"></div>
      <div style="margin-top:10px">${chipsHtml('packunit', ['l', 'dl', 'g', 'kg'].map(u => ({ value: u, label: u })), form.packUnit)}</div>
      <p class="meta">Används när en av flera förpackningar öppnas, och för att visa liter eller gram vid ”förp”.</p></div>` : ''}
    <div class="field"><button type="button" class="btn" id="e-photo">📷 ${lot.photoId ? 'Ta om bild' : 'Ta bild'}</button></div>
    <button class="btn primary" id="e-save">Spara</button>
    <div style="height:8px"></div>
    <button class="btn danger" id="e-delete">Ta bort (felinlagd)</button>
  `, root => {
    bindChips(root, 'unit', u => form.unit = u);
    bindChips(root, 'place', p => form.place = p);
    if (product) bindChips(root, 'packunit', u => form.packUnit = u);
    root.querySelector('#e-photo').addEventListener('click', async () => {
      const blob = await takePhoto();
      if (blob) { form.photoBlob = blob; root.querySelector('#e-photo').textContent = '📷 Bild vald'; }
    });
    root.querySelector('#e-save').addEventListener('click', async () => {
      const qty = parseNum(root.querySelector('#e-qty').value);
      if (!(qty >= 0)) { toast('Ange en mängd'); return; }
      const changes = { qty, unit: form.unit, place: form.place, bestBefore: root.querySelector('#e-best').value || null };
      if (form.photoBlob) changes.photoId = await savePhoto(form.photoBlob);
      if (qty === 0) changes.status = 'used';
      if (product) {
        const pq = parseNum(root.querySelector('#e-pack').value);
        const pack = pq > 0 ? { qty: pq, unit: form.packUnit } : null;
        const staple = root.querySelector('#e-staple').checked;
        if (JSON.stringify(pack) !== JSON.stringify(product.pack || null) || staple !== isStaple(product)) {
          const up = { ...product, pack, staple, updatedAt: new Date().toISOString() };
          await db.put('products', up);
          state.products.set(up.id, up);
        }
      }
      updateLot(lot, changes, 'edited', 0, `${lot.name} uppdaterad`);
    });
    root.querySelector('#e-delete').addEventListener('click', () =>
      updateLot(lot, { qty: 0, status: 'removed', deleted: true }, 'removed', 0, `${lot.name} borttagen`));
  });
}

async function updateLot(lot, changes, eventType, delta, message) {
  const before = { ...lot };
  const updated = { ...lot, ...changes, updatedAt: new Date().toISOString() };
  if (updated.qty <= 0 && updated.status === 'active') updated.status = 'used';
  await db.put('lots', updated);
  state.lots = state.lots.filter(l => l.id !== lot.id);
  if (updated.status === 'active') state.lots.push(updated);
  const ev = await logEvent(eventType, updated, delta);
  closeSheet();
  render();
  toast(message, { type: 'restore', before, eventId: ev.id }, restockAction(updated));
}

// Tog varan slut (eller slängdes)? Erbjud att lägga den på inköpslistan direkt i meddelandet.
function restockAction(lot) {
  if (lot.status !== 'used' && lot.status !== 'discarded') return null;
  if (state.lots.some(l => l.productId === lot.productId)) return null;
  if (openItems().some(i => i.productId === lot.productId)) return null;
  const product = state.products.get(lot.productId);
  return {
    label: '🛒 På listan',
    run: async () => {
      await addShopping({ product, name: lot.name });
      updateShopBadge();
      toast(`${lot.name} på inköpslistan`);
    },
  };
}

// extra: t.ex. { recipe: 'Tuna melt pasta' } för att kunna visa varför något tog slut.
async function logEvent(type, lot, delta, extra = {}) {
  const ev = {
    id: uuid(), ts: new Date().toISOString(), type,
    lotId: lot.id, productId: lot.productId, name: lot.name, unit: lot.unit, delta, ...extra,
  };
  ev.updatedAt = ev.ts;
  ev.emptied = lot.status === 'used' || lot.status === 'discarded';
  await db.put('events', ev);
  state.events.push(ev);
  return ev;
}

// Händelser raderas mjukt så att raderingen också når den andra telefonen.
async function deleteEvent(id) {
  const ev = await db.get('events', id);
  if (ev) await db.put('events', { ...ev, deleted: true, updatedAt: new Date().toISOString() });
  state.events = state.events.filter(e => e.id !== id);
}

// ---------- Ångra ----------
// Varje ändring som går att ångra hamnar i en historik (de 20 senaste, ett dygn bakåt).
// ↶ överst backar den senaste; Ångra i meddelandet backar just den ändringen.
const HISTORY_KEY = 'hemma-history';
const HISTORY_MAX = 20;

function loadHistory() {
  try {
    const list = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return list.filter(h => Date.now() - h.at < 24 * 3600 * 1000);
  } catch { return []; }
}
function saveHistory() {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history)); } catch {}
  const btn = $('#undo-btn');
  if (btn) btn.hidden = !state.history.length;
}
function pushHistory(label, info) {
  const entry = { id: uuid(), label, info, at: Date.now() };
  state.history = [...state.history, entry].slice(-HISTORY_MAX);
  saveHistory();
  return entry.id;
}

async function undoEntry(id) {
  const i = state.history.findIndex(h => h.id === id);
  if (i < 0) return;
  const [entry] = state.history.splice(i, 1);
  saveHistory();
  await performUndo(entry.info);
  hideToast();
  render();
  toast(`Ångrat: ${entry.label}`);
}
function undoLast() {
  const last = state.history[state.history.length - 1];
  if (last) undoEntry(last.id);
}
// Kvar för gamla anrop: ångra det senaste.
function undo() { return undoLast(); }

async function performUndo(u) {
  if (u.type === 'cook') await undoCook(u);
  else if (u.type === 'shop-added') {
    const item = state.shopping.find(i => i.id === u.itemId);
    if (item) {
      const del = { ...item, deleted: true, updatedAt: new Date().toISOString() };
      await db.put('shopping', del);
      state.shopping = state.shopping.map(i => i.id === del.id ? del : i);
    }
  }
  else if (u.type === 'shop') await undoShop(u);
  else if (u.type === 'recipe') await undoRecipeDelete(u);
  else if (u.type === 'split') {
    const now = new Date().toISOString();
    const opened = state.lots.find(l => l.id === u.newId);
    if (opened) await db.put('lots', { ...opened, status: 'removed', deleted: true, updatedAt: now });
    const restored = { ...u.before, updatedAt: now };
    await db.put('lots', restored);
    state.lots = state.lots.filter(l => l.id !== u.newId && l.id !== restored.id).concat(restored);
    await deleteEvent(u.eventId);
  }
  else if (u.type === 'remove') {
    const removed = { ...u.lot, status: 'removed', deleted: true, updatedAt: new Date().toISOString() };
    await db.put('lots', removed);
    state.lots = state.lots.filter(l => l.id !== u.lot.id);
    const evs = await db.all('events');
    const ev = evs.find(e => e.lotId === u.lot.id && e.type === 'added');
    if (ev) await deleteEvent(ev.id);
  } else {
    const restored = { ...u.before, updatedAt: new Date().toISOString() };
    await db.put('lots', restored);
    state.lots = state.lots.filter(l => l.id !== restored.id);
    if (restored.status === 'active') state.lots.push(restored);
    if (u.eventId) await deleteEvent(u.eventId);
  }
}

let toastTimer = null;
// extra: { label, run } – en andra knapp i meddelandet, t.ex. "På listan".
function toast(message, undoInfo, extra) {
  const el = $('#toast');
  const entryId = undoInfo ? pushHistory(message, undoInfo) : null;
  el.innerHTML = `<span>${esc(message)}</span><span class="toast-actions">${extra ? `<button id="toast-extra">${esc(extra.label)}</button>` : ''}${undoInfo ? '<button id="undo">Ångra</button>' : ''}</span>`;
  el.hidden = false;
  el.querySelector('#undo')?.addEventListener('click', () => undoEntry(entryId));
  el.querySelector('#toast-extra')?.addEventListener('click', () => { hideToast(); extra.run(); });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, extra ? 8000 : undoInfo ? 6000 : 2500);
}
function hideToast() { $('#toast').hidden = true; }

// ---------- Bilder ----------
function takePhoto() {
  return new Promise(resolve => {
    const input = $('#photo-input');
    input.value = '';
    input.onchange = async () => {
      const file = input.files[0];
      resolve(file ? await compressImage(file) : null);
    };
    input.click();
  });
}

async function compressImage(file, max = 1024) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.8));
  } catch {
    return file;
  }
}

async function savePhoto(blob) {
  const id = uuid();
  await db.put('photos', { id, blob, updatedAt: new Date().toISOString() });
  state.photoUrls.set(id, URL.createObjectURL(blob));
  Sync.queuePhoto(id);
  return id;
}

// ---------- Säkerhetskopia ----------
const blobToDataUrl = blob => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });

async function exportData() {
  const photos = await db.all('photos');
  const data = {
    app: 'hemma', version: 1, exportedAt: new Date().toISOString(),
    products: (await db.all('products')).filter(p => p.custom || p.uses),
    lots: await db.all('lots'),
    events: await db.all('events'),
    photos: await Promise.all(photos.map(async p => ({ id: p.id, data: await blobToDataUrl(p.blob) }))),
  };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `hemma-${todayIso()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importData(file) {
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'hemma') throw new Error('fel fil');
    // Slå ihop: den nyaste versionen av varje post vinner.
    for (const store of ['products', 'lots', 'events']) {
      const existing = new Map((await db.all(store)).map(x => [x.id, x]));
      const merged = (data[store] || []).filter(x => !existing.has(x.id) || (x.updatedAt || x.ts) > (existing.get(x.id).updatedAt || existing.get(x.id).ts));
      await db.putMany(store, merged);
    }
    for (const p of data.photos || []) {
      const blob = await (await fetch(p.data)).blob();
      await db.put('photos', { id: p.id, blob, updatedAt: new Date().toISOString() });
      Sync.queuePhoto(p.id);
    }
    await load();
    render();
    toast('Kopian är inläst');
  } catch (e) {
    toast('Kunde inte läsa filen');
  }
}

// ---------- Start ----------
async function load() {
  const products = await db.all('products');
  state.products = new Map(products.map(p => [p.id, p]));
  // Lägg in katalogvaror som saknas (deterministiska id:n så att två telefoner får samma).
  const missing = CATALOG.filter(c => !state.products.has('cat:' + slug(c.name)))
    .map(c => ({ ...c, id: 'cat:' + slug(c.name), uses: 0, custom: false, updatedAt: '2026-01-01T00:00:00.000Z' }));
  if (missing.length) {
    await db.putMany('products', missing, { silent: true });
    for (const p of missing) state.products.set(p.id, p);
  }
  state.lots = (await db.all('lots')).filter(l => l.status === 'active' && !l.deleted);
  state.recipes = (await db.all('recipes')).filter(r => !r.deleted);
  state.shopping = (await db.all('shopping')).filter(i => !i.deleted);
  state.settings = (await db.get('settings', 'household')) || {};
  // De senaste två veckornas händelser räcker för "Tog slut nyligen".
  const since = addDays(todayIso(), -14);
  state.events = (await db.all('events')).filter(e => !e.deleted && e.ts.slice(0, 10) >= since);
  for (const ph of await db.all('photos')) {
    if (!state.photoUrls.has(ph.id)) state.photoUrls.set(ph.id, URL.createObjectURL(ph.blob));
  }
}

function bind() {
  const q = $('#q');
  q.addEventListener('input', () => {
    state.active = 0;
    $('#q-clear').hidden = !q.value;
    renderSuggest();
    if (state.view === 'stock') renderStock();
  });
  q.addEventListener('focus', () => { if (q.value) renderSuggest(); });
  q.addEventListener('keydown', e => {
    const n = state.suggestions.filter(s => s.type !== 'head').length;
    if (e.key === 'ArrowDown') { state.active = (state.active + 1) % n; renderSuggest(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { state.active = (state.active - 1 + n) % n; renderSuggest(); e.preventDefault(); }
    else if (e.key === 'Enter') { pickSuggestion(state.active); e.preventDefault(); }
    else if (e.key === 'Escape') clearQuery();
  });
  $('#q-clear').addEventListener('click', () => { clearQuery(); });
  $('#scan-btn').addEventListener('click', () => { scanner.count = 0; openScanner(); });
  // Förhindra att fältet tappar fokus (och listan stängs) innan klicket hinner registreras.
  $('#suggest').addEventListener('pointerdown', e => e.preventDefault());
  $('#suggest').addEventListener('mousedown', e => e.preventDefault());
  $('#suggest').addEventListener('click', e => {
    const li = e.target.closest('li[data-k]');
    if (li) pickSuggestion(Number(li.dataset.k));
  });
  document.addEventListener('pointerdown', e => {
    if (!e.target.closest('.top')) $('#suggest').hidden = true;
  });

  document.querySelector('.tabs').addEventListener('click', e => {
    const b = e.target.closest('button[data-view]');
    if (!b) return;
    state.view = b.dataset.view;
    render();
    window.scrollTo(0, 0);
  });
  document.querySelector('main').addEventListener('click', e => {
    const row = e.target.closest('[data-lot]');
    if (row) { const lot = state.lots.find(l => l.id === row.dataset.lot); if (lot) openLotSheet(lot); return; }
    const place = e.target.closest('[data-place]');
    if (place) { state.stockPlace = place.dataset.place; renderStock(); return; }
    const sa = e.target.closest('[data-sync]');
    if (sa) { e.preventDefault(); syncAction(sa.dataset.sync); return; }
    const act = e.target.closest('[data-action]');
    if (act?.dataset.action === 'export') exportData();
    if (act?.dataset.action === 'ai') openAiExport();
    if (act?.dataset.action === 'import') {
      const input = $('#import-input');
      input.onchange = () => input.files[0] && importData(input.files[0]);
      input.click();
    }
  });
  bindRecipes();
  bindShop();
  $('#sheet-backdrop').addEventListener('click', closeSheet);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet(); });
  // Datumen räknas om när appen kommer tillbaka från bakgrunden (t.ex. nästa morgon).
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
}

(async function init() {
  state.history = loadHistory();
  saveHistory();
  $('#undo-btn').addEventListener('click', undoLast);
  // Bakåtknappen stänger ett öppet blad.
  window.addEventListener('popstate', () => { if (!$('#sheet').hidden) closeSheet(); });
  bind();
  await load();
  render();
  // Ändringar från den andra telefonen: läs om och rita om, men stör inte ett öppet blad.
  await Sync.init(async () => {
    await load();
    if ($('#sheet').hidden) render();
  });
  Sync.on(() => renderSyncCard());
  loadOffers();
  // Delat från en annan app (Android) eller länk med ?url=: öppna receptfliken och hämta.
  const shared = new URLSearchParams(location.search);
  const sharedText = [shared.get('url'), shared.get('text')].filter(Boolean).join(' ');
  if (sharedText) {
    history.replaceState(null, '', location.pathname);
    state.view = 'recipes';
    render();
    $('#r-url').value = sharedText;
    importRecipe(sharedText);
  }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
