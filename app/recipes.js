'use strict';
// Recept: läsa ICA:s receptdata, tolka ingrediensrader, koppla dem till varor
// och räkna om mängder mellan receptets och lagrets enheter.

const RECIPE_UNITS = {
  g: 'g', gram: 'g', hg: 'hg', kg: 'kg', kilo: 'kg',
  ml: 'ml', cl: 'cl', dl: 'dl', l: 'l', liter: 'l',
  msk: 'msk', matsked: 'msk', matskedar: 'msk', tsk: 'tsk', tesked: 'tsk', teskedar: 'tsk', krm: 'krm',
  st: 'st', styck: 'st', stycken: 'st',
  'förp': 'förp', 'förpackning': 'förp', 'förpackningar': 'förp', paket: 'förp', pkt: 'förp',
  'påse': 'förp', 'påsar': 'förp', ask: 'förp', askar: 'förp', burk: 'förp', burkar: 'förp', flaska: 'förp',
  klyfta: 'klyfta', klyftor: 'klyfta', skiva: 'skiva', skivor: 'skiva',
  knippe: 'knippe', knippen: 'knippe', kruka: 'kruka', krukor: 'kruka', nypa: 'nypa',
  bit: 'st', bitar: 'st', port: 'port', portion: 'port', portioner: 'port',
  kvist: 'kvist', kvistar: 'kvist', 'tärning': 'st', 'tärningar': 'st',
};
const MASS = { g: 1, hg: 100, kg: 1000 };
const VOLUME = { ml: 1, cl: 10, dl: 100, l: 1000, msk: 15, tsk: 5, krm: 1 };
const FRACTIONS = { '½': '1/2', '¼': '1/4', '¾': '3/4', '⅓': '1/3', '⅔': '2/3' };

// "2 1/2 dl vetemjöl" → { qty: 2.5, unit: 'dl', name: 'vetemjöl', alts: [...] }
function parseIngredient(text) {
  let s = text.replace(/[½¼¾⅓⅔]/g, c => ' ' + FRACTIONS[c]).replace(/\s+/g, ' ').trim()
    .replace(/^(ca|cirka|ev\.?|eventuellt)\s+/i, '')
    // "2 - ca 3 msk smör", "1/2 - ev 1 dl persilja": behåll den första siffran.
    .replace(/^([\d.,/ ]+?)\s*[-–]\s*(ca|ev\.?)?\s*[\d.,]+(\s+\d+\/\d+)?(?=\s)/i, '$1');
  let qty = null;
  const m = s.match(/^(\d+(?:[.,]\d+)?)?(?:\s*(\d+)\/(\d+))?(?:\s*[-–]\s*\d+(?:[.,]\d+)?(?:\s*\d+\/\d+)?)?(?=\s|$)/);
  if (m && (m[1] || m[2])) {
    qty = (m[1] ? parseFloat(m[1].replace(',', '.')) : 0) + (m[2] ? Number(m[2]) / Number(m[3]) : 0);
    s = s.slice(m[0].length).trim();
  }
  let unit = null;
  const first = s.split(' ')[0]?.toLocaleLowerCase('sv-SE').replace(/\.$/, '');
  if (first && RECIPE_UNITS[first]) { unit = RECIPE_UNITS[first]; s = s.slice(s.indexOf(' ') + 1 || s.length).trim(); }
  if (qty !== null && !unit) unit = /klyft/i.test(s.split(' ')[0]) ? 'klyfta' : 'st';
  // Bort med förklaringar inom parentes och allt efter kommatecken: "2 äpplen (gärna ingrid marie)".
  const clean = s.replace(/\([^)]*\)/g, '').split(',')[0].trim();
  const alts = clean.split(/\s+eller\s+|\s+och\/eller\s+/).map(x => x.trim()).filter(Boolean);
  return { text, qty, unit, name: alts[0] || clean, alts: alts.length ? alts : [clean] };
}

function parseServings(y) {
  const s = Array.isArray(y) ? y.join(' ') : String(y ?? '');
  const m = s.match(/(\d+)/);
  return { servings: m ? Number(m[1]) : null, label: s.replace(/^\s*\d+\s*/, '').trim() || 'portioner' };
}

// Hitta Recipe-objektet bland JSON-LD-blocken från sidan.
function findRecipe(blocks) {
  const stack = [...blocks];
  while (stack.length) {
    const b = stack.shift();
    if (!b || typeof b !== 'object') continue;
    if (Array.isArray(b)) { stack.push(...b); continue; }
    const t = b['@type'];
    if (t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'))) return b;
    if (b['@graph']) stack.push(...[].concat(b['@graph']));
  }
  return null;
}

function decodeEntities(s) {
  const t = document.createElement('textarea');
  t.innerHTML = s;
  return t.value;
}

function recipeFromLd(ld, url) {
  const image = [].concat(ld.image || [])[0];
  const { servings, label } = parseServings(ld.recipeYield);
  const idMatch = url.match(/-(\d{4,})\/?(?:[?#].*)?$/);
  return {
    id: idMatch ? 'ica:' + idMatch[1] : 'url:' + url.replace(/[?#].*$/, '').replace(/\/$/, ''),
    url,
    title: decodeEntities(ld.name || 'Recept'),
    image: typeof image === 'string' ? image : image?.url || null,
    servings, servingsLabel: label,
    ingredients: (ld.recipeIngredient || []).map(t => parseIngredient(decodeEntities(String(t)))),
    addedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ---------- Koppla ingrediens → vara ----------
// Ord i varunamnen som beskriver varan men inte behöver stå i receptet: "Färsk persilja", "Spenat fryst".
const DESCRIPTORS = new Set(['färsk', 'fryst', 'frysta', 'torkad', 'blandad', 'hel', 'på', 'i', 'burk', 'lake']);
// Efterled som inte ändrar vad varan är: "vitlöksklyftor", "kardemummakärnor", "buljongtärning".
const PART_SUFFIX = /^s?(klyft|kvist|kärn|filé|bit|skiv|blad|tärning|pulver|bladen)/;
const PLURAL_ENDINGS = new Set(['', 'n', 'r', 's', 'ar', 'or', 'er', 'en', 'na', 'et', 'arna', 'orna', 'erna', 'erna']);
// Sådant som står i recept men aldrig finns i lagret.
const NOT_STOCK = /^((kokande|kallt|varmt|ljummet)\s+)?vatten$|^is(bitar)?$|^steksnöre$|^bakplåtspapper$|^tandpetare$/;

function stemOf(w) { return w.length <= 3 ? w : w.slice(0, -1); }

// Hur väl varunamnet p sitter i ordet w. Svenska sammansättningar har huvudordet sist,
// så "syltlök" är en lök och inte sylt, medan "grönsaksbuljong" är buljong.
function wordFit(w, p) {
  const i = w.indexOf(p);
  if (i < 0) return 0;
  const rest = w.slice(i + p.length);
  const inflection = PLURAL_ENDINGS.has(rest);
  if (i === 0 && inflection) return 3;            // smör, äpplen, kycklingfiléer
  if (i > 0 && inflection) return p.length > 3 ? 2 : 0; // grönsaksbuljong (inte "te" i "tomater")
  if (PART_SUFFIX.test(rest)) return 2;           // vitlöksklyftor, kycklingbuljongtärning
  return 0;
}

function productScore(ingName, product) {
  const n = norm(ingName);
  const p = norm(product.name);
  if (p.length < 2) return 0;
  if (n === p) return 1000;
  const nWords = n.split(/[\s-]+/);
  // Hela varunamnet finns i ingrediensen: "rumstempererat smör".
  if (n.includes(' ' + p + ' ') || n.startsWith(p + ' ') || n.endsWith(' ' + p)) return 200 + p.length * 2;
  if (!p.includes(' ')) {
    const fit = Math.max(...nWords.map(w => wordFit(w, p)));
    if (fit) return 100 + fit * 10 + p.length * 2;
  }
  // Böjda former och beskrivande ord: "gula lökar" ↔ "Gul lök", "persilja" ↔ "Färsk persilja".
  const core = p.split(/[\s-]+/).filter(w => !DESCRIPTORS.has(w));
  if (core.length && core.every(pw => pw.length >= 3 && nWords.some(nw => nw.startsWith(stemOf(pw))))) {
    return 60 + core.join(' ').length;
  }
  // Ingrediensen är det allmänna namnet på varan: "olja" ↔ "Rapsolja", "peppar" ↔ "Svartpeppar".
  if (n.length >= 4 && !n.includes(' ') && p.endsWith(n) && p.length - n.length >= 3) return 30;
  return 0;
}

// Kopplingar man valt själv sparas som alias på varan (synkas med varorna).
// IGNORE_ID är en dold vara som samlar ingredienser som aldrig finns i lagret.
const IGNORE_ID = 'ignore';

function aliasFor(ing, products) {
  for (const alt of ing.alts) {
    const key = norm(alt);
    const p = products.find(x => !x.deleted && x.aliases?.includes(key));
    if (p) return p;
  }
  return null;
}

function matchProduct(ing, products, stockedIds) {
  let best = null, bestScore = 0;
  if (ing.alts.every(a => NOT_STOCK.test(norm(a)))) return null;
  for (const alt of ing.alts) {
    for (const p of products) {
      if (p.deleted || p.hidden) continue;
      let s = productScore(alt, p);
      if (!s) continue;
      if (stockedIds.has(p.id)) s += 20; // Hellre en vara som faktiskt finns hemma.
      if (s > bestScore) { bestScore = s; best = p; }
    }
  }
  return best;
}

// ---------- Enheter ----------
// Ungefärlig vikt per styck i gram, för att räkna mellan "4 kycklingfiléer" och ett lager i gram.
const PIECE_GRAMS = {
  'kycklingfilé': 150, 'kycklinglårfilé': 100, 'laxfilé fryst': 125, 'lax': 125, 'torskrygg': 125, 'torsk': 125,
  'ägg': 60, 'gul lök': 100, 'rödlök': 100, 'schalottenlök': 30, 'purjolök': 300, 'vitlök': 50,
  'morot': 80, 'potatis': 100, 'färskpotatis': 60, 'sötpotatis': 300, 'äpple': 150, 'päron': 150, 'banan': 120,
  'tomat': 100, 'paprika': 150, 'gurka': 350, 'zucchini': 250, 'aubergine': 300, 'citron': 100, 'lime': 70,
  'avokado': 170, 'broccoli': 400, 'blomkål': 600, 'champinjoner': 20, 'falukorv': 800, 'fläskfilé': 500,
};

function convertQty(qty, from, to, productName = '') {
  if (qty == null) return null;
  if (from === to) return qty;
  if (MASS[from] && MASS[to]) return qty * MASS[from] / MASS[to];
  const piece = PIECE_GRAMS[norm(productName)];
  if (piece && from === 'st' && MASS[to]) return qty * piece / MASS[to];
  if (piece && MASS[from] && to === 'st') return qty * MASS[from] / piece;
  if (VOLUME[from] && VOLUME[to]) return qty * VOLUME[from] / VOLUME[to];
  if (from === 'klyfta' && to === 'st' && /vitlök/i.test(productName)) return qty / 10;
  if (['st', 'förp'].includes(from) && ['st', 'förp'].includes(to)) return qty;
  return null;
}
