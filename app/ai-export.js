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
