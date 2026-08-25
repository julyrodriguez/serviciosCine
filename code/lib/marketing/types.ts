export type MarketingActionType = "dejar" | "retirar" | "colocar" | "mover";

export type MarketingRoomInstruction = {
  pelicula: string;
  detalle: string;
};

export type MarketingRoomPlan = {
  sala: number;
  funciones: MarketingRoomInstruction[];
  dataExtra: MarketingRoomInstruction[];
};

export type MarketingGlobalPosterCount = {
  pelicula: string;
  cantidad: number;
  salas: number[];
  possibleSourceSalas?: number[];
  mode?: "nuevo" | "movimiento";
};

export type MarketingGlobalMove = {
  pelicula: string;
  desdeSalas: number[];
  haciaSalas: number[];
  cantidad: number;
};

export type MarketingCompareSummary = {
  totalDejar: number;
  totalRetirar: number;
  totalColocar: number;
  totalMovimientos: number;
  salasSinCambios: number;

  postersNuevosGlobales: MarketingGlobalPosterCount[];
  postersRetirarGlobales: MarketingGlobalPosterCount[];
  postersMoverGlobales: MarketingGlobalMove[];
};

export type MarketingCompareResult = {
  generatedAtIso: string;
  salas: MarketingRoomPlan[];
  summary: MarketingCompareSummary;
  ponerEnCarteleraPorSala: Record<string, string>;
};

export type MarketingParsedRow = {
  sala: number;
  pelicula: string;
  hora?: string | null;
};

export type MarketingMovieOccurrence = {
  key: string;
  title: string;
  sala: number;
};

export type EventoForPrint = {
  pelicula: string;
  sala: string;      // puede ser "AC" (a confirmar) o un número
  fecha: string;      // ej: "Vie 10 abr"
  hora: string;       // ej: "19:30"
};