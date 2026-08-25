// lib/programacion/pdf.ts

import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
// @ts-ignore
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf";
import { WeekdayKey, WeeklyMovieRow } from "./types";

// Configurar el worker de PDF.js según la plataforma
// En web usamos el worker desde CDN (debe coincidir con la versión instalada de pdfjs-dist)
if (Platform.OS === "web" && typeof window !== "undefined") {
  GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";
}

/** Resultado del parseo del PDF semanal */
export interface ParsePDFResult {
  rows: WeeklyMovieRow[];
  /** Fecha del jueves (primer día) extraída del encabezado del PDF, o null si no se encontró */
  startDate: Date | null;
}

const DAYS: WeekdayKey[] = [
  "jueves",
  "viernes",
  "sabado",
  "domingo",
  "lunes",
  "martes",
  "miercoles",
];

async function readPdfDataFromUri(uri: string): Promise<Uint8Array> {
  if (Platform.OS === "web") {
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error(`No se pudo leer el archivo PDF (${response.status})`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function getDayIndexFromX(x: number): number {
  // Mapping coordinates: Thurs=114, Fri=182, Sat=250, Sun=318, Mon=386, Tue=454, Wed=522
  // Thresholds are midpoints between columns: 148, 216, 284, 352, 420, 488
  if (x < 148) return 0;
  if (x < 216) return 1;
  if (x < 284) return 2;
  if (x < 352) return 3;
  if (x < 420) return 4;
  if (x < 488) return 5;
  return 6;
}

function hasRating(title: string): boolean {
  return /\([^)]+\)/.test(title);
}

interface RawElement {
  x: number;
  y: number;
  text: string;
}

export async function parseWeeklyProgrammingPDF(uri: string): Promise<ParsePDFResult> {
  const data = await readPdfDataFromUri(uri);

  console.log("[PDF] Iniciando parseo, tamaño de datos:", data.byteLength, "bytes");

  const loadingTask = getDocument({
    data,
    verbosity: 0,
  } as any);

  loadingTask.onProgress = (progress: { loaded: number; total: number }) => {
    console.log("[PDF] Progreso:", progress.loaded, "/", progress.total);
  };

  const pdf = await loadingTask.promise;
  console.log("[PDF] Documento cargado. Páginas:", pdf.numPages);

  let startDate: Date | null = null;

  // ── Paso 1: Extraer la fecha del encabezado de la primera página ───────────
  // Escaneamos TODOS los textos de la página 1 (sin restricción de coordenadas)
  // porque Vista puede colocar la fecha en distintas posiciones según el idioma.
  {
    const page1 = await pdf.getPage(1);
    const page1Content = await page1.getTextContent();
    const allPage1Texts: string[] = [];

    for (const item of page1Content.items as any[]) {
      const text = (item.str ?? "").trim();
      if (text) allPage1Texts.push(text);
    }

    console.log("[PDF] Todos los textos de la página 1:", allPage1Texts);

    // Intentar extraer la fecha concatenando textos adyacentes también
    // (algunos PDFs separan "29" " " "May" " " "2025" en items distintos)
    const fullText = allPage1Texts.join(" ");
    console.log("[PDF] Texto completo página 1:", fullText);

    startDate = extractDateFromText(fullText);
    if (!startDate) {
      // Intentar cada fragmento individual
      for (const t of allPage1Texts) {
        startDate = extractDateFromText(t);
        if (startDate) break;
      }
    }

    if (startDate) {
      console.log("[PDF] Fecha detectada:", startDate.toISOString());
    } else {
      console.warn("[PDF] No se detectó ninguna fecha en página 1.");
    }
  }

  // ── Paso 2: Parsear las películas en todas las páginas ──────────────────────
  const moviesList: {
    sala: number;
    rawTitle: string;
    lastY: number;
    horariosPorDia: Record<WeekdayKey, string[]>;
  }[] = [];

  let currentSala: number | null = null;
  let currentMovie: typeof moviesList[0] | null = null;

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    // Restablecer el puntero de película al iniciar cada página nueva
    currentMovie = null;

    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    const elements: RawElement[] = [];

    for (const item of textContent.items as any[]) {
      const text = item.str;
      if (!text) continue;

      const x = item.transform[4];
      const y = Math.abs(item.transform[5]);

      elements.push({ x, y, text });
    }

    // Group elements by Y coordinate (within 3.0 points tolerance)
    const linesMap = new Map<number, RawElement[]>();
    for (const el of elements) {
      let foundGroupY = -1;
      for (const groupY of linesMap.keys()) {
        if (Math.abs(el.y - groupY) < 3.0) {
          foundGroupY = groupY;
          break;
        }
      }
      if (foundGroupY !== -1) {
        linesMap.get(foundGroupY)!.push(el);
      } else {
        linesMap.set(el.y, [el]);
      }
    }

    // Sort Y coordinates descending (from top of page to bottom)
    const sortedYs = Array.from(linesMap.keys()).sort((a, b) => b - a);

    for (const y of sortedYs) {
      // Ignorar cabeceras/pies (y > 720 o y < 50) — pero ya extrajimos la fecha en el Paso 1
      if (y > 720 || y < 50) continue;

      const lineElements = linesMap.get(y)!.sort((a, b) => a.x - b.x);

      // Check if this line is a screen header (e.g. "Pantalla 1" or "Screen 1")
      let isScreenHeader = false;
      const joinedLineText = lineElements.map(el => el.text).join(" ");
      if (/(?:pantalla|screen)\s+(\d+)/i.test(joinedLineText)) {
        const match = joinedLineText.match(/(?:pantalla|screen)\s+(\d+)/i);
        if (match) {
          currentSala = parseInt(match[1], 10);
          currentMovie = null;
          isScreenHeader = true;
        }
      }

      if (isScreenHeader) continue;
      if (currentSala === null) continue;

      // Split elements into title components (X < 100) and showtimes (X >= 100)
      const titleParts: RawElement[] = [];
      const showtimeElements: RawElement[] = [];

      for (const el of lineElements) {
        if (el.x < 100) {
          const trimmed = el.text.trim();
          if (
            trimmed &&
            !/weekly sessions/i.test(trimmed) &&
            !/reportfiles/i.test(trimmed) &&
            !/no free tickets/i.test(trimmed) &&
            !/in cinema working/i.test(trimmed) &&
            !/screen\s*\/\s*film/i.test(trimmed) &&
            !/screen\s*\/\s*movie/i.test(trimmed) &&
            !/film\s*\/\s*rating/i.test(trimmed) &&
            !/^film$/i.test(trimmed) &&
            !/^screen$/i.test(trimmed) &&
            !/^rating$/i.test(trimmed) &&
            !/pantalla\s*\/\s*pel/i.test(trimmed) &&
            !/page\s+\d+/i.test(trimmed) &&
            !/página\s+\d+/i.test(trimmed) &&
            !/from\s+thursday/i.test(trimmed) &&
            !/from\s+jueves/i.test(trimmed) &&
            !/reporting\s+period/i.test(trimmed) &&
            !/periodo\s+de\s+informe/i.test(trimmed) &&
            !/film\s+title/i.test(trimmed) &&
            !/título\s+de\s+película/i.test(trimmed) &&
            !/titulo\s+de\s+pelicula/i.test(trimmed) &&
            !/end\s+time/i.test(trimmed) &&
            !/hora\s+fin/i.test(trimmed) &&
            !/hora\s+de\s+fin/i.test(trimmed) &&
            !/from\s+\d{1,2}\/\d{1,2}/i.test(trimmed)
          ) {
            titleParts.push(el);
          }
        } else {
          showtimeElements.push(el);
        }
      }

      // 1. Process Movie Titles (X < 100)
      if (titleParts.length > 0) {
        const lineTitle = titleParts.map((p) => p.text.trim()).join(" ").replace(/\s+/g, " ").trim();

        // Verificar si la línea unida corresponde a cabeceras o metadatos de página
        const isHeaderMetadata =
          /weekly\s+sessions/i.test(lineTitle) ||
          /reportfiles/i.test(lineTitle) ||
          /no\s+free\s+tickets/i.test(lineTitle) ||
          /in\s+cinema\s+working/i.test(lineTitle) ||
          /screen\s*\/\s*film/i.test(lineTitle) ||
          /screen\s*\/\s*movie/i.test(lineTitle) ||
          /film\s*\/\s*rating/i.test(lineTitle) ||
          /^film$/i.test(lineTitle) ||
          /^screen$/i.test(lineTitle) ||
          /^rating$/i.test(lineTitle) ||
          /pantalla\s*\/\s*pel/i.test(lineTitle) ||
          /page\s+\d+/i.test(lineTitle) ||
          /página\s+\d+/i.test(lineTitle) ||
          /from\s+thursday/i.test(lineTitle) ||
          /from\s+jueves/i.test(lineTitle) ||
          /reporting\s+period/i.test(lineTitle) ||
          /periodo\s+de\s+informe/i.test(lineTitle) ||
          /film\s+title/i.test(lineTitle) ||
          /título\s+de\s+película/i.test(lineTitle) ||
          /titulo\s+de\s+pelicula/i.test(lineTitle) ||
          /end\s+time/i.test(lineTitle) ||
          /hora\s+fin/i.test(lineTitle) ||
          /hora\s+de\s+fin/i.test(lineTitle) ||
          /from\s+\d{1,2}\/\d{1,2}/i.test(lineTitle);

        if (!isHeaderMetadata && lineTitle.length > 0) {
          // Continuation if the current movie is "incomplete" (doesn't have rating parentheses yet)
          if (currentMovie && !hasRating(currentMovie.rawTitle)) {
            currentMovie.rawTitle += " " + lineTitle;
            currentMovie.lastY = y;
          } else {
            // Start a new movie entry
            currentMovie = {
              sala: currentSala,
              rawTitle: lineTitle,
              lastY: y,
              horariosPorDia: {
                jueves: [],
                viernes: [],
                sabado: [],
                domingo: [],
                lunes: [],
                martes: [],
                miercoles: [],
              },
            };
            moviesList.push(currentMovie);
          }
        }
      }

      // 2. Process Showtimes (X >= 100)
      if (showtimeElements.length > 0 && currentMovie) {
        for (const el of showtimeElements) {
          const matches = Array.from(el.text.matchAll(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/g));
          if (matches.length === 0) continue;

          // Starting column index based on X coordinate
          const startDayIdx = getDayIndexFromX(el.x);

          let prevEnd = -1;
          let currDayIdx = startDayIdx;

          for (const m of matches) {
            const showtimeStr = m[0];
            const matchIndex = m.index ?? 0;

            if (prevEnd !== -1) {
              const spacesBetween = matchIndex - prevEnd;
              let step = 1;
              if (spacesBetween > 12) step = 4;
              else if (spacesBetween > 8) step = 3;
              else if (spacesBetween > 4) step = 2;
              currDayIdx += step;
            }

            prevEnd = matchIndex + showtimeStr.length;

            if (currDayIdx >= 0 && currDayIdx < 7) {
              const dayName = DAYS[currDayIdx];
              currentMovie.horariosPorDia[dayName].push(showtimeStr);
            }
          }
        }
      }
    }
  }

  // Map list of parsed movies into standard WeeklyMovieRow format
  const result: WeeklyMovieRow[] = [];

  for (const m of moviesList) {
    const rawTitle = m.rawTitle.replace(/\s+/g, " ").trim();
    if (!rawTitle) continue;

    // Clean title and extract rating using same helpers as Excel
    const calif = extractCalificacion(rawTitle);
    const pelicula = cleanMovieTitle(rawTitle);

    // Only save if we actually got some showtimes for this movie
    const hasAnyShowtimes = DAYS.some((day) => m.horariosPorDia[day].length > 0);
    if (!hasAnyShowtimes) continue;

    result.push({
      sala: m.sala,
      pelicula,
      calificacion: calif,
      horariosPorDia: m.horariosPorDia,
    });
  }

  return { rows: result, startDate };
}

/**
 * Extrae la primera fecha encontrada en cualquier parte del texto.
 * Vista exporta la fecha en varios formatos según el idioma y la configuración:
 *   Formatos numéricos:
 *     - "29/05/2025"  o  "05/29/2025"
 *   Formatos con nombre de mes:
 *     - "29 May 2025"   (más común en Vista en inglés)
 *     - "29-May-2025"
 *     - "May 29 2025"   o   "May 29, 2025"
 *   Puede venir dentro de frases: "Reporting Period: 29 May 2025 - 04 Jun 2025"
 * Siempre retorna la PRIMERA fecha encontrada (que es el jueves de inicio).
 */
export function extractDateFromText(text: string): Date | null {
  const t = text.trim();

  // 1a) DD de Month de YYYY (ej. "29 de Mayo de 2025" o "29 de may. de 2025")
  const spanishDeMatch = t.match(/(\d{1,2})\s+de\s+([A-Za-z\.]+)\s+de\s+(\d{2,4})/i);
  if (spanishDeMatch) {
    const day = parseInt(spanishDeMatch[1], 10);
    const monthStr = spanishDeMatch[2].replace(/\.$/, ""); // remove trailing dot if any
    const month = parseMonthName(monthStr);
    let year = parseInt(spanishDeMatch[3], 10);
    if (year < 100) year += 2000;
    if (month !== -1 && day >= 1 && day <= 31 && year >= 2020) {
      return new Date(year, month, day);
    }
  }

  // 1) DD Month YYYY  (ej. "29 May 2025" o "29-May-2025" o "29 / May / 2025")
  const dayMonthYear = t.match(/(\d{1,2})\s*[\s\-\/]\s*([A-Za-z]{3,9})\s*[\s\-\/]\s*(\d{2,4})/);
  if (dayMonthYear) {
    const day = parseInt(dayMonthYear[1], 10);
    const month = parseMonthName(dayMonthYear[2]);
    let year = parseInt(dayMonthYear[3], 10);
    if (year < 100) year += 2000;
    if (month !== -1 && day >= 1 && day <= 31 && year >= 2020) {
      return new Date(year, month, day);
    }
  }

  // 2) Month DD YYYY  (ej. "May 29 2025" o "May 29, 2025" o "May 29 , 2025")
  const monthDayYear = t.match(/([A-Za-z]{3,9})\s*[\s\-]\s*(\d{1,2}),?\s*[\s\-]\s*(\d{2,4})/);
  if (monthDayYear) {
    const month = parseMonthName(monthDayYear[1]);
    const day = parseInt(monthDayYear[2], 10);
    let year = parseInt(monthDayYear[3], 10);
    if (year < 100) year += 2000;
    if (month !== -1 && day >= 1 && day <= 31 && year >= 2020) {
      return new Date(year, month, day);
    }
  }

  // 3) DD/MM/YYYY o MM/DD/YYYY o DD-MM-YYYY (numérico con barras/guiones/puntos, permitiendo espacios)
  const slashMatch = t.match(/(\d{1,2})\s*[\/\-\.]\s*(\d{1,2})\s*[\/\-\.]\s*(\d{2,4})/);
  if (slashMatch) {
    const a = parseInt(slashMatch[1], 10);
    const b = parseInt(slashMatch[2], 10);
    let year = parseInt(slashMatch[3], 10);
    if (year < 100) year += 2000;
    if (year >= 2020) {
      if (a > 12) return new Date(year, b - 1, a);      // a es día
      if (b > 12) return new Date(year, a - 1, b);      // b es día
      return new Date(year, b - 1, a);                   // asumimos DD/MM
    }
  }

  return null;
}



const MONTH_NAMES: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  ene: 0, abr: 3, ago: 7, dic: 11,
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
  january: 0, february: 1, march: 2, april: 3, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

function parseMonthName(name: string): number {
  return MONTH_NAMES[name.toLowerCase()] ?? -1;
}

function extractCalificacion(movieTitle: string): string {
  const matches = [...movieTitle.matchAll(/\(([^)]+)\)/g)];
  if (!matches.length) return "";
  return matches[matches.length - 1]?.[1]?.trim() ?? "";
}

function cleanMovieTitle(movieTitle: string): string {
  return movieTitle.replace(/\s*\([^)]+\)\s*$/g, "").trim();
}
