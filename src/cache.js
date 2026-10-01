// ─── Persistent API cache (IndexedDB) ──────────────────────────────────────────
// Finished sessions never change, so their responses are stored and reused across
// page loads. Every function fails soft: no IndexedDB (private mode, old browser)
// simply means no caching.
const DB = "f1-cockpit", STORE = "api";
let dbPromise;

const open = () => {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") return reject(new Error("no indexedDB"));
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
};

const run = async (mode, fn) => {
  try {
    const db = await open();
    return await new Promise((resolve) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    });
  } catch {
    return undefined;
  }
};

export const cacheGet = (key) => run("readonly", (s) => s.get(key));
export const cacheSet = (key, data) => run("readwrite", (s) => s.put({ at: Date.now(), data }, key));
export const cacheClear = () => run("readwrite", (s) => s.clear());
