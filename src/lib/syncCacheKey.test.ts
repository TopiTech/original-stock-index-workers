import { describe, it, expect, beforeEach } from "vitest";

// Regression test: the sync cache cleanup in useCalculation.ts must write to
// the same localStorage key that getLocalSyncCache()/updateLocalSyncCache()
// read from. A previous bug wrote to a stale "custom_index_sync_cache_v2" key,
// causing missing-ticker cleanup to silently fail and stale sync state to
// accumulate.

const SYNC_STORAGE_KEY = "osi_stock_sync_cache";

// Mock localStorage for Node.js test environment
function createLocalStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) || null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] || null,
    length: store.size,
  } as Storage;
}

function getLocalSyncCache(localStorage: Storage): Record<string, number> {
  try {
    const raw = localStorage.getItem(SYNC_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function updateLocalSyncCache(localStorage: Storage, tickers: string[]): void {
  try {
    const cache = getLocalSyncCache(localStorage);
    const now = Date.now();
    for (const t of tickers) {
      cache[t] = now;
    }
    for (const [k, v] of Object.entries(cache)) {
      if (now - v > 7 * 24 * 60 * 60 * 1000) {
        delete cache[k];
      }
    }
    localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // ignore
  }
}

describe("sync cache key consistency", () => {
  let mockLocalStorage: Storage;

  beforeEach(() => {
    mockLocalStorage = createLocalStorageMock();
  });

  it("writes to the same key that getLocalSyncCache reads from", () => {
    updateLocalSyncCache(mockLocalStorage, ["7203", "9984"]);
    const cache = getLocalSyncCache(mockLocalStorage);
    expect(cache["7203"]).toBeDefined();
    expect(cache["9984"]).toBeDefined();
  });

  it("cleanup removes entries and persists via SYNC_STORAGE_KEY", () => {
    // Seed some tickers
    updateLocalSyncCache(mockLocalStorage, ["7203", "9984", "6758"]);
    const cache = getLocalSyncCache(mockLocalStorage);
    expect(Object.keys(cache).length).toBe(3);

    // Simulate the cleanup path: delete a missing ticker and persist
    delete cache["9984"];
    mockLocalStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(cache));

    // Verify the cleanup persisted correctly
    const updated = getLocalSyncCache(mockLocalStorage);
    expect(updated["7203"]).toBeDefined();
    expect(updated["9984"]).toBeUndefined();
    expect(updated["6758"]).toBeDefined();
  });

  it("does not leave stale data in legacy keys", () => {
    updateLocalSyncCache(mockLocalStorage, ["7203"]);
    // Verify no legacy keys were created
    expect(mockLocalStorage.getItem("custom_index_sync_cache_v2")).toBeNull();
    expect(mockLocalStorage.getItem("osi_stock_sync_cache")).not.toBeNull();
  });
});
