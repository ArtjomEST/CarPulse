# CarPulse

> Handoff-документ для следующего агента. Обновлён 24 июля 2026 года после
> совместной диагностики интерфейса, D1, расписания Auto24 и production на Sites.
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
- Последняя функциональная production-версия на момент handoff: **13**,
  commit `cbbfa2b284c25453e51b812fcd85ce2bf55886aa`.
- Production-сайт закрыт в режиме `custom`, разрешён только владелец. Это не
  полноценная авторизация CarPulse.
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
Linux VPS со статическим IPv4
  → Chromium с постоянным профилем
  → Auto24
  → POST /api/sources/auto24/collector
  → D1 listings
  → D1 radar_matches
  → D1 notification_deliveries

Cloudflare cron */30
  → при AUTO24_MODE=external не собирает Auto24
  → проверяет, что внешний collector присылал результат не более 50 минут назад
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
- favorite-состояние пока только клиентское и после перезагрузки не сохраняется.

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

Возвращает:

- `radars`;
- максимум 50 уникальных `listings`;
- каждый listing содержит `radars: Array<{ id, name }>`;
- Telegram connection;
- состояние источников и последний Auto24 run.

Идентичность сейчас определяется так:

```ts
request.headers.get("oai-authenticated-user-email") ?? "demo@carpulse.local"
```

Это временная схема, а не полноценная система аккаунтов.

### `POST /api/dashboard`

Поддерживает:

- `create_radar`;
- `toggle_radar`;
- `update_radar`;
- `delete_radar`;
- `telegram_code`.

Все действия с радаром фильтруются по текущему `user_email`.

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

- `radars`;
- `radar_filters`;
- `listings`;
- `radar_matches`;
- `source_runs`;
- `notification_deliveries`;
- `telegram_connections`;
- `favorites`.

Важные ограничения:

- `listings` уникальны по `(source, external_id)`;
- `radar_matches` уникальны по `(radar_id, listing_id)`;
- FK используют `ON DELETE CASCADE`;
- текущая модель владения — `radars.user_email`;
- `favorites` существует, но UI её пока не использует для persistence;
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

## Следующая большая продуктовая задача: аккаунты и админка

Пользователь хочет полноценные аккаунты, чтобы тестировать сайт с телефона и
разными людьми. Это **ещё не реализовано**.

Требования:

- регистрация по имени, email и паролю;
- login/logout;
- отдельные радары, объявления, избранное и Telegram connection у каждого
  пользователя;
- роль `admin`;
- пункт «Пользователи» в левом меню только для admin;
- список пользователей;
- создание, изменение, блокировка и удаление пользователя;
- невозможность обычного пользователя открыть admin API или admin view;
- admin bootstrap без hardcoded пароля в Git.

Рекомендуемая модель D1:

```text
users
  id
  name
  email UNIQUE
  password_hash
  password_salt
  role            user | admin
  status          active | blocked
  created_at
  updated_at
  last_login_at

sessions
  id
  user_id
  token_hash
  expires_at
  created_at
  last_seen_at
  user_agent
```

Безопасность:

- никогда не хранить пароль в открытом виде;
- использовать адаптированный для Worker password KDF;
- session token хранить в D1 только как hash;
- cookie: `HttpOnly`, `Secure`, `SameSite=Lax`, ограниченный срок;
- rate-limit на login и registration;
- нормализация email;
- generic login errors без раскрытия существования email;
- все API должны получать user ID из валидной session, а не доверять
  произвольному email header;
- admin authorization проверять на сервере для каждого действия;
- удаление пользователя должно каскадно удалять или архивировать его данные по
  заранее выбранной политике.

Миграция:

- текущие таблицы используют `user_email`;
- желательно добавить `user_id` и постепенно мигрировать ownership;
- не удалять production-данные до проверки;
- для существующего владельца создать admin user и связать текущие радары;
- Sites сейчас owner-only. Для самостоятельной регистрации с телефона потребуется
  сделать сайт публичным либо вынести публичный auth/API endpoint. Изменение
  access mode — отдельное внешнее действие, его нельзя делать без явного
  подтверждения пользователя.

## Telegram bot — будущая задача

Пользователь собирается создать бота через BotFather. Bot token ещё не передан и
backend полностью не реализован.

Что уже есть:

- таблица `telegram_connections`;
- `connect_code`;
- UI подключения;
- `notification_deliveries`;
- создание pending delivery при новом совпадении.

Что нужно реализовать:

1. хранить `TELEGRAM_BOT_TOKEN` только как production secret;
2. генерировать короткий одноразовый connect code для текущего аккаунта;
3. пользователь отправляет боту `/start CP-XXXX`;
4. bot backend находит code и связывает `chat_id` с `user_id`;
5. code становится недействительным;
6. worker отправляет сообщение для pending delivery;
7. сохраняет `sent`, `failed`, Telegram message ID и текст ошибки;
8. добавить disconnect и повторное подключение;
9. добавить тестовое уведомление;
10. защитить webhook через Telegram secret token.

Инфраструктурное ограничение: приватный Sites возвращает `401` внешним
клиентам. Telegram webhook не сможет обратиться к закрытому URL без отдельного
публичного backend endpoint. Возможные варианты:

- сделать весь сайт публичным после реализации собственной auth;
- вынести bot webhook в отдельный публичный Cloudflare Worker;
- использовать long polling на постоянном VPS.

Для production предпочтительнее публичный Worker webhook с секретной проверкой,
а не long polling внутри frontend Worker.

## Остальные известные ограничения

- SS.lv не подключён;
- Nettiauto не подключён;
- mobile.de не подключён;
- Telegram UI частично демонстрационный;
- favorite не сохраняется;
- поиск по тексту в «Все автомобили» пока визуальный, без фильтрации;
- кнопка расширенных фильтров в общей ленте пока визуальная;
- профиль в sidebar захардкожен;
- нет password reset;
- нет email verification;
- нет audit log действий admin;
- нет постоянного VPS;
- статический IP уменьшает нестабильность, но не даёт математической гарантии
  доступности Auto24, VPS, сети или WAF.

## Рекомендуемый порядок следующей работы

1. Поднять VPS collector и убрать зависимость от localhost.
2. Проверить 2–3 автоматических цикла production.
3. Согласовать публичность сайта для регистрации.
4. Добавить `users`, `sessions`, роли и собственную auth.
5. Мигрировать ownership с `user_email` на `user_id`.
6. Добавить admin users panel.
7. Получить BotFather token и выбрать public webhook или VPS long polling.
8. Завершить Telegram connection и delivery worker.
9. Перевести favorites на D1.
10. Добавить интеграционные тесты auth, ownership, admin и Telegram.

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
