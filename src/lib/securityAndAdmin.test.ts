import { describe, it, expect, vi } from "vitest";
import worker, { hashToken, SYSTEM_INDICES, getDefaultAdminPassword } from "../../worker/index";

interface PasswordRecord {
  id: string;
  name: string;
  password_hash: string;
  plain_password: string | null;
  role: "admin" | "user";
  max_stocks: number | null;
  is_active: number;
  created_at: number;
  updated_at: number;
}

function createSecurityTestEnv() {
  const passwords = new Map<string, PasswordRecord>();
  const indices = new Map<string, { id: string; name: string; description: string; base_value: number; owner_token_hash: string | null }>();
  const basketItems: Array<{ index_id: string; ticker: string; name: string; weight: number; theme: string }> = [];

  // Seed default system indices
  for (const sysId of Array.from(SYSTEM_INDICES)) {
    indices.set(sysId, {
      id: sysId,
      name: `System Index ${sysId}`,
      description: "Built-in system index",
      base_value: 1000,
      owner_token_hash: null,
    });
  }

  const prepare = vi.fn().mockImplementation((query: string) => {
    return {
      bind: (...params: unknown[]) => ({
        all: async () => {
          if (query.includes("FROM access_passwords WHERE id = 'admin-master'")) {
            const master = passwords.get("admin-master");
            return { results: master ? [master] : [] };
          }
          if (query.includes("FROM access_passwords WHERE password_hash = ? AND is_active = 1 AND id != 'admin-master'")) {
            const hash = params[0] as string;
            const matches = Array.from(passwords.values()).filter(
              (p) => p.password_hash === hash && p.is_active === 1 && p.id !== "admin-master"
            );
            return { results: matches };
          }
          if (query.includes("FROM access_passwords WHERE password_hash = ? AND is_active = 1")) {
            const hash = params[0] as string;
            const matches = Array.from(passwords.values()).filter(
              (p) => p.password_hash === hash && p.is_active === 1
            );
            return { results: matches };
          }
          if (query.includes("FROM access_passwords WHERE id != 'admin-master'")) {
            const matches = Array.from(passwords.values()).filter((p) => p.id !== "admin-master");
            return { results: matches };
          }
          if (query.includes("FROM indices WHERE id = ?")) {
            const id = params[0] as string;
            const idx = indices.get(id);
            return { results: idx ? [idx] : [] };
          }
          if (query.includes("FROM rate_limits")) {
            return { results: [] };
          }
          return { results: [] };
        },
        run: async () => {
          if (query.includes("INSERT INTO access_passwords") || query.includes("INSERT OR REPLACE INTO access_passwords")) {
            if (query.includes("'admin-master'")) {
              // Master admin update: VALUES ('admin-master', 'マスター管理者', ?, NULL, 'admin', NULL, 1, ?, ?)
              const hash = params[0] as string;
              const now = params[1] as number;
              passwords.set("admin-master", {
                id: "admin-master",
                name: "マスター管理者",
                password_hash: hash,
                plain_password: null,
                role: "admin",
                max_stocks: null,
                is_active: 1,
                created_at: now,
                updated_at: now,
              });
            } else {
              // User password create
              const [id, name, hash, plain, role, maxStocks, now1, now2] = params as [string, string, string, string, "admin" | "user", number | null, number, number];
              passwords.set(id, {
                id,
                name,
                password_hash: hash,
                plain_password: plain,
                role,
                max_stocks: maxStocks,
                is_active: 1,
                created_at: now1,
                updated_at: now2,
              });
            }
            return { success: true };
          }
          if (query.includes("UPDATE access_passwords")) {
            // Find target id which is the last parameter
            const targetId = params[params.length - 1] as string;
            const existing = passwords.get(targetId);
            if (existing) {
              if (query.includes("role = ?")) {
                const roleParam = params.find((p) => p === "admin" || p === "user") as "admin" | "user";
                if (roleParam) existing.role = roleParam;
              }
              if (query.includes("is_active = ?")) {
                const activeParam = params.find((p) => p === 0 || p === 1) as number;
                if (activeParam !== undefined) existing.is_active = activeParam;
              }
            }
            return { success: true };
          }
          if (query.includes("DELETE FROM access_passwords WHERE id = ?")) {
            const id = params[0] as string;
            passwords.delete(id);
            return { success: true };
          }
          return { success: true };
        },
      }),
      all: async () => {
        if (query.includes("FROM access_passwords WHERE id = 'admin-master'")) {
          const master = passwords.get("admin-master");
          return { results: master ? [master] : [] };
        }
        if (query.includes("FROM access_passwords WHERE id != 'admin-master'")) {
          const matches = Array.from(passwords.values()).filter((p) => p.id !== "admin-master");
          return { results: matches };
        }
        if (query.includes("FROM access_passwords")) {
          return { results: Array.from(passwords.values()) };
        }
        return { results: [] };
      },
      run: async () => ({ success: true }),
    };
  });

  return {
    env: {
      ASSETS: {
        fetch: vi.fn().mockResolvedValue(new Response("Asset", { status: 200 })),
      },
      DB: {
        prepare,
        batch: vi.fn().mockImplementation(async (stmts: any[]) => {
          for (const s of stmts) {
            if (typeof s?.run === "function") await s.run();
          }
          return [];
        }),
      },
    },
    passwords,
    indices,
    basketItems,
  };
}

describe("Security and Admin Regression Tests", () => {
  it("authenticates with default admin password when no customized password exists", async () => {
    const { env } = createSecurityTestEnv();
    const req = new Request("http://localhost/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: getDefaultAdminPassword() }),
    });

    const res = await worker.fetch(req, env as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.role).toBe("admin");
  });

  it("permanently invalidates default admin password once admin changes the password", async () => {
    const { env, passwords } = createSecurityTestEnv();

    // 1. Admin updates master password to a new strong password
    const changeReq = new Request("http://localhost/api/admin/admin-password", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-auth-password": getDefaultAdminPassword(),
      },
      body: JSON.stringify({ newPassword: "SuperSecretPassword2026!" }),
    });

    const changeRes = await worker.fetch(changeReq, env as any);
    expect(changeRes.status).toBe(200);

    // Verify master admin plain_password is NOT stored in D1
    const masterRecord = passwords.get("admin-master");
    expect(masterRecord).toBeDefined();
    expect(masterRecord?.plain_password).toBeNull();

    // 2. Attempt to login with OLD default password (admin1234) -> MUST BE REJECTED (401)
    const oldLoginReq = new Request("http://localhost/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: getDefaultAdminPassword() }),
    });

    const oldLoginRes = await worker.fetch(oldLoginReq, env as any);
    expect(oldLoginRes.status).toBe(401);
    const oldLoginData = await oldLoginRes.json();
    expect(oldLoginData.ok).toBe(false);

    // 3. Login with NEW password -> MUST SUCCEED (200)
    const newLoginReq = new Request("http://localhost/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "SuperSecretPassword2026!" }),
    });

    const newLoginRes = await worker.fetch(newLoginReq, env as any);
    expect(newLoginRes.status).toBe(200);
    const newLoginData = await newLoginRes.json();
    expect(newLoginData.ok).toBe(true);
    expect(newLoginData.role).toBe("admin");
  });

  it("excludes admin-master from GET /api/admin/passwords response to prevent leakage", async () => {
    const { env, passwords } = createSecurityTestEnv();

    // Add admin-master
    const masterHash = await hashToken("SuperSecretPassword2026!");
    passwords.set("admin-master", {
      id: "admin-master",
      name: "マスター管理者",
      password_hash: masterHash,
      plain_password: null,
      role: "admin",
      max_stocks: null,
      is_active: 1,
      created_at: 1000,
      updated_at: 1000,
    });

    // Add a normal user
    const userHash = await hashToken("userpass123");
    passwords.set("pwd-user-1", {
      id: "pwd-user-1",
      name: "Test User",
      password_hash: userHash,
      plain_password: "userpass123",
      role: "user",
      max_stocks: 5,
      is_active: 1,
      created_at: 1100,
      updated_at: 1100,
    });

    const req = new Request("http://localhost/api/admin/passwords", {
      method: "GET",
      headers: { "x-auth-password": "SuperSecretPassword2026!" },
    });

    const res = await worker.fetch(req, env as any);
    expect(res.status).toBe(200);
    const list = await res.json();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBe(1);
    expect(list[0].id).toBe("pwd-user-1");
    // Ensure admin-master is not present in the returned list
    const hasAdminMaster = list.some((item: any) => item.id === "admin-master");
    expect(hasAdminMaster).toBe(false);
  });

  it("allows admins to update role in PUT /api/admin/passwords", async () => {
    const { env, passwords } = createSecurityTestEnv();

    passwords.set("pwd-user-2", {
      id: "pwd-user-2",
      name: "Promoted User",
      password_hash: await hashToken("promotepass"),
      plain_password: "promotepass",
      role: "user",
      max_stocks: 10,
      is_active: 1,
      created_at: 1000,
      updated_at: 1000,
    });

    const updateReq = new Request("http://localhost/api/admin/passwords", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-auth-password": getDefaultAdminPassword(),
      },
      body: JSON.stringify({
        id: "pwd-user-2",
        role: "admin",
      }),
    });

    const updateRes = await worker.fetch(updateReq, env as any);
    expect(updateRes.status).toBe(200);
    expect(passwords.get("pwd-user-2")?.role).toBe("admin");
  });

  it("allows admins to edit system indices in POST /api/indices", async () => {
    const { env } = createSecurityTestEnv();

    const req = new Request("http://localhost/api/indices", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-auth-password": getDefaultAdminPassword(),
      },
      body: JSON.stringify({
        id: "nikkei-175",
        name: "日経175 (更新版)",
        description: "管理者によってカスタマイズされた日経175",
        baseValue: 1000,
        basket: [
          { ticker: "7203", name: "トヨタ自動車", weight: 50, theme: "自動車" },
          { ticker: "9984", name: "ソフトバンクグループ", weight: 50, theme: "投資" },
        ],
      }),
    });

    const res = await worker.fetch(req, env as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.id).toBe("nikkei-175");
  });

  it("rejects non-admin users from editing system indices in POST /api/indices", async () => {
    const { env, passwords } = createSecurityTestEnv();

    // Create a regular user
    passwords.set("user-pwd", {
      id: "user-pwd",
      name: "Normal User",
      password_hash: await hashToken("usersecret"),
      plain_password: "usersecret",
      role: "user",
      max_stocks: 10,
      is_active: 1,
      created_at: 1000,
      updated_at: 1000,
    });

    const req = new Request("http://localhost/api/indices", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-auth-password": "usersecret",
      },
      body: JSON.stringify({
        id: "nikkei-175",
        name: "ハック日経175",
        description: "改ざんの試み",
        baseValue: 1000,
        basket: [{ ticker: "7203", name: "トヨタ", weight: 100, theme: "車" }],
      }),
    });

    const res = await worker.fetch(req, env as any);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain("システム指数の編集には管理者権限が必要です");
  });

  describe("Client Auth Session and Headers", () => {
    it("generates correct headers for admin and user sessions", async () => {
      const { getAuthHeaders } = await import("./auth");
      const adminSession = { role: "admin" as const, name: "管理者", password: "pwd1", maxStocks: null };
      const userSession = { role: "user" as const, name: "ユーザー", password: "pwd2", maxStocks: 5 };

      const adminHeaders = getAuthHeaders(adminSession);
      expect(adminHeaders["x-auth-password"]).toBe("pwd1");
      expect(adminHeaders["x-admin-key"]).toBe("pwd1");

      const userHeaders = getAuthHeaders(userSession);
      expect(userHeaders["x-auth-password"]).toBe("pwd2");
      expect(userHeaders["x-admin-key"]).toBeUndefined();
    });

    it("dispatches auth-changed event on storeAuth and clearAuth", async () => {
      const { storeAuth, clearAuth } = await import("./auth");
      let eventFired = 0;
      const originalDispatch = (globalThis as any).dispatchEvent;
      const originalStorage = (globalThis as any).localStorage;
      const mockStorage = new Map<string, string>();

      (globalThis as any).localStorage = {
        getItem: (k: string) => mockStorage.get(k) || null,
        setItem: (k: string, v: string) => mockStorage.set(k, v),
        removeItem: (k: string) => mockStorage.delete(k),
      };

      (globalThis as any).dispatchEvent = (evt: Event) => {
        if (evt.type === "auth-changed") {
          eventFired++;
        }
        return true;
      };

      try {
        storeAuth({ role: "admin", name: "管理者", password: "test", maxStocks: null });
        expect(eventFired).toBe(1);

        clearAuth();
        expect(eventFired).toBe(2);
      } finally {
        (globalThis as any).dispatchEvent = originalDispatch;
        (globalThis as any).localStorage = originalStorage;
      }
    });
  });
});
