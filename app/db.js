// Lokal lagring i IndexedDB.
// Allt har uuid-id, updatedAt och mjuk radering (deleted) så att samma poster
// kan synkas mellan flera telefoner i ett senare steg.
const DB_NAME = 'inventering';
const DB_VERSION = 4;
const STORES = ['products', 'lots', 'events', 'photos', 'meta', 'outbox', 'recipes', 'shopping'];
// Ändringar i de här lagren köas för uppladdning till hushållets databas.
const SYNC_STORES = ['products', 'lots', 'events', 'recipes', 'shopping'];

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'id' });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function promisify(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(store, mode, fn) {
  const db = await openDb();
  const t = db.transaction(store, mode);
  const result = fn(t.objectStore(store));
  await new Promise((resolve, reject) => {
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
  return result instanceof IDBRequest ? result.result : result;
}

const db = {
  async all(store) {
    const db = await openDb();
    return promisify(db.transaction(store).objectStore(store).getAll());
  },
  async get(store, id) {
    const db = await openDb();
    return promisify(db.transaction(store).objectStore(store).get(id));
  },
  // silent: true används när posten kommer från servern och inte ska skickas tillbaka.
  async put(store, value, { silent = false } = {}) {
    await tx(store, 'readwrite', s => s.put(value));
    if (!silent && SYNC_STORES.includes(store)) await queueChange(store, value.id);
    return value;
  },
  async putMany(store, values, { silent = false } = {}) {
    await tx(store, 'readwrite', s => { for (const v of values) s.put(v); });
    if (!silent && SYNC_STORES.includes(store)) for (const v of values) await queueChange(store, v.id);
  },
  async remove(store, id) {
    await tx(store, 'readwrite', s => s.delete(id));
  },
  async clear(store) {
    await tx(store, 'readwrite', s => s.clear());
  },
};

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function slug(s) {
  return s.toLowerCase().normalize('NFC').replace(/\s+/g, '-');
}

async function queueChange(kind, id) {
  await tx('outbox', 'readwrite', s => s.put({ id: kind + '|' + id, kind, recId: id, at: Date.now() }));
  window.Sync?.schedulePush();
}
