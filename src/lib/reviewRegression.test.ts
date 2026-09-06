import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import worker, {
  clearAuthCache,
  hashToken,
  resetPasswordTableEnsured,
} from "../../worker/index";

beforeEach(() => {
  clearAuthCache();
  resetPasswordTableEnsured();
});

describe("review regressions: dashboard styles", () => {
  it("keeps button styles separate from trend badges and restores stat typography", () => {
    const css = readFileSync(resolve("src/index.css"), "utf8");
    const heatmap = readFileSync(resolve("src/components/ThemeHeatmap.tsx"), "utf8");
    const buttonBlock = css.match(/\.btn\s*\{([\s\S]*?)\n\}/)?.[1] || "";
    const trendBlock = css.match(/\.badge-trend\s*\{([\s\S]*?)\n\}/)?.[1] || "";
    const statBlock = css.match(/\.stat-value-main\s*\{([\s\S]*?)\n\}/)?.[1] || "";

    expect(buttonBlock).toContain("font-family");
    expect(buttonBlock).toContain("display: inline-flex");
    expect(buttonBlock).not.toContain("width: 100%");
    expect(trendBlock).toContain("padding: 2px 8px");
    expect(trendBlock).not.toContain("cursor: pointer");
    expect(statBlock).toContain("font-size: 24px");
    expect(css).toContain("color: var(--text-on-heatmap)");
    expect(heatmap).toContain('color: "var(--text-heading)"');
    expect((css.match(/\.index-item::before/g) || []).length).toBe(1);
  });
});

describe("review regressions: Worker input boundaries", () => {
  it("rejects unsupported benchmark symbols before contacting Yahoo Finance", async () => {
    const prepare = vi.fn().mockImplementation((query: string) => ({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({ results: [] }),
        run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
      }),
      all: vi.fn().mockResolvedValue({ results: [] }),
      run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
      query,
    }));
    const fetchYahoo = vi.spyOn(globalThis, "fetch");
    const env = {
      ASSETS: { fetch: vi.fn() },
      DB: { prepare, batch: vi.fn() },
      ADMIN_PASSWORD: "unused",
    };

    const response = await worker.fetch(
      new Request("http://localhost/api/snapshot?symbol=%5EDJI"),
      env as any,
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("Unsupported symbol");
    expect(fetchYahoo).not.toHaveBeenCalled();
    fetchYahoo.mockRestore();
  });

  it("normalizes malformed, duplicate, and unsorted stored price series before calculating", async () => {
    const ticker = "ZSANITIZE";
    const storedSeries = [
      { date: "2026-01-03", close: 120 },
      { date: "not-a-date", close: 999 },
      { date: "2026-01-01", close: 100 },
      { date: "2026-01-01", close: 105 },
      { date: "2026-01-02", close: 110 },
      { date: "2026-01-04", close: null },
    ];
    const prepare = vi.fn().mockImplementation((query: string) => ({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockImplementation(async () => {
          if (query.includes("stock_series")) {
            return { results: [{ ticker, prices: JSON.stringify(storedSeries) }] };
          }
          return { results: [] };
        }),
        run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
      }),
      all: vi.fn().mockResolvedValue({ results: [] }),
      run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
      query,
    }));
    const env = {
      ASSETS: { fetch: vi.fn() },
      DB: { prepare, batch: vi.fn() },
      ADMIN_PASSWORD: "unused",
    };

    const response = await worker.fetch(
      new Request("http://localhost/api/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          basket: [{ ticker, name: "Sanitized Stock", theme: "Test", weight: 100 }],
          baseValue: 1000,
        }),
      }),
      env as any,
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.stockUniverse[0].series).toEqual([
      { date: "2026-01-01", close: 105 },
      { date: "2026-01-02", close: 110 },
      { date: "2026-01-03", close: 120 },
    ]);
    expect(data.series).toHaveLength(3);
  });
});

describe("review regressions: schema compatibility and authorization", () => {
  it("preserves owner_token_hash when a partially migrated schema lacks created_at", async () => {
    const adminPassword = "partial-schema-admin";
    const ownerHash = await hashToken("original-owner-token");
    const adminHash = await hashToken(adminPassword);
    const batchQueries: string[][] = [];
    let fallbackPreservedOwner = false;
    const prepare = vi.fn().mockImplementation((query: string) => ({
      bind: vi.fn().mockImplementation((...params: unknown[]) => ({
        all: vi.fn().mockImplementation(async () => {
          if (query.includes("FROM access_passwords WHERE id = 'admin-master'")) {
            return {
              results: [{
                id: "admin-master",
                name: "Admin",
                password_hash: adminHash,
                role: "admin",
                max_stocks: null,
                is_active: 1,
              }],
            };
          }
          if (query.includes("FROM indices WHERE id = ?")) {
            return { results: [{ id: params[0], owner_token_hash: ownerHash }] };
          }
          return { results: [] };
        }),
        run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
        query,
        params,
      })),
      all: vi.fn().mockResolvedValue({ results: [] }),
      run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
      query,
    }));
    const env = {
      ASSETS: { fetch: vi.fn() },
      DB: {
        prepare,
        batch: vi.fn().mockImplementation(async (statements: Array<{ query?: string }>) => {
          const queries = statements.map((statement) => statement.query || "");
          batchQueries.push(queries);
          const indexQuery = queries[0] || "";
          if (indexQuery.includes("created_at")) {
            throw new Error("D1_ERROR: table indices has no column named created_at: SQLITE_ERROR");
          }
          if (indexQuery.includes("owner_token_hash")) {
            fallbackPreservedOwner = true;
          }
          return [];
        }),
      },
      ADMIN_PASSWORD: adminPassword,
    };

    const response = await worker.fetch(
      new Request("http://localhost/api/indices", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-auth-password": adminPassword },
        body: JSON.stringify({
          id: "partial-schema-index",
          name: "Partial schema index",
          ownerToken: "admin-edit-token",
          basket: [{ ticker: "7203", name: "Toyota", weight: 100, theme: "Auto" }],
        }),
      }),
      env as any,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(batchQueries.length).toBe(2);
    expect(fallbackPreservedOwner).toBe(true);
    expect(batchQueries[1][0]).toContain("owner_token_hash");
    expect(batchQueries[1][0]).not.toContain("created_at");
  });

  it("fails closed when a user index quota cannot be checked", async () => {
    const userPassword = "limited-user-password";
    const userHash = await hashToken(userPassword);
    const prepare = vi.fn().mockImplementation((query: string) => ({
      bind: vi.fn().mockImplementation((...params: unknown[]) => ({
        all: vi.fn().mockImplementation(async () => {
          if (query.includes("FROM access_passwords WHERE id = 'admin-master'")) {
            return { results: [] };
          }
          if (query.includes("FROM access_passwords") && query.includes("id != 'admin-master'")) {
            return {
              results: [{
                id: "limited-user",
                name: "Limited User",
                password_hash: userHash,
                role: "user",
                max_stocks: 10,
                max_indices: 1,
                is_active: 1,
              }],
            };
          }
          if (query.includes("FROM indices WHERE id = ?")) {
            return { results: [] };
          }
          if (query.includes("COUNT(*) as count FROM indices WHERE creator_id = ?")) {
            throw new Error("D1_ERROR: no such column: creator_id");
          }
          return { results: [] };
        }),
        run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
        query,
        params,
      })),
      all: vi.fn().mockImplementation(async () => {
        if (query.includes("FROM access_passwords") && query.includes("id != 'admin-master'")) {
          return {
            results: [{
              id: "limited-user",
              name: "Limited User",
              password_hash: userHash,
              role: "user",
              max_stocks: 10,
              max_indices: 1,
              is_active: 1,
            }],
          };
        }
        return { results: [] };
      }),
      run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
      query,
    }));
    const env = {
      ASSETS: { fetch: vi.fn() },
      DB: { prepare, batch: vi.fn() },
      ADMIN_PASSWORD: "different-admin-password",
    };

    const response = await worker.fetch(
      new Request("http://localhost/api/indices", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-auth-password": userPassword },
        body: JSON.stringify({
          id: "quota-check-index",
          basket: [{ ticker: "7203", name: "Toyota", weight: 100 }],
        }),
      }),
      env as any,
    );

    expect(response.status).toBe(503);
    expect(env.DB.batch).not.toHaveBeenCalled();
  });

  it("does not retry a limited user write without creator_id", async () => {
    const userPassword = "partial-creator-user";
    const userHash = await hashToken(userPassword);
    const readRows = async (query: string) => {
      if (query.includes("FROM access_passwords WHERE id = 'admin-master'")) {
        return { results: [] };
      }
      if (query.includes("FROM access_passwords") && query.includes("id != 'admin-master'")) {
        return {
          results: [{
            id: "partial-creator-user-id",
            name: "Partial Creator User",
            password_hash: userHash,
            role: "user",
            max_stocks: 10,
            max_indices: 2,
            is_active: 1,
          }],
        };
      }
      if (query.includes("FROM indices WHERE id = ?")) return { results: [] };
      if (query.includes("COUNT(*) as count FROM indices WHERE creator_id = ?")) {
        return { results: [{ count: 0 }] };
      }
      return { results: [] };
    };
    const prepare = vi.fn().mockImplementation((query: string) => ({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockImplementation(() => readRows(query)),
        run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
        query,
      }),
      all: vi.fn().mockImplementation(() => readRows(query)),
      run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
      query,
    }));
    const batch = vi.fn().mockImplementation(async (statements: Array<{ query?: string }>) => {
      if ((statements[0]?.query || "").includes("creator_id")) {
        throw new Error("D1_ERROR: table indices has no column named creator_id: SQLITE_ERROR");
      }
      return [];
    });
    const env = {
      ASSETS: { fetch: vi.fn() },
      DB: { prepare, batch },
      ADMIN_PASSWORD: "different-admin-password",
    };

    const response = await worker.fetch(
      new Request("http://localhost/api/indices", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-auth-password": userPassword },
        body: JSON.stringify({
          id: "partial-creator-index",
          basket: [{ ticker: "7203", name: "Toyota", weight: 100 }],
        }),
      }),
      env as any,
    );

    expect(response.status).toBe(503);
    expect(batch).toHaveBeenCalledTimes(1);
  });

  it("does not treat an unrelated D1 lookup failure as a legacy schema", async () => {
    const adminPassword = "temporary-d1-admin";
    const prepare = vi.fn().mockImplementation((query: string) => ({
      bind: vi.fn().mockImplementation(() => ({
        all: vi.fn().mockImplementation(async () => {
          if (query.includes("FROM indices WHERE id = ?")) {
            throw new Error("temporary D1 outage");
          }
          return { results: [] };
        }),
        run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
      })),
      all: vi.fn().mockResolvedValue({ results: [] }),
      run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
      query,
    }));
    const env = {
      ASSETS: { fetch: vi.fn() },
      DB: { prepare, batch: vi.fn() },
      ADMIN_PASSWORD: adminPassword,
    };

    const response = await worker.fetch(
      new Request("http://localhost/api/indices", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-auth-password": adminPassword },
        body: JSON.stringify({
          id: "temporary-error-index",
          basket: [{ ticker: "7203", name: "Toyota", weight: 100 }],
        }),
      }),
      env as any,
    );

    expect(response.status).toBe(500);
    expect(env.DB.batch).not.toHaveBeenCalled();
  });
});
