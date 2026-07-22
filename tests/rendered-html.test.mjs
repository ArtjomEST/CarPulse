import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const appRoot = new URL("../app/", import.meta.url);

test("the CarPulse product replaces the disposable starter", async () => {
  const [page, layout, app, styles] = await Promise.all([
    readFile(new URL("page.tsx", appRoot), "utf8"),
    readFile(new URL("layout.tsx", appRoot), "utf8"),
    readFile(new URL("CarPulseApp.tsx", appRoot), "utf8"),
    readFile(new URL("globals.css", appRoot), "utf8"),
  ]);

  assert.match(page, /CarPulse/);
  assert.match(layout, /lang="ru"/);
  assert.match(app, /Свежие автомобили/);
  assert.match(app, /Создать радар/);
  assert.match(app, /Подключить Telegram/);
  assert.match(app, /Auto24/);
  assert.match(styles, /--red:/);
  assert.doesNotMatch(`${page}${layout}${app}`, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
  assert.deepEqual(await readdir(new URL("_sites-preview", appRoot)), []);
});
