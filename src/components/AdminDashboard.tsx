import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Shield,
  KeyRound,
  Users,
  Sliders,
  Settings,
  Plus,
  Trash2,
  Copy,
  Check,
  RefreshCw,
  ArrowLeft,
  Lock,
  Unlock,
  AlertCircle,
  Database,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import type { CustomIndex } from "../data/indices";
import type { BasketItem, UserPasswordItem } from "../types";
import { Card, Tag, Badge, SearchInput } from "./ui";

interface AdminDashboardProps {
  indices: CustomIndex[];
  onBackToApp: () => void;
  onRefreshIndices: () => Promise<void>;
  saveCustomIndex: (index: CustomIndex, ownerToken?: string) => Promise<{ ok: boolean; error?: string }>;
  deleteCustomIndex: (id: string) => Promise<{ ok: boolean; error?: string }>;
}

function generateSecurePassword(length = 10): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function AdminDashboard({
  indices,
  onBackToApp,
  onRefreshIndices,
  saveCustomIndex,
  deleteCustomIndex,
}: AdminDashboardProps) {
  const { session, isAdmin, login, logout, getHeaders } = useAuth();

  // Admin login state if not admin
  const [adminPasswordInput, setAdminPasswordInput] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  // Tabs
  const [activeTab, setActiveTab] = useState<"passwords" | "indices" | "settings">("passwords");

  // Passwords state
  const [passwords, setPasswords] = useState<UserPasswordItem[]>([]);
  const [loadingPasswords, setLoadingPasswords] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // New password form
  const [newUserName, setNewUserName] = useState("");
  const [newUserPassword, setNewUserPassword] = useState(() => generateSecurePassword());
  const [newUserMaxStocks, setNewUserMaxStocks] = useState<number | null>(10);
  const [newUserRole, setNewUserRole] = useState<"user" | "admin">("user");
  const [creatingPassword, setCreatingPassword] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  // Full Index Edit state
  const [selectedEditIndexId, setSelectedEditIndexId] = useState<string>(
    indices.length > 0 ? indices[0].id : ""
  );
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editBaseValue, setEditBaseValue] = useState(1000);
  const [editBasket, setEditBasket] = useState<BasketItem[]>([]);
  const [savingIndex, setSavingIndex] = useState(false);
  const [indexEditMessage, setIndexEditMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Add stock to edit index inline
  const [addTicker, setAddTicker] = useState("");
  const [addName, setAddName] = useState("");
  const [addTheme, setAddTheme] = useState("");
  const [addWeight, setAddWeight] = useState(10);

  // Change admin password state
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [confirmAdminPassword, setConfirmAdminPassword] = useState("");
  const [updatingAdminPwd, setUpdatingAdminPwd] = useState(false);
  const [adminPwdMessage, setAdminPwdMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Fetch passwords
  const fetchPasswords = useCallback(async () => {
    if (!isAdmin) return;
    try {
      setLoadingPasswords(true);
      const res = await fetch("/api/admin/passwords", {
        headers: getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setPasswords(data);
      }
    } catch (err) {
      console.error("Failed to fetch passwords:", err);
    } finally {
      setLoadingPasswords(false);
    }
  }, [isAdmin, getHeaders]);

  useEffect(() => {
    if (isAdmin) {
      fetchPasswords();
    }
  }, [isAdmin, fetchPasswords]);

  // Sync selected index data into edit fields
  useEffect(() => {
    const found = indices.find((idx) => idx.id === selectedEditIndexId) || indices[0];
    if (found) {
      setEditName(found.name);
      setEditDescription(found.description);
      setEditBaseValue(found.baseValue);
      setEditBasket([...found.basket]);
      setIndexEditMessage(null);
    }
  }, [selectedEditIndexId, indices]);

  // Admin login submit
  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminPasswordInput.trim()) {
      setLoginError("管理者パスワードを入力してください");
      return;
    }
    setLoggingIn(true);
    setLoginError(null);
    const res = await login(adminPasswordInput.trim());
    setLoggingIn(false);
    if (!res.ok) {
      setLoginError(res.error || "管理者パスワードが正しくありません");
    }
  };

  // Create user password submit
  const handleCreatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim() || !newUserPassword.trim()) {
      setCreateError("ユーザー名とパスワードは必須です");
      return;
    }
    setCreatingPassword(true);
    setCreateError(null);
    setCreateSuccess(null);

    try {
      const res = await fetch("/api/admin/passwords", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getHeaders(),
        },
        body: JSON.stringify({
          name: newUserName.trim(),
          password: newUserPassword.trim(),
          maxStocks: newUserRole === "admin" ? null : newUserMaxStocks,
          role: newUserRole,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "パスワード作成に失敗しました");
      }

      setCreateSuccess(`パスワードを作成しました: [${newUserName.trim()}] / 銘柄制限: ${newUserRole === "admin" ? "無制限" : `${newUserMaxStocks}銘柄`}`);
      setNewUserName("");
      setNewUserPassword(generateSecurePassword());
      await fetchPasswords();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "パスワード作成に失敗しました");
    } finally {
      setCreatingPassword(false);
    }
  };

  // Delete password
  const handleDeletePassword = async (id: string, name: string) => {
    if (!confirm(`パスワード「${name}」を削除しますか？\nこのパスワードを使用しているユーザーは編集できなくなります。`)) {
      return;
    }
    try {
      const res = await fetch(`/api/admin/passwords?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: getHeaders(),
      });
      if (res.ok) {
        await fetchPasswords();
      }
    } catch (err) {
      alert("削除に失敗しました: " + (err instanceof Error ? err.message : ""));
    }
  };

  // Copy password to clipboard
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Toggle active password
  const handleToggleActive = async (item: UserPasswordItem) => {
    try {
      await fetch("/api/admin/passwords", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...getHeaders(),
        },
        body: JSON.stringify({
          id: item.id,
          isActive: item.is_active === 1 ? false : true,
        }),
      });
      await fetchPasswords();
    } catch (err) {
      console.error(err);
    }
  };

  // Add stock to edit basket
  const handleAddStockToBasket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addTicker.trim() || !addName.trim()) return;
    const cleanTicker = addTicker.trim().toUpperCase();
    if (editBasket.some((b) => b.ticker === cleanTicker)) {
      setIndexEditMessage({ type: "error", text: `銘柄コード ${cleanTicker} は既に追加されています` });
      return;
    }
    setEditBasket([
      ...editBasket,
      {
        ticker: cleanTicker,
        name: addName.trim(),
        theme: addTheme.trim() || "カスタム",
        weight: Math.max(0.1, Number(addWeight) || 10),
      },
    ]);
    setAddTicker("");
    setAddName("");
    setAddTheme("");
    setIndexEditMessage(null);
  };

  // Save index full edit
  const handleSaveIndexFullEdit = async () => {
    if (!editName.trim()) {
      setIndexEditMessage({ type: "error", text: "指数名は必須です" });
      return;
    }
    if (editBasket.length === 0) {
      setIndexEditMessage({ type: "error", text: "最低1銘柄の構成銘柄が必要です" });
      return;
    }

    setSavingIndex(true);
    setIndexEditMessage(null);
    const updated: CustomIndex = {
      id: selectedEditIndexId,
      name: editName.trim(),
      description: editDescription.trim(),
      baseValue: editBaseValue,
      basket: editBasket,
    };

    const res = await saveCustomIndex(updated);
    setSavingIndex(false);
    if (res.ok) {
      setIndexEditMessage({ type: "success", text: "指数と構成銘柄を保存しました！" });
      await onRefreshIndices();
    } else {
      setIndexEditMessage({ type: "error", text: res.error || "保存に失敗しました" });
    }
  };

  // Equalize weights
  const handleEqualWeights = () => {
    if (editBasket.length === 0) return;
    const eq = Number((100 / editBasket.length).toFixed(2));
    setEditBasket(editBasket.map((b) => ({ ...b, weight: eq })));
  };

  // Change Master Admin Password
  const handleUpdateAdminPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newAdminPassword.length < 6) {
      setAdminPwdMessage({ type: "error", text: "パスワードは6文字以上で入力してください" });
      return;
    }
    if (newAdminPassword !== confirmAdminPassword) {
      setAdminPwdMessage({ type: "error", text: "確認用パスワードが一致しません" });
      return;
    }

    setUpdatingAdminPwd(true);
    setAdminPwdMessage(null);
    try {
      const res = await fetch("/api/admin/admin-password", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...getHeaders(),
        },
        body: JSON.stringify({ newPassword: newAdminPassword }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "管理者パスワードの更新に失敗しました");
      }
      setAdminPwdMessage({ type: "success", text: "管理者パスワードを正常に変更しました" });
      setNewAdminPassword("");
      setConfirmAdminPassword("");
    } catch (err) {
      setAdminPwdMessage({ type: "error", text: err instanceof Error ? err.message : "更新に失敗しました" });
    } finally {
      setUpdatingAdminPwd(false);
    }
  };

  // If not authenticated as Admin, show login screen
  if (!isAdmin) {
    return (
      <div className="app" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <header className="top-header">
          <div className="row space-between">
            <div className="row" style={{ gap: 10 }}>
              <button
                type="button"
                onClick={onBackToApp}
                className="btn btn-sm btn-outline"
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <ArrowLeft size={14} /> ダッシュボードに戻る
              </button>
            </div>
            <Badge variant="magenta">
              <Shield size={12} /> ADMIN ACCESS REQUIRED
            </Badge>
          </div>
        </header>

        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            style={{
              width: "100%",
              maxWidth: 460,
              background: "var(--bg-surface)",
              border: "1px solid var(--border-cyan)",
              borderRadius: 14,
              boxShadow: "0 20px 60px rgba(0,0,0,0.8), 0 0 30px rgba(0,229,255,0.2)",
              padding: 28,
            }}
          >
            <div style={{ textAlign: "center", marginBottom: 22 }}>
              <div
                style={{
                  width: 54,
                  height: 54,
                  margin: "0 auto 12px",
                  borderRadius: "50%",
                  background: "rgba(0, 229, 255, 0.12)",
                  border: "1px solid var(--border-cyan)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Shield size={26} style={{ color: "var(--neon-cyan)" }} />
              </div>
              <h2 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 700 }}>
                管理者ポータル ログイン
              </h2>
              <p className="muted" style={{ fontSize: 13, margin: 0, lineHeight: 1.5 }}>
                ユーザー用パスワードの発行（銘柄数制限設定）や、全指数のフル編集権限を利用するには管理者パスワードを入力してください。
              </p>
            </div>

            {loginError && (
              <div
                className="row"
                style={{
                  gap: 8,
                  padding: "10px 14px",
                  background: "rgba(255, 51, 102, 0.15)",
                  border: "1px solid var(--neon-red)",
                  borderRadius: 8,
                  color: "var(--neon-red)",
                  fontSize: 13,
                  marginBottom: 16,
                }}
              >
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{loginError}</span>
              </div>
            )}

            <form onSubmit={handleAdminLogin}>
              <div style={{ marginBottom: 18 }}>
                <label
                  htmlFor="admin-password-input"
                  style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}
                >
                  管理者マスターパスワード
                </label>
                <input
                  id="admin-password-input"
                  type="password"
                  value={adminPasswordInput}
                  onChange={(e) => setAdminPasswordInput(e.target.value)}
                  placeholder="管理者パスワード (初期: admin1234)"
                  autoFocus
                  style={{
                    width: "100%",
                    padding: "11px 14px",
                    background: "rgba(0,0,0,0.4)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 8,
                    color: "#fff",
                    fontSize: 14,
                    boxSizing: "border-box",
                  }}
                />
                <div className="muted tiny" style={{ marginTop: 6 }}>
                  ※ 初期パスワードは <code>admin1234</code> です（ログイン後に変更可能）。
                </div>
              </div>

              <button
                type="submit"
                disabled={loggingIn || !adminPasswordInput.trim()}
                className="btn btn-default"
                style={{ width: "100%", padding: "10px 16px" }}
              >
                {loggingIn ? "認証中..." : "管理者としてログイン"}
              </button>
            </form>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="app" style={{ minHeight: "100vh" }}>
      {/* Top Header */}
      <header className="top-header" style={{ marginBottom: 20 }}>
        <div className="row space-between flex-wrap" style={{ gap: 14 }}>
          <div className="row" style={{ gap: 12 }}>
            <button
              type="button"
              onClick={onBackToApp}
              className="btn btn-sm btn-outline"
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <ArrowLeft size={14} /> ダッシュボードに戻る
            </button>
            <div>
              <div className="row" style={{ gap: 8, alignItems: "center" }}>
                <h1 style={{ fontSize: 20, margin: 0, fontWeight: 700 }}>
                  管理者コンソール // FULL PRIVILEGES
                </h1>
                <Badge variant="cyan">ADMIN</Badge>
              </div>
              <div className="muted tiny" style={{ marginTop: 2 }}>
                ユーザーパスワード作成・上限銘柄数制限・全指数フル編集
              </div>
            </div>
          </div>

          <div className="row" style={{ gap: 10 }}>
            <button
              type="button"
              onClick={logout}
              className="btn btn-sm btn-outline"
              style={{ borderColor: "rgba(255,51,102,0.4)", color: "var(--neon-red)" }}
            >
              ログアウト
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div
        className="row"
        style={{
          gap: 8,
          marginBottom: 20,
          borderBottom: "1px solid var(--border-subtle)",
          paddingBottom: 10,
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab("passwords")}
          className={`btn btn-sm ${activeTab === "passwords" ? "btn-default" : "btn-outline"}`}
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <KeyRound size={14} /> ユーザー用パスワード管理
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("indices")}
          className={`btn btn-sm ${activeTab === "indices" ? "btn-default" : "btn-outline"}`}
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <Sliders size={14} /> 全指数 & 銘柄フル編集
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("settings")}
          className={`btn btn-sm ${activeTab === "settings" ? "btn-default" : "btn-outline"}`}
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <Settings size={14} /> 管理者設定
        </button>
      </div>

      {/* TAB 1: Passwords Management */}
      {activeTab === "passwords" && (
        <div className="grid" style={{ gap: 20, gridTemplateColumns: "minmax(320px, 420px) 1fr" }}>
          {/* Create Password Form */}
          <Card className="section">
            <div className="row" style={{ gap: 8, marginBottom: 14 }}>
              <Plus size={16} style={{ color: "var(--neon-cyan)" }} />
              <h2 style={{ fontSize: 16, margin: 0, fontWeight: 700 }}>
                ユーザー用パスワード新規作成
              </h2>
            </div>
            <p className="muted tiny" style={{ marginTop: 0, marginBottom: 16, lineHeight: 1.5 }}>
              ユーザーに配布するパスワードを発行します。パスワードごとに追加可能な構成銘柄数の上限を設定できます。
            </p>

            {createError && (
              <div
                className="row"
                style={{
                  gap: 8,
                  padding: "8px 12px",
                  background: "rgba(255, 51, 102, 0.15)",
                  border: "1px solid var(--neon-red)",
                  borderRadius: 6,
                  color: "var(--neon-red)",
                  fontSize: 12,
                  marginBottom: 14,
                }}
              >
                <AlertCircle size={14} />
                <span>{createError}</span>
              </div>
            )}

            {createSuccess && (
              <div
                className="row"
                style={{
                  gap: 8,
                  padding: "8px 12px",
                  background: "rgba(0, 255, 157, 0.15)",
                  border: "1px solid var(--neon-green)",
                  borderRadius: 6,
                  color: "var(--neon-green)",
                  fontSize: 12,
                  marginBottom: 14,
                }}
              >
                <Check size={14} />
                <span>{createSuccess}</span>
              </div>
            )}

            <form onSubmit={handleCreatePassword}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
                  ユーザー名 / 組織名 <span style={{ color: "var(--neon-red)" }}>*</span>
                </label>
                <input
                  type="text"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="例: リサーチチームA, 外部アナリスト"
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    background: "rgba(0,0,0,0.4)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 6,
                    color: "#fff",
                    fontSize: 13,
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <div className="row space-between" style={{ marginBottom: 4 }}>
                  <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    パスワード <span style={{ color: "var(--neon-red)" }}>*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setNewUserPassword(generateSecurePassword())}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--neon-cyan)",
                      fontSize: 11,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <Sparkles size={12} /> ランダム再生成
                  </button>
                </div>
                <input
                  type="text"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    background: "rgba(0,0,0,0.4)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 6,
                    color: "var(--neon-cyan)",
                    fontFamily: "monospace",
                    fontSize: 14,
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>
                  追加可能銘柄数（制限）
                </label>
                <div className="row flex-wrap" style={{ gap: 6, marginBottom: 8 }}>
                  {[3, 5, 10, 20].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setNewUserMaxStocks(preset)}
                      className={`btn btn-sm ${newUserMaxStocks === preset ? "btn-default" : "btn-outline"}`}
                      style={{ padding: "4px 10px", fontSize: 11 }}
                    >
                      {preset} 銘柄
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setNewUserMaxStocks(null)}
                    className={`btn btn-sm ${newUserMaxStocks === null ? "btn-default" : "btn-outline"}`}
                    style={{ padding: "4px 10px", fontSize: 11 }}
                  >
                    無制限
                  </button>
                </div>

                {newUserMaxStocks !== null && (
                  <div className="row" style={{ gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>カスタム上限:</span>
                    <input
                      type="number"
                      min="1"
                      max="500"
                      value={newUserMaxStocks}
                      onChange={(e) => setNewUserMaxStocks(Math.max(1, Number(e.target.value)))}
                      style={{
                        width: 80,
                        padding: "6px 8px",
                        background: "rgba(0,0,0,0.4)",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: 6,
                        color: "#fff",
                        fontSize: 12,
                      }}
                    />
                    <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>銘柄まで追加可能</span>
                  </div>
                )}
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>
                  権限ロール
                </label>
                <div className="row" style={{ gap: 10 }}>
                  <label className="row" style={{ gap: 6, fontSize: 12, cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="userRole"
                      checked={newUserRole === "user"}
                      onChange={() => setNewUserRole("user")}
                    />
                    <span>ユーザー（銘柄制限あり）</span>
                  </label>
                  <label className="row" style={{ gap: 6, fontSize: 12, cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="userRole"
                      checked={newUserRole === "admin"}
                      onChange={() => setNewUserRole("admin")}
                    />
                    <span>副管理者（無制限）</span>
                  </label>
                </div>
              </div>

              <button
                type="submit"
                disabled={creatingPassword || !newUserName.trim() || !newUserPassword.trim()}
                className="btn btn-default"
                style={{ width: "100%", padding: "9px 14px" }}
              >
                {creatingPassword ? "作成中..." : "ユーザーパスワードを発行"}
              </button>
            </form>
          </Card>

          {/* Passwords List */}
          <Card className="section">
            <div className="row space-between" style={{ marginBottom: 14 }}>
              <div className="row" style={{ gap: 8 }}>
                <Users size={16} style={{ color: "var(--neon-cyan)" }} />
                <h2 style={{ fontSize: 16, margin: 0, fontWeight: 700 }}>
                  発行済みパスワード一覧
                </h2>
                <Badge variant="cyan">{passwords.length} 件</Badge>
              </div>
              <button
                type="button"
                onClick={fetchPasswords}
                className="btn btn-sm btn-outline"
                title="一覧を再読み込み"
              >
                <RefreshCw size={12} /> 更新
              </button>
            </div>

            {loadingPasswords ? (
              <div style={{ textAlign: "center", padding: "30px 0" }} className="muted">
                読み込み中...
              </div>
            ) : passwords.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0" }} className="muted">
                発行されたユーザーパスワードはまだありません。左のフォームから作成してください。
              </div>
            ) : (
              <div className="table-wrapper">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th style={{ width: "22%" }}>名前 / ラベル</th>
                      <th style={{ width: "15%" }}>ロール</th>
                      <th style={{ width: "18%" }}>銘柄数上限</th>
                      <th style={{ width: "25%" }}>パスワード</th>
                      <th style={{ width: "10%" }}>状態</th>
                      <th style={{ width: "10%", textAlign: "center" }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {passwords.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{item.name}</div>
                          <div className="muted tiny mono">
                            {new Date(item.created_at * 1000).toLocaleDateString("ja-JP")}
                          </div>
                        </td>
                        <td>
                          {item.role === "admin" ? (
                            <Badge variant="magenta">管理者</Badge>
                          ) : (
                            <Badge variant="cyan">ユーザー</Badge>
                          )}
                        </td>
                        <td>
                          {item.max_stocks ? (
                            <span className="mono" style={{ color: "var(--neon-cyan)", fontWeight: 600 }}>
                              最大 {item.max_stocks} 銘柄
                            </span>
                          ) : (
                            <span className="muted">無制限</span>
                          )}
                        </td>
                        <td>
                          {item.plain_password ? (
                            <div className="row" style={{ gap: 6 }}>
                              <code
                                style={{
                                  background: "rgba(0, 229, 255, 0.08)",
                                  padding: "2px 6px",
                                  borderRadius: 4,
                                  color: "var(--neon-cyan)",
                                  fontSize: 12,
                                }}
                              >
                                {item.plain_password}
                              </code>
                              <button
                                type="button"
                                onClick={() => handleCopy(item.plain_password!, item.id)}
                                className="btn btn-sm btn-outline"
                                style={{ padding: "2px 6px", fontSize: 10 }}
                                title="パスワードをコピー"
                              >
                                {copiedId === item.id ? (
                                  <span style={{ color: "var(--neon-green)" }}>コピー済</span>
                                ) : (
                                  <Copy size={11} />
                                )}
                              </button>
                            </div>
                          ) : (
                            <span className="muted tiny">（暗号化済）</span>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            onClick={() => handleToggleActive(item)}
                            className="btn btn-sm"
                            style={{
                              padding: "2px 6px",
                              fontSize: 10,
                              background: item.is_active === 1 ? "rgba(0, 255, 157, 0.15)" : "rgba(255, 51, 102, 0.15)",
                              color: item.is_active === 1 ? "var(--neon-green)" : "var(--neon-red)",
                              border: `1px solid ${item.is_active === 1 ? "rgba(0,255,157,0.3)" : "rgba(255,51,102,0.3)"}`,
                            }}
                          >
                            {item.is_active === 1 ? "有効" : "停止"}
                          </button>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <button
                            type="button"
                            onClick={() => handleDeletePassword(item.id, item.name)}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "var(--neon-red)",
                              cursor: "pointer",
                              padding: 4,
                            }}
                            title="削除"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* TAB 2: Full Edit of Indices & Constituents */}
      {activeTab === "indices" && (
        <div className="grid" style={{ gap: 20 }}>
          <Card className="section">
            <div className="row space-between flex-wrap" style={{ gap: 12, marginBottom: 16 }}>
              <div className="row" style={{ gap: 8 }}>
                <Sliders size={18} style={{ color: "var(--neon-cyan)" }} />
                <div>
                  <h2 style={{ fontSize: 16, margin: 0, fontWeight: 700 }}>
                    全指数 & 構成銘柄フル編集（制限なし）
                  </h2>
                  <div className="muted tiny">
                    管理者特権により、銘柄数制限を受けずに任意の銘柄追加・削除・比率変更が可能です。
                  </div>
                </div>
              </div>

              {/* Index selector dropdown */}
              <div className="row" style={{ gap: 8 }}>
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>編集対象指数:</span>
                <select
                  value={selectedEditIndexId}
                  onChange={(e) => setSelectedEditIndexId(e.target.value)}
                  style={{
                    padding: "6px 12px",
                    background: "rgba(0,0,0,0.5)",
                    border: "1px solid var(--border-cyan)",
                    borderRadius: 6,
                    color: "#fff",
                    fontSize: 13,
                  }}
                >
                  {indices.map((idx) => (
                    <option key={idx.id} value={idx.id}>
                      {idx.name} ({idx.basket.length}銘柄)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {indexEditMessage && (
              <div
                className="row"
                style={{
                  gap: 8,
                  padding: "10px 14px",
                  background: indexEditMessage.type === "success" ? "rgba(0,255,157,0.15)" : "rgba(255,51,102,0.15)",
                  border: `1px solid ${indexEditMessage.type === "success" ? "var(--neon-green)" : "var(--neon-red)"}`,
                  borderRadius: 8,
                  color: indexEditMessage.type === "success" ? "var(--neon-green)" : "var(--neon-red)",
                  fontSize: 13,
                  marginBottom: 16,
                }}
              >
                {indexEditMessage.type === "success" ? <Check size={16} /> : <AlertCircle size={16} />}
                <span>{indexEditMessage.text}</span>
              </div>
            )}

            {/* Index Metadata Settings */}
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14, marginBottom: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
                  指数名
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    background: "rgba(0,0,0,0.4)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 6,
                    color: "#fff",
                    fontSize: 14,
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
                  基準値 (Base Value)
                </label>
                <input
                  type="number"
                  value={editBaseValue}
                  onChange={(e) => setEditBaseValue(Number(e.target.value))}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    background: "rgba(0,0,0,0.4)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 6,
                    color: "#fff",
                    fontSize: 14,
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
                指数の説明
              </label>
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={2}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  background: "rgba(0,0,0,0.4)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: 6,
                  color: "#fff",
                  fontSize: 13,
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Constituents Table */}
            <div style={{ marginBottom: 16 }}>
              <div className="row space-between" style={{ marginBottom: 10 }}>
                <div className="row" style={{ gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>構成銘柄リスト</span>
                  <Tag variant="cyan" className="mono tiny">{editBasket.length} 銘柄</Tag>
                  <span className="muted tiny">合計ウェイト: {editBasket.reduce((a, b) => a + b.weight, 0).toFixed(1)}%</span>
                </div>
                <button
                  type="button"
                  onClick={handleEqualWeights}
                  className="btn btn-sm btn-outline"
                  style={{ fontSize: 11 }}
                >
                  均等配分 (Equalize)
                </button>
              </div>

              <div className="table-wrapper" style={{ maxHeight: 340, overflowY: "auto" }}>
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th style={{ width: "15%" }}>コード</th>
                      <th style={{ width: "35%" }}>銘柄名</th>
                      <th style={{ width: "20%" }}>テーマ</th>
                      <th style={{ width: "20%" }}>比率 (%)</th>
                      <th style={{ width: "10%", textAlign: "center" }}>削除</th>
                    </tr>
                  </thead>
                  <tbody>
                    {editBasket.map((b) => (
                      <tr key={b.ticker}>
                        <td className="mono" style={{ color: "var(--neon-cyan)" }}>{b.ticker}</td>
                        <td>{b.name}</td>
                        <td className="muted">{b.theme}</td>
                        <td>
                          <input
                            type="number"
                            min="0.1"
                            max="100"
                            step="0.5"
                            value={b.weight}
                            onChange={(e) => {
                              const val = Math.max(0.1, Number(e.target.value));
                              setEditBasket(
                                editBasket.map((item) => (item.ticker === b.ticker ? { ...item, weight: val } : item))
                              );
                            }}
                            style={{
                              width: 70,
                              padding: "4px 6px",
                              background: "rgba(0,0,0,0.5)",
                              border: "1px solid var(--border-subtle)",
                              borderRadius: 4,
                              color: "#fff",
                              fontSize: 12,
                            }}
                          />
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <button
                            type="button"
                            onClick={() => setEditBasket(editBasket.filter((item) => item.ticker !== b.ticker))}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "var(--neon-red)",
                              cursor: "pointer",
                              padding: 4,
                            }}
                            title="銘柄を削除"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Quick Inline Add Stock */}
            <form
              onSubmit={handleAddStockToBasket}
              style={{
                padding: "12px 14px",
                background: "rgba(255,255,255,0.02)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 8,
                marginBottom: 20,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--neon-cyan)" }}>
                + 銘柄を追加（制限なし）
              </div>
              <div className="row flex-wrap" style={{ gap: 10 }}>
                <input
                  type="text"
                  placeholder="コード (例: 6758)"
                  value={addTicker}
                  onChange={(e) => setAddTicker(e.target.value.toUpperCase())}
                  style={{
                    width: 120,
                    padding: "6px 8px",
                    background: "rgba(0,0,0,0.4)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 4,
                    color: "#fff",
                    fontSize: 12,
                  }}
                />
                <input
                  type="text"
                  placeholder="銘柄名 (例: ソニーグループ)"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  style={{
                    flex: 1,
                    minWidth: 160,
                    padding: "6px 8px",
                    background: "rgba(0,0,0,0.4)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 4,
                    color: "#fff",
                    fontSize: 12,
                  }}
                />
                <input
                  type="text"
                  placeholder="テーマ"
                  value={addTheme}
                  onChange={(e) => setAddTheme(e.target.value)}
                  style={{
                    width: 130,
                    padding: "6px 8px",
                    background: "rgba(0,0,0,0.4)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 4,
                    color: "#fff",
                    fontSize: 12,
                  }}
                />
                <input
                  type="number"
                  placeholder="比率"
                  value={addWeight}
                  onChange={(e) => setAddWeight(Number(e.target.value))}
                  style={{
                    width: 70,
                    padding: "6px 8px",
                    background: "rgba(0,0,0,0.4)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 4,
                    color: "#fff",
                    fontSize: 12,
                  }}
                />
                <button
                  type="submit"
                  className="btn btn-sm btn-default"
                  disabled={!addTicker.trim() || !addName.trim()}
                >
                  追加
                </button>
              </div>
            </form>

            {/* Action Bar */}
            <div className="row space-between" style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 16 }}>
              <div>
                {!["nikkei-175", "eroge-index", "ai-semi", "infra-tech", "jp-core"].includes(selectedEditIndexId) && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (confirm(`指数「${editName}」を完全に削除しますか？`)) {
                        await deleteCustomIndex(selectedEditIndexId);
                        await onRefreshIndices();
                      }
                    }}
                    className="btn btn-sm btn-outline"
                    style={{ borderColor: "rgba(255,51,102,0.4)", color: "var(--neon-red)" }}
                  >
                    このカスタム指数を削除
                  </button>
                )}
              </div>

              <div className="row" style={{ gap: 10 }}>
                <button
                  type="button"
                  onClick={handleSaveIndexFullEdit}
                  disabled={savingIndex}
                  className="btn btn-default"
                  style={{ minWidth: 140, padding: "8px 18px" }}
                >
                  {savingIndex ? "保存中..." : "変更をD1に保存"}
                </button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 3: Settings */}
      {activeTab === "settings" && (
        <div style={{ maxWidth: 500 }}>
          <Card className="section">
            <div className="row" style={{ gap: 8, marginBottom: 14 }}>
              <Lock size={16} style={{ color: "var(--neon-cyan)" }} />
              <h2 style={{ fontSize: 16, margin: 0, fontWeight: 700 }}>管理者マスターパスワード変更</h2>
            </div>
            <p className="muted tiny" style={{ marginTop: 0, marginBottom: 16, lineHeight: 1.5 }}>
              管理コンソールへのアクセスに必要なマスターパスワードを更新します。6文字以上で入力してください。
            </p>

            {adminPwdMessage && (
              <div
                className="row"
                style={{
                  gap: 8,
                  padding: "8px 12px",
                  background: adminPwdMessage.type === "success" ? "rgba(0,255,157,0.15)" : "rgba(255,51,102,0.15)",
                  border: `1px solid ${adminPwdMessage.type === "success" ? "var(--neon-green)" : "var(--neon-red)"}`,
                  borderRadius: 6,
                  color: adminPwdMessage.type === "success" ? "var(--neon-green)" : "var(--neon-red)",
                  fontSize: 12,
                  marginBottom: 14,
                }}
              >
                {adminPwdMessage.type === "success" ? <Check size={14} /> : <AlertCircle size={14} />}
                <span>{adminPwdMessage.text}</span>
              </div>
            )}

            <form onSubmit={handleUpdateAdminPassword}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
                  新しい管理者パスワード
                </label>
                <input
                  type="password"
                  value={newAdminPassword}
                  onChange={(e) => setNewAdminPassword(e.target.value)}
                  placeholder="新しいパスワード (6文字以上)"
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    background: "rgba(0,0,0,0.4)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 6,
                    color: "#fff",
                    fontSize: 13,
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
                  新しい管理者パスワード（確認）
                </label>
                <input
                  type="password"
                  value={confirmAdminPassword}
                  onChange={(e) => setConfirmAdminPassword(e.target.value)}
                  placeholder="もう一度入力してください"
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    background: "rgba(0,0,0,0.4)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 6,
                    color: "#fff",
                    fontSize: 13,
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={updatingAdminPwd || newAdminPassword.length < 6}
                className="btn btn-default"
                style={{ width: "100%" }}
              >
                {updatingAdminPwd ? "更新中..." : "管理者パスワードを更新"}
              </button>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
