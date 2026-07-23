"use client";

import {
  Bot,
  Check,
  Copy,
  ExternalLink,
  KeyRound,
  Link2,
  MessageCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  Unlink,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import type { CurrentUser } from "./CarPulseRoot";

type TelegramConnection = {
  connected: boolean;
  username?: string | null;
  firstName?: string | null;
  connectedAt?: string | null;
  codeExpiresAt?: string | null;
};

type ConnectionPayload = {
  configured: boolean;
  connection: TelegramConnection;
  error?: string;
};

export function TelegramSettingsPanel({
  user,
  onConnectionChange,
  onSessionExpired,
}: {
  user: CurrentUser;
  onConnectionChange: (connected: boolean) => void;
  onSessionExpired: () => void;
}) {
  const [state, setState] = useState<ConnectionPayload | null>(null);
  const [code, setCode] = useState("");
  const [deepLink, setDeepLink] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [loadingAction, setLoadingAction] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [botState, setBotState] = useState<{
    configured: boolean;
    bot?: { username: string; name: string };
  } | null>(null);

  const loadConnection = useCallback(async () => {
    try {
      const response = await fetch("/api/telegram/connection");
      const payload = (await response.json()) as ConnectionPayload;
      if (response.status === 401) {
        onSessionExpired();
        return;
      }
      if (!response.ok) throw new Error(payload.error || "Не удалось проверить Telegram");
      setState(payload);
      onConnectionChange(Boolean(payload.connection?.connected));
      if (payload.connection?.connected) {
        setCode("");
        setDeepLink("");
        setExpiresAt("");
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось проверить Telegram");
    }
  }, [onConnectionChange, onSessionExpired]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadConnection(), 0);
    return () => window.clearTimeout(timer);
  }, [loadConnection]);

  useEffect(() => {
    if (!code || state?.connection?.connected) return;
    const timer = window.setInterval(() => void loadConnection(), 4_000);
    return () => window.clearInterval(timer);
  }, [code, loadConnection, state?.connection?.connected]);

  useEffect(() => {
    if (user.role !== "admin") return;
    let active = true;
    async function loadBot() {
      try {
        const response = await fetch("/api/admin/telegram");
        const payload = (await response.json()) as {
          configured: boolean;
          bot?: { username: string; name: string };
        };
        if (active && response.ok) setBotState(payload);
      } catch {
        if (active) setBotState({ configured: false });
      }
    }
    void loadBot();
    return () => {
      active = false;
    };
  }, [user.role]);

  async function action(actionName: "create_code" | "disconnect" | "test") {
    setLoadingAction(actionName);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/telegram/connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: actionName }),
      });
      const payload = (await response.json()) as {
        error?: string;
        code?: string;
        expiresAt?: string;
        deepLink?: string;
      };
      if (response.status === 401) {
        onSessionExpired();
        return;
      }
      if (!response.ok) throw new Error(payload.error || "Не удалось выполнить действие");

      if (actionName === "create_code") {
        setCode(payload.code || "");
        setDeepLink(payload.deepLink || "");
        setExpiresAt(payload.expiresAt || "");
        setNotice("Код создан. Отправьте его боту в течение 15 минут.");
      } else if (actionName === "disconnect") {
        setCode("");
        setNotice("Telegram отключён от аккаунта.");
        await loadConnection();
      } else {
        setNotice("Тестовое сообщение отправлено в Telegram.");
      }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Не удалось выполнить действие");
    } finally {
      setLoadingAction("");
    }
  }

  async function configureWebhook() {
    setLoadingAction("webhook");
    setError("");
    try {
      const response = await fetch("/api/admin/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const payload = (await response.json()) as {
        error?: string;
        bot?: { username: string; name: string };
      };
      if (!response.ok) throw new Error(payload.error || "Не удалось настроить webhook");
      setBotState({ configured: true, bot: payload.bot });
      setNotice("Webhook Telegram настроен и принимает команды.");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Не удалось настроить webhook");
    } finally {
      setLoadingAction("");
    }
  }

  const connected = Boolean(state?.connection?.connected);

  return (
    <>
      <section className="settings-card telegram-settings">
        <div className="settings-card-heading">
          <span className="settings-icon"><MessageCircle size={23} /></span>
          <div><h2>Уведомления в Telegram</h2><p>Этот чат принадлежит только текущему аккаунту.</p></div>
        </div>

        {!state ? (
          <p className="setting-loading"><RefreshCw size={17} /> Проверяем подключение…</p>
        ) : connected ? (
          <div className="telegram-connected-real">
            <span className="connected-check"><Check size={22} /></span>
            <div>
              <strong>Telegram подключён</strong>
              <p>
                {state.connection.firstName || "Личный чат"}
                {state.connection.username ? ` · @${state.connection.username}` : ""}
              </p>
            </div>
            <div className="telegram-connected-actions">
              <button type="button" onClick={() => void action("test")} disabled={Boolean(loadingAction)}>
                <Send size={16} /> {loadingAction === "test" ? "Отправляем…" : "Тест"}
              </button>
              <button type="button" className="danger" onClick={() => void action("disconnect")} disabled={Boolean(loadingAction)}>
                <Unlink size={16} /> Отключить
              </button>
            </div>
          </div>
        ) : !state.configured ? (
          <div className="telegram-not-ready">
            <Bot size={23} />
            <div><strong>Бот ещё не включён</strong><p>Администратор должен добавить токен BotFather в защищённые настройки.</p></div>
          </div>
        ) : code ? (
          <div className="telegram-code-flow">
            <ol>
              <li><span>1</span><p>Откройте бота по кнопке ниже.</p></li>
              <li><span>2</span><p>Нажмите Start или отправьте одноразовый код.</p></li>
            </ol>
            <div className="telegram-code-row">
              <code>{code}</code>
              <button type="button" onClick={() => {
                void navigator.clipboard.writeText(code);
                setNotice("Код скопирован.");
              }}><Copy size={17} /> Копировать</button>
            </div>
            <a className="telegram-open-link" href={deepLink} target="_blank" rel="noreferrer">
              Открыть Telegram <ExternalLink size={16} />
            </a>
            <p className="code-note">
              Код действует до {formatTime(expiresAt)}. Статус обновится автоматически после подключения.
            </p>
          </div>
        ) : (
          <div className="telegram-start-flow">
            <div><Link2 size={21} /><p>Создайте одноразовый код и свяжите личный Telegram-чат с аккаунтом {user.email}.</p></div>
            <button type="button" onClick={() => void action("create_code")} disabled={Boolean(loadingAction)}>
              {loadingAction === "create_code" ? "Создаём код…" : "Подключить Telegram"}
            </button>
          </div>
        )}
        {error && <p className="settings-message error" role="alert">{error}</p>}
        {notice && <p className="settings-message success" role="status">{notice}</p>}
      </section>

      {user.role === "admin" && (
        <section className="settings-card">
          <div className="settings-card-heading">
            <span className="settings-icon neutral"><ShieldCheck size={23} /></span>
            <div><h2>Telegram backend</h2><p>Состояние production-бота и webhook.</p></div>
          </div>
          <div className="bot-admin-state">
            <span className={`status-dot ${botState?.configured ? "status-success" : "status-waiting"}`} />
            <div>
              <strong>
                {botState?.configured
                  ? `@${botState.bot?.username || "бот подключён"}`
                  : "Токен не настроен"}
              </strong>
              <small>
                {botState?.configured
                  ? "BotFather token доступен только Worker runtime."
                  : "Добавьте TELEGRAM_BOT_TOKEN как secret в Sites."}
              </small>
            </div>
          </div>
          <button
            className="secondary-button settings-full-button"
            type="button"
            disabled={!botState?.configured || Boolean(loadingAction)}
            onClick={() => void configureWebhook()}
          >
            <RefreshCw size={17} />
            {loadingAction === "webhook" ? "Настраиваем…" : "Проверить и настроить webhook"}
          </button>
        </section>
      )}
    </>
  );
}

export function AccountSecurityPanel({
  user,
  onSessionExpired,
}: {
  user: CurrentUser;
  onSessionExpired: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    if (newPassword !== confirmation) {
      setError("Новый пароль и подтверждение не совпадают.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const payload = (await response.json()) as { error?: string };
      if (response.status === 401) {
        onSessionExpired();
        return;
      }
      if (!response.ok) throw new Error(payload.error || "Не удалось изменить пароль");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmation("");
      setMessage("Пароль изменён. Остальные активные сессии завершены.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Не удалось изменить пароль");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="settings-card settings-wide account-security">
      <div className="settings-card-heading">
        <span className="settings-icon neutral"><KeyRound size={23} /></span>
        <div>
          <h2>Аккаунт и пароль</h2>
          <p>{user.name} · {user.email} · {user.role === "admin" ? "Администратор" : "Пользователь"}</p>
        </div>
      </div>
      <form onSubmit={submit}>
        <label><span>Текущий пароль</span><input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label>
        <label><span>Новый пароль</span><input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={10} maxLength={128} required /></label>
        <label><span>Повторите новый пароль</span><input type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={10} maxLength={128} required /></label>
        <button type="submit" className="primary-button" disabled={saving}>{saving ? "Меняем пароль…" : "Изменить пароль"}</button>
      </form>
      {error && <p className="settings-message error" role="alert">{error}</p>}
      {message && <p className="settings-message success" role="status">{message}</p>}
    </section>
  );
}

function formatTime(value: string) {
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "ближайших 15 минут";
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
