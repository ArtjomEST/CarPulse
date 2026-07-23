import catalog from "../../../data/vehicle-catalog.json";
import { vehicleFilterOptions } from "../../../lib/vehicle-filters";

const ALLOWED_SOURCES = new Set(["Auto24", "SS.lv", "Nettiauto", "mobile.de"]);

type CatalogSourceReference = {
  id?: string;
  slug?: string;
  name: string;
  fallback?: boolean;
};

type CatalogModel = {
  id: string;
  name: string;
  aliases: string[];
  sources: Record<string, CatalogSourceReference>;
};

type CatalogMake = {
  id: string;
  name: string;
  aliases: string[];
  sources: Record<string, CatalogSourceReference>;
  models: CatalogModel[];
};

function selectedSources(request: Request) {
  const values = new URL(request.url).searchParams
    .get("sources")
    ?.split(",")
    .map((value) => value.trim())
    .filter((value) => ALLOWED_SOURCES.has(value));
  return values?.length ? values : ["Auto24"];
}

function supportsAny(
  sources: Record<string, CatalogSourceReference>,
  selected: string[],
) {
  return selected.some((source) => Boolean(sources[source]));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sources = selectedSources(request);
  const makeId = url.searchParams.get("make")?.trim();
  const makes = catalog.makes as CatalogMake[];

  if (makeId) {
    const make = makes.find((item) => item.id === makeId);
    if (!make || !supportsAny(make.sources, sources)) {
      return Response.json({ error: "Марка не найдена в выбранных площадках" }, { status: 404 });
    }

    const useMergedFallback = sources.some(
      (source) => source === "Auto24" || source === "mobile.de",
    );
    const models = make.models
      .filter((model) => useMergedFallback || supportsAny(model.sources, sources))
      .map((model) => ({
        id: model.id,
        name: model.name,
        sources: Object.keys(model.sources).filter((source) => sources.includes(source)),
      }));

    return Response.json(
      {
        generatedAt: catalog.generatedAt,
        make: { id: make.id, name: make.name },
        models,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        },
      },
    );
  }

  return Response.json(
    {
      generatedAt: catalog.generatedAt,
      makes: makes
        .filter((make) => supportsAny(make.sources, sources))
        .map((make) => ({
          id: make.id,
          name: make.name,
          modelCount: make.models.length,
          sources: Object.keys(make.sources).filter((source) => sources.includes(source)),
        })),
      filters: vehicleFilterOptions,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    },
  );
}
