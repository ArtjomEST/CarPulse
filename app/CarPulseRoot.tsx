"use client";

import { useEffect, useState } from "react";
import { AuthScreen } from "./AuthScreen";
import { CarPulseApp } from "./CarPulseApp";

export type CurrentUser = {
  id: number;
  name: string;
  email: string;
  role: "user" | "admin";
  status: "active" | "blocked";
};

type SessionState = {
  user: CurrentUser | null;
  bootstrapAvailable: boolean;
  bootstrapEmail?: string;
  registrationEnabled: boolean;
};

export function CarPulseRoot() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    async function loadSession() {
      try {
        const response = await fetch("/api/auth/session", {
          headers: { Accept: "application/json" },
        });
        const payload = (await response.json()) as SessionState & {
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error || "Не удалось проверить сессию");
        }
        if (active) setSession(payload);
      } catch (error) {
        if (active) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Не удалось открыть CarPulse",
          );
        }
      }
    }
    void loadSession();
    return () => {
      active = false;
    };
  }, []);

  if (!session) {
    return (
      <main className="auth-loading">
        <span className="auth-brand-mark" aria-hidden="true">CP</span>
        <strong>{loadError || "Открываем CarPulse…"}</strong>
        {loadError && (
          <button type="button" onClick={() => window.location.reload()}>
            Обновить страницу
          </button>
        )}
      </main>
    );
  }

  if (!session.user) {
    return (
      <AuthScreen
        bootstrapAvailable={session.bootstrapAvailable}
        bootstrapEmail={session.bootstrapEmail}
        registrationEnabled={session.registrationEnabled}
        onAuthenticated={(user) =>
          setSession((current) => ({
            ...current,
            bootstrapAvailable: false,
            registrationEnabled: true,
            user,
          }))
        }
      />
    );
  }

  return (
    <CarPulseApp
      user={session.user}
      onSessionExpired={() =>
        setSession((current) => ({
          ...current,
          user: null,
          bootstrapAvailable: false,
          registrationEnabled: true,
        }))
      }
      onLogout={async () => {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        }).catch(() => undefined);
        setSession({
          user: null,
          bootstrapAvailable: false,
          registrationEnabled: true,
        });
      }}
    />
  );
}
