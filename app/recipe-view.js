'use strict';
// Receptfliken: hämta från ICA, visa vad som finns hemma, laga och dra av.
// Använder hjälpfunktionerna i app.js (state, $, esc, openSheet, toast …) när de anropas.

const LEFTOVER_DAYS = 3;

function stockedProductIds() {
  return new Set(state.lots.map(l => l.productId));
}

// Varje ingrediens: vilken vara den motsvarar, vad som finns hemma och hur mycket som behövs.
function analyzeRecipe(recipe, scale = 1) {
  const products = [...state.products.values()];
  const stocked = stockedProductIds();
  return recipe.ingredients.map((ing, i) => {
    // En koppling man själv valt går före den automatiska.
    const alias = aliasFor(ing, products);
    const ignored = alias?.id === IGNORE_ID || (!alias && ing.alts.every(a => NOT_STOCK.test(norm(a))));
    const product = ignored ? null : alias || matchProduct(ing, products, stocked);
    const lots = product ? state.lots.filter(l => l.productId === product.id).sort(sortByExpiry) : [];
    const need = ing.qty != null ? ing.qty * scale : null;
    return { i, ing, product, lots, need, ignored, manual: !!alias };
  });
}

function coverage(rows) {
  const counted = rows.filter(r => !r.ignored);
  return { have: counted.filter(r => r.lots.length).length, total: counted.length };
}

// ---------- Välj vara för en ingrediens ----------
async function setAlias(ing, productId) {
  const keys = ing.alts.map(a => norm(a));
  const now = new Date().toISOString();
  // Ta bort kopplingen från varor som hade den tidigare.
  for (const p of state.products.values()) {
    if (p.aliases?.some(a => keys.includes(a))) {
      const updated = { ...p, aliases: p.aliases.filter(a => !keys.includes(a)), updatedAt: now };
      await db.put('products', updated);
      state.products.set(p.id, updated);
    }
  }
  if (!productId) return;
  let target = state.products.get(productId);
  if (!target && productId === IGNORE_ID) {
    target = { id: IGNORE_ID, name: 'Behövs inte i lagret', category: 'Övrigt', unit: 'st', place: 'skafferi', hidden: true, aliases: [] };
  }
  const updated = { ...target, aliases: [...new Set([...(target.aliases || []), norm(ing.name)])], updatedAt: now };
  await db.put('products', updated);
  state.products.set(updated.id, updated);
}

function openIngredientPicker(recipe, servings, row) {
  const ing = row.ing;
  const ingWords = norm(ing.name).split(/\s+/).filter(w => w.length >= 3);
  // Gissa vilka varor som ligger närmast: "rödvin" → "Rött vin" (samma början, och "vin" ingår).
  const scoreFor = name => {
    const words = norm(name).split(/\s+/);
    let s = Math.max(0, ...ing.alts.map(a => productScore(a, { name })), ...ingWords.map(w => matchScore(name, w)));
    for (const iw of ingWords) for (const w of words) {
      let k = 0;
      while (k < iw.length && k < w.length && iw[k] === w[k]) k++;
      if (k >= 2) s += k * 3;
      if (w.length >= 3 && iw !== w && iw.includes(w)) s += 15;
    }
    return s;
  };

  const draw = q => {
    const nq = norm(q);
    const lots = state.lots
      .map(l => ({ l, s: nq ? matchScore(l.name, nq) : scoreFor(l.name) }))
      .filter(x => !nq || x.s > 0)
      .sort((a, b) => b.s - a.s || a.l.name.localeCompare(b.l.name, 'sv'));
    const seen = new Set(lots.map(x => x.l.productId));
    const prods = nq ? [...state.products.values()]
      .filter(p => !p.deleted && !p.hidden && !seen.has(p.id))
      .map(p => ({ p, s: matchScore(p.name, nq) })).filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s).slice(0, 8) : [];
    return `
      ${lots.length ? `<div class="group"><h2>Finns hemma</h2></div><div class="list">${lots.map(({ l }) => `
        <button class="row" data-pick="${esc(l.productId)}">${thumbHtml(l)}
          <div class="r-main"><div class="r-name">${esc(l.name)}</div><div class="r-sub">${qtyLabel(l)} · ${placeLabel(l.place)}</div></div>
        </button>`).join('')}</div>` : ''}
      ${prods.length ? `<div class="group"><h2>Alla varor</h2></div><div class="list">${prods.map(({ p }) => `
        <button class="row" data-pick="${esc(p.id)}"><span class="thumb">${iconFor(p.name, p.category)}</span>
          <div class="r-main"><div class="r-name">${esc(p.name)}</div><div class="r-sub">Finns inte hemma just nu</div></div>
        </button>`).join('')}</div>` : ''}
      ${!lots.length && !prods.length ? `<p class="meta">Ingen vara matchar. Skriv ett annat namn.</p>` : ''}`;
  };

  openSheet(`<div id="picker">
    <div class="sheet-head"><div><h3>Vad är ”${esc(ing.name)}”?</h3>
      <div class="sub">Valet sparas och används i alla recept framöver</div></div></div>
    <div class="field"><input id="pick-q" type="search" placeholder="Sök vara, t.ex. vin" autocomplete="off"></div>
    <div id="pick-list">${draw('')}</div>
    <div style="height:12px"></div>
    <button class="btn" data-pick="${IGNORE_ID}">Behövs inte i lagret (t.ex. vatten)</button>
    ${row.manual ? `<div style="height:8px"></div><button class="btn danger" data-unpick>Ta bort min koppling</button>` : ''}
    <div style="height:8px"></div>
    <button class="btn" data-back>Tillbaka</button>
  </div>`, root => {
    const list = root.querySelector('#pick-list');
    root.querySelector('#pick-q').addEventListener('input', e => { list.innerHTML = draw(e.target.value); });
    // Lyssna på innehållet, inte på bladet självt – bladet återanvänds och skulle samla lyssnare.
    root.querySelector('#picker').addEventListener('click', async e => {
      const pick = e.target.closest('[data-pick]');
      if (pick) {
        await setAlias(ing, pick.dataset.pick);
        const name = pick.dataset.pick === IGNORE_ID ? 'behövs inte i lagret' : state.products.get(pick.dataset.pick)?.name;
        openRecipeSheet(recipe, servings);
        toast(`”${ing.name}” = ${name}`);
        return;
      }
      if (e.target.closest('[data-unpick]')) { await setAlias(ing, null); openRecipeSheet(recipe, servings); return; }
      if (e.target.closest('[data-back]')) openRecipeSheet(recipe, servings);
    });
  });
}

function fmtNeed(qty, unit) {
  if (qty == null) return '';
  const n = nf.format(Math.round(qty * 100) / 100);
  return unit && unit !== 'st' ? `${n} ${unit}` : n;
}

// ---------- Receptlistor ----------
// Ett recept kan ligga i flera listor (recipe.lists), t.ex. Favoritrecept och Vecka 3.
// Listorna synkas med recepten; en tom lista finns kvar under sessionen tills något läggs i den.
const DEFAULT_LIST = 'Favoritrecept';

function listOrder(a, b) {
  const rank = n => n === DEFAULT_LIST ? 0 : /^vecka\s*\d+/i.test(n) ? 1 : 2;
  const week = n => Number((n.match(/^vecka\s*(\d+)/i) || [])[1] || 0);
  return rank(a) - rank(b) || week(a) - week(b) || a.localeCompare(b, 'sv');
}
function recipeListNames() {
  const names = new Set(state.extraLists);
  for (const r of state.recipes || []) for (const l of r.lists || []) names.add(l);
  return [...names].sort(listOrder);
}
function nextWeekName() {
  const weeks = recipeListNames().map(n => Number((n.match(/^vecka\s*(\d+)/i) || [])[1] || 0));
  return `Vecka ${Math.max(0, ...weeks) + 1}`;
}
async function setRecipeLists(recipe, lists) {
  const updated = { ...recipe, lists: [...new Set(lists)], updatedAt: new Date().toISOString() };
  await db.put('recipes', updated);
  state.recipes = state.recipes.map(r => r.id === updated.id ? updated : r);
  return updated;
}

// Handla till en hel lista, t.ex. veckans recept.
async function shopWholeList(name) {
  const recipes = state.recipes.filter(r => r.lists?.includes(name));
  const before = openItems().length;
  for (const r of recipes) await addMissingFromRecipe(r, r.servings, { silent: true });
  const added = openItems().length - before;
  toast(added ? `${added} nya varor på inköpslistan för ${name}` : `Allt till ${name} finns hemma eller står redan på listan`);
}

// ---------- Listan ----------
function renderRecipes() {
  const el = $('#view-recipes');
  const lists = recipeListNames();
  if (state.recipeList !== 'Alla' && !lists.includes(state.recipeList)) state.recipeList = 'Alla';
  const current = state.recipeList;
  const recipes = (state.recipes || [])
    .filter(r => current === 'Alla' || r.lists?.includes(current))
    .map(r => ({ r, c: coverage(analyzeRecipe(r)) }))
    .sort((a, b) => (b.c.have / (b.c.total || 1)) - (a.c.have / (a.c.total || 1)) || a.r.title.localeCompare(b.r.title, 'sv'));
  const listChips = `<div class="filters list-chips">
    ${['Alla', ...lists].map(n => `<button class="chip ${n === current ? 'on' : ''}" data-rlist="${esc(n)}">${esc(n)} <span class="chip-n">${n === 'Alla' ? state.recipes.length : state.recipes.filter(r => r.lists?.includes(n)).length}</span></button>`).join('')}
    <button class="chip" data-recipe-act="new-list">+ Ny lista</button>
  </div>`;

  el.innerHTML = `
    <div class="card import">
      <h3>Lägg till recept från ICA</h3>
      <p>Dela → Kopiera i ICA-appen och klistra in här. Flera recept? Klistra in ett i taget och tryck Hämta.</p>
      <div class="field"><textarea id="r-url" class="url-box" rows="2" autocapitalize="off" placeholder="https://www.ica.se/recept/…"></textarea></div>
      <div class="btn-row">
        <button class="btn" data-recipe-act="paste">Klistra in</button>
        <button class="btn primary" data-recipe-act="import">Hämta recept</button>
      </div>
      <p class="meta" id="r-status"></p>
    </div>
    <div class="btn-row ai-row">
      ${state.lots.length ? `<button class="btn ai-btn slim" data-recipe-act="ai">✨ Fråga AI</button>` : ''}
      <button class="btn ai-btn slim" data-recipe-act="ai-import">📥 Importera svar</button>
    </div>
    ${listChips}
    ${current !== 'Alla' && recipes.length ? `<button class="btn" data-recipe-act="shop-list">🛒 Handla till ${esc(current)}</button>` : ''}
    ${recipes.length ? `
      <div class="group"><h2>${current === 'Alla' ? 'Sorterat efter vad som finns hemma' : esc(current)}</h2><span class="count">${recipes.length}</span></div>
      <div class="list">${recipes.map(({ r, c }) => `
        <button class="row" data-recipe="${esc(r.id)}">
          ${r.image ? `<img class="thumb" src="${esc(r.image)}" alt="" loading="lazy">` : `<span class="thumb">${r.source === 'ai' ? '✨' : '🍽️'}</span>`}
          <div class="r-main"><div class="r-name">${esc(r.title)}</div>
          <div class="r-sub">${r.source === 'ai' ? 'AI-förslag · ' : ''}${r.servings ? `${r.servings} ${esc(r.servingsLabel)} · ` : ''}${c.total} ingredienser</div></div>
          <span class="badge ${c.have === c.total ? 'ok' : c.have / c.total >= .6 ? 'warn' : ''}">${c.have} av ${c.total} hemma</span>
        </button>`).join('')}</div>`
    : current !== 'Alla' ? emptyHtml('📂', `${esc(current)} är tom`, 'Öppna ett recept och välj listan under Listor, eller klistra in ICA-länkar ovan medan listan är vald.')
    : emptyHtml('📖', 'Inga recept än', 'Recept du hämtar från ICA hamnar här, sorterade efter hur mycket av ingredienserna ni redan har hemma.')}`;
}

// ---------- Massimport ----------
function icaLinks(text) {
  const urls = [...String(text).matchAll(/https?:\/\/[^\s<>"')\]]+/g)].map(m => m[0].replace(/[.,;]+$/, ''));
  return [...new Set(urls.filter(u => /(^|\.)ica\.se\/|ica\.app\.link/i.test(u)))];
}

function openBulkImport(urls) {
  const lists = recipeListNames();
  // Bara den flik man själv står i är förvald – annars hamnar recepten inte i någon lista.
  const preset = state.recipeList !== 'Alla' ? state.recipeList : '';
  openSheet(`<div id="bulk">
    <div class="sheet-head"><div><h3>Hämta ${urls.length} länkar</h3><div class="sub">Från ICA, en i taget</div></div></div>
    <div class="field"><label for="b-list">Lägg i lista</label>
      <select id="b-list">
        <option value="" ${preset ? '' : 'selected'}>Ingen lista</option>
        ${[...new Set([DEFAULT_LIST, ...lists])].sort(listOrder).map(n => `<option ${n === preset ? 'selected' : ''}>${esc(n)}</option>`).join('')}
        <option value="__new">Ny lista…</option>
      </select></div>
    <div class="field" id="b-new-wrap" hidden><input id="b-new" type="text" placeholder="t.ex. ${esc(nextWeekName())}" value="${esc(nextWeekName())}"></div>
    <button class="btn primary" data-bulk="go">Hämta</button>
    <p class="meta" id="b-status"></p>
    <div class="list" id="b-log" hidden></div>
  </div>`, root => {
    const sel = root.querySelector('#b-list');
    sel.addEventListener('change', () => { root.querySelector('#b-new-wrap').hidden = sel.value !== '__new'; });
    root.querySelector('[data-bulk="go"]').addEventListener('click', async e => {
      const listName = sel.value === '__new' ? root.querySelector('#b-new').value.trim() : sel.value;
      e.target.disabled = true;
      const status = root.querySelector('#b-status');
      const log = root.querySelector('#b-log');
      log.hidden = false;
      let ok = 0, had = 0, failed = 0;
      const seen = new Set();
      for (const [i, url] of urls.entries()) {
        status.textContent = `Hämtar ${i + 1} av ${urls.length}…`;
        let line;
        try {
          const res = await Sync.fetchRecipe(url);
          const ld = findRecipe(res.blocks || []);
          if (!ld) throw new Error('inget recept på sidan');
          const recipe = recipeFromLd(ld, res.url || url);
          // ICA:s delningstext kan innehålla flera länkar till samma recept.
          if (seen.has(recipe.id)) { line = `· ${esc(recipe.title)} – samma recept igen, hoppas över`; log.insertAdjacentHTML('beforeend', `<div class="bulk-line">${line}</div>`); continue; }
          seen.add(recipe.id);
          const existing = state.recipes.find(r => r.id === recipe.id);
          if (existing) {
            if (listName) await setRecipeLists(existing, [...(existing.lists || []), listName]);
            had++; line = `↺ ${esc(existing.title)} – fanns redan i Hemma${listName ? `, nu även i ${esc(listName)}` : ''}`;
          } else {
            recipe.lists = listName ? [listName] : [];
            await db.put('recipes', recipe);
            state.recipes.push(recipe);
            ok++; line = `✓ ${esc(recipe.title)}`;
          }
        } catch (err) {
          failed++; line = `✕ ${esc(url)} – ${esc(err.message || 'fel')}`;
        }
        log.insertAdjacentHTML('beforeend', `<div class="bulk-line">${line}</div>`);
      }
      $('#r-url') && ($('#r-url').value = '');
      status.textContent = `Klart: ${ok} nya${had ? `, ${had} fanns redan i Hemma` : ''}${failed ? `, ${failed} misslyckades` : ''}${listName ? ` · i ${listName}` : ''}.`;
      e.target.textContent = 'Stäng';
      e.target.disabled = false;
      e.target.onclick = () => { closeSheet(); renderRecipes(); };
      renderRecipes();
    }, { once: true });
  });
}

function openNewList() {
  openSheet(`<div id="new-list">
    <div class="sheet-head"><div><h3>Ny receptlista</h3><div class="sub">T.ex. Favoritrecept eller en veckoplanering</div></div></div>
    <div class="chips small" style="margin-bottom:10px">
      ${[DEFAULT_LIST, nextWeekName()].filter(n => !recipeListNames().includes(n)).map(n => `<button type="button" class="chip" data-nl="${esc(n)}">${esc(n)}</button>`).join('')}
    </div>
    <div class="field"><input id="nl-name" type="text" placeholder="Namn på listan"></div>
    <button class="btn primary" data-nl-go>Skapa</button>
  </div>`, root => {
    const input = root.querySelector('#nl-name');
    root.querySelector('#new-list').addEventListener('click', e => {
      const q = e.target.closest('[data-nl]');
      if (q) input.value = q.dataset.nl;
      if (e.target.closest('[data-nl-go]') && input.value.trim()) {
        const name = input.value.trim();
        if (!state.extraLists.includes(name)) state.extraLists.push(name);
        state.recipeList = name;
        closeSheet();
        renderRecipes();
      }
    });
  });
}

async function importRecipe(raw) {
  const status = $('#r-status');
  const many = icaLinks(raw);
  if (many.length > 1) {
    if (!Sync.enabled || !Sync.status.user) { if (status) status.textContent = 'Logga in under Mer först – recepten hämtas via ert hushålls databas.'; return; }
    openBulkImport(many);
    return;
  }
  const url = (String(raw).match(/https?:\/\/\S+/) || [])[0]?.replace(/[)\].,]+$/, '');
  if (!url) { if (status) status.textContent = 'Hittade ingen länk. Klistra in adressen till receptet.'; return; }
  if (!Sync.enabled || !Sync.status.user) {
    if (status) status.textContent = 'Logga in under Mer först – receptet hämtas via ert hushålls databas.';
    return;
  }
  if (status) status.textContent = 'Hämtar receptet…';
  try {
    const res = await Sync.fetchRecipe(url);
    const ld = findRecipe(res.blocks || []);
    if (!ld) throw new Error('Sidan innehöll inget recept');
    const recipe = recipeFromLd(ld, res.url || url);
    const existing = state.recipes.find(r => r.id === recipe.id);
    const list = state.recipeList !== 'Alla' ? state.recipeList : null;
    if (existing && !existing.deleted) {
      const r = list ? await setRecipeLists(existing, [...(existing.lists || []), list]) : existing;
      openRecipeSheet(r);
      if (status) status.textContent = list ? `Receptet fanns redan – nu även i ${list}.` : 'Receptet fanns redan.';
      return;
    }
    recipe.lists = list ? [list] : [];
    await db.put('recipes', recipe);
    $('#r-url').value = '';
    if (status) status.textContent = list ? `Sparat i ${list}.` : '';
    state.recipes.push(recipe);
    renderRecipes();
    openRecipeSheet(recipe);
  } catch (e) {
    const m = e.message || '';
    if (status) status.textContent = /Bara länkar/.test(m) ? 'Det fungerar bara med länkar till ica.se.'
      : /schema cache|Could not find the function/.test(m) ? 'Receptfunktionen är inte installerad i Supabase än.'
      : `Kunde inte hämta receptet: ${m}`;
  }
}

// ---------- Receptbladet ----------
function openRecipeSheet(recipe, servings = recipe.servings) {
  const scale = recipe.servings && servings ? servings / recipe.servings : 1;
  const rows = analyzeRecipe(recipe, scale);
  const c = coverage(rows);

  const rowHtml = r => {
    const home = r.lots.length;
    const total = r.lots.reduce((s, l) => s + l.qty, 0);
    const sub = r.ignored ? 'Behövs inte i lagret'
      : !r.product ? 'Hittar ingen vara – tryck för att välja'
      : home && isStaple(r.product) ? `Finns hemma · ${placeLabel(r.lots[0].place)}`
      : home ? `Hemma: ${fmtQty(Math.round(total * 100) / 100, r.lots[0].unit)} ${esc(r.product.name.toLowerCase())} · ${placeLabel(r.lots[0].place)}`
      : `Saknas hemma (${esc(r.product.name)}) – tryck för att välja annan`;
    return `<button type="button" class="ing ${home ? 'have' : r.ignored ? 'ignored' : r.product ? 'miss' : 'unknown'}" data-ing="${r.i}">
      <span class="ing-mark">${home ? '✓' : r.ignored ? '–' : r.product ? '✕' : '?'}</span>
      <div class="ing-main"><div>${r.need != null ? `<b>${fmtNeed(r.need, /klyft/i.test(r.ing.name) ? 'st' : r.ing.unit)}</b> ` : ''}${esc(r.ing.name)}</div>
      <div class="ing-sub">${sub}</div></div><span class="ing-edit" aria-hidden="true">›</span></button>`;
  };

  openSheet(`
    ${recipe.image ? `<img class="photo-big" src="${esc(recipe.image)}" alt="">` : ''}
    <div class="sheet-head"><div style="flex:1"><h3>${esc(recipe.title)}</h3>
      <div class="sub">${c.have} av ${c.total} ingredienser hemma</div></div></div>
    ${recipe.description ? `<p class="meta">${esc(recipe.description)}</p>` : ''}
    <div class="field"><span class="label">Listor</span>
      <div class="chips small" id="r-lists">
        ${[...new Set([DEFAULT_LIST, ...recipeListNames()])].sort(listOrder).map(n => `<button type="button" class="chip ${recipe.lists?.includes(n) ? 'on' : ''}" data-tl="${esc(n)}">${esc(n)}</button>`).join('')}
        <button type="button" class="chip" data-tl-new>+ ${esc(nextWeekName())}</button>
      </div></div>
    ${recipe.servings ? `<div class="field"><span class="label">${esc(recipe.servingsLabel.charAt(0).toUpperCase() + recipe.servingsLabel.slice(1))}</span>
      <div class="qty"><button class="step" data-serv="-1" aria-label="Färre">−</button>
      <input id="r-serv" value="${servings}" inputmode="numeric" readonly>
      <button class="step" data-serv="1" aria-label="Fler">+</button></div></div>` : ''}
    <div class="ings">${rows.map(rowHtml).join('')}</div>
    ${recipe.steps?.length ? `<div class="group"><h2>Gör så här</h2></div>
      <ol class="steps">${recipe.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
    <div style="height:12px"></div>
    <button class="btn" data-missing>🛒 Lägg det som saknas på listan</button>
    <div style="height:8px"></div>
    <button class="btn primary sticky-save" data-cook>Laga – dra av från lagret</button>
    <div class="btn-row" style="margin-top:8px">
      ${recipe.url ? `<a class="btn" href="${esc(recipe.url)}" target="_blank" rel="noopener">Öppna hos ICA</a>` : ''}
      <button class="btn danger" data-del-recipe>Ta bort</button>
    </div>
  `, root => {
    root.querySelectorAll('[data-serv]').forEach(b => b.addEventListener('click', () => {
      const next = Math.max(1, servings + Number(b.dataset.serv));
      openRecipeSheet(recipe, next);
    }));
    root.querySelector('[data-cook]').addEventListener('click', () => openCookSheet(recipe, servings));
    root.querySelector('#r-lists').addEventListener('click', async e => {
      const t = e.target.closest('[data-tl]');
      const n = e.target.closest('[data-tl-new]');
      if (!t && !n) return;
      const name = t ? t.dataset.tl : nextWeekName();
      const has = recipe.lists?.includes(name);
      const updated = await setRecipeLists(recipe, has ? recipe.lists.filter(x => x !== name) : [...(recipe.lists || []), name]);
      openRecipeSheet(updated, servings);
      toast(has ? `Borttaget från ${name}` : `Tillagt i ${name}`);
    });
    root.querySelector('[data-missing]').addEventListener('click', () => addMissingFromRecipe(recipe, servings));
    root.querySelector('.ings').addEventListener('click', e => {
      const b = e.target.closest('[data-ing]');
      if (b) openIngredientPicker(recipe, servings, rows[Number(b.dataset.ing)]);
    });
    root.querySelector('[data-del-recipe]').addEventListener('click', async () => {
      const del = { ...recipe, deleted: true, updatedAt: new Date().toISOString() };
      await db.put('recipes', del);
      state.recipes = state.recipes.filter(r => r.id !== recipe.id);
      closeSheet();
      renderRecipes();
      toast(`${recipe.title} borttaget`, { type: 'recipe', before: recipe });
    });
  });
}

// ---------- Laga: förslag på avdrag som går att justera ----------
function planCook(recipe, servings) {
  const scale = recipe.servings && servings ? servings / recipe.servings : 1;
  const plan = [];
  for (const r of analyzeRecipe(recipe, scale)) {
    // Förbrukningsvaror dras inte av – de finns tills någon säger att de är slut.
    if (!r.lots.length || isStaple(r.product)) continue;
    // Äldst först: ta från partiet som går ut först.
    let left = convertQty(r.need, r.ing.unit, r.lots[0].unit, r.product.name);
    const known = left != null;
    r.lots.forEach((lot, k) => {
      const take = known ? Math.min(lot.qty, left) : 0;
      if (known && take <= 0 && k > 0) return;
      plan.push({ lot, ingName: r.ing.name, take: known ? roundQty(take, lot.unit) : 0, known, short: known && k === r.lots.length - 1 && left > lot.qty });
      if (known) left -= take;
    });
  }
  return plan;
}

function openCookSheet(recipe, servings) {
  const plan = planCook(recipe, servings);
  openSheet(`
    <div class="sheet-head"><div><h3>Laga ${esc(recipe.title)}</h3>
      <div class="sub">${servings ? `${servings} ${esc(recipe.servingsLabel)} · ` : ''}Justera mängderna innan du drar av</div></div></div>
    ${plan.length ? `<div class="cook">${plan.map((p, k) => `
      <label class="cook-row">
        <input type="checkbox" data-k="${k}" ${p.take > 0 ? 'checked' : ''}>
        <div class="ing-main"><div>${esc(p.lot.name)}</div>
          <div class="ing-sub">Finns ${fmtQty(p.lot.qty, p.lot.unit)} · ${placeLabel(p.lot.place)}${p.known ? '' : ' · ange mängd själv'}${p.short ? ' · räcker inte helt' : ''}</div></div>
        <span class="cook-qty"><input inputmode="decimal" data-q="${k}" value="${p.take ? nf.format(p.take) : ''}" placeholder="0"> ${esc(p.lot.unit)}</span>
      </label>`).join('')}</div>`
    : emptyHtml('🤷', 'Inget att dra av', 'Ingen av ingredienserna finns i lagret.')}
    <div class="field"><span class="label">Blev det rester?</span>
      ${chipsHtml('left', [0, 1, 2, 3, 4].map(n => ({ value: n, label: n ? `${n} portion${n > 1 ? 'er' : ''}` : 'Nej' })), 0)}</div>
    <button class="btn primary" data-apply>Dra av</button>
  `, root => {
    let leftovers = 0;
    bindChips(root, 'left', v => leftovers = Number(v));
    root.querySelectorAll('[data-q]').forEach(inp => inp.addEventListener('input', () => {
      root.querySelector(`[data-k="${inp.dataset.q}"]`).checked = parseNum(inp.value) > 0;
    }));
    root.querySelector('[data-apply]').addEventListener('click', async () => {
      const takes = plan.map((p, k) => ({ p, take: root.querySelector(`[data-k="${k}"]`).checked ? parseNum(root.querySelector(`[data-q="${k}"]`).value) || 0 : 0 }))
        .filter(t => t.take > 0);
      await applyCook(recipe, takes, leftovers);
    });
  });
}

async function applyCook(recipe, takes, leftovers) {
  const now = new Date().toISOString();
  const befores = [];
  const eventIds = [];
  for (const { p, take } of takes) {
    const lot = state.lots.find(l => l.id === p.lot.id);
    if (!lot) continue;
    befores.push({ ...lot });
    const qty = roundQty(Math.max(0, lot.qty - take), lot.unit);
    const updated = { ...lot, qty, status: qty > 0 ? 'active' : 'used', updatedAt: now };
    await db.put('lots', updated);
    state.lots = state.lots.filter(l => l.id !== lot.id);
    if (updated.status === 'active') state.lots.push(updated);
    const ev = await logEvent('cooked', updated, Math.min(take, lot.qty), { recipe: recipe.title });
    eventIds.push(ev.id);
  }
  let leftoverLot = null;
  if (leftovers > 0) {
    leftoverLot = {
      id: uuid(), productId: 'rester', name: `Rester: ${recipe.title}`, category: 'Rester',
      qty: leftovers, initialQty: leftovers, unit: 'st', place: 'kyl',
      addedAt: now, bestBefore: addDays(todayIso(), LEFTOVER_DAYS), openedAt: null, photoId: null,
      status: 'active', updatedAt: now,
    };
    await db.put('lots', leftoverLot);
    state.lots.push(leftoverLot);
    eventIds.push((await logEvent('added', leftoverLot, leftovers)).id);
  }
  await db.put('recipes', { ...recipe, lastCooked: now, updatedAt: now });
  closeSheet();
  render();
  const parts = [`Drog av ${takes.length} ${takes.length === 1 ? 'vara' : 'varor'}`];
  if (leftoverLot) parts.push(`${leftovers} portion${leftovers > 1 ? 'er' : ''} rester i kylen`);
  // Tog något slut? Låt användaren gå igenom det i lugn och ro under Inköp.
  const emptied = recentlyEmptied().filter(g => g.events.some(e => eventIds.includes(e.id))).length;
  if (emptied) parts.push(`${emptied} tog slut`);
  toast(parts.join(' · '), { type: 'cook', befores, eventIds, leftoverId: leftoverLot?.id },
    emptied ? { label: 'Visa', run: () => { state.view = 'shop'; render(); window.scrollTo(0, 0); } } : null);
}

async function undoCook(u) {
  for (const before of u.befores) {
    const restored = { ...before, updatedAt: new Date().toISOString() };
    await db.put('lots', restored);
    state.lots = state.lots.filter(l => l.id !== restored.id);
    if (restored.status === 'active') state.lots.push(restored);
  }
  if (u.leftoverId) {
    const lot = state.lots.find(l => l.id === u.leftoverId);
    if (lot) {
      await db.put('lots', { ...lot, status: 'removed', deleted: true, updatedAt: new Date().toISOString() });
      state.lots = state.lots.filter(l => l.id !== u.leftoverId);
    }
  }
  for (const id of u.eventIds) await deleteEvent(id);
}

async function undoRecipeDelete(u) {
  const restored = { ...u.before, deleted: false, updatedAt: new Date().toISOString() };
  await db.put('recipes', restored);
  state.recipes.push(restored);
}

function bindRecipes() {
  $('#view-recipes').addEventListener('click', async e => {
    const chip = e.target.closest('[data-rlist]');
    if (chip) { state.recipeList = chip.dataset.rlist; renderRecipes(); return; }
    const row = e.target.closest('[data-recipe]');
    if (row) { const r = state.recipes.find(x => x.id === row.dataset.recipe); if (r) openRecipeSheet(r); return; }
    const act = e.target.closest('[data-recipe-act]')?.dataset.recipeAct;
    if (act === 'import') importRecipe($('#r-url').value);
    if (act === 'ai') openAiExport();
    if (act === 'ai-import') openAiImport();
    if (act === 'new-list') openNewList();
    if (act === 'shop-list') shopWholeList(state.recipeList);
    if (act === 'paste') {
      try {
        const text = await navigator.clipboard.readText();
        const box = $('#r-url');
        box.value = [box.value.trim(), text.trim()].filter(Boolean).join('\n');
        const n = icaLinks(box.value).length;
        $('#r-status').textContent = n ? `${n} ${n === 1 ? 'länk' : 'länkar'} i rutan – klistra in fler eller tryck Hämta recept.` : 'Hittade ingen ICA-länk i det du kopierade.';
      } catch {
        $('#r-url').focus();
        $('#r-status').textContent = 'Tryck länge i fältet och välj Klistra in.';
      }
    }
  });
  $('#view-recipes').addEventListener('keydown', e => {
    if (e.target.id === 'r-url' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); importRecipe(e.target.value); }
  });
}
