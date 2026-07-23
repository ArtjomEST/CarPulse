# CarPulse

MVP сервиса мониторинга автомобильных площадок. Пользователь создаёт радары вручную в личном кабинете, видит свежие совпадения в общей ленте и сможет подключить Telegram для мгновенных уведомлений.

## Что уже есть

- адаптивный личный кабинет;
- форма создания радара без ссылок на готовый поиск;
- реальные радары и фильтры в Cloudflare D1;
- таблицы объявлений, совпадений, запусков источников и очереди уведомлений;
- лента найденных автомобилей из D1;
- экран подключения Telegram по одноразовому коду;
- Auto24-адаптер на Cloudflare Browser Run;
- Cron Trigger `*/30 * * * *`: одна проверка каждые 30 минут;
- дедупликация объявлений по `source + external_id`;
- единый интерфейс адаптеров Auto24, SS.lv, Nettiauto и mobile.de;
- защищённый ручной запуск `POST /api/sources/auto24/sync`.

Auto24 проверяется полноценным браузером: берутся первые 50 объявлений из выдачи за последние сутки, отсортированной по времени добавления. При явной CAPTCHA, `403` или `429` сборщик прекращает запрос и записывает запуск как `blocked`. Для стабильной эксплуатации нужен согласованный с Auto24 allowlist или их API. SS.lv, Nettiauto и mobile.de пока не подключены.

## Поток данных

```text
Cloudflare Cron → Browser Run → Auto24 → нормализация → D1 listings
                                                    → radar_matches
                                                    → notification_deliveries
```

## Запуск

```bash
npm install
npm run dev
```

Проверка production-сборки:

```bash
npm run build
npm test
npm run lint
```

После изменения `db/schema.ts`:

```bash
npm run db:generate
```

Для ручной синхронизации в Cloudflare нужно добавить секрет `AUTO24_SYNC_SECRET` и вызвать:

```bash
curl -X POST https://<worker>/api/sources/auto24/sync \
  -H "Authorization: Bearer <AUTO24_SYNC_SECRET>"
```

Cron Trigger использует внутренний `scheduled()` handler и не требует публичного ключа.
