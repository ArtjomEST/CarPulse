# CarPulse

> Handoff-документ для следующего агента. Обновлён 24 июля 2026 года после
> реализации собственных аккаунтов, админ-панели, изоляции пользовательских
> данных и Telegram-бота.
> Не добавляйте сюда реальные секреты, пароли, bypass-токены или SSH-ключи.

CarPulse — MVP сервиса мониторинга автомобильных площадок. Пользователь создаёт
«радар» с фильтрами автомобиля, сервис каждые 30 минут проверяет источники,
сохраняет объявления и показывает новые совпадения в личной ленте.

## Самое важное перед продолжением

- Локальный проект: `/Users/artjom/Documents/CarPulse`.
- GitHub: `https://github.com/ArtjomEST/CarPulse`, ветка `main`.
- Production: <https://carpulse-mvp.artjomkaest.chatgpt.site>.
- Sites project ID уже существует:
  `appgprj_6a61236d2d54819195ec1a824fb7d2e0`.
- Конфигурация Sites находится в [`.openai/hosting.json`](.openai/hosting.json).
  Новый Sites-проект создавать нельзя — всегда использовать существующий ID.
- Последняя production-версия до rollout аккаунтов: **13**,
  commit `cbbfa2b284c25453e51b812fcd85ce2bf55886aa`.
- Production-сайт пока закрыт в режиме `custom`, разрешён только владелец.
  Внутри приложения уже есть собственная авторизация CarPulse. Закрытый режим
  нужен один раз: владелец задаёт пароль первого администратора в браузере, после
  чего сайт можно переключить в public для регистрации с телефона.
- Production D1 и локальная D1 — разные базы. Локальные радары и объявления
  автоматически в production не появляются.
- Production уже переключён на `AUTO24_MODE=external`.
- Постоянный VPS-сборщик ещё не установлен. Пока localhost запущен со специальными
  переменными окружения, он может временно передавать результаты в production.
  После выключения Mac эта временная схема перестаёт работать.
- Cloudflare Browser Binding на Sites production отсутствует. Попытка production
  Browser Run завершилась ошибкой:
  `Cannot read properties of undefined (reading 'fetch')`.
  Поэтому возвращать production в режим `browser` нельзя.

## Текущее состояние production

Снимок состояния на 24 июля 2026 года:

- 3 конфигурации радаров были перенесены из localhost в production;
- в production успешно передано 16 уникальных объявлений Auto24;
- внешний запуск записан как `success`;
- объявления в общей ленте дедуплицированы по ID;
- одна машина, совпавшая с несколькими радарами, показывается одной карточкой;
- внутри такой карточки перечисляются все радары, которые её нашли;
- runtime environment revision на момент последнего деплоя: `2`;
- настроенные production-ключи:
  - `AUTO24_MODE=external`;
  - `AUTO24_COLLECTOR_SECRET` — secret;
  - `AUTO24_SYNC_SECRET` — secret.
- `TELEGRAM_BOT_TOKEN` добавлен как Sites runtime secret;
- токен BotFather нельзя хранить в Git, README, логах или клиентском bundle.

Значения секретов через README, Git, логи или ответы пользователю не раскрывать.
Перед изменением environment сначала читать текущие ключи через Sites и
обновлять только нужные.

## Стек

- Next.js 16 + React 19;
- Vinext + Vite;
- Cloudflare Worker runtime;
- Cloudflare D1;
- Sites для приватного production;
- `@cloudflare/puppeteer` для локального Browser Binding;
- отдельный `puppeteer-core` + Chromium collector для VPS;
- Docker Compose для постоянного внешнего сборщика.

## Основные файлы

- [`app/CarPulseApp.tsx`](app/CarPulseApp.tsx) — весь текущий кабинет и клиентская
  логика.
- [`app/CarPulseRoot.tsx`](app/CarPulseRoot.tsx) — bootstrap сессии и переключение
  между авторизацией и кабинетом.
- [`app/AuthScreen.tsx`](app/AuthScreen.tsx) — вход, регистрация и безопасное
  создание первого администратора.
- [`app/AdminUsersView.tsx`](app/AdminUsersView.tsx) — управление пользователями.
- [`app/SettingsPanels.tsx`](app/SettingsPanels.tsx) — пароль и Telegram.
- [`lib/auth.ts`](lib/auth.ts) — password hashing, сессии, rate limit и
  server-side role checks.
- [`lib/telegram.ts`](lib/telegram.ts) — Bot API, webhook и доставка уведомлений.
- [`app/api/dashboard/route.ts`](app/api/dashboard/route.ts) — загрузка кабинета,
  создание, изменение, включение и удаление радаров.
- [`app/api/catalog/route.ts`](app/api/catalog/route.ts) — каталог марок, моделей
  и доступных фильтров.
- [`app/api/sources/auto24/sync/route.ts`](app/api/sources/auto24/sync/route.ts) —
  ручной Browser Run. Работает локально, но не работает на Sites без `BROWSER`.
- [`app/api/sources/auto24/collector/route.ts`](app/api/sources/auto24/collector/route.ts) —
  закрытый API внешнего сборщика.
- [`lib/sources/collect-auto24.ts`](lib/sources/collect-auto24.ts) — Auto24 fetch,
  ingest, matching, source runs и контроль свежести внешнего сборщика.
- [`lib/sources/matching.ts`](lib/sources/matching.ts) — проверка объявления по
  фильтрам радара.
- [`lib/vehicle-filters.ts`](lib/vehicle-filters.ts) — соответствие фильтров
  CarPulse параметрам Auto24.
- [`db/ensure-schema.ts`](db/ensure-schema.ts) — фактическое создание таблиц D1.
- [`db/schema.ts`](db/schema.ts) — Drizzle-схема.
- [`worker/index.ts`](worker/index.ts) — HTTP Worker и `scheduled()` handler.
- [`vite.config.ts`](vite.config.ts) — bindings и cron `*/30 * * * *`.
- [`scripts/dev.mjs`](scripts/dev.mjs) — общий локальный запуск сервера и cron.
- [`scripts/dev-cron.mjs`](scripts/dev-cron.mjs) — локальный планировщик и
  опциональный bridge в production.
- [`collector/`](collector) — постоянный VPS collector.
- [`collector/README.md`](collector/README.md) — инструкция контейнера.

## Архитектура данных

Постоянная production-схема:

```text
Браузер
  → registration/login
  → HttpOnly session cookie
  → users + sessions
  → все пользовательские запросы фильтруются по session user_id

Linux VPS со статическим IPv4
  → Chromium с постоянным профилем
  → Auto24
  → POST /api/sources/auto24/collector
  → D1 listings
  → D1 radar_matches
  → D1 notification_deliveries
  → Telegram Bot API

Cloudflare cron */30
  → при AUTO24_MODE=external не собирает Auto24
  → проверяет, что внешний collector присылал результат не более 50 минут назад
  → повторяет ожидающие/неудачные Telegram delivery
```

Временная development-схема:

```text
npm run dev
  → Vinext localhost:3000
  → scripts/dev-cron.mjs
  → /cdn-cgi/handler/scheduled в :00 и :30
  → локальный Browser Binding
  → локальная D1
  → при наличии bridge-секретов результат отправляется в production
```

Локальный процесс и Mac нельзя считать production-инфраструктурой: система может
уснуть, процесс может быть остановлен, а таймер — задержаться. Для автономной
работы обязателен VPS.

## Что уже реализовано

### Радары

- создание радара в трёх шагах;
- выбор площадок;
- каталог марок и зависимый список моделей;
- цена, год, пробег и мощность;
- топливо, коробка, кузов, привод и регион;
- сохранение фильтров в D1;
- включение и пауза;
- изменение через меню `…`;
- удаление через меню `…` с подтверждением;
- optimistic UI с восстановлением состояния при ошибке;
- максимум 10 радаров на пользователя;
- изменения вступают в силу для следующего запуска collector.

### Лента

- объявления загружаются из D1;
- кабинет обновляется каждые 30 секунд;
- обновление также происходит при возврате фокуса и открытии вкладки;
- кнопка «Показать все автомобили» переводит в общую ленту;
- источник можно фильтровать;
- одинаковое объявление не дублируется, если совпало с несколькими радарами;
- карточка хранит массив `{ id, name }` совпавших радаров;
- избранное хранится в `user_favorites` отдельно для каждого аккаунта.

### Аккаунты и админка

- регистрация по имени, email и паролю;
- login/logout и смена собственного пароля;
- password hash: PBKDF2-HMAC-SHA256, индивидуальная salt, суммарно 600 000
  итераций в шести последовательных runtime-совместимых раундах по 100 000;
- случайный session token хранится в браузере как `Secure`, `HttpOnly`,
  `SameSite=Lax` cookie, а в D1 — только его SHA-256 hash;
- ограничение неудачных входов: 5 попыток за 15 минут для пары IP + email;
- роли `user` и `admin`, статусы `active` и `blocked`;
- server-side проверка admin для каждого административного API;
- админ видит пункт «Пользователи», создаёт, редактирует, блокирует, меняет
  пароль и удаляет аккаунты;
- нельзя заблокировать/понизить/удалить себя или убрать последнего активного
  администратора;
- блокировка, смена пароля и удаление инвалидируют сессии пользователя;
- радары, совпадения, избранное и Telegram изолированы по `user_id`;
- legacy-данные владельца привязываются при создании первого администратора.

### Telegram

- подключение отдельного Telegram-чата к каждому аккаунту;
- одноразовый код формата `CP_XXXXXXXX`, в D1 хранится только SHA-256 hash;
- код действует 15 минут и аннулируется после использования;
- `/start <код>` связывает чат с аккаунтом, `/stop` отключает;
- один чат нельзя подключить к двум аккаунтам;
- webhook проверяет `X-Telegram-Bot-Api-Secret-Token`;
- из настроек можно отправить тестовое сообщение;
- администратор видит bot identity и настраивает production webhook;
- delivery имеет claim, до 5 попыток и backoff 1/5/15/60/180 минут.

### Состояние источника

- `source_runs` хранит каждый запуск;
- статусы: `running`, `success`, `blocked`, `failed`;
- UI показывает реальное время последней проверки;
- если результат старше 50 минут, UI показывает «Проверка просрочена»;
- внешний watchdog записывает `EXTERNAL_COLLECTOR_STALE`;
- `AUTO24_BLOCKED` отображается отдельно от обычной ошибки.

### Auto24

- пользователь сообщил, что Auto24 письменно разрешил MVP-сбор информации;
- подтверждающий документ в репозитории не сохранён;
- текущая стратегия не использует ротацию IP;
- production-стратегия: один статический IP, один постоянный Chromium profile,
  проверка раз в 30 минут;
- collector получает активные радары из CarPulse;
- collector строит точный URL Auto24 для каждого набора фильтров;
- одинаковые URL группируются;
- записи нормализуются и дедуплицируются по `source + external_id`;
- повторная обработка не создаёт повторные `radar_matches`;
- challenge, `403` и `429` записываются как `blocked`;
- контейнер имеет `restart: unless-stopped`;
- cookies Chromium сохраняются в Docker volume.

## Исправленные в этом диалоге ошибки

1. Меню `…` радара ничего не делало.
   Теперь есть «Изменить» и «Удалить».
2. Изменение радара отсутствовало в API.
   Добавлен `update_radar`.
3. Удаление радара отсутствовало в API.
   Добавлен `delete_radar` с проверкой владельца.
4. Третий шаг формы мгновенно проскакивал и сохранял радар.
   Причина: React переиспользовал кнопку перехода как submit-кнопку.
   Теперь кнопки перехода и сохранения разделены, а submit разрешён только на
   шаге 3.
5. «Показать все автомобили» не имела обработчика.
   Добавлен переход во view `vehicles`.
6. После фоновой проверки открытая страница не обновлялась.
   Добавлен polling раз в 30 секунд и refresh по focus/visibility.
7. Localhost ожидал Cloudflare cron, который сам в dev не запускается.
   Добавлен `scripts/dev-cron.mjs`.
8. Production не получал объявления.
   Выяснено, что Sites не предоставляет приложению `BROWSER`; production
   переключён на внешний collector.
9. Localhost и production использовали разные D1, но это не было очевидно.
   Добавлен временный local-to-production bridge.
10. Объявления визуально дублировались для каждого совпавшего радара.
    API теперь группирует до 500 строк `radar_matches` в максимум 50 уникальных
    объявлений.

## API

### `GET /api/dashboard`

Требует действующую сессию CarPulse.

Возвращает:

- `radars`;
- максимум 50 уникальных `listings`;
- каждый listing содержит `radars: Array<{ id, name }>`;
- Telegram connection;
- состояние источников и последний Auto24 run.

Идентичность берётся только из session cookie. Произвольные email-заголовки
dashboard не принимает.

### `POST /api/dashboard`

Поддерживает:

- `create_radar`;
- `toggle_radar`;
- `update_radar`;
- `delete_radar`;
- `toggle_favorite`.

Все действия фильтруются по `user_id` действующей сессии. Все browser POST API
также проверяют same-origin.

### Auth API

- `GET /api/auth/session` — текущий пользователь и bootstrap state;
- `POST /api/auth/bootstrap` — первый admin только за закрытым Sites access;
- `POST /api/auth/register` — обычная регистрация после bootstrap;
- `POST /api/auth/login`;
- `POST /api/auth/logout`;
- `POST /api/auth/password` — смена собственного пароля.

### Admin API

- `GET /api/admin/users`;
- `POST /api/admin/users` с действиями `create_user`, `update_user`,
  `reset_password`, `delete_user`;
- `GET /api/admin/telegram`;
- `POST /api/admin/telegram` — `setWebhook` на текущий production origin.

### Telegram API

- `GET /api/telegram/connection`;
- `POST /api/telegram/connection` с действиями `create_code`, `test`,
  `disconnect`;
- `POST /api/telegram/webhook` — публичный Telegram endpoint с проверкой secret
  header.

### `GET /api/sources/auto24/collector`

Требует:

```text
Authorization: Bearer <AUTO24_COLLECTOR_SECRET>
```

Возвращает активные радары, search URL и mapping фильтров.

Если Sites остаётся приватным, внешний клиент дополнительно передаёт:

```text
OAI-Sites-Authorization: Bearer <CARPULSE_SITES_BYPASS_TOKEN>
```

Этот bypass-токен нельзя показывать в логах, командах, README или ответах.

### `POST /api/sources/auto24/collector`

Принимает:

- `status: success | blocked | failed`;
- `records` для `success`;
- `message` для ошибок.

Максимум 1000 записей за запуск.

### `POST /api/sources/auto24/sync`

Требует `AUTO24_SYNC_SECRET`. Использует `BROWSER`, поэтому пригоден для local
development, но не для текущего Sites production.

## D1

Основные таблицы:

- `users`;
- `sessions`;
- `login_attempts`;
- `radars`;
- `radar_filters`;
- `listings`;
- `radar_matches`;
- `source_runs`;
- `notification_deliveries`;
- `telegram_accounts`;
- `user_favorites`;

Legacy-таблицы, оставленные для безопасной миграции:

- `telegram_connections`;
- `favorites`.

Важные ограничения:

- `listings` уникальны по `(source, external_id)`;
- `radar_matches` уникальны по `(radar_id, listing_id)`;
- FK используют `ON DELETE CASCADE`;
- текущая модель владения — `radars.user_id`;
- `radars.user_email` временно сохранён только для совместимости с legacy;
- email пользователя нормализован и уникален;
- `sessions.token_hash` содержит только SHA-256 hash session token;
- `telegram_accounts.chat_id` уникален;
- `user_favorites` уникален по `(user_id, listing_id)`;
- `notification_deliveries` создаётся только при новом совпадении и наличии
  подключённого Telegram chat.

## Запуск localhost

```bash
npm install
npm run dev
```

`npm run dev` запускает:

- `npm run dev:server`;
- `npm run dev:cron -- --now`.

Адреса:

- приложение: <http://localhost:3000>;
- debug: <http://localhost:3000/__debug>.

Раздельный запуск:

```bash
npm run dev:server
npm run dev:cron -- --now
```

Ручной local scheduled event:

```bash
curl "http://localhost:3000/cdn-cgi/handler/scheduled?cron=*/30+*+*+*+*"
```

Временный bridge в production включается только через process environment:

```text
CARPULSE_PRODUCTION_URL
CARPULSE_PRODUCTION_COLLECTOR_SECRET
CARPULSE_SITES_BYPASS_TOKEN
```

Не коммитить эти значения и не сохранять их в README. Bridge нужно удалить из
операционного процесса после запуска VPS.

## Проверки перед commit

```bash
node --check scripts/dev.mjs
node --check scripts/dev-cron.mjs
npm run check --prefix collector
npm run lint
npm run build
node --test tests/*.test.mjs
git diff --check
```

Последний полный прогон этих проверок прошёл успешно перед production version 13.

## Деплой Sites

Из-за [`.openai/hosting.json`](.openai/hosting.json) следующий агент обязан
использовать Sites workflow.

Порядок:

1. Проверить чистоту worktree и не затереть изменения пользователя.
2. Запустить lint, build и tests.
3. Создать commit и push в GitHub.
4. Получить краткоживущий source repository credential для существующего
   `project_id`.
5. Push exact `HEAD` в Sites source branch.
6. Собрать архив именно из этого commit:

   ```bash
   /Users/artjom/.codex/plugins/cache/openai-bundled/sites/0.1.30/scripts/package-site.sh \
     /Users/artjom/Documents/CarPulse \
     /tmp/carpulse-<short-sha>.tar.gz
   ```

7. `save_site_version` с exact full commit SHA и этим архивом.
8. Сайт owner-only, поэтому использовать `deploy_private_site_version`.
9. Poll deployment до `succeeded` или `failed`.
10. Проверить production GET с защищённой авторизацией.

Не делать:

- не вызывать `create_site`;
- не придумывать Sites IDs;
- не раскрывать `siwc_bypass_bearer_token`;
- не переключать `AUTO24_MODE` обратно на `browser`;
- не считать локальную D1 копией production D1;
- не деплоить незакоммиченный или не отправленный в Sites source код.

## Постоянный VPS collector — главный незавершённый шаг

Рекомендуемый минимум:

- Ubuntu 24.04;
- 1 vCPU;
- 2 GB RAM;
- 25–50 GB SSD;
- публичный статический IPv4;
- Docker + Docker Compose.

Пользователь должен создать VPS и предоставить работающую строку вида:

```bash
ssh root@SERVER_IP
```

Пароль или приватный SSH-ключ в чат не просить. Ключ должен быть настроен на
машине пользователя.

На сервере:

1. установить Docker и Compose;
2. скопировать `collector/`;
3. создать `.env` вне Git;
4. задать:

   ```text
   CARPULSE_BASE_URL=https://carpulse-mvp.artjomkaest.chatgpt.site
   AUTO24_COLLECTOR_SECRET=<тот же secret, что в Sites>
   CARPULSE_SITES_BYPASS_TOKEN=<Sites bypass secret>
   AUTO24_INTERVAL_MINUTES=30
   AUTO24_CHALLENGE_WAIT_MS=45000
   AUTO24_HEADLESS=true
   ```

5. `docker compose up -d --build`;
6. проверить `docker compose logs -f auto24-collector`;
7. убедиться, что первый run записан как `success`;
8. проверить новые объявления в production;
9. дождаться минимум двух циклов;
10. выключить local bridge.

Docker на локальной машине во время диалога отсутствовал, поэтому Docker image
локально не собирался. `package-lock`, синтаксис Node и production build
проверялись.

## Безопасный rollout аккаунтов

1. Задеплоить новую версию, оставив Sites в owner-only режиме.
2. Владелец открывает production и задаёт имя и пароль первого администратора.
   Пароль вводится только в браузере и нигде не передаётся агенту.
3. Проверить вход, раздел «Пользователи» и Telegram status.
4. Переключить существующий Sites project в public. Только после этого внешний
   телефон и Telegram смогут обращаться к приложению.
5. Администратор нажимает «Настроить webhook» в настройках Telegram.
6. Зарегистрировать второй тестовый аккаунт с телефона и проверить изоляцию.

До шага 4 Telegram webhook не сможет достучаться до Sites из-за внешней
owner-only авторизации. Это инфраструктурное ограничение, а не ошибка bot
backend.

## Остальные известные ограничения

- SS.lv не подключён;
- Nettiauto не подключён;
- mobile.de не подключён;
- поиск по тексту в «Все автомобили» пока визуальный, без фильтрации;
- кнопка расширенных фильтров в общей ленте пока визуальная;
- нет email verification;
- нет пользовательского восстановления пароля по email; admin может задать
  временный пароль;
- нет audit log действий admin;
- нет постоянного VPS;
- статический IP уменьшает нестабильность, но не даёт математической гарантии
  доступности Auto24, VPS, сети или WAF.

## Рекомендуемый порядок следующей работы

1. Создать первого администратора в закрытом production.
2. Переключить Sites access mode в public.
3. Настроить Telegram webhook из admin settings.
4. Проверить регистрацию и вход со второго телефона.
5. Проверить, что два пользователя не видят радары/избранное друг друга.
6. Поднять VPS collector и убрать зависимость от localhost.
7. Проверить 2–3 автоматических цикла production и Telegram delivery.
8. Добавить email verification, self-service password reset и admin audit log.

## Definition of done для следующего этапа

Система аккаунтов считается готовой только если:

- два пользователя могут зарегистрироваться и войти;
- пользователь A не видит и не изменяет данные пользователя B;
- прямой вызов admin API обычным пользователем возвращает `403`;
- admin видит пользователей и может безопасно заблокировать аккаунт;
- logout инвалидирует session;
- перезапуск Worker не сбрасывает session;
- телефон может открыть публичный сайт и пройти registration/login;
- Telegram code связывается только с текущим аккаунтом;
- объявления продолжают собираться без localhost;
- lint, build, tests и production verification проходят.
