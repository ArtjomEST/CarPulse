"use client";

import {
  Bell,
  BellRing,
  Bookmark,
  Bot,
  CarFront,
  Check,
  ChevronDown,
  Clock3,
  ExternalLink,
  Gauge,
  Heart,
  LayoutDashboard,
  MapPin,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Settings,
  SlidersHorizontal,
  X,
} from "lucide-react";
import Image from "next/image";
import { FormEvent, useEffect, useMemo, useState } from "react";

type View = "overview" | "radars" | "vehicles" | "favorites" | "settings";

type Listing = {
  id: number;
  url: string;
  title: string;
  price: number;
  year: number;
  mileage: string;
  fuel: string;
  power: string;
  transmission: string;
  location: string;
  source: string;
  age: string;
  radar: string;
  image: string;
  goodPrice?: boolean;
};

type RadarFilters = {
  make?: string;
  model?: string;
  priceMin?: number;
  priceMax?: number;
  yearMin?: number;
  yearMax?: number;
  mileageMax?: number;
  fuel?: string;
  transmission?: string;
  location?: string;
};

type Radar = {
  id: number;
  name: string;
  query: string;
  sources: string[];
  matches: number;
  enabled: boolean;
  lastSeen: string;
  filters: RadarFilters;
};

type SourceState = {
  status: "success" | "blocked" | "failed" | "waiting";
  label: string;
  checkedAt?: string | null;
};

const navigation = [
  { id: "overview" as const, label: "Обзор", icon: LayoutDashboard },
  { id: "radars" as const, label: "Радары", icon: SlidersHorizontal },
  { id: "vehicles" as const, label: "Автомобили", icon: CarFront },
  { id: "favorites" as const, label: "Избранное", icon: Bookmark },
  { id: "settings" as const, label: "Настройки", icon: Settings },
];

const viewCopy: Record<View, { title: string; description: string }> = {
  overview: {
    title: "Свежие автомобили",
    description: "Новые совпадения из всех активных радаров.",
  },
  radars: {
    title: "Мои радары",
    description: "Настройте, какие автомобили искать на площадках.",
  },
  vehicles: {
    title: "Все автомобили",
    description: "Общая лента объявлений, найденных вашими радарами.",
  },
  favorites: {
    title: "Избранное",
    description: "Автомобили, которые вы отложили для проверки.",
  },
  settings: {
    title: "Настройки",
    description: "Уведомления, площадки и параметры аккаунта.",
  },
};

function formatPrice(price: number) {
  return new Intl.NumberFormat("ru-RU").format(price) + " €";
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function relativeTime(value?: string | null) {
  if (!value) return "совпадений пока нет";
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const difference = Math.max(0, Date.now() - new Date(normalized).getTime());
  const minutes = Math.floor(difference / 60_000);
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин. назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч. назад`;
  return `${Math.floor(hours / 24)} дн. назад`;
}

export function CarPulseApp() {
  const [view, setView] = useState<View>("overview");
  const [radars, setRadars] = useState<Radar[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [favorites, setFavorites] = useState<number[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [telegramConnected, setTelegramConnected] = useState(false);
  const [toast, setToast] = useState("");
  const [sourceFilter, setSourceFilter] = useState("Все площадки");
  const [loading, setLoading] = useState(true);
  const [sourceStates, setSourceStates] = useState<Record<string, SourceState>>({
    Auto24: { status: "waiting", label: "Ожидает первой проверки" },
    "SS.lv": { status: "waiting", label: "Не подключена" },
    Nettiauto: { status: "waiting", label: "Не подключена" },
    "mobile.de": { status: "waiting", label: "Не подключена" },
  });

  useEffect(() => {
    let active = true;
    async function loadDashboard() {
      try {
        const response = await fetch("/api/dashboard");
        const payload = (await response.json()) as {
          error?: string;
          radars?: Array<{
            id: number;
            name: string;
            query: string;
            sources: string[];
            enabled: boolean;
            filters: RadarFilters;
            matches: number;
            lastMatchAt: string | null;
          }>;
          listings?: Array<{
            id: number;
            url: string;
            title: string;
            priceEur: number | null;
            year: number | null;
            mileageKm: number | null;
            fuel: string | null;
            transmission: string | null;
            location: string | null;
            imageUrl: string | null;
            source: string;
            matchedAt: string;
            radarName: string;
            powerKw: number | null;
          }>;
          telegram?: { connected?: number | boolean } | null;
          sources?: Record<
            string,
            {
              mode?: string;
              lastRun?: {
                status?: string;
                error_message?: string | null;
                finished_at?: string | null;
                started_at?: string | null;
              } | null;
            }
          >;
        };
        if (!response.ok) throw new Error(payload.error || "Не удалось загрузить данные");
        if (!active) return;
        setRadars(
          (payload.radars || []).map((radar) => ({
            id: radar.id,
            name: radar.name,
            query: radar.query,
            sources: radar.sources,
            matches: radar.matches,
            enabled: radar.enabled,
            filters: radar.filters || {},
            lastSeen: radar.lastMatchAt
              ? `совпадение ${relativeTime(radar.lastMatchAt)}`
              : "ожидает проверки",
          })),
        );
        setListings(
          (payload.listings || []).map((listing) => ({
            id: listing.id,
            url: listing.url,
            title: listing.title,
            price: listing.priceEur || 0,
            year: listing.year || 0,
            mileage: listing.mileageKm ? `${formatNumber(listing.mileageKm)} км` : "Пробег не указан",
            fuel: listing.fuel || "Топливо не указано",
            power: listing.powerKw ? `${listing.powerKw} кВт` : "Мощность не указана",
            transmission: listing.transmission || "Коробка не указана",
            location: listing.location || "Эстония",
            source: listing.source,
            age: relativeTime(listing.matchedAt),
            radar: listing.radarName,
            image: listing.imageUrl || "",
          })),
        );
        setTelegramConnected(Boolean(payload.telegram?.connected));
        const auto24Run = payload.sources?.Auto24?.lastRun;
        setSourceStates({
          Auto24: auto24Run
            ? {
                status:
                  auto24Run.status === "success"
                    ? "success"
                    : auto24Run.status === "blocked"
                      ? "blocked"
                      : "failed",
                label:
                  auto24Run.status === "success"
                    ? "Работает"
                    : auto24Run.status === "blocked"
                      ? "Остановлена защитой"
                      : "Ошибка проверки",
                checkedAt: auto24Run.finished_at || auto24Run.started_at,
              }
            : { status: "waiting", label: "Ожидает первой проверки" },
          "SS.lv": { status: "waiting", label: "Не подключена" },
          Nettiauto: { status: "waiting", label: "Не подключена" },
          "mobile.de": { status: "waiting", label: "Не подключена" },
        });
      } catch (error) {
        if (active) {
          setToast(error instanceof Error ? error.message : "Не удалось загрузить кабинет");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    loadDashboard();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const visibleListings = useMemo(() => {
    const sourceFiltered =
      sourceFilter === "Все площадки"
        ? listings
        : listings.filter((listing) => listing.source === sourceFilter);
    return view === "favorites"
      ? sourceFiltered.filter((listing) => favorites.includes(listing.id))
      : sourceFiltered;
  }, [favorites, listings, sourceFilter, view]);

  function changeView(nextView: View) {
    setView(nextView);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleFavorite(id: number) {
    setFavorites((current) =>
      current.includes(id)
        ? current.filter((listingId) => listingId !== id)
        : [...current, id],
    );
  }

  async function toggleRadar(id: number) {
    const currentRadar = radars.find((radar) => radar.id === id);
    if (!currentRadar) return;
    const enabled = !currentRadar.enabled;
    setRadars((current) =>
      current.map((radar) => (radar.id === id ? { ...radar, enabled } : radar)),
    );
    try {
      const response = await fetch("/api/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle_radar", id, enabled }),
      });
      if (!response.ok) throw new Error("Не удалось изменить радар");
    } catch {
      setRadars((current) =>
        current.map((radar) =>
          radar.id === id ? { ...radar, enabled: currentRadar.enabled } : radar,
        ),
      );
      setToast("Не удалось изменить радар. Попробуйте ещё раз.");
    }
  }

  async function createRadar(radar: Omit<Radar, "id" | "matches" | "lastSeen">) {
    try {
      const response = await fetch("/api/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_radar", radar }),
      });
      const payload = (await response.json()) as {
        error?: string;
        radar?: {
          id: number;
          name: string;
          query: string;
          sources: string[];
          enabled: boolean;
          filters: RadarFilters;
          matches: number;
        };
      };
      if (!response.ok || !payload.radar) {
        throw new Error(payload.error || "Не удалось создать радар");
      }
      setRadars((current) => [
        {
          ...payload.radar,
          matches: payload.radar.matches || 0,
          filters: payload.radar.filters || {},
          lastSeen: "ожидает ближайшей проверки",
        },
        ...current,
      ]);
      setModalOpen(false);
      setView("radars");
      setToast("Радар сохранён. Auto24 проверяется каждые 30 минут.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Не удалось создать радар");
    }
  }

  const copy = viewCopy[view];

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <div className="brand-row">
          <button
            className="brand"
            type="button"
            aria-label="Перейти на обзор"
            onClick={() => changeView("overview")}
          >
            <span className="brand-mark" aria-hidden="true">
              <Gauge size={23} strokeWidth={2.4} />
            </span>
            <span>CarPulse</span>
          </button>
          <button
            className="icon-button mobile-menu-close"
            onClick={() => setMenuOpen(false)}
            aria-label="Закрыть меню"
            type="button"
          >
            <X size={21} />
          </button>
        </div>

        <nav className="main-nav" aria-label="Основная навигация">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={`nav-item ${view === item.id ? "nav-item-active" : ""}`}
                onClick={() => changeView(item.id)}
              >
                <Icon size={20} />
                <span>{item.label}</span>
                {item.id === "radars" && <span className="nav-count">{radars.length}</span>}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-profile">
          <span className="avatar">АК</span>
          <span className="profile-copy">
            <strong>Артём К.</strong>
            <small>Тестовый аккаунт</small>
          </span>
          <MoreHorizontal size={19} />
        </div>
      </aside>

      {menuOpen && <button className="menu-backdrop" onClick={() => setMenuOpen(false)} aria-label="Закрыть меню" />}

      <main className="main-content">
        <header className="mobile-header">
          <button className="icon-button" onClick={() => setMenuOpen(true)} aria-label="Открыть меню" type="button">
            <Menu size={23} />
          </button>
          <button className="brand brand-mobile" type="button" onClick={() => changeView("overview")}>
            <span className="brand-mark"><Gauge size={20} /></span>
            <span>CarPulse</span>
          </button>
          <button className="icon-button notification-button" type="button" aria-label="Уведомления">
            <Bell size={21} />
            <span className="notification-dot" />
          </button>
        </header>

        <div className={`content-inner ${view === "overview" ? "overview-content" : ""}`}>
          {view !== "overview" && (
            <div className="page-heading">
              <div>
                <h1>{copy.title}</h1>
                <p>{copy.description}</p>
              </div>
              <div className="heading-actions">
                <button
                  className={`telegram-button ${telegramConnected ? "connected" : ""}`}
                  type="button"
                  onClick={() => setView("settings")}
                >
                  {telegramConnected ? <Check size={19} /> : <MessageCircle size={19} />}
                  {telegramConnected ? "Telegram подключён" : "Подключить Telegram"}
                </button>
                <button className="primary-button" type="button" onClick={() => setModalOpen(true)}>
                  <Plus size={19} />
                  Создать радар
                </button>
              </div>
            </div>
          )}

          {view === "overview" && (
            <Overview
              radars={radars}
              listings={visibleListings}
              favorites={favorites}
              sourceFilter={sourceFilter}
              setSourceFilter={setSourceFilter}
              onFavorite={toggleFavorite}
              onCreate={() => setModalOpen(true)}
              onViewRadars={() => changeView("radars")}
              loading={loading}
              sourceStates={sourceStates}
            />
          )}

          {view === "radars" && (
            <RadarsView radars={radars} onToggle={toggleRadar} onCreate={() => setModalOpen(true)} />
          )}

          {(view === "vehicles" || view === "favorites") && (
            <VehiclesView
              listings={visibleListings}
              favorites={favorites}
              sourceFilter={sourceFilter}
              setSourceFilter={setSourceFilter}
              onFavorite={toggleFavorite}
              emptyFavorites={view === "favorites" && visibleListings.length === 0}
              onShowAll={() => changeView("vehicles")}
            />
          )}

          {view === "settings" && (
            <SettingsView
              connected={telegramConnected}
              onConnect={() => {
                setTelegramConnected(true);
                setToast("Telegram подключён. Тестовое уведомление отправлено.");
              }}
              onDisconnect={() => {
                setTelegramConnected(false);
                setToast("Telegram отключён.");
              }}
            />
          )}
        </div>
      </main>

      {modalOpen && <RadarModal onClose={() => setModalOpen(false)} onCreate={createRadar} />}
      {toast && (
        <div className="toast" role="status">
          <Check size={19} />
          {toast}
        </div>
      )}
    </div>
  );
}

function Overview({
  radars,
  listings,
  favorites,
  sourceFilter,
  setSourceFilter,
  onFavorite,
  onCreate,
  onViewRadars,
  loading,
  sourceStates,
}: {
  radars: Radar[];
  listings: Listing[];
  favorites: number[];
  sourceFilter: string;
  setSourceFilter: (source: string) => void;
  onFavorite: (id: number) => void;
  onCreate: () => void;
  onViewRadars: () => void;
  loading: boolean;
  sourceStates: Record<string, SourceState>;
}) {
  return (
    <>
      <div className="dashboard-grid">
        <section className="feed-panel">
          <div className="section-heading">
            <div>
              <h2>Автомобили с ваших радаров</h2>
            </div>
            <SourceSelect value={sourceFilter} onChange={setSourceFilter} />
          </div>
          <div className="listing-stack">
            {loading ? (
              <div className="feed-empty compact">
                <RefreshCw size={24} className="loading-icon" />
                <strong>Загружаем автомобили</strong>
              </div>
            ) : listings.length ? (
              listings.slice(0, 4).map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  favorite={favorites.includes(listing.id)}
                  onFavorite={onFavorite}
                />
              ))
            ) : (
              <div className="feed-empty">
                <span><CarFront size={27} /></span>
                <h3>Совпадений пока нет</h3>
                <p>Создайте радар. Новые объявления Auto24 появятся здесь после ближайшей проверки.</p>
                <button className="primary-button" type="button" onClick={onCreate}>
                  <Plus size={18} /> Создать радар
                </button>
              </div>
            )}
          </div>
          {listings.length > 0 && (
            <button className="wide-secondary-button" type="button">
              Показать все автомобили
            </button>
          )}
        </section>

        <aside className="dashboard-aside">
          <section className="side-card">
            <div className="side-card-heading">
              <div>
                <p className="side-label">Ваши радары</p>
                <h2>{radars.filter((radar) => radar.enabled).length} работают сейчас</h2>
              </div>
              <button className="text-button" type="button" onClick={onViewRadars}>Все</button>
            </div>
            <div className="compact-radars">
              {radars.slice(0, 3).map((radar) => (
                <button className="compact-radar" key={radar.id} type="button" onClick={onViewRadars}>
                  <span className="radar-pulse"><span /></span>
                  <span className="compact-radar-copy">
                    <strong>{radar.name}</strong>
                    <small>{radar.sources.join(" · ")}</small>
                  </span>
                  <span className="match-count">{radar.matches}</span>
                </button>
              ))}
            </div>
            <button className="add-radar-button" type="button" onClick={onCreate}>
              <Plus size={18} /> Добавить радар
            </button>
          </section>

          <section className="telegram-card">
            <span className="telegram-icon"><Bot size={24} /></span>
            <div>
              <h3>Узнавайте о машинах сразу</h3>
              <p>Подключите Telegram — ссылка придёт, как только радар найдёт объявление.</p>
            </div>
            <button type="button">Подключить Telegram</button>
          </section>

          <section className="sources-card">
            <div className="source-health-heading">
              <h3>Состояние площадок</h3>
              <span><RefreshCw size={14} /> обновлено сейчас</span>
            </div>
            {["Auto24", "SS.lv", "Nettiauto", "mobile.de"].map((source) => (
              <div className="source-health" key={source}>
                <span className={`status-dot status-${sourceStates[source]?.status || "waiting"}`} />
                <strong>{source}</strong>
                <span>{sourceStates[source]?.label || "Не подключена"}</span>
              </div>
            ))}
          </section>
        </aside>
      </div>
    </>
  );
}

function VehiclesView({
  listings,
  favorites,
  sourceFilter,
  setSourceFilter,
  onFavorite,
  emptyFavorites,
  onShowAll,
}: {
  listings: Listing[];
  favorites: number[];
  sourceFilter: string;
  setSourceFilter: (source: string) => void;
  onFavorite: (id: number) => void;
  emptyFavorites: boolean;
  onShowAll: () => void;
}) {
  return (
    <section className="full-panel">
      <div className="toolbar">
        <div className="search-field">
          <Search size={19} />
          <input aria-label="Поиск по автомобилям" placeholder="Марка, модель или город" />
        </div>
        <SourceSelect value={sourceFilter} onChange={setSourceFilter} />
        <button className="secondary-button" type="button"><SlidersHorizontal size={18} /> Фильтры</button>
      </div>
      {emptyFavorites ? (
        <div className="empty-state">
          <span><Heart size={27} /></span>
          <h2>В избранном пока пусто</h2>
          <p>Сохраняйте интересные автомобили, чтобы быстро вернуться к ним позже.</p>
          <button className="primary-button" type="button" onClick={onShowAll}>Посмотреть автомобили</button>
        </div>
      ) : (
        <div className="listing-stack listing-stack-roomy">
          {listings.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              favorite={favorites.includes(listing.id)}
              onFavorite={onFavorite}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function RadarsView({ radars, onToggle, onCreate }: { radars: Radar[]; onToggle: (id: number) => void; onCreate: () => void }) {
  return (
    <section className="full-panel">
      <div className="radar-list-header">
        <div className="info-notice">
          <BellRing size={20} />
          <span><strong>Проверяем Auto24 каждые 30 минут.</strong> Новые совпадения сразу появятся в ленте.</span>
        </div>
        <span className="radar-limit">Использовано {radars.length} из 10</span>
      </div>
      <div className="radar-list">
        {radars.map((radar) => (
          <article className="radar-card" key={radar.id}>
            <div className="radar-card-main">
              <span className={`radar-state ${radar.enabled ? "active" : ""}`}><span /></span>
              <div>
                <div className="radar-title-row">
                  <h2>{radar.name}</h2>
                  <span className={radar.enabled ? "active-badge" : "paused-badge"}>{radar.enabled ? "Активен" : "На паузе"}</span>
                </div>
                <p>{radar.query}</p>
                <div className="source-pills">
                  {radar.sources.map((source) => <span key={source}>{source}</span>)}
                </div>
              </div>
            </div>
            <div className="radar-card-side">
              <div><strong>{radar.matches}</strong><small>новых сегодня</small></div>
              <span>{radar.lastSeen}</span>
              <label className="switch">
                <input type="checkbox" checked={radar.enabled} onChange={() => onToggle(radar.id)} aria-label={`${radar.enabled ? "Остановить" : "Запустить"} радар ${radar.name}`} />
                <span className="switch-track"><span /></span>
              </label>
              <button className="icon-button" type="button" aria-label={`Меню радара ${radar.name}`}><MoreHorizontal size={20} /></button>
            </div>
          </article>
        ))}
      </div>
      <button className="new-radar-card" type="button" onClick={onCreate}>
        <span><Plus size={22} /></span>
        <div><strong>Создать новый радар</strong><small>Добавьте марки, цены, пробег и нужные площадки</small></div>
      </button>
    </section>
  );
}

function SettingsView({ connected, onConnect, onDisconnect }: { connected: boolean; onConnect: () => void; onDisconnect: () => void }) {
  return (
    <div className="settings-grid">
      <section className="settings-card telegram-settings">
        <div className="settings-card-heading">
          <span className="settings-icon"><MessageCircle size={23} /></span>
          <div><h2>Уведомления в Telegram</h2><p>Получайте новые объявления сразу после обнаружения.</p></div>
        </div>
        {connected ? (
          <div className="connected-state">
            <span className="connected-check"><Check size={22} /></span>
            <div><strong>Telegram подключён</strong><p>Уведомления отправляются в чат @artjom_cars</p></div>
            <button className="danger-text-button" type="button" onClick={onDisconnect}>Отключить</button>
          </div>
        ) : (
          <div className="connect-flow">
            <div className="connect-step"><span>1</span><p>Откройте бота <strong>@CarPulseBot</strong> в Telegram</p></div>
            <div className="connect-step"><span>2</span><p>Отправьте ему одноразовый код</p></div>
            <div className="connection-code"><code>CP-4829</code><button type="button" onClick={onConnect}>Открыть Telegram</button></div>
            <p className="code-note">Код действует 15 минут. Для демо кнопка сразу подтверждает подключение.</p>
          </div>
        )}
      </section>

      <section className="settings-card">
        <div className="settings-card-heading">
          <span className="settings-icon neutral"><Clock3 size={23} /></span>
          <div><h2>Частота проверки</h2><p>Как часто обновлять объявления.</p></div>
        </div>
        <label className="field-label" htmlFor="frequency">Интервал</label>
        <div className="select-wrap"><select id="frequency" defaultValue="30" disabled><option value="30">Каждые 30 минут</option></select><ChevronDown size={18} /></div>
        <p className="setting-hint">В MVP интервал зафиксирован, чтобы не создавать лишнюю нагрузку на Auto24.</p>
      </section>

      <section className="settings-card settings-wide">
        <div className="settings-card-heading">
          <span className="settings-icon neutral"><CarFront size={23} /></span>
          <div><h2>Подключённые площадки</h2><p>Список источников, которые используются в радарах.</p></div>
        </div>
        <div className="platform-list">
          {["Auto24", "SS.lv", "Nettiauto", "mobile.de"].map((source) => (
            <div className="platform-row" key={source}><span className="platform-logo">{source.slice(0, 2).toUpperCase()}</span><div><strong>{source}</strong><small>{source === "Auto24" ? "Браузерная проверка · каждые 30 минут" : "Подключение запланировано"}</small></div><span className={source === "Auto24" ? "platform-ok" : "platform-pending"}>{source === "Auto24" ? <><Check size={16} /> Включена</> : "Не подключена"}</span></div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ListingCard({ listing, favorite, onFavorite }: { listing: Listing; favorite: boolean; onFavorite: (id: number) => void }) {
  return (
    <article className="listing-card">
      <div className="listing-image-wrap">
        {listing.image ? (
          <Image
            src={listing.image}
            alt={`${listing.title}, объявление ${listing.source}`}
            className="listing-image"
            fill
            sizes="(max-width: 640px) 124px, 196px"
            unoptimized
          />
        ) : (
          <span className="listing-image-placeholder"><CarFront size={32} /></span>
        )}
        <span className="source-badge">{listing.source}</span>
      </div>
      <div className="listing-body">
        <div className="listing-title-line">
          <div><h3>{listing.title}</h3><p className="listing-location"><MapPin size={15} /> {listing.location}</p></div>
          <div className="price-block"><strong>{listing.price ? formatPrice(listing.price) : "Цена не указана"}</strong>{listing.goodPrice && <span>Хорошая цена</span>}</div>
        </div>
        <div className="spec-list" aria-label="Характеристики">
          <span>{listing.year || "Год не указан"}</span><span>{listing.mileage}</span><span>{listing.fuel}</span><span>{listing.power}</span><span>{listing.transmission}</span>
        </div>
        <div className="listing-footer">
          <div><span className="fresh-dot" /><strong>{listing.age}</strong><span>Радар: {listing.radar}</span></div>
          <div className="listing-actions">
            <button className={`favorite-button ${favorite ? "is-favorite" : ""}`} type="button" onClick={() => onFavorite(listing.id)} aria-label={favorite ? "Убрать из избранного" : "Добавить в избранное"}><Heart size={19} fill={favorite ? "currentColor" : "none"} /></button>
            <a href={listing.url} target="_blank" rel="noreferrer">Открыть объявление <ExternalLink size={16} /></a>
          </div>
        </div>
      </div>
    </article>
  );
}

function SourceSelect({ value, onChange }: { value: string; onChange: (source: string) => void }) {
  return (
    <label className="source-select">
      <span className="sr-only">Фильтр по площадке</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option>Все площадки</option><option>Auto24</option><option>SS.lv</option><option>Nettiauto</option><option>mobile.de</option>
      </select>
      <ChevronDown size={17} />
    </label>
  );
}

function RadarModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (radar: Omit<Radar, "id" | "matches" | "lastSeen">) => void;
}) {
  const [step, setStep] = useState(1);
  const [sources, setSources] = useState(["Auto24"]);
  const [name, setName] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [filters, setFilters] = useState<RadarFilters>({});

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKeyDown);
    document.body.classList.add("modal-lock");
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("modal-lock");
    };
  }, [onClose]);

  function toggleSource(source: string) {
    setSources((current) => current.includes(source) ? current.filter((item) => item !== source) : [...current, source]);
  }

  function setNumberFilter(key: keyof RadarFilters, value: string) {
    const parsed = Number(value.replace(/\s/g, ""));
    setFilters((current) => ({
      ...current,
      [key]: value && Number.isFinite(parsed) ? parsed : undefined,
    }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = name.trim() || [make, model].filter(Boolean).join(" ") || "Новый радар";
    const radarFilters = {
      ...filters,
      make: make.trim() || undefined,
      model: model.trim() || undefined,
    };
    const queryParts = [
      [make, model].filter(Boolean).join(" ") || "Все марки",
      radarFilters.yearMin ? `от ${radarFilters.yearMin}` : "",
      radarFilters.priceMax ? `до ${formatNumber(radarFilters.priceMax)} €` : "",
      radarFilters.mileageMax ? `до ${formatNumber(radarFilters.mileageMax)} км` : "",
    ].filter(Boolean);
    onCreate({
      name: title,
      query: queryParts.join(" · "),
      sources: sources.length ? sources : ["Auto24"],
      enabled: true,
      filters: radarFilters,
    });
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="radar-modal" role="dialog" aria-modal="true" aria-labelledby="radar-modal-title">
        <header className="modal-header">
          <div><p>Новый радар · шаг {step} из 2</p><h2 id="radar-modal-title">{step === 1 ? "Что будем искать?" : "Где искать и как назвать?"}</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Закрыть"><X size={22} /></button>
        </header>
        <div className="step-bar"><span className="complete" /><span className={step === 2 ? "complete" : ""} /></div>
        <form onSubmit={submit}>
          {step === 1 ? (
            <div className="modal-content">
              <div className="form-grid">
                <Field label="Марка" htmlFor="make"><input id="make" name="make" list="makes" value={make} onChange={(event) => setMake(event.target.value)} placeholder="Например, BMW" /><datalist id="makes"><option value="BMW" /><option value="Mercedes-Benz" /><option value="Audi" /><option value="Volkswagen" /><option value="Volvo" /><option value="Toyota" /></datalist></Field>
                <Field label="Модель" htmlFor="model"><input id="model" name="model" value={model} onChange={(event) => setModel(event.target.value)} placeholder="Например, 5 Series" /></Field>
                <Field label="Цена от" htmlFor="priceMin"><div className="input-suffix"><input id="priceMin" name="priceMin" inputMode="numeric" value={filters.priceMin ?? ""} onChange={(event) => setNumberFilter("priceMin", event.target.value)} placeholder="10 000" /><span>€</span></div></Field>
                <Field label="Цена до" htmlFor="priceMax"><div className="input-suffix"><input id="priceMax" name="priceMax" inputMode="numeric" value={filters.priceMax ?? ""} onChange={(event) => setNumberFilter("priceMax", event.target.value)} placeholder="30 000" /><span>€</span></div></Field>
                <Field label="Год от" htmlFor="yearMin"><input id="yearMin" name="yearMin" inputMode="numeric" value={filters.yearMin ?? ""} onChange={(event) => setNumberFilter("yearMin", event.target.value)} placeholder="2018" /></Field>
                <Field label="Пробег до" htmlFor="mileageMax"><div className="input-suffix"><input id="mileageMax" name="mileageMax" inputMode="numeric" value={filters.mileageMax ?? ""} onChange={(event) => setNumberFilter("mileageMax", event.target.value)} placeholder="180 000" /><span>км</span></div></Field>
                <Field label="Топливо" htmlFor="fuel"><div className="select-wrap"><select id="fuel" name="fuel" value={filters.fuel ?? ""} onChange={(event) => setFilters((current) => ({ ...current, fuel: event.target.value || undefined }))}><option value="">Любое</option><option>Дизель</option><option>Бензин</option><option>Гибрид</option><option>Электро</option></select><ChevronDown size={18} /></div></Field>
                <Field label="Коробка передач" htmlFor="gearbox"><div className="select-wrap"><select id="gearbox" name="gearbox" value={filters.transmission ?? ""} onChange={(event) => setFilters((current) => ({ ...current, transmission: event.target.value || undefined }))}><option value="">Любая</option><option>Автомат</option><option>Механика</option></select><ChevronDown size={18} /></div></Field>
              </div>
              <button className="advanced-link" type="button"><Plus size={17} /> Добавить кузов, мощность и город</button>
            </div>
          ) : (
            <div className="modal-content">
              <Field label="Название радара" htmlFor="radarName" hint="Так он будет отображаться в кабинете и Telegram."><input id="radarName" name="radarName" value={name} onChange={(event) => setName(event.target.value)} placeholder={make ? `${make} ${model}`.trim() : "Например, BMW 5 до 30 000 €"} /></Field>
              <fieldset className="source-fieldset">
                <legend>Площадки</legend>
                <p>Выберите одну или несколько. Вписывать ссылки не нужно.</p>
                <div className="source-options">
                  {["Auto24", "SS.lv", "Nettiauto", "mobile.de"].map((source) => (
                    <label className={`source-option ${sources.includes(source) ? "selected" : ""}`} key={source}>
                      <input type="checkbox" checked={sources.includes(source)} onChange={() => toggleSource(source)} />
                      <span className="source-check">{sources.includes(source) && <Check size={16} />}</span>
                      <span><strong>{source}</strong><small>{source === "Auto24" ? "Эстония" : source === "SS.lv" ? "Латвия" : source === "Nettiauto" ? "Финляндия" : "Германия"}</small></span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="telegram-toggle"><span><Bell size={20} /><span><strong>Уведомлять в Telegram</strong><small>Когда Telegram будет подключён</small></span></span><input type="checkbox" defaultChecked /></label>
            </div>
          )}
          <footer className="modal-footer">
            <button className="secondary-button" type="button" onClick={step === 1 ? onClose : () => setStep(1)}>{step === 1 ? "Отмена" : "Назад"}</button>
            {step === 1 ? <button className="primary-button" type="button" onClick={() => setStep(2)}>Продолжить</button> : <button className="primary-button" type="submit" disabled={!sources.length}>Создать радар</button>}
          </footer>
        </form>
      </section>
    </div>
  );
}

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }) {
  return <label className="field" htmlFor={htmlFor}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}
