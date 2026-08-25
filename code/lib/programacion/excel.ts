// lib/programacion/excel.ts

import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import * as XLSX from "xlsx-js-style";
import {
  DailyShow,
  GenerateProgramacionParams,
  ProgramacionBuildResult,
  WEEKDAY_LABELS,
  WeekdayKey,
  WeeklyMovieRow,
  FloorConfig,
} from "./types";
import { extractDateFromText } from "./pdf";

const DAY_COLUMN_CANDIDATES: Record<WeekdayKey, number[]> = {
  jueves: [1],
  viernes: [2],
  sabado: [3],
  domingo: [4],
  lunes: [5],
  martes: [6],
  miercoles: [7, 8],
};

const COLOR_BLACK = "000000";
const COLOR_WHITE = "FFFFFF";
const COLOR_GRAY = "808080";
const COLOR_LIGHT_GRAY = "D9D9D9";
const COLOR_SUBHEADER = "EFEFEF";
const COLOR_BORDER = "BFBFBF";

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function upper(value: string): string {
  return normalizeText(value).toUpperCase();
}

function normalizeMovieKey(value: string): string {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeMovieForPosterCompare(value: string): string {
  return normalizeMovieKey(value)
    .replace(/\b(2d|3d)\b/g, "")
    .replace(/\b(sub|cas)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isPantallaLabel(text: string): boolean {
  return /^(?:pantalla|screen)\s+\d+/i.test(text.trim());
}

function getSalaFromPantalla(text: string): number | null {
  const match = text.match(/^(?:pantalla|screen)\s+(\d+)/i);
  return match ? Number(match[1]) : null;
}

function extractCalificacion(movieTitle: string): string {
  const matches = [...movieTitle.matchAll(/\(([^)]+)\)/g)];
  if (!matches.length) return "";
  return matches[matches.length - 1]?.[1]?.trim() ?? "";
}

function translateCalificacion(value: string): string {
  const v = upper(value).replace(/\s+/g, "");
  if (v === "ATP") return "G";
  if (v === "ATPR") return "SP";
  if (v === "S13" || v === "SAM13" || v === "S13R" || v === "SAM13R") return "R-13";
  if (v === "S16" || v === "SAM16" || v === "S16R" || v === "SAM16R") return "R-17";
  if (v === "S18" || v === "SAM18") return "C";
  return upper(value);
}

function cleanMovieTitle(movieTitle: string): string {
  return movieTitle.replace(/\s*\([^)]+\)\s*$/g, "").trim();
}

function normalizeTime(value: string): string {
  return value.replace(/\./g, ":").trim();
}

function timeToMinutes(value: string): number {
  const normalized = normalizeTime(value);
  const [h, m] = normalized.split(":").map(Number);
  return h * 60 + m;
}

function timeToMinutesForLateNight(value: string): number {
  const minutes = timeToMinutes(value);
  if (minutes < 360) return minutes + 24 * 60;
  return minutes;
}

function parseRangesFromCell(cellValue: unknown): { inicio: string; fin: string }[] {
  const raw = normalizeText(cellValue);
  if (!raw) return [];

  const text = raw.replace(/[–—]/g, "-").replace(/\./g, ":");
  const matches = [...text.matchAll(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/g)];

  return matches.map((m) => ({
    inicio: normalizeTime(m[1]),
    fin: normalizeTime(m[2]),
  }));
}

function isRestrictedRating(calificacionTranslated: string): boolean {
  const v = calificacionTranslated.trim().toUpperCase();
  return v === "R-17" || v === "C";
}

async function readWorkbookFromUri(uri: string): Promise<XLSX.WorkBook> {
  if (Platform.OS === "web") {
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error(`No se pudo leer el archivo (${response.status})`);
    }

    const arrayBuffer = await response.arrayBuffer();

    return XLSX.read(arrayBuffer, {
      type: "array",
      cellDates: false,
      cellText: false,
    });
  }

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return XLSX.read(base64, {
    type: "base64",
    cellDates: false,
    cellText: false,
  });
}

function getFirstSheet(workbook: XLSX.WorkBook): XLSX.WorkSheet {
  const firstSheetName = workbook.SheetNames[0];
  return workbook.Sheets[firstSheetName];
}

function sheetToRows(sheet: XLSX.WorkSheet): any[][] {
  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  }) as any[][];
}

function getCellTextFromCandidates(row: any[], indexes: number[]): string {
  for (const idx of indexes) {
    const value = normalizeText(row?.[idx]);
    if (value) return value;
  }
  return "";
}

function is3DMovie(title: string): boolean {
  const t = normalizeMovieKey(title);
  return /\b3d\b/.test(t);
}

function defaultBorder(color = COLOR_BORDER) {
  return {
    top: { style: "thin", color: { rgb: color } },
    bottom: { style: "thin", color: { rgb: color } },
    left: { style: "thin", color: { rgb: color } },
    right: { style: "thin", color: { rgb: color } },
  };
}

function strongBlackBorder() {
  return {
    top: { style: "medium", color: { rgb: COLOR_BLACK } },
    bottom: { style: "medium", color: { rgb: COLOR_BLACK } },
    left: { style: "medium", color: { rgb: COLOR_BLACK } },
    right: { style: "medium", color: { rgb: COLOR_BLACK } },
  };
}

function thickDividerBorderRight(style: any) {
  return {
    ...style,
    border: {
      ...(style.border || {}),
      right: { style: "medium", color: { rgb: COLOR_BLACK } },
    },
  };
}

function thickDividerBorderLeft(style: any) {
  return {
    ...style,
    border: {
      ...(style.border || {}),
      left: { style: "medium", color: { rgb: COLOR_BLACK } },
    },
  };
}

function centeredStyle(extra: any = {}) {
  const font = {
    sz: 12,
    color: { rgb: COLOR_BLACK },
    name: "Calibri",
    ...(extra.font || {}),
  };

  return {
    alignment: {
      horizontal: "center",
      vertical: "center",
      wrapText: true,
      ...(extra.alignment || {}),
    },
    border: defaultBorder(),
    ...extra,
    font,
  };
}

function movieTextStyle(extra: any = {}) {
  const font = {
    sz: 11,
    bold: true,
    name: "Calibri",
    color: { rgb: COLOR_BLACK },
    ...(extra.font || {}),
  };

  return {
    alignment: {
      horizontal: "center",
      vertical: "center",
      wrapText: true,
      shrinkToFit: true,
      ...(extra.alignment || {}),
    },
    border: defaultBorder(),
    ...extra,
    font,
  };
}

function setCellStyle(ws: XLSX.WorkSheet, addr: string, style: any) {
  const cell: any = ws[addr];
  if (!cell) return;
  cell.s = style;
}

function setDefaultRowHeights(ws: XLSX.WorkSheet, totalRows: number, hpx = 17) {
  ws["!rows"] = Array.from({ length: totalRows }, () => ({ hpx }));
}

function styleRange(ws: XLSX.WorkSheet, cols: string[], row: number, style: any) {
  cols.forEach((col) => setCellStyle(ws, `${col}${row}`, style));
}

export async function parseWeeklyProgrammingExcel(
  uri: string
): Promise<{ rows: WeeklyMovieRow[]; startDate: Date | null }> {
  const workbook = await readWorkbookFromUri(uri);
  const sheet = getFirstSheet(workbook);
  const rows = sheetToRows(sheet);

  // 1. Scan the first 15 rows for a date cell (using same extractor as PDF)
  let startDate: Date | null = null;
  const maxScanRows = Math.min(rows.length, 15);
  for (let r = 0; r < maxScanRows; r++) {
    const row = rows[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const val = normalizeText(row[c]);
      if (val) {
        const d = extractDateFromText(val);
        if (d) {
          startDate = d;
          break;
        }
      }
    }
    if (startDate) break;
  }

  const result: WeeklyMovieRow[] = [];

  let currentSala: number | null = null;
  let currentMovie: WeeklyMovieRow | null = null;

  for (const row of rows) {
    const colA = normalizeText(row?.[0]);

    if (colA && isPantallaLabel(colA)) {
      currentSala = getSalaFromPantalla(colA);
      currentMovie = null;
      continue;
    }

    const hasAnyDayData = (Object.keys(DAY_COLUMN_CANDIDATES) as WeekdayKey[]).some((day) => {
      const text = getCellTextFromCandidates(row, DAY_COLUMN_CANDIDATES[day]);
      return !!text;
    });

    if (!currentSala || !hasAnyDayData) continue;

    if (colA) {
      currentMovie = {
        sala: currentSala,
        pelicula: cleanMovieTitle(colA),
        calificacion: extractCalificacion(colA),
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

      result.push(currentMovie);
    }

    if (!currentMovie) continue;

    (Object.keys(DAY_COLUMN_CANDIDATES) as WeekdayKey[]).forEach((day) => {
      const cellText = getCellTextFromCandidates(row, DAY_COLUMN_CANDIDATES[day]);
      const ranges = parseRangesFromCell(cellText);

      for (const range of ranges) {
        currentMovie!.horariosPorDia[day].push(`${range.inicio} - ${range.fin}`);
      }
    });
  }

  return { rows: result, startDate };
}

export function buildDailyProgramming(
  weeklyRows: WeeklyMovieRow[],
  day: WeekdayKey,
  dateLabel: string
): ProgramacionBuildResult {
  const allShows: DailyShow[] = [];

  for (const movie of weeklyRows) {
    const ranges = movie.horariosPorDia[day] ?? [];

    for (const item of ranges) {
      const normalized = item.replace(/[–—]/g, "-").replace(/\./g, ":");
      const match = normalized.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
      if (!match) continue;

      const inicio = normalizeTime(match[1]);
      const fin = normalizeTime(match[2]);

      const sortInicio = timeToMinutes(inicio);
      if (sortInicio >= 119 && sortInicio <= 300) {
        continue;
      }

      allShows.push({
        sala: movie.sala,
        pelicula: movie.pelicula,
        calificacion: movie.calificacion,
        inicio,
        fin,
        sortInicio: timeToMinutesForLateNight(inicio),
        sortFin: timeToMinutesForLateNight(fin),
      });
    }
  }

  const entrada = [...allShows].sort((a, b) => {
    if (a.sortInicio !== b.sortInicio) return a.sortInicio - b.sortInicio;
    return a.sala - b.sala;
  });

  const salida = [...allShows].sort((a, b) => {
    const aFin = a.sortFin;
    const bFin = b.sortFin;

    if (aFin !== bFin) return aFin - bFin;
    return a.sala - b.sala;
  });

  const bySala = new Map<number, DailyShow[]>();

  for (const show of entrada) {
    const list = bySala.get(show.sala) ?? [];
    list.push(show);
    bySala.set(show.sala, list);
  }

  const cambioSalaKeys = new Set<string>();

  for (const [sala, list] of bySala) {
    const ordered = [...list].sort((a, b) => a.sortInicio - b.sortInicio);

    for (let i = 1; i < ordered.length; i++) {
      const prev = ordered[i - 1];
      const current = ordered[i];

      if (
        normalizeMovieForPosterCompare(prev.pelicula) !==
        normalizeMovieForPosterCompare(current.pelicula)
      ) {
        cambioSalaKeys.add(`${sala}-${current.inicio}-${current.fin}-${current.pelicula}`);
      }
    }
  }

  return {
    dateLabel,
    entrada,
    salida,
    cambioSalaKeys,
  };
}

function createBaseRows(dateLabel: string, legendStartRow: number, hideLegend = false, skipDateRow = false): any[][] {
  const rows: any[][] = [];
  let currentIdx = 0;

  if (!skipDateRow) {
    rows[currentIdx++] = [upper(dateLabel), "", "", "", "", "", "", "", upper(dateLabel), "", "", "", "", "", ""];
  }

  rows[currentIdx++] = ["ENTRADA", "", "", "", "", "SALIDA", "", "", "ENTRADA", "", "", "", "", "SALIDA", ""];
  rows[currentIdx++] = [
    "INICIO", "SALA", "H", "PELÍCULA", "CALIF", "SALA", "FIN", "",
    "INICIO", "SALA", "H", "PELÍCULA", "CALIF", "SALA", "FIN",
  ];

  const totalRows = legendStartRow + (hideLegend ? 0 : 2);
  for (let i = currentIdx; i < totalRows; i++) {
    rows[i] = ["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""];
  }

  if (!hideLegend) {
    rows[legendStartRow - 1] = ["PELÍCULAS 3D", "", "", "", "", "", "", "", "PELÍCULAS 3D", "", "", "", "", "", ""];
    rows[legendStartRow] = ["CAMBIO DE POSTER", "", "", "", "", "", "", "", "CAMBIO DE POSTER", "", "", "", "", "", ""];

    const legend1 = "G = Audiencia General (ATP)  |  SP = Supervisión Parental Sugerida (ATPR)  |  R-13 = Restringida menores de 13 años";
    const legend2 = "R-17 = Restringida menores de 17 años  |  C = Solo apta mayores de 18 años";

    rows[legendStartRow + 1] = [legend1, "", "", "", "", "", "", "", legend1, "", "", "", "", "", ""];
    rows[legendStartRow + 2] = [legend2, "", "", "", "", "", "", "", legend2, "", "", "", "", "", ""];
  }

  return rows;
}

function applyPrintOptions(ws: XLSX.WorkSheet, lastRow: number) {
  const range = `A1:O${lastRow}`;
  ws["!ref"] = range;
  ws["!printArea"] = range;


  ws["!pageSetup"] = {
    orientation: "landscape",
    paperSize: 9, // A4
    fitToWidth: 1, // Ajustar al ancho de la página
    fitToHeight: 1, // Ajustar al alto de la página
  };

  ws["!margins"] = {
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    header: 0,
    footer: 0,
  };
}

function createBaseSheet(dateLabel: string, legendStartRow: number): XLSX.WorkSheet {
  const rows = createBaseRows(dateLabel, legendStartRow);
  const ws = XLSX.utils.aoa_to_sheet(rows);

  const totalRowsCount = rows.length;
  applyPrintOptions(ws, totalRowsCount);

  ws["!cols"] = [
    { wch: 12 }, // A INICIO
    { wch: 9 },  // B SALA
    { wch: 3 },  // C HAB.
    { wch: 62 }, // D PELICULA
    { wch: 10 }, // E CALIF
    { wch: 9 },  // F SALA (SALIDA)
    { wch: 12 }, // G FIN
    { wch: 3 },  // H separador
    { wch: 12 }, // I INICIO
    { wch: 9 },  // J SALA
    { wch: 3 },  // K HAB.
    { wch: 62 }, // L PELICULA
    { wch: 10 }, // M CALIF
    { wch: 9 },  // N SALA (SALIDA)
    { wch: 12 }, // O FIN
  ];

  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
    { s: { r: 0, c: 8 }, e: { r: 0, c: 14 } },

    { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
    { s: { r: 1, c: 5 }, e: { r: 1, c: 6 } },
    { s: { r: 1, c: 8 }, e: { r: 1, c: 12 } },
    { s: { r: 1, c: 13 }, e: { r: 1, c: 14 } },

    { s: { r: legendStartRow - 1, c: 0 }, e: { r: legendStartRow - 1, c: 6 } },
    { s: { r: legendStartRow - 1, c: 8 }, e: { r: legendStartRow - 1, c: 14 } },
    { s: { r: legendStartRow, c: 0 }, e: { r: legendStartRow, c: 6 } },
    { s: { r: legendStartRow, c: 8 }, e: { r: legendStartRow, c: 14 } },
    { s: { r: legendStartRow + 1, c: 0 }, e: { r: legendStartRow + 1, c: 6 } },
    { s: { r: legendStartRow + 1, c: 8 }, e: { r: legendStartRow + 1, c: 14 } },
    { s: { r: legendStartRow + 2, c: 0 }, e: { r: legendStartRow + 2, c: 6 } },
    { s: { r: legendStartRow + 2, c: 8 }, e: { r: legendStartRow + 2, c: 14 } },
  ];

  return ws;
}

function applyHalfStyles(
  ws: XLSX.WorkSheet,
  data: ProgramacionBuildResult,
  legendStartRow: number,
  startCols: {
    inicio: string;
    salaEntrada: string;
    hab: string;
    pelicula: string;
    calif: string;
    salaSalida: string;
    fin: string;
  },
  rowOffset = 0,
  hideLegend = false,
  skipDateRow = false
) {
  const off = rowOffset;
  const topDateStyle = centeredStyle({
    fill: { patternType: "solid", fgColor: { rgb: COLOR_LIGHT_GRAY } },
    font: { bold: true, sz: 14, name: "Calibri", color: { rgb: COLOR_BLACK } },
    border: defaultBorder(COLOR_BLACK),
  });

  const blockHeader = centeredStyle({
    fill: { patternType: "solid", fgColor: { rgb: COLOR_LIGHT_GRAY } },
    font: { bold: true, sz: 13, name: "Calibri", color: { rgb: COLOR_BLACK } },
    border: defaultBorder(COLOR_BLACK),
  });

  const subHeaderInicio = centeredStyle({
    fill: { patternType: "solid", fgColor: { rgb: COLOR_SUBHEADER } },
    font: { bold: true, sz: 12, name: "Calibri", color: { rgb: COLOR_BLACK } },
    border: strongBlackBorder(),
  });

  const subHeaderSala = centeredStyle({
    fill: { patternType: "solid", fgColor: { rgb: COLOR_SUBHEADER } },
    font: { bold: true, sz: 12, name: "Calibri", color: { rgb: COLOR_BLACK } },
    border: strongBlackBorder(),
  });

  const subHeaderHab = centeredStyle({
    fill: { patternType: "solid", fgColor: { rgb: COLOR_SUBHEADER } },
    font: { bold: true, sz: 12, name: "Calibri", color: { rgb: COLOR_BLACK } },
    border: defaultBorder(COLOR_BLACK),
  });

  const subHeaderPelicula = centeredStyle({
    fill: { patternType: "solid", fgColor: { rgb: COLOR_SUBHEADER } },
    font: { bold: true, sz: 12, name: "Calibri", color: { rgb: COLOR_BLACK } },
    border: defaultBorder(COLOR_BLACK),
  });

  const subHeaderCalif = thickDividerBorderRight(
    centeredStyle({
      fill: { patternType: "solid", fgColor: { rgb: COLOR_SUBHEADER } },
      font: { bold: true, sz: 12, name: "Calibri", color: { rgb: COLOR_BLACK } },
      border: defaultBorder(COLOR_BLACK),
    })
  );

  const subHeaderSalidaSala = thickDividerBorderLeft(
    centeredStyle({
      fill: { patternType: "solid", fgColor: { rgb: COLOR_SUBHEADER } },
      font: { bold: true, sz: 12, name: "Calibri", color: { rgb: COLOR_BLACK } },
      border: defaultBorder(COLOR_BLACK),
    })
  );

  const subHeaderSalidaFin = centeredStyle({
    fill: { patternType: "solid", fgColor: { rgb: COLOR_SUBHEADER } },
    font: { bold: true, sz: 12, name: "Calibri", color: { rgb: COLOR_BLACK } },
    border: defaultBorder(COLOR_BLACK),
  });

  const normalInicio = centeredStyle({
    font: { sz: 12, name: "Calibri", color: { rgb: COLOR_BLACK } },
    border: strongBlackBorder(),
  });

  const normalSala = centeredStyle({
    font: { sz: 12, name: "Calibri", color: { rgb: COLOR_BLACK } },
    border: strongBlackBorder(),
  });

  const normalHab = centeredStyle({
    font: { sz: 12, name: "Calibri", color: { rgb: COLOR_BLACK } },
    border: defaultBorder(COLOR_BLACK),
  });

  const normalCalif = thickDividerBorderRight(
    centeredStyle({
      font: { sz: 12, name: "Calibri", color: { rgb: COLOR_BLACK } },
      border: defaultBorder(),
    })
  );

  const normalSalidaSala = thickDividerBorderLeft(
    centeredStyle({
      font: { sz: 12, name: "Calibri", color: { rgb: COLOR_BLACK } },
      border: defaultBorder(),
    })
  );

  const normalSalidaFin = centeredStyle({
    font: { sz: 12, name: "Calibri", color: { rgb: COLOR_BLACK } },
    border: defaultBorder(),
  });

  const movieNormal = movieTextStyle({
    font: { sz: 11, bold: true, name: "Calibri", color: { rgb: COLOR_BLACK } },
    border: defaultBorder(),
  });

  const movieBoldRestricted = movieTextStyle({
    font: { sz: 11, bold: true, name: "Calibri", color: { rgb: COLOR_BLACK } },
    border: defaultBorder(),
  });

  const califBoldRestricted = thickDividerBorderRight(
    centeredStyle({
      fill: { patternType: "solid", fgColor: { rgb: COLOR_BLACK } },
      font: { sz: 12, bold: true, name: "Calibri", color: { rgb: COLOR_WHITE } },
      border: defaultBorder(),
    })
  );

  const movie3D = movieTextStyle({
    fill: { patternType: "solid", fgColor: { rgb: COLOR_GRAY } },
    font: { bold: true, sz: 11, name: "Calibri", color: { rgb: COLOR_WHITE } },
    border: defaultBorder(),
  });

  const generic3D = centeredStyle({
    fill: { patternType: "solid", fgColor: { rgb: COLOR_GRAY } },
    font: { bold: true, sz: 12, name: "Calibri", color: { rgb: COLOR_WHITE } },
    border: defaultBorder(),
  });

  const generic3DStrongBorder = centeredStyle({
    fill: { patternType: "solid", fgColor: { rgb: COLOR_GRAY } },
    font: { bold: true, sz: 12, name: "Calibri", color: { rgb: COLOR_WHITE } },
    border: strongBlackBorder(),
  });

  const generic3DCalif = thickDividerBorderRight(
    centeredStyle({
      fill: { patternType: "solid", fgColor: { rgb: COLOR_GRAY } },
      font: { bold: true, sz: 12, name: "Calibri", color: { rgb: COLOR_WHITE } },
      border: defaultBorder(),
    })
  );

  const generic3DSalidaSala = thickDividerBorderLeft(
    centeredStyle({
      fill: { patternType: "solid", fgColor: { rgb: COLOR_GRAY } },
      font: { bold: true, sz: 12, name: "Calibri", color: { rgb: COLOR_WHITE } },
      border: defaultBorder(),
    })
  );

  const posterChangeSalaStyle = centeredStyle({
    fill: { patternType: "solid", fgColor: { rgb: COLOR_BLACK } },
    font: { bold: true, sz: 12, name: "Calibri", color: { rgb: COLOR_WHITE } },
    border: strongBlackBorder(),
  });

  const legend3DStyle = centeredStyle({
    fill: { patternType: "solid", fgColor: { rgb: COLOR_GRAY } },
    font: { bold: true, sz: 12, name: "Calibri", color: { rgb: COLOR_WHITE } },
    border: defaultBorder(COLOR_BLACK),
  });

  const legendPosterStyle = centeredStyle({
    fill: { patternType: "solid", fgColor: { rgb: COLOR_BLACK } },
    font: { bold: true, sz: 12, name: "Calibri", color: { rgb: COLOR_WHITE } },
    border: defaultBorder(),
  });

  const row1 = 1 + off;
  const row2 = 2 + off;
  const row3 = 3 + off;

  if (!skipDateRow) {
    styleRange(ws, [startCols.inicio, startCols.salaEntrada, startCols.hab, startCols.pelicula, startCols.calif, startCols.salaSalida, startCols.fin], row1, topDateStyle);
    styleRange(ws, [startCols.inicio, startCols.salaEntrada, startCols.hab, startCols.pelicula, startCols.calif, startCols.salaSalida, startCols.fin], row2, blockHeader);
    setCellStyle(ws, `${startCols.inicio}${row3}`, subHeaderInicio);
    setCellStyle(ws, `${startCols.salaEntrada}${row3}`, subHeaderSala);
    setCellStyle(ws, `${startCols.hab}${row3}`, subHeaderHab);
    setCellStyle(ws, `${startCols.pelicula}${row3}`, subHeaderPelicula);
    setCellStyle(ws, `${startCols.calif}${row3}`, subHeaderCalif);
    setCellStyle(ws, `${startCols.salaSalida}${row3}`, subHeaderSalidaSala);
    setCellStyle(ws, `${startCols.fin}${row3}`, subHeaderSalidaFin);
  } else {
    // ENTRADA header is row1, subheaders is row2
    styleRange(ws, [startCols.inicio, startCols.salaEntrada, startCols.hab, startCols.pelicula, startCols.calif, startCols.salaSalida, startCols.fin], row1, blockHeader);
    setCellStyle(ws, `${startCols.inicio}${row2}`, subHeaderInicio);
    setCellStyle(ws, `${startCols.salaEntrada}${row2}`, subHeaderSala);
    setCellStyle(ws, `${startCols.hab}${row2}`, subHeaderHab);
    setCellStyle(ws, `${startCols.pelicula}${row2}`, subHeaderPelicula);
    setCellStyle(ws, `${startCols.calif}${row2}`, subHeaderCalif);
    setCellStyle(ws, `${startCols.salaSalida}${row2}`, subHeaderSalidaSala);
    setCellStyle(ws, `${startCols.fin}${row2}`, subHeaderSalidaFin);
  }

  const dataStartExcelRow = (skipDateRow ? 3 : 4) + off;
  const lastDataRow = Math.max(data.entrada.length, data.salida.length, 1) + (skipDateRow ? 2 : 3) + off;

  for (let row = dataStartExcelRow; row <= lastDataRow; row++) {
    setCellStyle(ws, `${startCols.inicio}${row}`, normalInicio);
    setCellStyle(ws, `${startCols.salaEntrada}${row}`, normalSala);
    setCellStyle(ws, `${startCols.hab}${row}`, normalHab);
    setCellStyle(ws, `${startCols.pelicula}${row}`, movieNormal);
    setCellStyle(ws, `${startCols.calif}${row}`, normalCalif);
    setCellStyle(ws, `${startCols.salaSalida}${row}`, normalSalidaSala);
    setCellStyle(ws, `${startCols.fin}${row}`, normalSalidaFin);
  }

  data.entrada.forEach((item, idx) => {
    const row = dataStartExcelRow + idx;
    const key = `${item.sala}-${item.inicio}-${item.fin}-${item.pelicula}`;
    const is3D = is3DMovie(item.pelicula);
    const isPosterChange = data.cambioSalaKeys.has(key);
    const translated = translateCalificacion(item.calificacion);
    const isRestricted = isRestrictedRating(translated);

    if (is3D) {
      setCellStyle(ws, `${startCols.inicio}${row}`, generic3DStrongBorder);
      setCellStyle(ws, `${startCols.salaEntrada}${row}`, generic3DStrongBorder);
      setCellStyle(ws, `${startCols.hab}${row}`, generic3D);
      setCellStyle(ws, `${startCols.pelicula}${row}`, movie3D);
      setCellStyle(ws, `${startCols.calif}${row}`, isRestricted ? califBoldRestricted : generic3DCalif);
    } else if (isRestricted) {
      setCellStyle(ws, `${startCols.pelicula}${row}`, movieBoldRestricted);
      setCellStyle(ws, `${startCols.calif}${row}`, califBoldRestricted);
    }

    if (isPosterChange) {
      setCellStyle(ws, `${startCols.salaEntrada}${row}`, posterChangeSalaStyle);
    }
  });

  data.salida.forEach((item, idx) => {
    const row = dataStartExcelRow + idx;
    if (is3DMovie(item.pelicula)) {
      setCellStyle(ws, `${startCols.salaSalida}${row}`, generic3DSalidaSala);
      setCellStyle(ws, `${startCols.fin}${row}`, generic3D);
    }
  });

  if (!hideLegend) {
    styleRange(ws, [startCols.inicio, startCols.salaEntrada, startCols.hab, startCols.pelicula, startCols.calif, startCols.salaSalida, startCols.fin], legendStartRow + off, legend3DStyle);
    styleRange(ws, [startCols.inicio, startCols.salaEntrada, startCols.hab, startCols.pelicula, startCols.calif, startCols.salaSalida, startCols.fin], legendStartRow + 1 + off, legendPosterStyle);

    const legend1Style = centeredStyle({ fontSize: 9, bold: true });
    const legend2Style = centeredStyle({ fontSize: 9, bold: true });

    styleRange(ws, [startCols.inicio, startCols.salaEntrada, startCols.hab, startCols.pelicula, startCols.calif, startCols.salaSalida, startCols.fin], legendStartRow + 2 + off, legend1Style);
    styleRange(ws, [startCols.inicio, startCols.salaEntrada, startCols.hab, startCols.pelicula, startCols.calif, startCols.salaSalida, startCols.fin], legendStartRow + 3 + off, legend2Style);
  }
}

function clearAreaSeparatorColumn(ws: XLSX.WorkSheet, startRow: number, endRow: number) {
  for (let row = startRow; row <= endRow; row++) {
    ws[`H${row}`] = { t: "s", v: "" };
    setCellStyle(ws, `H${row}`, {
      fill: { patternType: "solid", fgColor: { rgb: COLOR_WHITE } },
      border: defaultBorder(),
    });
  }
}

function fillPrograArea(
  ws: XLSX.WorkSheet,
  data: ProgramacionBuildResult,
  rowOffset: number,
  hideLegend = false,
  skipDateRow = false
) {
  const dataRows = Math.max(data.entrada.length, data.salida.length, 1);
  const legendStartRow = dataRows + (skipDateRow ? 3 : 4);

  const entradaRows = data.entrada.map((item) => [
    upper(item.inicio),
    item.sala,
    "",
    upper(item.pelicula),
    translateCalificacion(item.calificacion),
  ]);

  const salidaRows = data.salida.map((item) => [item.sala, upper(item.fin)]);

  const dataStartRow = (skipDateRow ? 3 : 4) + rowOffset;
  const originEntrada1 = `A${dataStartRow}`;
  const originEntrada2 = `I${dataStartRow}`;
  const originSalida1 = `F${dataStartRow}`;
  const originSalida2 = `N${dataStartRow}`;

  if (entradaRows.length) {
    XLSX.utils.sheet_add_aoa(ws, entradaRows, { origin: originEntrada1 });
    XLSX.utils.sheet_add_aoa(ws, entradaRows, { origin: originEntrada2 });
  }

  if (salidaRows.length) {
    XLSX.utils.sheet_add_aoa(ws, salidaRows, { origin: originSalida1 });
    XLSX.utils.sheet_add_aoa(ws, salidaRows, { origin: originSalida2 });
  }

  const columns1 = {
    inicio: "A",
    salaEntrada: "B",
    hab: "C",
    pelicula: "D",
    calif: "E",
    salaSalida: "F",
    fin: "G",
  };
  const columns2 = {
    inicio: "I",
    salaEntrada: "J",
    hab: "K",
    pelicula: "L",
    calif: "M",
    salaSalida: "N",
    fin: "O",
  };

  applyHalfStyles(ws, data, legendStartRow, columns1, rowOffset, hideLegend, skipDateRow);
  applyHalfStyles(ws, data, legendStartRow, columns2, rowOffset, hideLegend, skipDateRow);

  const clearEndRow = (hideLegend ? dataRows + (skipDateRow ? 2 : 3) : legendStartRow + 3) + rowOffset;
  clearAreaSeparatorColumn(ws, 1 + rowOffset, clearEndRow);
}

export async function generateProgramacionWorkbook(params: GenerateProgramacionParams): Promise<{
  uri?: string;
  fileName: string;
  data: ProgramacionBuildResult;
  webArrayBuffer?: ArrayBuffer;
}> {
  const { weeklyRows, day, floorConfig, dateLabel } = params;
  const finalDateLabel = dateLabel || WEEKDAY_LABELS[day];

  const data = buildDailyProgramming(weeklyRows, day, finalDateLabel);

  const dataRowsFull = Math.max(data.entrada.length, data.salida.length, 1);
  const legendStartRowFull = dataRowsFull + 4;

  const ws = createBaseSheet(finalDateLabel, legendStartRowFull);
  setDefaultRowHeights(ws, legendStartRowFull + 10, 17);

  const lastRowSheet1 = legendStartRowFull + 3;
  let finalMaxRow = lastRowSheet1;

  const wb = XLSX.utils.book_new();

  if (floorConfig && floorConfig.active) {
    const floorWs = XLSX.utils.aoa_to_sheet([["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]]);
    floorWs["!cols"] = ws["!cols"];
    floorWs["!merges"] = [];

    let currentRowOffset = 0;
    const floorLabels = ["PRIMER PISO", "SEGUNDO PISO", "TERCER PISO", "CUARTO PISO"];

    const count = parseInt(floorConfig.count.toString(), 10) || 0;
    for (let i = 0; i < count; i++) {
      const range = floorConfig.ranges[i];
      const floorEntrada = data.entrada.filter(
        (val) => Number(val.sala) >= range.from && Number(val.sala) <= range.to
      );
      const floorSalida = data.salida.filter(
        (val) => Number(val.sala) >= range.from && Number(val.sala) <= range.to
      );

      if (floorEntrada.length === 0 && floorSalida.length === 0) continue;

      const floorData: ProgramacionBuildResult = {
        ...data,
        entrada: floorEntrada,
        salida: floorSalida,
        dateLabel: floorLabels[i] || `PISO ${i + 1}`,
      };

      const floorRowsCount = Math.max(floorEntrada.length, floorSalida.length, 1);
      const baseRows = createBaseRows(floorData.dateLabel, floorRowsCount + 4, true, true);

      XLSX.utils.sheet_add_aoa(floorWs, baseRows, { origin: `A${currentRowOffset + 1}` });

      const floorMerges = [
        { s: { r: currentRowOffset, c: 0 }, e: { r: currentRowOffset, c: 4 } },
        { s: { r: currentRowOffset, c: 5 }, e: { r: currentRowOffset, c: 6 } },
        { s: { r: currentRowOffset, c: 8 }, e: { r: currentRowOffset, c: 12 } },
        { s: { r: currentRowOffset, c: 13 }, e: { r: currentRowOffset, c: 14 } },
      ];
      floorWs["!merges"]!.push(...floorMerges);

      fillPrograArea(floorWs, floorData, currentRowOffset, true, true);

      const blockHeight = floorRowsCount + 2;
      const isLastFloor = i === count - 1;

      if (!isLastFloor) {
        currentRowOffset += blockHeight + 3; // +3 de separación
      } else {
        currentRowOffset += blockHeight;
      }
    }

    const lastRowSheet2 = currentRowOffset;
    finalMaxRow = Math.max(lastRowSheet1, lastRowSheet2);

    // Ajustamos ref para que Excel reconozca el nuevo largo sincronizado
    ws["!ref"] = `A1:O${finalMaxRow}`;
    floorWs["!ref"] = `A1:O${finalMaxRow}`;

    applyPrintOptions(ws, finalMaxRow);
    applyPrintOptions(floorWs, finalMaxRow);

    fillPrograArea(ws, data, 0, false);

    XLSX.utils.book_append_sheet(wb, ws, "PROGRA");
    XLSX.utils.book_append_sheet(wb, floorWs, "PISOS");
  } else {
    applyPrintOptions(ws, lastRowSheet1);
    fillPrograArea(ws, data, 0, false);
    XLSX.utils.book_append_sheet(wb, ws, "PROGRA");
  }

  const safeDate = finalDateLabel
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");

  const fileName = `programacion-${safeDate}.xlsx`;

  if (Platform.OS === "web") {
    const webArrayBuffer = XLSX.write(wb, {
      type: "array",
      bookType: "xlsx",
      cellStyles: true,
    }) as ArrayBuffer;

    return {
      fileName,
      data,
      webArrayBuffer,
    };
  }

  const base64 = XLSX.write(wb, {
    type: "base64",
    bookType: "xlsx",
    cellStyles: true,
  });

  const outputUri = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(outputUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return {
    uri: outputUri,
    fileName,
    data,
  };
}

export async function generateWeeklyProgramacionWorkbook(params: {
  weeklyRows: WeeklyMovieRow[];
  startDate: Date | null;
  floorConfig?: FloorConfig;
}): Promise<{
  uri?: string;
  fileName: string;
  webArrayBuffer?: ArrayBuffer;
}> {
  const { weeklyRows, startDate, floorConfig } = params;

  const wb = XLSX.utils.book_new();
  const daysOrdered: WeekdayKey[] = ["jueves", "viernes", "sabado", "domingo", "lunes", "martes", "miercoles"];

  // Re-define MONTH_LABELS_ES and DAY_OFFSETS for date formatting
  const MONTH_LABELS_ES = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];
  const DAY_OFFSETS: Record<WeekdayKey, number> = {
    jueves: 0,
    viernes: 1,
    sabado: 2,
    domingo: 3,
    lunes: 4,
    martes: 5,
    miercoles: 6,
  };

  const getDayDateLabel = (day: WeekdayKey): string => {
    const label = WEEKDAY_LABELS[day];
    if (!startDate) return label;
    const offset = DAY_OFFSETS[day];
    const d = new Date(startDate);
    d.setDate(d.getDate() + offset);
    const dd = String(d.getDate()).padStart(2, "0");
    const month = MONTH_LABELS_ES[d.getMonth()];
    const yyyy = d.getFullYear();
    return `${label} ${dd} de ${month.charAt(0).toUpperCase() + month.slice(1)} de ${yyyy}`;
  };

  for (const day of daysOrdered) {
    const finalDateLabel = getDayDateLabel(day);
    const data = buildDailyProgramming(weeklyRows, day, finalDateLabel);

    const dataRowsFull = Math.max(data.entrada.length, data.salida.length, 1);
    const legendStartRowFull = dataRowsFull + 4;

    const ws = createBaseSheet(finalDateLabel, legendStartRowFull);
    setDefaultRowHeights(ws, legendStartRowFull + 10, 17);

    const lastRowSheet1 = legendStartRowFull + 3;
    let finalMaxRow = lastRowSheet1;

    // Determine sheet names (upper case day names, and handle floors if config is active)
    const sheetNameBase = WEEKDAY_LABELS[day].toUpperCase();

    if (floorConfig && floorConfig.active) {
      const floorWs = XLSX.utils.aoa_to_sheet([["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]]);
      floorWs["!cols"] = ws["!cols"];
      floorWs["!merges"] = [];

      let currentRowOffset = 0;
      const floorLabels = ["PRIMER PISO", "SEGUNDO PISO", "TERCER PISO", "CUARTO PISO"];

      const count = parseInt(floorConfig.count.toString(), 10) || 0;
      for (let i = 0; i < count; i++) {
        const range = floorConfig.ranges[i];
        const floorEntrada = data.entrada.filter(
          (val) => Number(val.sala) >= range.from && Number(val.sala) <= range.to
        );
        const floorSalida = data.salida.filter(
          (val) => Number(val.sala) >= range.from && Number(val.sala) <= range.to
        );

        if (floorEntrada.length === 0 && floorSalida.length === 0) continue;

        const floorData: ProgramacionBuildResult = {
          ...data,
          entrada: floorEntrada,
          salida: floorSalida,
          dateLabel: floorLabels[i] || `PISO ${i + 1}`,
        };

        const floorRowsCount = Math.max(floorEntrada.length, floorSalida.length, 1);
        const baseRows = createBaseRows(floorData.dateLabel, floorRowsCount + 4, true, true);

        XLSX.utils.sheet_add_aoa(floorWs, baseRows, { origin: `A${currentRowOffset + 1}` });

        const floorMerges = [
          { s: { r: currentRowOffset, c: 0 }, e: { r: currentRowOffset, c: 4 } },
          { s: { r: currentRowOffset, c: 5 }, e: { r: currentRowOffset, c: 6 } },
          { s: { r: currentRowOffset, c: 8 }, e: { r: currentRowOffset, c: 12 } },
          { s: { r: currentRowOffset, c: 13 }, e: { r: currentRowOffset, c: 14 } },
        ];
        floorWs["!merges"]!.push(...floorMerges);

        fillPrograArea(floorWs, floorData, currentRowOffset, true, true);

        const blockHeight = floorRowsCount + 2;
        const isLastFloor = i === count - 1;

        if (!isLastFloor) {
          currentRowOffset += blockHeight + 3; // +3 de separación
        } else {
          currentRowOffset += blockHeight;
        }
      }

      const lastRowSheet2 = currentRowOffset;
      finalMaxRow = Math.max(lastRowSheet1, lastRowSheet2);

      ws["!ref"] = `A1:O${finalMaxRow}`;
      floorWs["!ref"] = `A1:O${finalMaxRow}`;

      applyPrintOptions(ws, finalMaxRow);
      applyPrintOptions(floorWs, finalMaxRow);

      fillPrograArea(ws, data, 0, false);

      XLSX.utils.book_append_sheet(wb, ws, sheetNameBase);
      // Limit to 31 chars (e.g. "JUEVES PISOS")
      XLSX.utils.book_append_sheet(wb, floorWs, `${sheetNameBase.substring(0, 25)} PISOS`);
    } else {
      applyPrintOptions(ws, lastRowSheet1);
      fillPrograArea(ws, data, 0, false);
      XLSX.utils.book_append_sheet(wb, ws, sheetNameBase);
    }
  }

  let formattedDate = "semanal";
  if (startDate) {
    const sd = new Date(startDate);
    const dd = String(sd.getDate()).padStart(2, "0");
    const mm = String(sd.getMonth() + 1).padStart(2, "0");
    const yyyy = sd.getFullYear();
    formattedDate = `${dd}-${mm}-${yyyy}`;
  }
  const fileName = `programacion-semanal-${formattedDate}.xlsx`;

  if (Platform.OS === "web") {
    const webArrayBuffer = XLSX.write(wb, {
      type: "array",
      bookType: "xlsx",
      cellStyles: true,
    }) as ArrayBuffer;

    return {
      fileName,
      webArrayBuffer,
    };
  }

  const base64 = XLSX.write(wb, {
    type: "base64",
    bookType: "xlsx",
    cellStyles: true,
  });

  const outputUri = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(outputUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return {
    uri: outputUri,
    fileName,
  };
}
