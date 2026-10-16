'use strict';
// Inköpslistan: manuella varor, det som saknas till recept och "alltid hemma"-varor under sin nivå.
// Avbockat i butiken läggs in i lagret med ett tryck.

// Ungefär i den ordning man går genom en vanlig matbutik.
const AISLE_ORDER = ['Frukt', 'Grönsaker', 'Bröd', 'Mejeri', 'Ägg', 'Kött', 'Fisk & skaldjur', 'Färdigmat',
  'Vegetariskt', 'Fryst', 'Skafferi', 'Kryddor', 'Dryck', 'Rester', 'Övrigt'];
const DEFAULT_BUY = { g: 500, kg: 1, st: 1, 'förp': 1, l: 1, dl: 5 };

function shopItems() { return state.shopping.filter(i => !i.deleted); }
function openItems() { return shopItems().filter(i => !i.checked); }

// Hur mycket av en vara som finns hemma, i varans miniminivå-enhet.
function stockOf(product, unit) {
  return state.lots.filter(l => l.productId === product.id)
    .reduce((s, l) => s + (convertQty(l.qty, l.unit, unit, product.name) ?? 0), 0);
}

// Alltid hemma-varor som är under sin nivå och inte redan står på listan.
function lowStockItems() {
  const onList = new Set(shopItems().map(i => i.productId).filter(Boolean));
  return [...state.products.values()]
    .filter(p => !p.deleted && p.minQty > 0 && !onList.has(p.id))
    .map(p => {
      const unit = p.minUnit || p.unit;
      const have = stockOf(p, unit);
      return have < p.minQty ? { auto: true, id: 'auto:' + p.id, productId: p.id, name: p.name, qty: roundQty(p.minQty - have, unit), unit, have, note: 'Alltid hemma' } : null;
    })
    .filter(Boolean);
}

function categoryOf(item) {
  return state.products.get(item.productId)?.category || 'Övrigt';
}

function updateShopBadge() {
  const n = openItems().length + lowStockItems().length;
  const tab = document.querySelector('.tabs button[data-view="shop"] .tab-badge');
  if (tab) { tab.textContent = n; tab.hidden = !n; }
}

// ---------- Lägga till ----------
async function addShopping({ product = null, name, qty = null, unit = null, note = '', source = 'manual', recipeId = null }) {
  const now = new Date().toISOString();
  const existing = product && openItems().find(i => i.productId === product.id);
  if (existing) {
    // Samma vara står redan på listan: lägg ihop mängden och anteckningen.
    const sum = existing.qty != null && qty != null ? convertQty(qty, unit, existing.unit, product.name) : null;
    const updated = {
      ...existing,
      qty: sum != null ? roundQty(existing.qty + sum, existing.unit) : existing.qty ?? qty,
      unit: existing.unit ?? unit,
      note: [existing.note, note].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', '),
      updatedAt: now,
    };
    await db.put('shopping', updated);
    state.shopping = state.shopping.map(i => i.id === updated.id ? updated : i);
    return updated;
  }
  const item = {
    id: uuid(), productId: product?.id || null, name: product?.name || name,
    qty, unit: unit || product?.unit || null, note, source, recipeId,
    checked: false, createdAt: now, updatedAt: now,
  };
  await db.put('shopping', item);
  state.shopping.push(item);
  return item;
}

async function addFromSearch(product, newName) {
  const item = await addShopping({ product, name: newName });
  if (state.view === 'shop') renderShop();
  updateShopBadge();
  toast(`${item.name} på listan`);
  // Finns varan hemma? Fråga om den är slut, så att lagret stämmer utan ett extra steg.
  const lots = product ? state.lots.filter(l => l.productId === product.id) : [];
  if (lots.length) openEmptyPrompt(product, lots);
}

// Det som saknas till ett recept (eller inte räcker) läggs på listan.
async function addMissingFromRecipe(recipe, servings, { silent = false } = {}) {
  const scale = recipe.servings && servings ? servings / recipe.servings : 1;
  let n = 0;
  for (const r of analyzeRecipe(recipe, scale)) {
    if (r.ignored) continue;
    let qty = r.need, unit = r.ing.unit;
    if (r.lots.length) {
      if (r.need == null || !r.product) continue;
      const have = r.lots.reduce((s, l) => s + (convertQty(l.qty, l.unit, unit, r.product.name) ?? Infinity), 0);
      if (have >= r.need) continue;
      qty = r.need - have;
    }
    if (unit === 'st' && r.product && r.product.unit !== 'st') {
      // "4 kycklingfiléer" handlas i varans egen enhet om det går att räkna om.
      const conv = convertQty(qty, 'st', r.product.unit, r.product.name);
      if (conv != null) { qty = conv; unit = r.product.unit; }
    }
    // Förbrukningsvaror handlas som en förpackning – "3 msk vetemjöl" på listan hjälper ingen.
    if (isStaple(r.product)) { qty = null; unit = r.product.unit; }
    await addShopping({ product: r.product, name: r.ing.name, qty: qty != null ? roundQty(qty, unit) || qty : null, unit, note: recipe.title, source: 'recipe', recipeId: recipe.id });
    n++;
  }
  updateShopBadge();
  if (!silent) toast(n ? `${n} ${n === 1 ? 'vara' : 'varor'} på inköpslistan` : 'Allt finns redan hemma');
  return n;
}

// När en vara läggs in i lagret på vanligt sätt stryks den från listan.
async function shopOnStocked(productId) {
  const now = new Date().toISOString();
  for (const item of openItems().filter(i => i.productId === productId)) {
    const done = { ...item, deleted: true, updatedAt: now };
    await db.put('shopping', done);
    state.shopping = state.shopping.map(i => i.id === done.id ? done : i);
  }
  updateShopBadge();
}

// ---------- Listan ----------
function shopRowHtml(item) {
  const qty = item.qty != null ? fmtQty(item.qty, item.unit || 'st') : '';
  const sub = [qty, item.auto ? `hemma ${fmtQty(roundQty(item.have, item.unit), item.unit)}` : item.note].filter(Boolean).join(' · ');
  return `<div class="shop-row ${item.checked ? 'done' : ''}">
    <button class="shop-check" data-check="${esc(item.id)}" aria-label="${item.checked ? 'Avbocka' : 'Bocka av'} ${esc(item.name)}">${item.checked ? '✓' : ''}</button>
    <button class="shop-main" data-shop="${esc(item.id)}">
      <div class="r-name">${esc(item.name)}</div>${sub ? `<div class="r-sub">${esc(sub)}</div>` : ''}
    </button>
    ${item.auto ? '<span class="badge">Alltid hemma</span>' : ''}
  </div>`;
}

// ---------- Tog slut nyligen ----------
// Varor som tagit slut eller slängts de senaste två veckorna, som inte finns hemma igen
// och inte står på listan. Går att gå igenom i lugn och ro; "Inte nu" markerar händelserna som sedda.
function recentlyEmptied() {
  const inStock = new Set(state.lots.map(l => l.productId));
  const onList = new Set(shopItems().map(i => i.productId));
  const byProduct = new Map();
  for (const e of state.events) {
    if (!e.emptied || e.reviewed || e.deleted || !['used', 'cooked', 'discarded'].includes(e.type)) continue;
    if (!e.productId || e.productId === 'rester' || inStock.has(e.productId) || onList.has(e.productId)) continue;
    const g = byProduct.get(e.productId) || { productId: e.productId, name: e.name, events: [], ts: '' };
    g.events.push(e);
    if (e.ts > g.ts) { g.ts = e.ts; g.type = e.type; g.recipe = e.recipe; }
    byProduct.set(e.productId, g);
  }
  return [...byProduct.values()].sort((a, b) => b.ts.localeCompare(a.ts));
}

async function markReviewed(groups) {
  const now = new Date().toISOString();
  for (const g of groups) for (const e of g.events) {
    const updated = { ...e, reviewed: true, updatedAt: now };
    await db.put('events', updated);
    state.events = state.events.map(x => x.id === e.id ? updated : x);
  }
}

function emptiedHtml(groups) {
  if (!groups.length) return '';
  return `<div class="group"><h2>Tog slut nyligen</h2><span class="count">${groups.length}</span></div>
    <div class="list emptied">${groups.map(g => {
      const p = state.products.get(g.productId);
      const why = g.type === 'discarded' ? 'slängd' : g.recipe ? `slut efter ${esc(g.recipe)}` : 'tog slut';
      return `<div class="shop-row">
        <span class="thumb small">${iconFor(g.name, p?.category)}</span>
        <div class="shop-main"><div class="r-name">${esc(g.name)}</div><div class="r-sub">${why} · ${shortDate(g.ts.slice(0, 10))}</div></div>
        <button class="mini-btn" data-emptied-add="${esc(g.productId)}" aria-label="Lägg ${esc(g.name)} på listan">+ Listan</button>
        <button class="mini-btn quiet" data-emptied-skip="${esc(g.productId)}" aria-label="Hoppa över ${esc(g.name)}">Inte nu</button>
      </div>`;
    }).join('')}</div>
    ${groups.length > 1 ? `<div class="btn-row" style="margin-top:8px">
      <button class="btn" data-shop-act="emptied-all">Lägg alla ${groups.length} på listan</button>
      <button class="btn" data-shop-act="emptied-none">Inte nu</button></div>` : ''}`;
}

async function emptiedAction(kind, productId) {
  const groups = recentlyEmptied().filter(g => !productId || g.productId === productId);
  if (kind === 'add') {
    for (const g of groups) await addShopping({ product: state.products.get(g.productId), name: g.name, note: g.recipe || '' });
    toast(groups.length === 1 ? `${groups[0].name} på listan` : `${groups.length} varor på listan`);
  }
  await markReviewed(groups);
  renderShop();
}

function renderShop() {
  const el = $('#view-shop');
  const open = [...openItems(), ...lowStockItems()];
  const checked = shopItems().filter(i => i.checked);
  const emptied = recentlyEmptied();
  updateShopBadge();

  if (!open.length && !checked.length && !emptied.length) {
    el.innerHTML = emptyHtml('🛒', 'Inköpslistan är tom', 'Skriv en vara i fältet ovan, eller tryck ”Lägg det som saknas på listan” i ett recept. Varor med en ”alltid hemma”-nivå hamnar här av sig själva.');
    return;
  }
  const groups = AISLE_ORDER.map(cat => ({ cat, items: open.filter(i => categoryOf(i) === cat).sort((a, b) => a.name.localeCompare(b.name, 'sv')) }))
    .filter(g => g.items.length);
  el.innerHTML = `
    ${emptiedHtml(emptied)}
    ${!open.length && !checked.length ? '<p class="meta">Inköpslistan är tom.</p>' : ''}
    ${groups.map(g => `<div class="group"><h2>${CATEGORY_ICON[g.cat] || ''} ${g.cat}</h2><span class="count">${g.items.length}</span></div>
      <div class="list">${g.items.map(shopRowHtml).join('')}</div>`).join('')}
    ${checked.length ? `
      <div class="group"><h2>I korgen</h2><span class="count">${checked.length}</span></div>
      <div class="list">${checked.map(shopRowHtml).join('')}</div>
      <div style="height:12px"></div>
      <button class="btn primary" data-shop-act="stock">Klar – lägg in ${checked.length} i lagret</button>
      <div style="height:8px"></div>
      <button class="btn" data-shop-act="clear">Ta bort avbockade utan att lägga in</button>` : ''}`;
}

async function toggleCheck(id) {
  const now = new Date().toISOString();
  if (id.startsWith('auto:')) {
    const auto = lowStockItems().find(i => i.id === id);
    if (!auto) return;
    const item = await addShopping({ product: state.products.get(auto.productId), qty: auto.qty, unit: auto.unit, note: 'Alltid hemma', source: 'min' });
    const done = { ...item, checked: true, checkedAt: now, updatedAt: now };
    await db.put('shopping', done);
    state.shopping = state.shopping.map(i => i.id === done.id ? done : i);
  } else {
    const item = state.shopping.find(i => i.id === id);
    if (!item) return;
    const updated = { ...item, checked: !item.checked, checkedAt: item.checked ? null : now, updatedAt: now };
    await db.put('shopping', updated);
    state.shopping = state.shopping.map(i => i.id === id ? updated : i);
  }
  renderShop();
}

function openShopItemSheet(item) {
  const form = { unit: item.unit || state.products.get(item.productId)?.unit || 'st' };
  openSheet(`
    <div class="sheet-head"><div><h3>${esc(item.name)}</h3><div class="sub">${esc(item.note || 'På inköpslistan')}</div></div></div>
    <div class="field"><label for="s-qty">Mängd (valfritt)</label>
      <div class="qty"><input id="s-qty" inputmode="decimal" value="${item.qty != null ? nf.format(item.qty) : ''}" placeholder="–"></div></div>
    <div class="field"><span class="label">Enhet</span>${chipsHtml('unit', UNITS.map(u => ({ value: u, label: u })), form.unit)}</div>
    <div class="field"><label for="s-note">Anteckning</label><input id="s-note" type="text" value="${esc(item.note || '')}" placeholder="t.ex. ekologisk"></div>
    <button class="btn primary" data-s="save">Spara</button>
    <div style="height:8px"></div>
    <button class="btn danger" data-s="del">Ta bort från listan</button>
  `, root => {
    bindChips(root, 'unit', u => form.unit = u);
    root.querySelector('[data-s="save"]').addEventListener('click', async () => {
      const q = parseNum(root.querySelector('#s-qty').value);
      const updated = { ...item, qty: q > 0 ? q : null, unit: form.unit, note: root.querySelector('#s-note').value.trim(), updatedAt: new Date().toISOString() };
      await db.put('shopping', updated);
      state.shopping = state.shopping.map(i => i.id === item.id ? updated : i);
      closeSheet(); renderShop();
    });
    root.querySelector('[data-s="del"]').addEventListener('click', async () => {
      const del = { ...item, deleted: true, updatedAt: new Date().toISOString() };
      await db.put('shopping', del);
      state.shopping = state.shopping.map(i => i.id === item.id ? del : i);
      closeSheet(); renderShop();
      toast(`${item.name} borttagen`, { type: 'shop', befores: [item] });
    });
  });
}

// ---------- Från korgen till lagret ----------
function openStockSheet() {
  const checked = shopItems().filter(i => i.checked);
  const rows = checked.map(item => {
    const p = state.products.get(item.productId);
    const unit = p?.unit || item.unit || 'st';
    const conv = item.qty != null ? convertQty(item.qty, item.unit || unit, unit, p?.name || '') : null;
    return { item, p, unit, qty: conv != null ? roundQty(conv, unit) || conv : DEFAULT_BUY[unit] ?? 1, place: p?.place || 'kyl' };
  });
  openSheet(`<div id="stock-in">
    <div class="sheet-head"><div><h3>Lägg in i lagret</h3><div class="sub">Justera mängd och plats om det behövs</div></div></div>
    <div class="cook">${rows.map((r, k) => `
      <div class="cook-row">
        <input type="checkbox" data-k="${k}" ${r.p ? 'checked' : ''} aria-label="Lägg in ${esc(r.item.name)}">
        <div class="ing-main"><div>${esc(r.item.name)}</div>
          <div class="ing-sub"><select data-place="${k}" aria-label="Plats">${PLACES.map(pl => `<option value="${pl.id}" ${pl.id === r.place ? 'selected' : ''}>${pl.label}</option>`).join('')}</select>
          ${r.p ? '' : ' · ny vara'}</div></div>
        <span class="cook-qty"><input inputmode="decimal" data-q="${k}" value="${nf.format(r.qty)}"> ${esc(r.unit)}</span>
      </div>`).join('')}</div>
    <div style="height:12px"></div>
    <button class="btn primary" data-go>Lägg in</button>
  </div>`, root => {
    root.querySelector('[data-go]').addEventListener('click', async () => {
      const now = new Date().toISOString();
      const lotsAdded = [];
      const eventIds = [];
      for (const [k, r] of rows.entries()) {
        const on = root.querySelector(`[data-k="${k}"]`).checked;
        const qty = parseNum(root.querySelector(`[data-q="${k}"]`).value);
        const place = root.querySelector(`[data-place="${k}"]`).value;
        if (!on || !(qty > 0)) continue;
        let product = r.p;
        if (!product) {
          product = { id: uuid(), name: r.item.name, category: 'Övrigt', unit: r.unit, place, shelfDays: 7, openDays: null, uses: 0, custom: true };
        }
        product = { ...product, uses: (product.uses || 0) + 1, updatedAt: now };
        await db.put('products', product);
        state.products.set(product.id, product);
        const best = place === 'frys' && product.place !== 'frys' ? addDays(todayIso(), FREEZE_DAYS)
          : product.shelfDays ? addDays(todayIso(), product.shelfDays) : null;
        const lot = {
          id: uuid(), productId: product.id, name: product.name, category: product.category,
          qty, initialQty: qty, unit: r.unit, place, addedAt: now, bestBefore: best, openedAt: null, photoId: null,
          status: 'active', updatedAt: now,
        };
        await db.put('lots', lot);
        state.lots.push(lot);
        eventIds.push((await logEvent('added', lot, qty)).id);
        lotsAdded.push(lot);
      }
      // Alla avbockade lämnar listan, även de man valde att inte lägga in.
      for (const r of rows) {
        const done = { ...r.item, deleted: true, updatedAt: now };
        await db.put('shopping', done);
        state.shopping = state.shopping.map(i => i.id === done.id ? done : i);
      }
      closeSheet();
      render();
      toast(`${lotsAdded.length} ${lotsAdded.length === 1 ? 'vara' : 'varor'} inlagda i lagret`, { type: 'shop', befores: rows.map(r => r.item), lots: lotsAdded, eventIds });
    });
  });
}

async function clearChecked() {
  const now = new Date().toISOString();
  const checked = shopItems().filter(i => i.checked);
  for (const item of checked) {
    const del = { ...item, deleted: true, updatedAt: now };
    await db.put('shopping', del);
    state.shopping = state.shopping.map(i => i.id === item.id ? del : i);
  }
  renderShop();
  toast(`${checked.length} borttagna`, { type: 'shop', befores: checked });
}

async function undoShop(u) {
  const now = new Date().toISOString();
  for (const before of u.befores) {
    const restored = { ...before, deleted: false, updatedAt: now };
    await db.put('shopping', restored);
    state.shopping = state.shopping.filter(i => i.id !== restored.id).concat(restored);
  }
  for (const lot of u.lots || []) {
    await db.put('lots', { ...lot, status: 'removed', deleted: true, updatedAt: now });
    state.lots = state.lots.filter(l => l.id !== lot.id);
  }
  for (const id of u.eventIds || []) await deleteEvent(id);
}

// ---------- Alltid hemma ----------
function openMinSheet(product) {
  const unit = product.minUnit || product.unit;
  const quick = { g: [250, 500, 1000], kg: [1, 2], st: [1, 2, 6, 12], 'förp': [1, 2], l: [1, 2, 3], dl: [2, 5] }[unit] || [1, 2];
  openSheet(`
    <div class="sheet-head"><div><h3>Alltid hemma: ${esc(product.name)}</h3>
      <div class="sub">Hamnar på inköpslistan när ni har mindre än så här hemma</div></div></div>
    <div class="field"><label for="m-qty">Minst</label>
      <div class="qty"><input id="m-qty" inputmode="decimal" value="${product.minQty ? nf.format(product.minQty) : ''}" placeholder="0"><span class="unit-label">${esc(unit)}</span></div>
      <div class="chips small" style="margin-top:10px">${quick.map(v => `<button type="button" class="chip" data-mq="${v}">${fmtQty(v, unit)}</button>`).join('')}</div></div>
    <button class="btn primary" data-m="save">Spara</button>
    ${product.minQty ? `<div style="height:8px"></div><button class="btn" data-m="off">Sluta bevaka</button>` : ''}
  `, root => {
    const input = root.querySelector('#m-qty');
    root.querySelector('.chips').addEventListener('click', e => { const b = e.target.closest('[data-mq]'); if (b) input.value = nf.format(Number(b.dataset.mq)); });
    const save = async minQty => {
      const updated = { ...product, minQty, minUnit: unit, updatedAt: new Date().toISOString() };
      await db.put('products', updated);
      state.products.set(product.id, updated);
      closeSheet(); render();
      toast(minQty ? `${product.name}: minst ${fmtQty(minQty, unit)} hemma` : `${product.name} bevakas inte längre`);
    };
    root.querySelector('[data-m="save"]').addEventListener('click', () => save(parseNum(input.value) > 0 ? parseNum(input.value) : null));
    root.querySelector('[data-m="off"]')?.addEventListener('click', () => save(null));
  });
}

function bindShop() {
  $('#view-shop').addEventListener('click', e => {
    const c = e.target.closest('[data-check]');
    if (c) { toggleCheck(c.dataset.check); return; }
    const m = e.target.closest('[data-shop]');
    if (m) {
      const item = state.shopping.find(i => i.id === m.dataset.shop);
      if (item) openShopItemSheet(item);
      else if (m.dataset.shop.startsWith('auto:')) openMinSheet(state.products.get(m.dataset.shop.slice(5)));
      return;
    }
    const ea = e.target.closest('[data-emptied-add]');
    if (ea) { emptiedAction('add', ea.dataset.emptiedAdd); return; }
    const es = e.target.closest('[data-emptied-skip]');
    if (es) { emptiedAction('skip', es.dataset.emptiedSkip); return; }
    const act = e.target.closest('[data-shop-act]')?.dataset.shopAct;
    if (act === 'emptied-all') emptiedAction('add');
    if (act === 'emptied-none') emptiedAction('skip');
    if (act === 'stock') openStockSheet();
    if (act === 'clear') clearChecked();
  });
}
