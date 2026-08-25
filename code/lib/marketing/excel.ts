import * as XLSX from "xlsx";
import { MarketingParsedRow } from "./types";

function normalizeText(value: string): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function extractSalaFromPantalla(text: string): number | null {
  const m = normalizeText(text).match(/^pantalla\s+(\d{1,2})$/i);
  if (!m) return null;

  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  if (n < 1 || n > 50) return null;

  return n;
}

function isFooterLine(text: string): boolean {
  const t = normalizeText(text);
  return (
    t.includes("note: sessions that are not open for sale") ||
    t.includes("weekly sessions by screen")
  );
}

function isLikelyMovieLine(text: string): boolean {
  const t = normalizeText(text);
  if (!t) return false;

  if (t.startsWith("pantalla ")) return false;
  if (t.includes("note: sessions that are not open for sale")) return false;
  if (t.includes("weekly sessions by screen")) return false;
  if (t === "•" || t === "-" || t === "—") return false;

  return true;
}

function normalizeHora(hh: number, mm: number): string | null {
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function extractStartTimes(value: unknown): string[] {
  const raw = String(value ?? "").trim();
  if (!raw) return [];

  const text = raw.replace(/\./g, ":").replace(/\s+/g, " ").trim();
  const found: string[] = [];

  for (const m of text.matchAll(/\b(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\b/g)) {
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    const hora = normalizeHora(hh, mm);
    if (hora) found.push(hora);
  }

  return found;
}

export function parseMarketingExcelFromArrayBuffer(
  buffer: ArrayBuffer
): MarketingParsedRow[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];

  const sheet = workbook.Sheets[firstSheetName];
  if (!sheet) return [];

  const matrix = XLSX.utils.sheet_to_json<any[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: true,
  });

  const parsed: MarketingParsedRow[] = [];

  let salaActual: number | null = null;
  let peliculaActual: string | null = null;

  for (let rowIndex = 0; rowIndex < matrix.length; rowIndex++) {
    const row = matrix[rowIndex] ?? [];
    const colA = String(row[0] ?? "").trim();
    const colB = row[1];

    if (colA && isFooterLine(colA)) {
      break;
    }

    if (colA) {
      const salaDetectada = extractSalaFromPantalla(colA);
      if (salaDetectada) {
        salaActual = salaDetectada;
        peliculaActual = null;
        continue;
      }
    }

    if (colA && salaActual && isLikelyMovieLine(colA)) {
      peliculaActual = colA;
    }

    if (!salaActual || !peliculaActual) continue;

    let startTimes = extractStartTimes(colB);

    if (!startTimes.length) {
      startTimes = ["23:59"];
    }

    for (const hora of startTimes) {
      parsed.push({
        sala: salaActual,
        pelicula: peliculaActual,
        hora,
      });
    }
  }

  return parsed;
}