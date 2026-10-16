'use strict';
// Streckkoder: kamera → kod → vara. Koden slås upp i Open Food Facts och kopplingen
// sparas på varan (synkas), så att samma förpackning känns igen direkt nästa gång.

const ZXING_URL = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';
const OFF_FIELDS = 'product_name,product_name_sv,brands,quantity,product_quantity,product_quantity_unit,image_front_small_url';
const SCAN_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];

const scanner = { stop: null, count: 0, session: loadScanPref(), busy: false };

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('Kunde inte ladda streckkodsläsaren'));
    document.head.appendChild(s);
  });
}

// ---------- Kameran ----------
async function startCamera(video, onCode) {
  // Inbyggd läsare där den finns (Android/Chrome), annars ZXing (bl.a. iPhone).
  if ('BarcodeDetector' in window && (await BarcodeDetector.getSupportedFormats?.())?.includes('ean_13')) {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    video.srcObject = stream;
    await video.play();
    const detector = new BarcodeDetector({ formats: SCAN_FORMATS });
    let running = true;
    const tick = async () => {
      if (!running) return;
      try {
        const codes = await detector.detect(video);
        if (codes[0]?.rawValue) { onCode(codes[0].rawValue); return; }
      } catch { /* bild inte klar än */ }
      setTimeout(tick, 120);
    };
    tick();
    return () => { running = false; stream.getTracks().forEach(t => t.stop()); };
  }
  if (!window.ZXing) await loadScript(ZXING_URL);
  const hints = new Map();
  hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8,
    ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.UPC_E, ZXing.BarcodeFormat.CODE_128]);
  const reader = new ZXing.BrowserMultiFormatReader(hints, 150);
  let done = false;
  await reader.decodeFromConstraints({ video: { facingMode: 'environment' }, audio: false }, video, result => {
    if (result && !done) { done = true; onCode(result.getText()); }
  });
  return () => { done = true; reader.reset(); };
}

function openScanner() {
  if (scanner.busy) return;
  closeSheet();
  let el = $('#scanner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'scanner';
    el.className = 'scanner';
    document.body.appendChild(el);
  }
  const shop = state.view === 'shop';
  el.innerHTML = `
    <video id="scan-video" playsinline muted></video>
    <div class="scan-frame" aria-hidden="true"></div>
    <div class="scan-top">
      <span>${shop ? 'Skanna för att lägga i korgen' : scanner.session && scanner.count ? `${scanner.count} skannade – skanna nästa` : 'Rikta kameran mot streckkoden'}</span>
    </div>
    <div class="scan-bottom">
      <label class="scan-toggle"><input type="checkbox" id="scan-many" ${scanner.session ? 'checked' : ''}> Skanna flera i rad</label>
      <button class="btn" id="scan-manual">Skriv koden</button>
      <button class="btn primary" id="scan-close">${scanner.count ? 'Klar' : 'Stäng'}</button>
    </div>
    <p class="scan-msg" id="scan-msg"></p>`;
  el.hidden = false;
  const msg = $('#scan-msg');
  el.querySelector('#scan-many').addEventListener('change', e => {
    scanner.session = e.target.checked;
    try { localStorage.setItem('hemma-scan-many', scanner.session ? '1' : ''); } catch {}
  });
  el.querySelector('#scan-close').addEventListener('click', () => { scanner.session = loadScanPref(); scanner.count = 0; closeScanner(); });
  el.querySelector('#scan-manual').addEventListener('click', () => {
    closeScanner();
    openManualCode();
  });
  startCamera(el.querySelector('#scan-video'), code => {
    navigator.vibrate?.(60);
    closeScanner();
    handleBarcode(code);
  }).then(stop => { scanner.stop = stop; })
    .catch(e => {
      msg.textContent = /Permission|NotAllowed/i.test(e.name + e.message)
        ? 'Appen får inte använda kameran. Tillåt kamera för Hemma i Inställningar, eller skriv koden.'
        : `Kameran startade inte: ${e.message}`;
    });
}

function closeScanner() {
  scanner.stop?.();
  scanner.stop = null;
  const el = $('#scanner');
  if (el) { el.hidden = true; el.innerHTML = ''; }
}

function loadScanPref() {
  try { return localStorage.getItem('hemma-scan-many') !== ''; } catch { return true; }
}

function openManualCode() {
  openSheet(`
    <div class="sheet-head"><div><h3>Skriv streckkoden</h3><div class="sub">Siffrorna under streckkoden</div></div></div>
    <div class="field"><input id="m-code" type="text" inputmode="numeric" autocomplete="off" placeholder="7310865004703"></div>
    <button class="btn primary" id="m-go">Sök</button>
  `, root => {
    const input = root.querySelector('#m-code');
    input.focus();
    const go = () => { const c = input.value.replace(/\D/g, ''); if (c.length >= 8) handleBarcode(c); };
    root.querySelector('#m-go').addEventListener('click', go);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  });
}

// ---------- Uppslag ----------
function productByBarcode(code) {
  for (const p of state.products.values()) {
    const hit = !p.deleted && p.barcodes?.find(b => b.code === code);
    if (hit) return { product: p, info: hit };
  }
  return null;
}

async function lookupOff(code) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`, { signal: ctrl.signal });
    const data = await res.json();
    if (data.status !== 1 || !data.product) return null;
    const p = data.product;
    const name = (p.product_name_sv || p.product_name || '').trim();
    const brand = (p.brands || '').split(',')[0].trim();
    let qty = Number(p.product_quantity) || null;
    let unit = (p.product_quantity_unit || '').toLowerCase() || null;
    if (!qty && p.quantity) {
      const m = String(p.quantity).replace(',', '.').match(/([\d.]+)\s*(kg|g|l|dl|cl|ml|st)\b/i);
      if (m) { qty = parseFloat(m[1]); unit = m[2].toLowerCase(); }
    }
    return { name, brand, qty, unit, size: p.quantity ? String(p.quantity) : null, image: p.image_front_small_url || null };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Gissa vilken av våra varor förpackningen är: "Arla Mellanmjölk 1,5%" → Mellanmjölk.
// "Snacks med baconsmak" är inte bacon: smaker och tillbehör efter "med"/"smak" räknas inte.
function guessProduct(off) {
  const core = off.name.replace(/\s(med|i|smak av)\s.*$/i, '').replace(/\S*smak\S*/gi, '').replace(/[\d.,]+\s*%?/g, ' ').trim();
  if (!core) return null;
  const ing = parseIngredient(core);
  const products = [...state.products.values()].filter(p => !p.deleted && !p.hidden);
  return aliasFor(ing, products) || matchProduct(ing, products, stockedProductIds());
}

// Förpackningens storlek i varans egen enhet, om det går att räkna om.
function packQty(info, product) {
  if (!info?.qty || !info.unit) return null;
  const unit = { liter: 'l', gram: 'g' }[info.unit] || info.unit;
  if (unit === product.unit) return info.qty;
  const conv = convertQty(info.qty, unit, product.unit, product.name);
  return conv != null ? Math.round(conv * 100) / 100 : null;
}

async function rememberBarcode(product, code, off) {
  const info = { code, qty: off?.qty || null, unit: off?.unit || null, label: off ? [off.brand, off.name].filter(Boolean).join(' ') : null };
  const updated = { ...product, barcodes: [...(product.barcodes || []).filter(b => b.code !== code), info], updatedAt: new Date().toISOString() };
  await db.put('products', updated);
  state.products.set(updated.id, updated);
  return { product: updated, info };
}

async function handleBarcode(code) {
  const known = productByBarcode(code);
  if (known) { useScanned(known.product, known.info); return; }

  openSheet(`<div class="empty"><div class="big">🔎</div><strong>Letar efter ${esc(code)}…</strong></div>`);
  const off = await lookupOff(code);
  const guess = off?.name ? guessProduct(off) : null;
  openScanResultSheet(code, off, guess);
}

function openScanResultSheet(code, off, guess) {
  const label = off ? [off.brand, off.name].filter(Boolean).join(' ') : '';
  const size = off?.size || (off?.qty ? fmtQty(off.qty, off.unit || 'st') : '');
  openSheet(`<div id="scan-result">
    ${off?.image ? `<img class="photo-big scan-img" src="${esc(off.image)}" alt="">` : ''}
    <div class="sheet-head"><div><h3>${off ? esc(label || 'Okänt namn') : 'Okänd streckkod'}</h3>
      <div class="sub">${off ? [size, code].filter(Boolean).join(' · ') : `${esc(code)} finns inte i Open Food Facts`}</div></div></div>
    ${guess ? `
      <p class="meta">Det här verkar vara</p>
      <button class="row pick-guess" data-use="${esc(guess.id)}"><span class="thumb">${iconFor(guess.name, guess.category)}</span>
        <div class="r-main"><div class="r-name">${esc(guess.name)}</div><div class="r-sub">Tryck för att använda</div></div>
        <span class="s-tag">Stämmer</span></button>
      <div style="height:12px"></div>` : ''}
    <div class="field"><label for="sr-q">${guess ? 'Eller välj en annan vara' : 'Vad är det för vara?'}</label>
      <input id="sr-q" type="search" autocomplete="off" placeholder="Sök vara" value="${guess ? '' : esc(off?.name || '')}"></div>
    <div id="sr-list"></div>
    <div style="height:8px"></div>
    <button class="btn" data-new>Skapa ny vara${off?.name ? ` ”${esc(off.name)}”` : ''}</button>
    <p class="meta">Valet sparas så att streckkoden känns igen nästa gång.</p>
  </div>`, root => {
    const list = root.querySelector('#sr-list');
    const draw = q => {
      const nq = norm(q);
      if (!nq) { list.innerHTML = ''; return; }
      const hits = [...state.products.values()].filter(p => !p.deleted && !p.hidden)
        .map(p => ({ p, s: matchScore(p.name, nq) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 6);
      list.innerHTML = hits.length ? `<div class="list">${hits.map(({ p }) => `
        <button class="row" data-use="${esc(p.id)}"><span class="thumb">${iconFor(p.name, p.category)}</span>
          <div class="r-main"><div class="r-name">${esc(p.name)}</div><div class="r-sub">${esc(p.category)}</div></div></button>`).join('')}</div>` : '';
    };
    const q = root.querySelector('#sr-q');
    q.addEventListener('input', () => draw(q.value));
    draw(q.value);
    root.querySelector('#scan-result').addEventListener('click', async e => {
      const use = e.target.closest('[data-use]');
      if (use) {
        const { product, info } = await rememberBarcode(state.products.get(use.dataset.use), code, off);
        useScanned(product, info);
        return;
      }
      if (e.target.closest('[data-new]')) {
        const name = (q.value.trim() || off?.name || 'Ny vara');
        openAddSheet(null, name, { qty: off?.qty, unit: off?.unit });
        state.pendingBarcode = { code, off };
        if (scanner.session) state.afterAdd = () => { scanner.count++; setTimeout(openScanner, 500); };
      }
    });
  });
}

// Varan är känd: lägg i korgen (Inköp) eller öppna bladet för att lägga in den.
async function useScanned(product, info) {
  if (state.view === 'shop') {
    const onList = openItems().find(i => i.productId === product.id);
    const item = onList || await addShopping({ product, qty: packQty(info, product), unit: product.unit, note: 'Skannad' });
    if (!item.checked) await toggleCheck(item.id);
    closeSheet();
    renderShop();
    toast(`${product.name} i korgen`);
    if (scanner.session) setTimeout(openScanner, 600);
    return;
  }
  if (scanner.session) {
    state.afterAdd = () => { scanner.count++; setTimeout(openScanner, 500); };
  }
  openAddSheet(product, null, { qty: packQty(info, product) });
}
