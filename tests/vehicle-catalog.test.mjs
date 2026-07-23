import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const catalog = JSON.parse(
  await readFile(new URL("../data/vehicle-catalog.json", import.meta.url), "utf8"),
);

test("vehicle catalog contains a useful cross-market snapshot", () => {
  const modelCount = catalog.makes.reduce(
    (total, make) => total + make.models.length,
    0,
  );

  assert.ok(catalog.makes.length >= 150);
  assert.ok(modelCount >= 3_000);
  for (const domain of ["auto24.ee", "ss.com", "nettiauto.com", "mobile.de"]) {
    assert.ok(
      catalog.sourceUrls.some((url) => url.includes(domain)),
      `catalog should record ${domain} as a source`,
    );
  }
});

test("popular makes expose dependent model lists and source references", () => {
  for (const makeName of ["Audi", "BMW", "Mercedes-Benz", "Toyota", "Volkswagen", "Volvo"]) {
    const make = catalog.makes.find((item) => item.name === makeName);
    assert.ok(make, `${makeName} should exist`);
    assert.ok(make.models.length >= 20, `${makeName} should have a useful model list`);
    assert.ok(make.sources.Auto24, `${makeName} should map to Auto24`);
  }

  const volkswagen = catalog.makes.find((item) => item.name === "Volkswagen");
  assert.ok(
    volkswagen.models.some((model) => model.sources["SS.lv"]),
    "Volkswagen models should preserve SS.lv references",
  );
  assert.ok(
    volkswagen.models.some((model) => model.sources.Nettiauto),
    "Volkswagen models should preserve Nettiauto references",
  );
});

test("catalog identifiers are unique within their scope", () => {
  const makeIds = catalog.makes.map((make) => make.id);
  assert.equal(new Set(makeIds).size, makeIds.length);

  for (const make of catalog.makes) {
    const modelIds = make.models.map((model) => model.id);
    assert.equal(
      new Set(modelIds).size,
      modelIds.length,
      `${make.name} contains duplicate model identifiers`,
    );
  }
});
