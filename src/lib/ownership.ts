const STORAGE_KEY = "custom_index_owners";

interface OwnerStore {
  [indexId: string]: string; // indexId -> ownerToken
}

function getStore(): OwnerStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getEmptyStore();
    // Corrupted or tampered storage ("null", "5", "[]", quoted strings) must
    // degrade to an empty store instead of throwing on later property access.
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return getEmptyStore();
    // A null prototype keeps hostile keys such as "__proto__" in storage from
    // resolving through Object.prototype on later property reads.
    const store: OwnerStore = Object.create(null);
    for (const [key, value] of Object.entries(parsed)) {
      // Skip keys that interact with the object prototype chain when assigned
      // through a plain object literal; index ids validated elsewhere can
      // never contain underscores, so no legitimate entry is lost.
      if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
      if (key.length > 0 && typeof value === "string") {
        store[key] = value;
      }
    }
    return store;
  } catch {
    return getEmptyStore();
  }
}

function getEmptyStore(): OwnerStore {
  return Object.create(null);
}

function setStore(store: OwnerStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore quota/storage errors
  }
}

/**
 * Save an owner token for a custom index
 */
export function saveIndexOwnerToken(indexId: string, token: string): void {
  if (!indexId || !token) return;
  const store = getStore();
  store[indexId] = token;
  setStore(store);
}

/**
 * Retrieve the owner token for a custom index
 */
export function getIndexOwnerToken(indexId: string): string | null {
  if (!indexId) return null;
  const store = getStore();
  return store[indexId] || null;
}

/**
 * Remove an owner token for a custom index
 */
export function removeIndexOwnerToken(indexId: string): void {
  if (!indexId) return;
  const store = getStore();
  delete store[indexId];
  setStore(store);
}

/**
 * Check whether the current browser is the owner/creator of the index
 */
export function isIndexOwner(indexId: string): boolean {
  if (!indexId) return false;
  const store = getStore();
  return Boolean(store[indexId]);
}
