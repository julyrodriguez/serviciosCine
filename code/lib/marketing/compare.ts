import {
  MarketingCompareResult,
  MarketingGlobalPosterCount,
  MarketingParsedRow,
  MarketingRoomPlan,
} from "./types";

function buildRoomNumbers(salasCount: number): number[] {
  const safe = Number.isFinite(salasCount) ? Math.max(1, Math.floor(salasCount)) : 12;
  return Array.from({ length: safe }, (_, i) => i + 1);
}

function normalizeText(value: string): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function stripMovieVariants(value: string): string {
  let t = String(value ?? "").trim();

  t = t.replace(/^•\s*/, "");
  t = t.replace(/\([^)]*\)/g, " ");
  t = t.replace(/[\/|_,.;-]+/g, " ");

  t = t.replace(
    /\b(2d|3d|4d|xd|imax|atmos|atmoss|atmós|cas|cast|castellano|sub|subs|subt|subtitulado|subtitulada|dob|doblada|doblado|esp|dbox)\b/gi,
    " "
  );

  t = t.replace(
    /\b(atp|pg|pg13|r|c13|c16|c18|s13|s16|s18|s13r|s16r|s18r)\b/gi,
    " "
  );
  t = t.replace(/\+\s*(13|16|18)\b/gi, " ");
  t = t.replace(/\b(13|16|18)\b/gi, " ");
  t = t.replace(/\b(apta?|apto|todo publico|todo público)\b/gi, " ");

  t = t.replace(/\s+/g, " ").trim();
  t = t.replace(/[\s:.-]+$/g, "").trim();

  return t;
}

function cleanDisplayTitle(value: string): string {
  return stripMovieVariants(value).replace(/\s+/g, " ").trim();
}

function normalizeMovieKey(value: string): string {
  let t = normalizeText(stripMovieVariants(value));
  t = t.replace(/[^a-z0-9\s]/g, " ");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

function horaToMinutes(hora?: string | null): number {
  if (!hora) return Number.POSITIVE_INFINITY;

  const m = String(hora).match(/^(\d{2}):(\d{2})$/);
  if (!m) return Number.POSITIVE_INFINITY;

  const hh = Number(m[1]);
  const mm = Number(m[2]);

  if (!Number.isFinite(hh) || !Number.isFinite(mm)) {
    return Number.POSITIVE_INFINITY;
  }

  return hh * 60 + mm;
}

function buildCarteleraBySala(
  currRows: MarketingParsedRow[],
  roomNumbers: number[]
): Record<string, string> {
  const allowed = new Set(roomNumbers);
  const bestBySala = new Map<number, { pelicula: string; minutos: number }>();

  for (const row of currRows) {
    const sala = Number(row.sala);
    const pelicula = cleanDisplayTitle(row.pelicula);
    const minutos = horaToMinutes(row.hora);

    if (!allowed.has(sala)) continue;
    if (!pelicula) continue;

    const existing = bestBySala.get(sala);

    if (!existing || minutos < existing.minutos) {
      bestBySala.set(sala, { pelicula, minutos });
    }
  }

  const out: Record<string, string> = {};
  for (const sala of roomNumbers) {
    out[String(sala)] = bestBySala.get(sala)?.pelicula ?? "";
  }

  return out;
}

function buildRoomMovieMap(
  rows: MarketingParsedRow[],
  roomNumbers: number[]
): Map<number, Map<string, string>> {
  const allowed = new Set(roomNumbers);
  const map = new Map<number, Map<string, string>>();

  for (const row of rows) {
    const sala = Number(row.sala);
    const pelicula = cleanDisplayTitle(row.pelicula);

    if (!allowed.has(sala)) continue;
    if (!pelicula) continue;

    const key = normalizeMovieKey(pelicula);
    if (!key) continue;

    if (!map.has(sala)) {
      map.set(sala, new Map<string, string>());
    }

    const roomMap = map.get(sala)!;

    if (!roomMap.has(key)) {
      roomMap.set(key, pelicula);
    }
  }

  return map;
}

function buildGlobalRoomsMap(
  roomMap: Map<number, Map<string, string>>
): Map<string, { title: string; salas: number[] }> {
  const result = new Map<string, { title: string; salas: number[] }>();

  for (const [sala, movies] of roomMap.entries()) {
    for (const [key, title] of movies.entries()) {
      const existing = result.get(key);

      if (!existing) {
        result.set(key, { title, salas: [sala] });
      } else {
        existing.salas.push(sala);
      }
    }
  }

  for (const value of result.values()) {
    value.salas = Array.from(new Set(value.salas)).sort((a, b) => a - b);
  }

  return result;
}

function sortInstructions<T extends { pelicula: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.pelicula.localeCompare(b.pelicula, "es"));
}

function minSala(salas: number[]): number {
  if (!salas.length) return Number.POSITIVE_INFINITY;
  return Math.min(...salas);
}

function orderRoomsByDistance(sourceSalas: number[], targetSala: number): number[] {
  return [...sourceSalas].sort((a, b) => {
    const distA = Math.abs(a - targetSala);
    const distB = Math.abs(b - targetSala);
    if (distA !== distB) return distA - distB;
    return a - b;
  });
}

function formatSalaListWithSlash(salas: number[]): string {
  return salas.join("/");
}

export function compareMarketingWeeks(
  prevRows: MarketingParsedRow[],
  currRows: MarketingParsedRow[],
  salasCount = 12
): MarketingCompareResult {
  const ROOM_NUMBERS = buildRoomNumbers(salasCount);

  const prevRoomMap = buildRoomMovieMap(prevRows, ROOM_NUMBERS);
  const currRoomMap = buildRoomMovieMap(currRows, ROOM_NUMBERS);

  const prevGlobal = buildGlobalRoomsMap(prevRoomMap);
  const currGlobal = buildGlobalRoomsMap(currRoomMap);

  const roomPlansMap = new Map<number, MarketingRoomPlan>();

  for (const sala of ROOM_NUMBERS) {
    roomPlansMap.set(sala, {
      sala,
      funciones: [],
      dataExtra: [],
    });
  }

  const postersNuevosGlobales: MarketingGlobalPosterCount[] = [];
  const peliculasSalenCarteleraGlobales: MarketingGlobalPosterCount[] = [];

  const movieKeys = Array.from(
    new Set([...Array.from(prevGlobal.keys()), ...Array.from(currGlobal.keys())])
  ).sort((a, b) => a.localeCompare(b, "es"));

  let totalDejar = 0;
  let totalRetirar = 0;
  let totalColocar = 0;
  let totalMovimientos = 0;

  for (const key of movieKeys) {
    const prevInfo = prevGlobal.get(key);
    const currInfo = currGlobal.get(key);

    const title = cleanDisplayTitle(currInfo?.title ?? prevInfo?.title ?? key);

    const prevSalas = prevInfo?.salas ?? [];
    const currSalas = currInfo?.salas ?? [];

    const staySalas = currSalas
      .filter((s) => prevSalas.includes(s))
      .sort((a, b) => a - b);

    const sourceOnly = prevSalas
      .filter((s) => !currSalas.includes(s))
      .sort((a, b) => a - b);

    const targetOnly = currSalas
      .filter((s) => !prevSalas.includes(s))
      .sort((a, b) => a - b);

    for (const sala of staySalas) {
      roomPlansMap.get(sala)!.funciones.push({
        pelicula: title,
        detalle: "Dejar en la marquesina",
      });
      totalDejar += 1;
    }

    const N = targetOnly.length;
    const M = sourceOnly.length;

    for (const sala of targetOnly) {
      const orderedSources = orderRoomsByDistance(sourceOnly, sala);
      let detalle = "Traer de MKT";
      if (orderedSources.length > 0) {
        detalle = `Traer de MKT (puede moverse de sala ${formatSalaListWithSlash(
          orderedSources
        )})`;
        if (N > M) {
          detalle += ` - Bajar ${N - M} sí o sí de marketing`;
        }
      }

      roomPlansMap.get(sala)!.funciones.push({
        pelicula: title,
        detalle,
      });

      totalColocar += 1;
    }

    if (targetOnly.length > 0) {
      const orderedSourcesForGlobal =
        sourceOnly.length > 0 ? orderRoomsByDistance(sourceOnly, targetOnly[0]) : [];

      postersNuevosGlobales.push({
        pelicula: title,
        cantidad: targetOnly.length,
        salas: targetOnly,
        possibleSourceSalas: orderedSourcesForGlobal,
        mode: orderedSourcesForGlobal.length > 0 ? "movimiento" : "nuevo",
      });

      if (orderedSourcesForGlobal.length > 0) {
        totalMovimientos += targetOnly.length;
      }
    }

    for (const sala of sourceOnly) {
      const orderedTargets = orderRoomsByDistance(targetOnly, sala);
      let detalle = "Ya no se da";
      if (orderedTargets.length > 0) {
        detalle = `Puede ser reutilizado en sala ${formatSalaListWithSlash(orderedTargets)}`;
        if (M > N) {
          detalle += ` - Devolver ${M - N} a marketing`;
        }
      } else {
        detalle = `Ya no se da - Devolver ${M} a marketing`;
      }

      roomPlansMap.get(sala)!.dataExtra.push({
        pelicula: title,
        detalle,
      });

      totalRetirar += 1;
    }

    if (prevSalas.length > 0 && currSalas.length === 0) {
      peliculasSalenCarteleraGlobales.push({
        pelicula: title,
        cantidad: prevSalas.length,
        salas: prevSalas,
      });
    }
  }

  const ponerEnCarteleraPorSala = buildCarteleraBySala(currRows, ROOM_NUMBERS);

  const salas = ROOM_NUMBERS.map((sala) => {
    const plan = roomPlansMap.get(sala)!;

    plan.funciones = sortInstructions(plan.funciones);
    plan.dataExtra = sortInstructions(plan.dataExtra);

    return plan;
  });

  const salasSinCambios = salas.filter(
    (s) => s.funciones.length === 0 && s.dataExtra.length === 0
  ).length;

  return {
    generatedAtIso: new Date().toISOString(),
    salas,
    ponerEnCarteleraPorSala,
    summary: {
      totalDejar,
      totalRetirar,
      totalColocar,
      totalMovimientos,
      salasSinCambios,
      postersNuevosGlobales: [...postersNuevosGlobales].sort((a, b) => {
        const modeA = a.mode === "nuevo" ? 0 : 1;
        const modeB = b.mode === "nuevo" ? 0 : 1;
        if (modeA !== modeB) return modeA - modeB;

        const salaA = minSala(a.salas);
        const salaB = minSala(b.salas);
        if (salaA !== salaB) return salaA - salaB;

        return a.pelicula.localeCompare(b.pelicula, "es");
      }),
      postersRetirarGlobales: [...peliculasSalenCarteleraGlobales].sort((a, b) => {
        const salaA = minSala(a.salas);
        const salaB = minSala(b.salas);
        if (salaA !== salaB) return salaA - salaB;
        return a.pelicula.localeCompare(b.pelicula, "es");
      }),
      postersMoverGlobales: [],
    },
  };
}