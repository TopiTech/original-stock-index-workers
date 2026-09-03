const STORAGE_KEY = "custom_index_owners";

interface OwnerStore {
  [indexId: string]: string; // indexId -> ownerToken
}

function getStore(): OwnerStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
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
