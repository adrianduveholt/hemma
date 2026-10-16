'use strict';
// Receptidéer med AI: lagret som en färdig text att klistra in i valfri AI-chatt.
// Appen anropar ingen AI själv – texten kopieras eller delas.

const AI_PREFS_KEY = 'hemma-ai-export';
const SOON_DAYS = 3;

function loadAiPrefs() {
  try { return { servings: 4, prioritize: true, wishes: '', ...JSON.parse(localStorage.getItem(AI_PREFS_KEY) || '{}') }; }
  catch { return { servings: 4, prioritize: true, wishes: '' }; }
}
function saveAiPrefs(p) {
  try { localStorage.setItem(AI_PREFS_KEY, JSON.stringify(p)); } catch {}
}

function aiLotLine(lot) {
  const product = state.products.get(lot.productId);
  const d = daysLeft(lot);
  const parts = [lot.name];
  if (!isStaple(product)) parts.push(fmtQty(Math.round(lot.qty * 100) / 100, lot.unit));
  if (lot.openedAt) parts.push('öppnad');
  let line = `- ${parts.join(', ')}`;
  if (d !== null && d < 0) line += ' ⚠ bäst före har passerat, kontrollera först';
  else if (d !== null && d <= SOON_DAYS) line += ` ⚠ går ut ${d === 0 ? 'idag' : d === 1 ? 'imorgon' : `om ${d} dagar`}`;
  return line;
}

function buildAiPrompt(prefs) {
  const lots = [...state.lots].sort(sortByExpiry);
  const staples = lots.filter(l => isStaple(state.products.get(l.productId)) && l.category !== 'Rester');
  const regular = lots.filter(l => !staples.includes(l));
  const leftovers = regular.filter(l => l.category === 'Rester');
  const food = regular.filter(l => l.category !== 'Rester');
  const soon = food.filter(l => { const d = daysLeft(l); return d !== null && d <= SOON_DAYS; });

  const today = new Date().toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' });
  const lines = [
    'Jag vill ha förslag på recept utifrån det vi har hemma.',
    '',
    `- Föreslå 3–5 rätter för ${prefs.servings} portioner som använder så mycket som möjligt av det som finns.`,
  ];
  if (prefs.prioritize && soon.length) lines.push('- Prioritera det som är markerat med ⚠ – det går ut snart.');
  lines.push(
    '- Skriv för varje rätt vilka av våra varor den använder och vad som behöver handlas (helst högst 3 saker).',
    '- Kort ingredienslista och gör så här i punktform. Svara på svenska.',
  );
  if (prefs.wishes.trim()) lines.push(`- Önskemål: ${prefs.wishes.trim()}`);
  lines.push('', `Det här finns hemma (${today}):`);

  for (const place of PLACES) {
    const items = food.filter(l => l.place === place.id);
    if (!items.length) continue;
    lines.push('', `${place.label}:`, ...items.map(aiLotLine));
  }
  if (leftovers.length) lines.push('', 'Rester:', ...leftovers.map(aiLotLine));
  if (staples.length) {
    const names = [...new Set(staples.map(l => l.name.toLowerCase()))];
    lines.push('', `Basvaror och kryddor som finns: ${names.join(', ')}.`);
  }
  if (!food.length && !leftovers.length) lines.push('', '(Lagret är tomt.)');
  lines.push('', AI_FORMAT);
  return lines.join('\n');
}

function openAiExport() {
  const prefs = loadAiPrefs();
  openSheet(`<div id="ai-export">
    <div class="sheet-head"><div><h3>Receptidéer med AI</h3>
      <div class="sub">Kopiera texten och klistra in den i valfri AI-chatt</div></div></div>
    <div class="field"><span class="label">Portioner</span>
      <div class="qty"><button class="step" data-ai-serv="-1" aria-label="Färre">−</button>
      <input id="ai-serv" value="${prefs.servings}" inputmode="numeric" readonly>
      <button class="step" data-ai-serv="1" aria-label="Fler">+</button></div></div>
    <div class="field"><label class="check-line"><input type="checkbox" id="ai-prio" ${prefs.prioritize ? 'checked' : ''}>
      <span>Prioritera det som går ut snart</span></label></div>
    <div class="field"><label for="ai-wish">Önskemål (valfritt)</label>
      <input id="ai-wish" type="text" value="${esc(prefs.wishes)}" placeholder="t.ex. vegetariskt, max 30 min, barnvänligt"></div>
    <div class="field"><label for="ai-text">Text som kopieras</label>
      <textarea id="ai-text" class="ai-text" readonly></textarea></div>
    <div class="btn-row">
      ${navigator.share ? '<button class="btn" data-ai="share">Dela…</button>' : ''}
      <button class="btn primary" data-ai="copy">Kopiera</button>
    </div>
    <p class="meta">När AI:n har svarat: kopiera hela svaret och tryck <b>Importera AI-svar</b> under Recept.</p>
  </div>`, root => {
    const text = root.querySelector('#ai-text');
    const update = () => {
      prefs.servings = Number(root.querySelector('#ai-serv').value) || 4;
      prefs.prioritize = root.querySelector('#ai-prio').checked;
      prefs.wishes = root.querySelector('#ai-wish').value;
      saveAiPrefs(prefs);
      text.value = buildAiPrompt(prefs);
    };
    update();
    root.querySelector('#ai-export').addEventListener('click', async e => {
      const s = e.target.closest('[data-ai-serv]');
      if (s) {
        const inp = root.querySelector('#ai-serv');
        inp.value = Math.max(1, Number(inp.value) + Number(s.dataset.aiServ));
        update();
        return;
      }
      const act = e.target.closest('[data-ai]')?.dataset.ai;
      if (act === 'copy') {
        try {
          await navigator.clipboard.writeText(text.value);
          closeSheet();
          toast('Kopierat – klistra in i din AI-chatt');
        } catch {
          text.focus(); text.select();
          toast('Markerat – välj Kopiera');
        }
      }
      if (act === 'share') {
        try { await navigator.share({ text: text.value }); } catch { /* avbrutet */ }
      }
    });
    root.querySelector('#ai-prio').addEventListener('change', update);
    root.querySelector('#ai-wish').addEventListener('input', update);
  });
}

// ---------- Importera AI-svar ----------
// AI:n ombeds avsluta med ett ```hemma-block med JSON. Vi läser det, och faller tillbaka på
// en enkel tolkning av vanlig text (rubriken "Inköpslista" följd av punkter).

const AI_FORMAT = `Avsluta svaret med ett kodblock som börjar med \`\`\`hemma och innehåller JSON i exakt detta format, så att jag kan importera det i min app:
\`\`\`hemma
{"recept":[{"namn":"Pasta med torsk","portioner":4,"ingredienser":["400 g torskrygg","2 dl matlagningsgrädde"],"gor_sa_har":["Koka pastan.","Stek torsken."]}],"inkopslista":["1 burk krossade tomater"]}
\`\`\`
Skriv ingredienser som mängd, enhet och vara, t.ex. "2 dl grädde". Inköpslistan ska bara innehålla det som saknas hemma.`;

const AI_REFORMAT = `Kan du skriva om dina förslag ovan i det här formatet?\n\n${AI_FORMAT}`;

function pick(obj, ...keys) {
  for (const k of keys) if (obj?.[k] != null) return obj[k];
  return null;
}

function parseAiReply(text) {
  const candidates = [];
  for (const m of text.matchAll(/```[a-zA-Z]*\s*([\s\S]*?)```/g)) candidates.push(m[1]);
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a >= 0 && b > a) candidates.push(text.slice(a, b + 1));
  for (const c of candidates) {
    let data;
    try { data = JSON.parse(c.trim()); } catch { continue; }
    const recipes = [].concat(pick(data, 'recept', 'recipes') || []).map(r => ({
      title: String(pick(r, 'namn', 'name', 'title') || 'AI-recept'),
      servings: Number(pick(r, 'portioner', 'servings')) || null,
      ingredients: [].concat(pick(r, 'ingredienser', 'ingredients') || []).map(String),
      steps: [].concat(pick(r, 'gor_sa_har', 'gör_så_här', 'steg', 'steps', 'instructions') || []).map(String),
    })).filter(r => r.ingredients.length);
    const shopping = [].concat(pick(data, 'inkopslista', 'inköpslista', 'shopping', 'shopping_list') || []).map(String);
    if (recipes.length || shopping.length) return { recipes, shopping, structured: true };
  }
  // Reserv: vanlig text. Leta upp inköpslistan under en rubrik.
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex(l => /inköpslista|att handla|handla/i.test(l));
  const shopping = [];
  if (start >= 0) {
    for (const l of lines.slice(start + 1)) {
      const m = l.match(/^\s*(?:[-*•]|\d+[.)]|☐|\[ \])\s+(.+)/);
      if (m) shopping.push(m[1].replace(/\*\*/g, '').trim());
      else if (shopping.length && l.trim()) break;
    }
  }
  return { recipes: [], shopping, structured: false };
}

function aiRecipeToRecipe(r) {
  const now = new Date().toISOString();
  return {
    id: 'ai:' + uuid(), url: null, source: 'ai', title: r.title, image: null,
    servings: r.servings, servingsLabel: 'portioner',
    ingredients: r.ingredients.map(t => parseIngredient(t)),
    steps: r.steps, addedAt: now, updatedAt: now,
  };
}

function openAiImport() {
  openSheet(`<div id="ai-import">
    <div class="sheet-head"><div><h3>Importera AI-svar</h3>
      <div class="sub">Kopiera hela svaret från AI-chatten och klistra in här</div></div></div>
    <div class="field"><textarea id="ai-reply" class="ai-text" placeholder="Klistra in svaret här"></textarea></div>
    <div class="btn-row">
      <button class="btn" data-imp="paste">Klistra in</button>
      <button class="btn primary" data-imp="read">Läs svaret</button>
    </div>
    <div id="ai-preview"></div>
  </div>`, root => {
    const area = root.querySelector('#ai-reply');
    const preview = root.querySelector('#ai-preview');
    let parsed = null;

    const show = () => {
      parsed = parseAiReply(area.value);
      const { recipes, shopping, structured } = parsed;
      if (!recipes.length && !shopping.length) {
        preview.innerHTML = `<p class="meta">Hittade inga recept eller någon inköpslista. Be AI:n skriva om svaret i Hemma-formatet:</p>
          <button class="btn" data-imp="reformat">Kopiera formatfråga</button>`;
        return;
      }
      preview.innerHTML = `
        ${recipes.length ? `<div class="group"><h2>Recept</h2><span class="count">${recipes.length}</span></div>
          <div class="cook">${recipes.map((r, k) => `<label class="cook-row"><input type="checkbox" data-r="${k}" checked>
            <div class="ing-main"><div>${esc(r.title)}</div><div class="ing-sub">${r.ingredients.length} ingredienser${r.servings ? ` · ${r.servings} portioner` : ''}</div></div></label>`).join('')}</div>` : ''}
        ${shopping.length ? `<div class="group"><h2>Till inköpslistan</h2><span class="count">${shopping.length}</span></div>
          <div class="cook">${shopping.map((s, k) => `<label class="cook-row"><input type="checkbox" data-s="${k}" checked>
            <div class="ing-main"><div>${esc(s)}</div></div></label>`).join('')}</div>` : ''}
        ${!structured ? `<p class="meta">Svaret saknade Hemma-formatet, så bara inköpslistan kunde läsas. Vill du ha med recepten:
          <a href="#" data-imp="reformat">kopiera formatfrågan</a> och klistra in den i chatten.</p>` : ''}
        <div style="height:12px"></div>
        <button class="btn primary" data-imp="go">Importera</button>`;
    };

    root.querySelector('#ai-import').addEventListener('click', async e => {
      const act = e.target.closest('[data-imp]')?.dataset.imp;
      if (!act) return;
      e.preventDefault();
      if (act === 'paste') {
        try { area.value = await navigator.clipboard.readText(); show(); }
        catch { area.focus(); toast('Tryck länge i rutan och välj Klistra in'); }
      }
      if (act === 'read') show();
      if (act === 'reformat') {
        try { await navigator.clipboard.writeText(AI_REFORMAT); toast('Kopierat – klistra in i AI-chatten'); }
        catch { toast('Kunde inte kopiera'); }
      }
      if (act === 'go' && parsed) {
        const recipes = parsed.recipes.filter((_, k) => root.querySelector(`[data-r="${k}"]`)?.checked).map(aiRecipeToRecipe);
        const items = parsed.shopping.filter((_, k) => root.querySelector(`[data-s="${k}"]`)?.checked);
        for (const r of recipes) { await db.put('recipes', r); state.recipes.push(r); }
        const products = [...state.products.values()];
        const stocked = stockedProductIds();
        for (const text of items) {
          const ing = parseIngredient(text);
          const product = aliasFor(ing, products) || matchProduct(ing, products, stocked);
          await addShopping({ product, name: product ? product.name : ing.name.charAt(0).toUpperCase() + ing.name.slice(1), qty: ing.qty, unit: ing.unit, note: 'AI-förslag' });
        }
        closeSheet();
        render();
        updateShopBadge();
        const parts = [];
        if (recipes.length) parts.push(`${recipes.length} recept`);
        if (items.length) parts.push(`${items.length} på inköpslistan`);
        toast(`Importerat: ${parts.join(' och ')}`);
      }
    });
    area.addEventListener('paste', () => setTimeout(show, 0));
  });
}
