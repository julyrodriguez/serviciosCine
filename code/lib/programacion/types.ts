// lib/programacion/types.ts

export type WeekdayKey =
  | "jueves"
  | "viernes"
  | "sabado"
  | "domingo"
  | "lunes"
  | "martes"
  | "miercoles";

export const WEEKDAY_LABELS: Record<WeekdayKey, string> = {
  jueves: "Jueves",
  viernes: "Viernes",
  sabado: "Sábado",
  domingo: "Domingo",
  lunes: "Lunes",
  martes: "Martes",
  miercoles: "Miércoles",
};

export type WeeklyMovieRow = {
  sala: number;
  pelicula: string;
  calificacion: string;
  horariosPorDia: Record<WeekdayKey, string[]>;
};

export type DailyShow = {
  sala: number;
  pelicula: string;
  calificacion: string;
  inicio: string;
  fin: string;
  sortInicio: number;
  sortFin: number;
};

export type ProgramacionBuildResult = {
  dateLabel: string;
  entrada: DailyShow[];
  salida: DailyShow[];
  cambioSalaKeys: Set<string>;
};

export type FloorRange = {
  from: number;
  to: number;
};

export type FloorConfig = {
  active: boolean;
  count: number;
  ranges: FloorRange[];
};

export type GenerateProgramacionParams = {
  weeklyRows: WeeklyMovieRow[];
  day: WeekdayKey;
  dateLabel?: string;
  floorConfig?: FloorConfig;
};