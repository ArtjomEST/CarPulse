"use client";

import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Gauge,
  LockKeyhole,
  Radar,
  ShieldCheck,
} from "lucide-react";
import { FormEvent, useState } from "react";
import type { CurrentUser } from "./CarPulseRoot";

type AuthMode = "login" | "register" | "bootstrap";

export function AuthScreen({
  bootstrapAvailable,
  bootstrapEmail,
  registrationEnabled,
  onAuthenticated,
}: {
  bootstrapAvailable: boolean;
  bootstrapEmail?: string;
  registrationEnabled: boolean;
  onAuthenticated: (user: CurrentUser) => void;
}) {
  const [mode, setMode] = useState<AuthMode>(
    bootstrapAvailable ? "bootstrap" : "login",
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState(bootstrapEmail || "");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    if (nextMode === "bootstrap" && bootstrapEmail) setEmail(bootstrapEmail);
    setError("");
    setPassword("");
    setConfirmation("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (mode !== "login" && password !== confirmation) {
      setError("Пароли не совпадают. Введите одинаковый пароль в оба поля.");
      return;
    }

    setSubmitting(true);
    try {
      const endpoint =
        mode === "bootstrap"
          ? "/api/auth/bootstrap"
          : mode === "register"
            ? "/api/auth/register"
            : "/api/auth/login";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          ...(mode !== "login" ? { name } : {}),
          email,
          password,
        }),
      });
      const payload = (await response.json()) as {
        user?: CurrentUser;
        error?: string;
      };
      if (!response.ok || !payload.user) {
        throw new Error(payload.error || "Не удалось выполнить вход");
      }
      onAuthenticated(payload.user);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Не удалось выполнить действие. Попробуйте ещё раз.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const title =
    mode === "bootstrap"
      ? "Создайте аккаунт администратора"
      : mode === "register"
        ? "Создайте свой аккаунт"
        : "Войдите в CarPulse";
  const description =
    mode === "bootstrap"
      ? "Это одноразовый защищённый шаг. Прежние радары владельца будут привязаны к новому аккаунту."
      : mode === "register"
        ? "Ваши радары, автомобили, избранное и Telegram будут отделены от данных других пользователей."
        : "Все радары и найденные автомобили ждут вас в одном кабинете.";

  return (
    <main className="auth-page">
      <section className="auth-story" aria-label="О CarPulse">
        <div className="auth-wordmark">
          <span><Gauge size={24} /></span>
          CarPulse
        </div>
        <div className="auth-story-copy">
          <p className="auth-kicker">Автомобильный мониторинг</p>
          <h1>Хорошее объявление не будет ждать.</h1>
          <p>
            Настройте поиск один раз. CarPulse проверит площадки и покажет
            подходящие автомобили в вашем личном кабинете.
          </p>
        </div>
        <ul className="auth-benefits">
          <li><Radar size={19} /><span><strong>Личные радары</strong>Данные каждого аккаунта полностью разделены.</span></li>
          <li><ShieldCheck size={19} /><span><strong>Защищённый доступ</strong>Пароли не хранятся в открытом виде.</span></li>
          <li><Check size={19} /><span><strong>Telegram сразу после находки</strong>Подключение через одноразовый код.</span></li>
        </ul>
      </section>

      <section className="auth-form-side">
        <div className="auth-form-wrap">
          <div className="auth-mobile-brand"><Gauge size={21} /> CarPulse</div>
          {!bootstrapAvailable && (
            <div className="auth-tabs" role="tablist" aria-label="Авторизация">
              <button
                type="button"
                role="tab"
                aria-selected={mode === "login"}
                className={mode === "login" ? "active" : ""}
                onClick={() => changeMode("login")}
              >
                Вход
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "register"}
                className={mode === "register" ? "active" : ""}
                disabled={!registrationEnabled}
                onClick={() => changeMode("register")}
              >
                Регистрация
              </button>
            </div>
          )}

          <header className="auth-form-heading">
            {mode === "bootstrap" && (
              <span className="auth-secure-label"><LockKeyhole size={15} /> Только для владельца</span>
            )}
            <h2>{title}</h2>
            <p>{description}</p>
          </header>

          <form className="auth-form" onSubmit={submit}>
            {mode !== "login" && (
              <label>
                <span>Имя</span>
                <input
                  name="name"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Артём Ковалёв"
                  required
                  minLength={2}
                  maxLength={80}
                />
              </label>
            )}
            <label>
              <span>Почта</span>
              <input
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.com"
                readOnly={mode === "bootstrap" && Boolean(bootstrapEmail)}
                required
              />
            </label>
            <label>
              <span>Пароль</span>
              <div className="auth-password">
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={mode === "login" ? "Ваш пароль" : "Минимум 10 символов"}
                  required
                  minLength={mode === "login" ? undefined : 10}
                  maxLength={128}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                >
                  {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              </div>
            </label>
            {mode !== "login" && (
              <label>
                <span>Повторите пароль</span>
                <input
                  name="passwordConfirmation"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  placeholder="Тот же пароль ещё раз"
                  required
                  minLength={10}
                  maxLength={128}
                />
              </label>
            )}
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button className="auth-submit" type="submit" disabled={submitting}>
              {submitting
                ? mode === "login"
                  ? "Входим…"
                  : "Создаём аккаунт…"
                : mode === "bootstrap"
                  ? "Создать администратора"
                  : mode === "register"
                    ? "Создать аккаунт"
                    : "Войти"}
              {!submitting && <ArrowRight size={19} />}
            </button>
          </form>

          {mode === "register" && (
            <p className="auth-switch">
              Уже есть аккаунт?{" "}
              <button type="button" onClick={() => changeMode("login")}>Войти</button>
            </p>
          )}
          {mode === "login" && registrationEnabled && (
            <p className="auth-switch">
              Впервые в CarPulse?{" "}
              <button type="button" onClick={() => changeMode("register")}>Создать аккаунт</button>
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
