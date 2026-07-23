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
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import Image from "next/image";
import { FormEvent, useEffect, useMemo, useState } from "react";

type View = "overview" | "radars" | "vehicles" | "favorites" | "settings";

type Listing = {
  id: number;
  radarId: number;
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
  catalogMakeId?: string;
  catalogModelId?: string;
  make?: string;
  model?: string;
  priceMin?: number;
  priceMax?: number;
  yearMin?: number;
  yearMax?: number;
  mileageMin?: number;
  mileageMax?: number;
  powerMin?: number;
  powerMax?: number;
  fuel?: string;
  transmission?: string;
  bodyType?: string;
  drivetrain?: string;
  location?: string;
};

type CatalogOption = {
  id: string;
  name: string;
};

type FilterOption = {
  value: string;
  label: string;
};

type CatalogFilters = {
  fuels: FilterOption[];
  transmissions: FilterOption[];
  bodyTypes: FilterOption[];
  drivetrains: FilterOption[];
  locations: FilterOption[];
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
  detail?: string | null;
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
  const [editingRadar, setEditingRadar] = useState<Radar | null>(null);
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
            radarId: number;
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
            radarId: listing.radarId,
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
                      ? "Защита не пропустила"
                      : auto24Run.error_message?.startsWith(
                            "EXTERNAL_COLLECTOR_STALE:",
                          )
                        ? "Сборщик не отвечает"
                      : "Ошибка проверки",
                checkedAt: auto24Run.finished_at || auto24Run.started_at,
                detail: auto24Run.error_message,
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

  function openCreateRadar() {
    setEditingRadar(null);
    setModalOpen(true);
  }

  function openEditRadar(radar: Radar) {
    setEditingRadar(radar);
    setModalOpen(true);
  }

  function closeRadarModal() {
    setModalOpen(false);
    setEditingRadar(null);
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
      const createdRadar = payload.radar;
      setRadars((current) => [
        {
          ...createdRadar,
          matches: createdRadar.matches || 0,
          filters: createdRadar.filters || {},
          lastSeen: "ожидает ближайшей проверки",
        },
        ...current,
      ]);
      closeRadarModal();
      setView("radars");
      setToast("Радар сохранён. Настройки уже действуют.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Не удалось создать радар");
    }
  }

  async function updateRadar(
    radar: Omit<Radar, "id" | "matches" | "lastSeen">,
  ) {
    if (!editingRadar) return;
    const previousRadar = editingRadar;
    const updatedRadar = { ...previousRadar, ...radar };

    setRadars((current) =>
      current.map((item) => (item.id === previousRadar.id ? updatedRadar : item)),
    );
    setListings((current) =>
      current.map((listing) =>
        listing.radarId === previousRadar.id
          ? { ...listing, radar: updatedRadar.name }
          : listing,
      ),
    );
    closeRadarModal();

    try {
      const response = await fetch("/api/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_radar",
          radar: { ...radar, id: previousRadar.id },
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Не удалось сохранить изменения");
      }
      setToast("Радар изменён. Новые настройки уже действуют.");
    } catch (error) {
      setRadars((current) =>
        current.map((item) => (item.id === previousRadar.id ? previousRadar : item)),
      );
      setListings((current) =>
        current.map((listing) =>
          listing.radarId === previousRadar.id
            ? { ...listing, radar: previousRadar.name }
            : listing,
        ),
      );
      setToast(
        error instanceof Error ? error.message : "Не удалось сохранить изменения",
      );
    }
  }

  async function deleteRadar(id: number) {
    const index = radars.findIndex((radar) => radar.id === id);
    if (index < 0) return;
    const removedRadar = radars[index];
    const removedListings = listings.filter((listing) => listing.radarId === id);

    setRadars((current) => current.filter((radar) => radar.id !== id));
    setListings((current) => current.filter((listing) => listing.radarId !== id));

    try {
      const response = await fetch("/api/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_radar", id }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Не удалось удалить радар");
      }
      setToast(`Радар «${removedRadar.name}» удалён.`);
    } catch (error) {
      setRadars((current) => {
        const restored = [...current];
        restored.splice(Math.min(index, restored.length), 0, removedRadar);
        return restored;
      });
      setListings((current) => [...removedListings, ...current]);
      setToast(error instanceof Error ? error.message : "Не удалось удалить радар");
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
                <button className="primary-button" type="button" onClick={openCreateRadar}>
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
              onCreate={openCreateRadar}
              onViewRadars={() => changeView("radars")}
              loading={loading}
              sourceStates={sourceStates}
            />
          )}

          {view === "radars" && (
            <RadarsView
              radars={radars}
              onToggle={toggleRadar}
              onCreate={openCreateRadar}
              onEdit={openEditRadar}
              onDelete={deleteRadar}
            />
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

      {modalOpen && (
        <RadarModal
          initialRadar={editingRadar}
          onClose={closeRadarModal}
          onSave={editingRadar ? updateRadar : createRadar}
        />
      )}
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
  const auto24State = sourceStates.Auto24;
  const sourceCheckedLabel = auto24State?.checkedAt
    ? `проверено ${relativeTime(auto24State.checkedAt)}`
    : "ещё не проверено";

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
              <span><RefreshCw size={14} /> {sourceCheckedLabel}</span>
            </div>
            {["Auto24", "SS.lv", "Nettiauto", "mobile.de"].map((source) => (
              <div className="source-health" key={source}>
                <span className={`status-dot status-${sourceStates[source]?.status || "waiting"}`} />
                <strong>{source}</strong>
                <span>{sourceStates[source]?.label || "Не подключена"}</span>
              </div>
            ))}
            {(auto24State?.status === "blocked" || auto24State?.status === "failed") && (
              <p className="source-health-note">
                {auto24State.detail
                  ?.replace(/^AUTO24_BLOCKED:\s*/, "")
                  .replace(/^EXTERNAL_COLLECTOR_STALE:\s*/, "") ||
                  "Последняя проверка Auto24 не завершилась. Остальные площадки продолжают работать."}
              </p>
            )}
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

function RadarsView({
  radars,
  onToggle,
  onCreate,
  onEdit,
  onDelete,
}: {
  radars: Radar[];
  onToggle: (id: number) => void;
  onCreate: () => void;
  onEdit: (radar: Radar) => void;
  onDelete: (id: number) => void | Promise<void>;
}) {
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  function closeMenu() {
    setOpenMenuId(null);
    setConfirmDeleteId(null);
  }

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
              <div
                className="radar-menu-wrap"
                onBlur={(event) => {
                  if (
                    !event.currentTarget.contains(
                      event.relatedTarget as Node | null,
                    )
                  ) {
                    closeMenu();
                  }
                }}
              >
                <button
                  className="icon-button"
                  type="button"
                  aria-label={`Меню радара ${radar.name}`}
                  aria-haspopup="menu"
                  aria-expanded={openMenuId === radar.id}
                  onClick={() => {
                    setConfirmDeleteId(null);
                    setOpenMenuId((current) => (current === radar.id ? null : radar.id));
                  }}
                >
                  <MoreHorizontal size={20} />
                </button>
                {openMenuId === radar.id && (
                  <div className="radar-menu" role="menu">
                    {confirmDeleteId === radar.id ? (
                      <div className="radar-menu-confirm">
                        <strong>Удалить радар?</strong>
                        <span>Совпадения этого радара исчезнут из ленты.</span>
                        <div>
                          <button type="button" onClick={() => setConfirmDeleteId(null)}>
                            Отмена
                          </button>
                          <button
                            className="radar-menu-delete-confirm"
                            type="button"
                            onClick={() => {
                              closeMenu();
                              void onDelete(radar.id);
                            }}
                          >
                            Удалить
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            closeMenu();
                            onEdit(radar);
                          }}
                        >
                          <Pencil size={17} />
                          Изменить
                        </button>
                        <button
                          className="radar-menu-danger"
                          type="button"
                          role="menuitem"
                          onClick={() => setConfirmDeleteId(radar.id)}
                        >
                          <Trash2 size={17} />
                          Удалить
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
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
  initialRadar,
  onClose,
  onSave,
}: {
  initialRadar: Radar | null;
  onClose: () => void;
  onSave: (radar: Omit<Radar, "id" | "matches" | "lastSeen">) => void;
}) {
  const [step, setStep] = useState(1);
  const [sources, setSources] = useState(initialRadar?.sources || ["Auto24"]);
  const [name, setName] = useState(initialRadar?.name || "");
  const [makeId, setMakeId] = useState(initialRadar?.filters.catalogMakeId || "");
  const [make, setMake] = useState(initialRadar?.filters.make || "");
  const [modelId, setModelId] = useState(initialRadar?.filters.catalogModelId || "");
  const [model, setModel] = useState(initialRadar?.filters.model || "");
  const [filters, setFilters] = useState<RadarFilters>(initialRadar?.filters || {});
  const [makes, setMakes] = useState<CatalogOption[]>([]);
  const [models, setModels] = useState<CatalogOption[]>([]);
  const [filterOptions, setFilterOptions] = useState<CatalogFilters>({
    fuels: [],
    transmissions: [],
    bodyTypes: [],
    drivetrains: [],
    locations: [],
  });
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [catalogError, setCatalogError] = useState("");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKeyDown);
    document.body.classList.add("modal-lock");
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("modal-lock");
    };
  }, [onClose]);

  useEffect(() => {
    let active = true;
    async function loadMakes() {
      setCatalogLoading(true);
      setCatalogError("");
      try {
        const response = await fetch(
          `/api/catalog?sources=${encodeURIComponent(sources.join(","))}`,
        );
        const payload = (await response.json()) as {
          error?: string;
          makes?: CatalogOption[];
          filters?: CatalogFilters;
        };
        if (!response.ok) throw new Error(payload.error || "Не удалось загрузить марки");
        if (!active) return;
        const nextMakes = payload.makes || [];
        setMakes(nextMakes);
        if (payload.filters) setFilterOptions(payload.filters);
        if (makeId && !nextMakes.some((item) => item.id === makeId)) {
          setMakeId("");
          setMake("");
          setModelId("");
          setModel("");
        }
      } catch (error) {
        if (active) {
          setCatalogError(error instanceof Error ? error.message : "Каталог недоступен");
        }
      } finally {
        if (active) setCatalogLoading(false);
      }
    }
    loadMakes();
    return () => {
      active = false;
    };
  }, [sources, makeId]);

  useEffect(() => {
    let active = true;
    async function loadModels() {
      if (!makeId || !sources.length) {
        setModels([]);
        return;
      }
      setModelsLoading(true);
      setCatalogError("");
      try {
        const response = await fetch(
          `/api/catalog?make=${encodeURIComponent(makeId)}&sources=${encodeURIComponent(sources.join(","))}`,
        );
        const payload = (await response.json()) as {
          error?: string;
          models?: CatalogOption[];
        };
        if (!response.ok) throw new Error(payload.error || "Не удалось загрузить модели");
        if (!active) return;
        const nextModels = payload.models || [];
        setModels(nextModels);
        if (modelId && !nextModels.some((item) => item.id === modelId)) {
          setModelId("");
          setModel("");
        }
      } catch (error) {
        if (active) {
          setModels([]);
          setCatalogError(error instanceof Error ? error.message : "Модели недоступны");
        }
      } finally {
        if (active) setModelsLoading(false);
      }
    }
    loadModels();
    return () => {
      active = false;
    };
  }, [makeId, modelId, sources]);

  function toggleSource(source: string) {
    setSources((current) => {
      if (!current.includes(source)) return [...current, source];
      return current.length === 1 ? current : current.filter((item) => item !== source);
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = name.trim() || [make, model].filter(Boolean).join(" ") || "Новый радар";
    const radarFilters = {
      ...filters,
      catalogMakeId: makeId || undefined,
      catalogModelId: modelId || undefined,
      make: make || undefined,
      model: model || undefined,
    };
    const queryParts = [
      [make, model].filter(Boolean).join(" ") || "Все марки",
      radarFilters.yearMin || radarFilters.yearMax
        ? `${radarFilters.yearMin || "…"}–${radarFilters.yearMax || "…"} г.`
        : "",
      radarFilters.priceMin || radarFilters.priceMax
        ? `${radarFilters.priceMin ? formatNumber(radarFilters.priceMin) : "0"}–${radarFilters.priceMax ? formatNumber(radarFilters.priceMax) : "…"} €`
        : "",
      radarFilters.mileageMin || radarFilters.mileageMax
        ? `${radarFilters.mileageMin ? formatNumber(radarFilters.mileageMin) : "0"}–${radarFilters.mileageMax ? formatNumber(radarFilters.mileageMax) : "…"} км`
        : "",
    ].filter(Boolean);
    onSave({
      name: title,
      query: queryParts.join(" · "),
      sources: sources.length ? sources : ["Auto24"],
      enabled: initialRadar?.enabled ?? true,
      filters: radarFilters,
    });
  }

  const rangeInvalid =
    (filters.priceMin != null && filters.priceMax != null && filters.priceMin > filters.priceMax) ||
    (filters.yearMin != null && filters.yearMax != null && filters.yearMin > filters.yearMax) ||
    (filters.mileageMin != null && filters.mileageMax != null && filters.mileageMin > filters.mileageMax) ||
    (filters.powerMin != null && filters.powerMax != null && filters.powerMin > filters.powerMax);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="radar-modal" role="dialog" aria-modal="true" aria-labelledby="radar-modal-title">
        <header className="modal-header">
          <div>
            <p>{initialRadar ? "Изменение радара" : "Новый радар"} · шаг {step} из 3</p>
            <h2 id="radar-modal-title">
              {step === 1
                ? "Площадки и автомобиль"
                : step === 2
                  ? "Диапазоны поиска"
                  : "Дополнительные параметры"}
            </h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Закрыть"><X size={22} /></button>
        </header>
        <div className="step-bar">
          <span className="complete" />
          <span className={step >= 2 ? "complete" : ""} />
          <span className={step >= 3 ? "complete" : ""} />
        </div>
        <form onSubmit={submit}>
          {step === 1 ? (
            <div className="modal-content">
              <fieldset className="source-fieldset">
                <legend>Площадки</legend>
                <p>Каталог марки и модели обновится под выбранные источники.</p>
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
              <div className="form-grid catalog-fields">
                <Field label="Марка" htmlFor="make" hint={catalogLoading ? "Загружаем каталог…" : `${makes.length} марок в выбранных площадках`}>
                  <div className="select-wrap">
                    <select
                      id="make"
                      name="make"
                      value={makeId}
                      disabled={!sources.length || catalogLoading}
                      onChange={(event) => {
                        const selected = makes.find((item) => item.id === event.target.value);
                        setMakeId(selected?.id || "");
                        setMake(selected?.name || "");
                        setModelId("");
                        setModel("");
                      }}
                    >
                      <option value="">Любая марка</option>
                      {makes.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
                    </select>
                    <ChevronDown size={18} />
                  </div>
                </Field>
                <Field label="Модель" htmlFor="model" hint={makeId ? (modelsLoading ? "Загружаем модели…" : `${models.length} вариантов`) : "Сначала выберите марку"}>
                  <div className="select-wrap">
                    <select
                      id="model"
                      name="model"
                      value={modelId}
                      disabled={!makeId || modelsLoading}
                      onChange={(event) => {
                        const selected = models.find((item) => item.id === event.target.value);
                        setModelId(selected?.id || "");
                        setModel(selected?.name || "");
                      }}
                    >
                      <option value="">Любая модель</option>
                      {models.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
                    </select>
                    <ChevronDown size={18} />
                  </div>
                </Field>
              </div>
              {catalogError && <p className="form-error" role="alert">{catalogError}</p>}
              <p className="catalog-note">
                Марка и модель выбираются только из каталога. Ссылки и названия вручную вводить не нужно.
              </p>
            </div>
          ) : step === 2 ? (
            <div className="modal-content range-grid">
              <RangeFilter
                label="Цена"
                min={0}
                max={200000}
                step={500}
                minValue={filters.priceMin}
                maxValue={filters.priceMax}
                onMinChange={(value) => setFilters((current) => ({ ...current, priceMin: value }))}
                onMaxChange={(value) => setFilters((current) => ({ ...current, priceMax: value }))}
                suffix="€"
                format={formatNumber}
              />
              <RangeFilter
                label="Год выпуска"
                min={1980}
                max={new Date().getFullYear() + 1}
                step={1}
                minValue={filters.yearMin}
                maxValue={filters.yearMax}
                onMinChange={(value) => setFilters((current) => ({ ...current, yearMin: value }))}
                onMaxChange={(value) => setFilters((current) => ({ ...current, yearMax: value }))}
                format={String}
              />
              <RangeFilter
                label="Пробег"
                min={0}
                max={500000}
                step={5000}
                minValue={filters.mileageMin}
                maxValue={filters.mileageMax}
                onMinChange={(value) => setFilters((current) => ({ ...current, mileageMin: value }))}
                onMaxChange={(value) => setFilters((current) => ({ ...current, mileageMax: value }))}
                suffix="км"
                format={formatNumber}
              />
              <RangeFilter
                label="Мощность"
                min={0}
                max={500}
                step={5}
                minValue={filters.powerMin}
                maxValue={filters.powerMax}
                onMinChange={(value) => setFilters((current) => ({ ...current, powerMin: value }))}
                onMaxChange={(value) => setFilters((current) => ({ ...current, powerMax: value }))}
                suffix="кВт"
                format={formatNumber}
              />
              {rangeInvalid && <p className="form-error range-error" role="alert">Значение «от» не может быть больше значения «до».</p>}
            </div>
          ) : (
            <div className="modal-content">
              <div className="form-grid">
                <OptionField id="fuel" label="Топливо" emptyLabel="Любое" value={filters.fuel} options={filterOptions.fuels} onChange={(value) => setFilters((current) => ({ ...current, fuel: value }))} />
                <OptionField id="gearbox" label="Коробка передач" emptyLabel="Любая" value={filters.transmission} options={filterOptions.transmissions} onChange={(value) => setFilters((current) => ({ ...current, transmission: value }))} />
                <OptionField id="bodyType" label="Кузов" emptyLabel="Любой" value={filters.bodyType} options={filterOptions.bodyTypes} onChange={(value) => setFilters((current) => ({ ...current, bodyType: value }))} />
                <OptionField id="drivetrain" label="Привод" emptyLabel="Любой" value={filters.drivetrain} options={filterOptions.drivetrains} onChange={(value) => setFilters((current) => ({ ...current, drivetrain: value }))} />
                <OptionField id="location" label="Город или регион" emptyLabel="Неважно" value={filters.location} options={filterOptions.locations} onChange={(value) => setFilters((current) => ({ ...current, location: value }))} />
                <Field label="Название радара" htmlFor="radarName" hint="Будет видно в кабинете и Telegram.">
                  <input id="radarName" name="radarName" value={name} onChange={(event) => setName(event.target.value)} placeholder={make ? `${make} ${model}`.trim() : "Например, авто до 30 000 €"} />
                </Field>
              </div>
              <label className="telegram-toggle"><span><Bell size={20} /><span><strong>Уведомлять в Telegram</strong><small>Когда Telegram будет подключён</small></span></span><input type="checkbox" defaultChecked /></label>
            </div>
          )}
          <footer className="modal-footer">
            <button className="secondary-button" type="button" onClick={step === 1 ? onClose : () => setStep((current) => current - 1)}>{step === 1 ? "Отмена" : "Назад"}</button>
            {step < 3 ? (
              <button className="primary-button" type="button" onClick={() => setStep((current) => current + 1)} disabled={!sources.length || catalogLoading || rangeInvalid}>Продолжить</button>
            ) : (
              <button className="primary-button" type="submit" disabled={!sources.length || rangeInvalid}>
                {initialRadar ? "Сохранить изменения" : "Создать радар"}
              </button>
            )}
          </footer>
        </form>
      </section>
    </div>
  );
}

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }) {
  return <label className="field" htmlFor={htmlFor}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function OptionField({
  id,
  label,
  emptyLabel,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  emptyLabel: string;
  value?: string;
  options: FilterOption[];
  onChange: (value?: string) => void;
}) {
  return (
    <Field label={label} htmlFor={id}>
      <div className="select-wrap">
        <select id={id} value={value || ""} onChange={(event) => onChange(event.target.value || undefined)}>
          <option value="">{emptyLabel}</option>
          {options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
        </select>
        <ChevronDown size={18} />
      </div>
    </Field>
  );
}

function RangeFilter({
  label,
  min,
  max,
  step,
  minValue,
  maxValue,
  onMinChange,
  onMaxChange,
  suffix,
  format,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  minValue?: number;
  maxValue?: number;
  onMinChange: (value?: number) => void;
  onMaxChange: (value?: number) => void;
  suffix?: string;
  format: (value: number) => string;
}) {
  const lower = minValue ?? min;
  const upper = maxValue ?? max;
  const lowerPercent = ((lower - min) / (max - min)) * 100;
  const upperPercent = ((upper - min) / (max - min)) * 100;

  function parse(value: string) {
    if (!value.trim()) return undefined;
    const parsed = Number(value.replace(/\s/g, ""));
    return Number.isFinite(parsed) ? Math.round(parsed) : undefined;
  }

  return (
    <fieldset className="range-filter">
      <legend>{label}</legend>
      <div className="range-number-row">
        <label>
          <span>От</span>
          <div className="input-suffix">
            <input
              type="number"
              inputMode="numeric"
              min={min}
              max={max}
              step={step}
              value={minValue ?? ""}
              onChange={(event) => onMinChange(parse(event.target.value))}
              placeholder={format(min)}
              aria-label={`${label}, от`}
            />
            {suffix && <span>{suffix}</span>}
          </div>
        </label>
        <label>
          <span>До</span>
          <div className="input-suffix">
            <input
              type="number"
              inputMode="numeric"
              min={min}
              max={max}
              step={step}
              value={maxValue ?? ""}
              onChange={(event) => onMaxChange(parse(event.target.value))}
              placeholder={format(max)}
              aria-label={`${label}, до`}
            />
            {suffix && <span>{suffix}</span>}
          </div>
        </label>
      </div>
      <div
        className="dual-range"
        style={{
          "--range-start": `${lowerPercent}%`,
          "--range-end": `${upperPercent}%`,
        } as React.CSSProperties}
      >
        <span className="dual-range-track" />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={lower}
          aria-label={`${label}, нижняя граница`}
          onChange={(event) => onMinChange(Math.min(Number(event.target.value), upper))}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={upper}
          aria-label={`${label}, верхняя граница`}
          onChange={(event) => onMaxChange(Math.max(Number(event.target.value), lower))}
        />
      </div>
    </fieldset>
  );
}
