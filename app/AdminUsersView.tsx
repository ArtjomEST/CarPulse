"use client";

import {
  Ban,
  Check,
  ChevronDown,
  KeyRound,
  MessageCircle,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";

type ManagedUser = {
  id: number;
  name: string;
  email: string;
  role: "user" | "admin";
  status: "active" | "blocked";
  createdAt: string | null;
  updatedAt: string | null;
  lastLoginAt: string | null;
  radarCount: number;
  favoriteCount: number;
  telegramConnected: boolean;
};

type UserDraft = Pick<ManagedUser, "name" | "email" | "role" | "status">;

const emptyDraft: UserDraft & { password: string } = {
  name: "",
  email: "",
  password: "",
  role: "user",
  status: "active",
};

export function AdminUsersView({
  currentUserId,
  onSessionExpired,
}: {
  currentUserId: number;
  onSessionExpired: () => void;
}) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState(emptyDraft);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<UserDraft | null>(null);
  const [passwordUserId, setPasswordUserId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/users");
      const payload = (await response.json()) as {
        users?: ManagedUser[];
        error?: string;
      };
      if (response.status === 401) {
        onSessionExpired();
        return;
      }
      if (!response.ok) throw new Error(payload.error || "Не удалось загрузить пользователей");
      setUsers(payload.users || []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Не удалось загрузить пользователей",
      );
    } finally {
      setLoading(false);
    }
  }, [onSessionExpired]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadUsers(), 0);
    return () => window.clearTimeout(timer);
  }, [loadUsers]);

  async function adminAction(body: Record<string, unknown>) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as {
        user?: ManagedUser;
        id?: number;
        error?: string;
      };
      if (response.status === 401) {
        onSessionExpired();
        throw new Error("Сессия завершилась. Войдите снова.");
      }
      if (!response.ok) throw new Error(payload.error || "Не удалось сохранить изменения");
      return payload;
    } finally {
      setSaving(false);
    }
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const payload = await adminAction({
        action: "create_user",
        ...createDraft,
      });
      if (payload.user) setUsers((current) => [payload.user!, ...current]);
      setCreateDraft(emptyDraft);
      setCreateOpen(false);
      setNotice("Пользователь создан. Он уже может войти с указанным паролем.");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Не удалось создать пользователя");
    }
  }

  async function updateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingId || !editDraft) return;
    try {
      const payload = await adminAction({
        action: "update_user",
        id: editingId,
        ...editDraft,
      });
      if (payload.user) {
        setUsers((current) =>
          current.map((user) => (user.id === editingId ? payload.user! : user)),
        );
      }
      setEditingId(null);
      setEditDraft(null);
      setNotice("Данные пользователя обновлены.");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Не удалось обновить пользователя");
    }
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!passwordUserId) return;
    try {
      await adminAction({
        action: "reset_password",
        id: passwordUserId,
        password: newPassword,
      });
      setPasswordUserId(null);
      setNewPassword("");
      setNotice("Пароль изменён. Все прежние сессии пользователя завершены.");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Не удалось изменить пароль");
    }
  }

  async function deleteUser(id: number) {
    try {
      await adminAction({ action: "delete_user", id });
      setUsers((current) => current.filter((user) => user.id !== id));
      setDeleteConfirmId(null);
      setNotice("Пользователь и принадлежащие ему данные удалены.");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Не удалось удалить пользователя");
    }
  }

  return (
    <section className="admin-users">
      <div className="admin-summary" aria-label="Сводка пользователей">
        <div><span>Всего аккаунтов</span><strong>{users.length}</strong></div>
        <div><span>Активны</span><strong>{users.filter((user) => user.status === "active").length}</strong></div>
        <div><span>Администраторы</span><strong>{users.filter((user) => user.role === "admin").length}</strong></div>
        <button
          className="primary-button"
          type="button"
          onClick={() => {
            setCreateOpen((current) => !current);
            setError("");
          }}
        >
          {createOpen ? <X size={18} /> : <Plus size={18} />}
          {createOpen ? "Закрыть форму" : "Добавить пользователя"}
        </button>
      </div>

      {createOpen && (
        <form className="admin-create-form" onSubmit={createUser}>
          <div>
            <p className="admin-form-kicker">Новый аккаунт</p>
            <h2>Создать пользователя вручную</h2>
            <p>Передайте пароль человеку безопасным способом. После входа он сможет заменить его в настройках.</p>
          </div>
          <div className="admin-form-fields">
            <label><span>Имя</span><input value={createDraft.name} onChange={(event) => setCreateDraft((current) => ({ ...current, name: event.target.value }))} required minLength={2} maxLength={80} /></label>
            <label><span>Почта</span><input type="email" value={createDraft.email} onChange={(event) => setCreateDraft((current) => ({ ...current, email: event.target.value }))} required /></label>
            <label><span>Временный пароль</span><input type="password" value={createDraft.password} onChange={(event) => setCreateDraft((current) => ({ ...current, password: event.target.value }))} required minLength={10} maxLength={128} /></label>
            <label><span>Роль</span><div className="select-wrap"><select value={createDraft.role} onChange={(event) => setCreateDraft((current) => ({ ...current, role: event.target.value as "user" | "admin" }))}><option value="user">Пользователь</option><option value="admin">Администратор</option></select><ChevronDown size={18} /></div></label>
          </div>
          <div className="admin-form-actions">
            <button type="button" className="secondary-button" onClick={() => setCreateOpen(false)}>Не создавать</button>
            <button type="submit" className="primary-button" disabled={saving}>{saving ? "Создаём…" : "Создать пользователя"}</button>
          </div>
        </form>
      )}

      {(error || notice) && (
        <div className={`admin-message ${error ? "error" : "success"}`} role={error ? "alert" : "status"}>
          {error ? <Ban size={18} /> : <Check size={18} />}
          <span>{error || notice}</span>
          <button type="button" onClick={() => { setError(""); setNotice(""); }} aria-label="Закрыть сообщение"><X size={17} /></button>
        </div>
      )}

      <div className="admin-user-list">
        <div className="admin-user-list-heading">
          <div><UsersRound size={20} /><h2>Все пользователи</h2></div>
          <span>Доступ и данные управляются отдельно для каждого аккаунта</span>
        </div>

        {loading ? (
          <div className="admin-users-empty">Загружаем пользователей…</div>
        ) : users.length === 0 ? (
          <div className="admin-users-empty">Пользователей пока нет.</div>
        ) : (
          users.map((user) => (
            <article className="admin-user-row" key={user.id}>
              <div className="admin-user-identity">
                <span className={`admin-avatar ${user.status === "blocked" ? "blocked" : ""}`}>{initials(user.name)}</span>
                <div>
                  <div className="admin-user-name">
                    <strong>{user.name}</strong>
                    {user.id === currentUserId && <span>Вы</span>}
                    {user.role === "admin" && <span className="admin-role"><ShieldCheck size={13} /> Админ</span>}
                  </div>
                  <small>{user.email}</small>
                </div>
              </div>
              <div className="admin-user-data">
                <span><strong>{user.radarCount}</strong> радаров</span>
                <span><strong>{user.favoriteCount}</strong> избранных</span>
                <span className={user.telegramConnected ? "telegram-on" : ""}><MessageCircle size={15} /> {user.telegramConnected ? "Telegram" : "Без Telegram"}</span>
              </div>
              <div className="admin-user-state">
                <span className={`user-status user-status-${user.status}`}>{user.status === "active" ? "Активен" : "Заблокирован"}</span>
                <small>{user.lastLoginAt ? `Вход ${formatDate(user.lastLoginAt)}` : `Создан ${formatDate(user.createdAt)}`}</small>
              </div>
              <div className="admin-user-actions">
                <button type="button" onClick={() => {
                  setEditingId(user.id);
                  setEditDraft({ name: user.name, email: user.email, role: user.role, status: user.status });
                  setPasswordUserId(null);
                  setDeleteConfirmId(null);
                }}><Pencil size={17} /> Изменить</button>
                {user.id !== currentUserId && (
                  <>
                    <button type="button" onClick={() => {
                      setPasswordUserId(user.id);
                      setNewPassword("");
                      setEditingId(null);
                      setDeleteConfirmId(null);
                    }}><KeyRound size={17} /> Пароль</button>
                    <button className="danger" type="button" onClick={() => setDeleteConfirmId(user.id)}><Trash2 size={17} /> Удалить</button>
                  </>
                )}
              </div>

              {editingId === user.id && editDraft && (
                <form className="admin-inline-form" onSubmit={updateUser}>
                  <label><span>Имя</span><input value={editDraft.name} onChange={(event) => setEditDraft((current) => current ? ({ ...current, name: event.target.value }) : current)} required minLength={2} maxLength={80} /></label>
                  <label><span>Почта</span><input type="email" value={editDraft.email} onChange={(event) => setEditDraft((current) => current ? ({ ...current, email: event.target.value }) : current)} required /></label>
                  <label><span>Роль</span><div className="select-wrap"><select value={editDraft.role} disabled={user.id === currentUserId} onChange={(event) => setEditDraft((current) => current ? ({ ...current, role: event.target.value as "user" | "admin" }) : current)}><option value="user">Пользователь</option><option value="admin">Администратор</option></select><ChevronDown size={17} /></div></label>
                  <label><span>Статус</span><div className="select-wrap"><select value={editDraft.status} disabled={user.id === currentUserId} onChange={(event) => setEditDraft((current) => current ? ({ ...current, status: event.target.value as "active" | "blocked" }) : current)}><option value="active">Активен</option><option value="blocked">Заблокирован</option></select><ChevronDown size={17} /></div></label>
                  <div className="admin-inline-actions"><button type="button" onClick={() => { setEditingId(null); setEditDraft(null); }}>Не сохранять</button><button type="submit" disabled={saving}>{saving ? "Сохраняем…" : "Сохранить изменения"}</button></div>
                </form>
              )}

              {passwordUserId === user.id && (
                <form className="admin-password-form" onSubmit={resetPassword}>
                  <div><KeyRound size={19} /><span><strong>Новый пароль для {user.name}</strong><small>После сохранения все активные сессии этого пользователя завершатся.</small></span></div>
                  <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="Минимум 10 символов" required minLength={10} maxLength={128} />
                  <button type="button" onClick={() => setPasswordUserId(null)}>Не менять</button>
                  <button type="submit" disabled={saving}>{saving ? "Сохраняем…" : "Задать пароль"}</button>
                </form>
              )}

              {deleteConfirmId === user.id && (
                <div className="admin-delete-confirm">
                  <div><Trash2 size={19} /><span><strong>Удалить аккаунт {user.name}?</strong><small>Радары, совпадения, избранное, сессии и Telegram-подключение будут удалены без возможности восстановления.</small></span></div>
                  <button type="button" onClick={() => setDeleteConfirmId(null)}>Сохранить аккаунт</button>
                  <button type="button" disabled={saving} onClick={() => void deleteUser(user.id)}>{saving ? "Удаляем…" : "Удалить аккаунт"}</button>
                </div>
              )}
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("ru"))
    .join("");
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}
