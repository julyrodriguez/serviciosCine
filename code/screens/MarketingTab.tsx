import * as DocumentPicker from "expo-document-picker";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import {
  collection,
  getDocs,
  orderBy,
  query,
  where,
  doc,
  getDoc,
} from "@/lib/dbService";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import dayjs from "dayjs";

import { getCineConfig } from "../../lib/cineConfig";
import { CINES_COLLECTION, db } from "../../lib/firebaseConfig";
import { compareMarketingWeeks } from "../../lib/marketing/compare";
import { parseMarketingExcelFromArrayBuffer } from "../../lib/marketing/excel";
import { buildMarketingPrintHtml } from "../../lib/marketing/print";
import {
  EventoForPrint,
  MarketingCompareResult,
  MarketingParsedRow,
} from "../../lib/marketing/types";
import { COLORS, THEME } from "../../lib/theme";
import { useAuthUser } from "../../lib/useAuthUser";
import {
  DIAS_SEMANA_SHORT,
  MESES_ABBR,
} from "@/shared/utils";
import { toDate } from "@/shared/utils";

const MKT = {
  warning: Platform.OS === "web" ? "var(--warning, #8a5a00)" : "#8a5a00",
  warningBg: Platform.OS === "web" ? "var(--warning-bg, #fff4d6)" : "#fff4d6",
};

function getMovieWeekStartForNow(): string {
  const localDate = new Date(Date.now() - (3 * 60 * 60 * 1000));
  if (localDate.getUTCHours() < 6) {
    localDate.setTime(localDate.getTime() - 24 * 60 * 60 * 1000);
  }
  const dayNum = localDate.getUTCDay();
  const daysToSubtract = dayNum <= 3 ? dayNum + 3 : dayNum - 4;
  const thurDate = new Date(localDate.getTime() - daysToSubtract * 24 * 60 * 60 * 1000);
  const yyyy = thurDate.getUTCFullYear();
  const mm = String(thurDate.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(thurDate.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatWeekRange(weekStart: string): string {
  if (!weekStart) return "";
  const [y, m, d] = weekStart.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d));
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
  const startD = start.getUTCDate();
  const startM = start.getUTCMonth() + 1;
  const endD = end.getUTCDate();
  const endM = end.getUTCMonth() + 1;
  return `Semana del ${startD}/${startM} al ${endD}/${endM}`;
}

const mapShowtimesToMarketingRows = (sessions: any[], weekStart: string): MarketingParsedRow[] => {
  const rows: MarketingParsedRow[] = [];
  sessions.forEach((session: any) => {
    const sala = Number(session.theaterRoom);
    if (isNaN(sala)) return;

    const formatStr = (session.sessionFormat || "").toUpperCase().includes("3D") ? "3D" : "2D";
    const langName = (session.language?.name || session.language || "").toUpperCase();
    let langStr = "CAS";
    if (langName.includes("SUB") || langName.includes("ING") || langName.includes("ORIG")) {
      langStr = "SUB";
    }
    const movieTitle = `${session.movieName} ${formatStr} ${langStr}`.toUpperCase();

    const displayDate = session.sessionDisplayDate || (session.sessionDateTime ? session.sessionDateTime.substring(0, 10) : "");
    const isJueves = displayDate === weekStart;
    const hora = isJueves && session.sessionDateTime ? session.sessionDateTime.substring(11, 16) : null;

    rows.push({
      sala,
      pelicula: movieTitle,
      hora,
    });
  });
  return rows;
};

type LoadedSheet = {
  name: string;
  rows: MarketingParsedRow[];
};

export default function MarketingTab() {
  const { cineId } = useAuthUser();

  const [prevSheet, setPrevSheet] = useState<LoadedSheet | null>(null);
  const [currSheet, setCurrSheet] = useState<LoadedSheet | null>(null);
  const [result, setResult] = useState<MarketingCompareResult | null>(null);

  const [salasCount, setSalasCount] = useState(12);
  const [loadingSalas, setLoadingSalas] = useState(true);

  const [loadingPick, setLoadingPick] = useState<"prev" | "curr" | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);

  const [showManual, setShowManual] = useState(false);
  const [eventos, setEventos] = useState<EventoForPrint[]>([]);
  const [loadingEventos, setLoadingEventos] = useState(true);

  const [sourceMode, setSourceMode] = useState<"excel" | "programacion">("excel");
  const [selectedWeekStart, setSelectedWeekStart] = useState<string>(() => getMovieWeekStartForNow());
  const [statusText, setStatusText] = useState("");
  const [loading, setLoading] = useState(false);

  const availableWeeks = useMemo(() => {
    const list: string[] = [];
    const currentThur = getMovieWeekStartForNow();
    const [y, m, d] = currentThur.split('-');
    const thurDate = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));

    for (let i = -4; i < 6; i++) {
      const nextThur = new Date(thurDate.getTime() + i * 7 * 24 * 60 * 60 * 1000);
      const yyyy = nextThur.getUTCFullYear();
      const mm = String(nextThur.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(nextThur.getUTCDate()).padStart(2, '0');
      list.push(`${yyyy}-${mm}-${dd}`);
    }
    return list;
  }, []);

  const handleModeChange = (mode: "excel" | "programacion") => {
    setSourceMode(mode);
    setPrevSheet(null);
    setCurrSheet(null);
    setResult(null);
    setStatusText("");
  };

  const canCompare = sourceMode === "programacion" ? (!loading && !loadingSalas && !!cineId) : (!!prevSheet && !!currSheet && !loadingSalas);

  useEffect(() => {
    let cancelled = false;

    async function loadConfig() {
      if (!cineId) {
        setSalasCount(12);
        setLoadingSalas(false);
        return;
      }

      try {
        setLoadingSalas(true);
        const cfg = await getCineConfig(cineId);

        if (cancelled) return;

        const count =
          cfg?.salasCount && Number.isFinite(cfg.salasCount) && cfg.salasCount > 0
            ? Math.floor(cfg.salasCount)
            : 12;

        setSalasCount(count);
      } catch (e) {
        console.error("Marketing config error:", e);
        if (!cancelled) {
          setSalasCount(12);
        }
      } finally {
        if (!cancelled) {
          setLoadingSalas(false);
        }
      }
    }

    loadConfig();

    return () => {
      cancelled = true;
    };
  }, [cineId]);

  // Fetch upcoming events from Firestore
  useEffect(() => {
    let cancelled = false;

    async function fetchEventos() {
      if (!cineId) {
        setEventos([]);
        setLoadingEventos(false);
        return;
      }

      try {
        setLoadingEventos(true);
        const now = new Date();
        const threshold = new Date(now.getTime() - 60 * 60 * 1000);
        const colRef = collection(db, CINES_COLLECTION, cineId, "eventos");
        const qy = query(
          colRef,
          where("diaHora", ">=", threshold),
          orderBy("diaHora", "asc")
        );
        const snap = await getDocs(qy);

        if (cancelled) return;

        const rows: EventoForPrint[] = snap.docs.map((d: any) => {
          const data = d.data() as any;
          const diaHora = toDate(data.diaHora);
          const valid = diaHora instanceof Date && !isNaN(diaHora.getTime());

          const diaSemana = valid ? DIAS_SEMANA_SHORT[diaHora.getDay()] : "???";
          const dia = valid ? diaHora.getDate() : 0;
          const mes = valid ? MESES_ABBR[diaHora.getMonth()] : "???";
          const hh = valid ? String(diaHora.getHours()).padStart(2, "0") : "--";
          const mm = valid ? String(diaHora.getMinutes()).padStart(2, "0") : "--";

          return {
            pelicula: data.pelicula || "Sin título",
            sala: String(data.sala ?? "AC"),
            fecha: `${diaSemana} ${dia} ${mes}`,
            hora: `${hh}:${mm}`,
          };
        });

        setEventos(rows);
      } catch (e) {
        console.error("Marketing fetchEventos error:", e);
        if (!cancelled) setEventos([]);
      } finally {
        if (!cancelled) setLoadingEventos(false);
      }
    }

    fetchEventos();
    return () => { cancelled = true; };
  }, [cineId]);

  async function pickExcel(which: "prev" | "curr") {
    try {
      setLoadingPick(which);

      const res = await DocumentPicker.getDocumentAsync({
        type: [
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-excel",
          "text/csv",
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (res.canceled) return;

      const asset = res.assets[0];
      const name =
        asset.name ?? (which === "prev" ? "semana-anterior" : "semana-actual");

      let buffer: ArrayBuffer;

      const maybeFile = (asset as any).file as File | undefined;
      if (maybeFile && typeof maybeFile.arrayBuffer === "function") {
        buffer = await maybeFile.arrayBuffer();
      } else {
        const response = await fetch(asset.uri);
        buffer = await response.arrayBuffer();
      }

      const rows = parseMarketingExcelFromArrayBuffer(buffer);

      if (!rows.length) {
        Alert.alert(
          "Archivo sin datos",
          "No encontré filas válidas con Sala y Película."
        );
        return;
      }

      const loaded = { name, rows };

      if (which === "prev") setPrevSheet(loaded);
      else setCurrSheet(loaded);

      setResult(null);
    } catch (e: any) {
      console.log("MKT pickExcel error:", e);
      Alert.alert(
        "Error leyendo Excel",
        e?.message ??
        "No pude leer el archivo. Verificá que tenga datos de Sala y Película."
      );
    } finally {
      setLoadingPick(null);
    }
  }

  async function handleCompare() {
    if (sourceMode === "excel") {
      if (!prevSheet || !currSheet) return;

      try {
        const compared = compareMarketingWeeks(
          prevSheet.rows,
          currSheet.rows,
          salasCount
        );
        setResult(compared);
      } catch (e: any) {
        Alert.alert(
          "Error al comparar",
          e?.message ?? "No se pudo comparar los excels."
        );
      }
    } else {
      // Programación (API Cinemark)
      if (!cineId) return;

      try {
        setLoading(true);
        setStatusText("Buscando programación de la semana...");

        const previousWeekStart = dayjs(selectedWeekStart).subtract(7, "day").format("YYYY-MM-DD");

        setStatusText("Obteniendo showtimes semana actual...");
        const newDocRef = doc(db, CINES_COLLECTION, cineId, "showtimes", selectedWeekStart);
        const newSnap = await getDoc(newDocRef);

        if (!newSnap.exists()) {
          Alert.alert(
            "Sin datos",
            `No hay showtimes guardados para la semana ${selectedWeekStart}. Por favor sincronizá la programación primero.`
          );
          setLoading(false);
          setStatusText("");
          return;
        }

        const newResultRows = newSnap.data()?.sessions || [];

        setStatusText("Obteniendo showtimes semana anterior...");
        const oldDocRef = doc(db, CINES_COLLECTION, cineId, "showtimes", previousWeekStart);
        const oldSnap = await getDoc(oldDocRef);
        const oldResultRows = oldSnap.exists() ? oldSnap.data()?.sessions || [] : [];

        setStatusText("Procesando datos de la API...");

        const currRows = mapShowtimesToMarketingRows(newResultRows, selectedWeekStart);
        const prevRows = mapShowtimesToMarketingRows(oldResultRows, previousWeekStart);

        const loadedPrev = {
          name: `API (${formatWeekRange(previousWeekStart)})`,
          rows: prevRows,
        };
        const loadedCurr = {
          name: `API (${formatWeekRange(selectedWeekStart)})`,
          rows: currRows,
        };

        setPrevSheet(loadedPrev);
        setCurrSheet(loadedCurr);

        setStatusText("Comparando programaciones...");

        const compared = compareMarketingWeeks(
          prevRows,
          currRows,
          salasCount
        );

        setResult(compared);
        setStatusText(`Comparación finalizada. Se procesaron ${currRows.length} sesiones.`);
      } catch (e: any) {
        console.error(e);
        Alert.alert(
          "Error de comparación",
          e?.message ?? "Ocurrió un error al procesar y comparar las programaciones de la API."
        );
        setStatusText("Error en la comparación.");
      } finally {
        setLoading(false);
      }
    }
  }

  async function handleExportPdf() {
    if (!result) return;

    try {
      setLoadingPdf(true);

      const html = buildMarketingPrintHtml(result, {
        semanaAnteriorLabel: prevSheet?.name ?? "Semana anterior",
        semanaActualLabel: currSheet?.name ?? "Semana actual",
        generadoPor: "mkt@usuario.local",
      }, eventos);

      if (Platform.OS === "web") {
        const printWindow = window.open("", "_blank", "width=1200,height=900");

        if (!printWindow) {
          throw new Error(
            "El navegador bloqueó la ventana de impresión. Permití popups e intentá de nuevo."
          );
        }

        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();

        const doPrint = () => {
          setTimeout(() => {
            printWindow.focus();
            printWindow.print();
          }, 500);
        };

        if (printWindow.document.readyState === "complete") {
          doPrint();
        } else {
          printWindow.onload = doPrint;
        }

        return;
      }

      const { uri } = await Print.printToFileAsync({ html });
      const canShare = await Sharing.isAvailableAsync();

      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: "Plan MKT - PDF",
          UTI: "com.adobe.pdf",
        });
      } else {
        Alert.alert("PDF generado", `Se generó el PDF en:\n${uri}`);
      }
    } catch (e: any) {
      Alert.alert(
        "Error al generar PDF",
        e?.message ?? "No pude generar el PDF."
      );
    } finally {
      setLoadingPdf(false);
    }
  }

  const quickStats = useMemo(() => {
    if (!result) return null;
    return result.summary;
  }, [result]);

  return (
    <ScrollView style={s.main} contentContainerStyle={s.content}>

      {/* TARJETA DE MANUAL */}
      <Pressable
        style={[s.card, s.manualCard, showManual && s.manualCardActive]}
        onPress={() => setShowManual(!showManual)}
      >
        <View style={s.rowBetween}>
          <View style={s.manualHeader}>
            <Text style={{ fontSize: 18 }}>📖</Text>
            <Text style={s.manualTitle}>Manual de Uso</Text>
          </View>
          <Text style={s.manualChevron}>{showManual ? "▲" : "▼"}</Text>
        </View>

        {showManual && (
          <View style={s.manualContent}>
            <View style={s.divider} />

            <View style={s.step}>
              <Text style={s.stepNumber}>1</Text>
              <View style={s.stepInfo}>
                <Text style={s.stepTitle}>Exportar Excels desde Vista</Text>
                <Text style={s.stepText}>• Buscar reporte: "Weekly sessions by screen" o "Función por pantalla semanal" en Vista.</Text>
                <Text style={s.stepText}>• En cada reporte, seleccionar el rango de fechas de jueves a jueves correspondiente a cada semana.</Text>
                <Text style={s.stepText}>• Generar un Excel Data Only para la semana anterior y otro para la semana actual.</Text>
              </View>
            </View>

            <View style={s.step}>
              <Text style={s.stepNumber}>2</Text>
              <View style={s.stepInfo}>
                <Text style={s.stepTitle}>Cargar y Comparar</Text>
                <Text style={s.stepText}>• Cargar ambos archivos en las secciones correspondientes.</Text>
                <Text style={s.stepText}>• Presionar "Comparar" para ver los cambios de pósters por sala.</Text>
              </View>
            </View>

            <View style={s.step}>
              <Text style={s.stepNumber}>3</Text>
              <View style={s.stepInfo}>
                <Text style={s.stepTitle}>Generar PDF</Text>
                <Text style={s.stepText}>• Una vez comparados los datos, presionar "Imprimir / Guardar PDF" para obtener el plan imprimible.</Text>
              </View>
            </View>
          </View>
        )}
      </Pressable>

      {/* TARJETA PRINCIPAL */}
      <View style={s.card}>
        {/* Selector de origen (Excel vs Programación) */}
        <View style={s.tabContainer}>
          <Pressable
            style={[s.tabButton, sourceMode === "excel" && s.tabButtonActive]}
            onPress={() => handleModeChange("excel")}
          >
            <Text style={[s.tabButtonText, sourceMode === "excel" && s.tabButtonTextActive]}>
              📁 Cargar Excels
            </Text>
          </Pressable>
          <Pressable
            style={[s.tabButton, sourceMode === "programacion" && s.tabButtonActive]}
            onPress={() => handleModeChange("programacion")}
          >
            <Text style={[s.tabButtonText, sourceMode === "programacion" && s.tabButtonTextActive]}>
              🔌 Programación (API)
            </Text>
          </Pressable>
        </View>

        {sourceMode === "excel" ? (
          <>
            {/* SECCIÓN 1: ARCHIVO SEMANA ANTERIOR */}
            <View style={s.section}>
              <Text style={s.sectionLabel}>Semana Anterior</Text>
              <Pressable
                style={[s.filePicker, !!prevSheet && s.filePickerActive]}
                onPress={() => pickExcel("prev")}
              >
                <View style={s.filePickerIcon}>
                  {loadingPick === "prev" ? (
                    <ActivityIndicator color={COLORS.primary} size="small" />
                  ) : (
                    <Text style={{ fontSize: 20 }}>📊</Text>
                  )}
                </View>
                <View style={s.filePickerInfo}>
                  <Text style={s.filePickerText}>
                    {prevSheet ? prevSheet.name : "Seleccionar Excel"}
                  </Text>
                  <Text style={s.filePickerSubtext}>
                    {prevSheet
                      ? `${prevSheet.rows.length} filas válidas`
                      : "Formatos .xlsx, .xls, .csv"}
                  </Text>
                </View>
              </Pressable>
            </View>

            <View style={s.divider} />

            {/* SECCIÓN 2: ARCHIVO SEMANA ACTUAL */}
            <View style={s.section}>
              <Text style={s.sectionLabel}>Semana Actual</Text>
              <Pressable
                style={[s.filePicker, !!currSheet && s.filePickerActive]}
                onPress={() => pickExcel("curr")}
              >
                <View style={s.filePickerIcon}>
                  {loadingPick === "curr" ? (
                    <ActivityIndicator color={COLORS.primary} size="small" />
                  ) : (
                    <Text style={{ fontSize: 20 }}>📊</Text>
                  )}
                </View>
                <View style={s.filePickerInfo}>
                  <Text style={s.filePickerText}>
                    {currSheet ? currSheet.name : "Seleccionar Excel"}
                  </Text>
                  <Text style={s.filePickerSubtext}>
                    {currSheet
                      ? `${currSheet.rows.length} filas válidas`
                      : "Formatos .xlsx, .xls, .csv"}
                  </Text>
                </View>
              </Pressable>
            </View>
          </>
        ) : (
          <View style={{ paddingVertical: 8 }}>
            <Text style={s.sectionLabel}>Seleccionar Semana Cinematográfica</Text>
            <Text style={[s.filePickerSubtext, { marginBottom: 12 }]}>
              Se comparará la programación de la semana seleccionada (semana actual) contra la semana anterior en base a la API sincronizada.
            </Text>
            {(() => {
              const currentIndex = availableWeeks.indexOf(selectedWeekStart);
              if (currentIndex === -1) return null;
              const canGoPrev = currentIndex > 0;
              const canGoNext = currentIndex < availableWeeks.length - 1;
              const currentWeek = getMovieWeekStartForNow();
              const isCurrent = selectedWeekStart === currentWeek;
              
              let weekLabel = formatWeekRange(selectedWeekStart);
              if (isCurrent) {
                weekLabel += " (Actual)";
              } else if (selectedWeekStart > currentWeek) {
                weekLabel += " (Preventa)";
              } else if (selectedWeekStart < currentWeek) {
                weekLabel += " (Pasada)";
              }
              
              return (
                <View style={s.singleWeekSelectorContainer}>
                  <Pressable
                    disabled={!canGoPrev}
                    onPress={() => {
                      setSelectedWeekStart(availableWeeks[currentIndex - 1]);
                      setResult(null);
                      setPrevSheet(null);
                      setCurrSheet(null);
                      setStatusText("");
                    }}
                    style={[s.arrowButton, !canGoPrev && s.arrowButtonDisabled]}
                  >
                    <Text style={{ fontSize: 14, fontWeight: "bold", color: canGoPrev ? COLORS.text : COLORS.muted }}>◀</Text>
                  </Pressable>
                  
                  <View style={s.singleWeekLabelContainer}>
                    <Text style={s.singleWeekLabelText}>{weekLabel}</Text>
                  </View>
      
                  <Pressable
                    disabled={!canGoNext}
                    onPress={() => {
                      setSelectedWeekStart(availableWeeks[currentIndex + 1]);
                      setResult(null);
                      setPrevSheet(null);
                      setCurrSheet(null);
                      setStatusText("");
                    }}
                    style={[s.arrowButton, !canGoNext && s.arrowButtonDisabled]}
                  >
                    <Text style={{ fontSize: 14, fontWeight: "bold", color: canGoNext ? COLORS.text : COLORS.muted }}>▶</Text>
                  </Pressable>
                </View>
              );
            })()}
          </View>
        )}

        <View style={s.divider} />

        {/* SECCIÓN 3: CONFIG SALAS */}
        <View style={s.section}>
          <View style={s.rowBetween}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={s.sectionLabel}>Salas del Cine</Text>
              <Text style={s.sectionSublabel}>
                {loadingSalas
                  ? "Cargando configuración..."
                  : `Este cine está configurado con ${salasCount} sala${salasCount === 1 ? "" : "s"}.`}
              </Text>
            </View>
            <View style={s.salasCountBadge}>
              <Text style={s.salasCountText}>
                {loadingSalas ? "..." : salasCount}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {!!statusText && (
        <Text style={{
          textAlign: "center",
          fontSize: 12,
          color: COLORS.muted,
          marginTop: -4,
          marginBottom: 12,
          fontStyle: "italic"
        }}>
          {statusText}
        </Text>
      )}

      {/* ACCIÓN PRINCIPAL */}
      <View style={s.actionArea}>
        <Pressable
          style={[s.mainButton, (!canCompare) && s.mainButtonDisabled]}
          onPress={handleCompare}
          disabled={!canCompare}
        >
          <Text style={s.mainButtonText}>
            {loadingSalas ? "CARGANDO SALAS..." : (loading ? "OBTENIENDO DATOS..." : "COMPARAR SEMANAS")}
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 10, fontWeight: "600" }}>
            {sourceMode === "programacion"
              ? (loading ? "Conectando con la base de datos..." : `Semana: ${formatWeekRange(selectedWeekStart)}`)
              : (prevSheet && currSheet ? "Archivos listos" : "Cargar ambos archivos")
            }
          </Text>
        </Pressable>

        {!!result && (
          <Pressable
            style={[s.secondaryButton, loadingPdf && s.mainButtonDisabled]}
            onPress={handleExportPdf}
            disabled={loadingPdf}
          >
            {loadingPdf ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <>
                <Text style={s.mainButtonText}>
                  {Platform.OS === "web" ? "IMPRIMIR / PDF" : "GENERAR PDF"}
                </Text>
                <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 10, fontWeight: "600" }}>
                  Plan de pósters
                </Text>
              </>
            )}
          </Pressable>
        )}
      </View>

      {/* RESUMEN RÁPIDO */}
      {quickStats && (
        <View style={s.summaryCard}>
          <View style={s.summaryHeader}>
            <Text style={s.summaryTitle}>Reporte de Comparación</Text>
            <Text style={s.summaryBadge}>OK</Text>
          </View>
          <View style={s.summaryGrid}>
            <View style={s.summaryItem}>
              <Text style={s.summaryValue}>{quickStats.totalDejar}</Text>
              <Text style={s.summaryLabel}>DEJAR</Text>
            </View>
            <View style={s.summaryVerticalDivider} />
            <View style={s.summaryItem}>
              <Text style={s.summaryValue}>{quickStats.postersRetirarGlobales.length}</Text>
              <Text style={s.summaryLabel}>SALEN</Text>
            </View>
            <View style={s.summaryVerticalDivider} />
            <View style={s.summaryItem}>
              <Text style={s.summaryValue}>{quickStats.totalColocar}</Text>
              <Text style={s.summaryLabel}>NUEVOS</Text>
            </View>
          </View>
        </View>
      )}

      {/* CARTELERA PRIMERA FUNCIÓN */}
      {result?.ponerEnCarteleraPorSala &&
        Object.keys(result.ponerEnCarteleraPorSala).length > 0 && (
          <View style={s.carteleraCard}>
            <View style={s.carteleraHeaderRow}>
              <Text style={{ fontSize: 16 }}>🎬</Text>
              <Text style={s.carteleraTitle}>Primera función del jueves</Text>
            </View>
            <View style={s.carteleraDivider} />
            {Object.entries(result.ponerEnCarteleraPorSala)
              .sort((a, b) => Number(a[0]) - Number(b[0]))
              .map(([sala, pelicula], idx) => (
                <View key={`cart-${sala}-${idx}`} style={s.carteleraRow}>
                  <View style={s.carteleraSalaBadge}>
                    <Text style={s.carteleraSalaText}>{sala}</Text>
                  </View>
                  <Text style={s.carteleraPelicula} numberOfLines={1}>
                    {pelicula || "Sin dato"}
                  </Text>
                </View>
              ))}
          </View>
        )}

      {/* NUEVOS / MOVIMIENTOS */}
      {quickStats && (quickStats.postersNuevosGlobales.length > 0 || quickStats.postersRetirarGlobales.length > 0) && (
        <View style={s.detailsCard}>
          {quickStats.postersNuevosGlobales.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionLabel}>🆕 Nuevos / Movimientos</Text>
              {quickStats.postersNuevosGlobales.map((item, idx) => {
                const hasMovement =
                  !!item.possibleSourceSalas && item.possibleSourceSalas.length > 0;

                return (
                  <View key={`new-${item.pelicula}-${idx}`} style={s.movementCard}>
                    <View style={s.movementCardRow}>
                      <View style={s.movementCardLeft}>
                        <Text style={s.movementTitle}>
                          {item.pelicula}
                        </Text>
                        <Text style={s.movementMeta}>
                          x{item.cantidad} → {item.cantidad === 1 ? "Sala" : "Salas"}{" "}
                          {item.salas.join(", ")}
                        </Text>
                        {hasMovement ? (
                          <Text style={s.movementSource}>
                            Puede moverse de sala {item.possibleSourceSalas!.join("/")}
                            {item.cantidad > item.possibleSourceSalas!.length ? (
                              ` - Bajar ${item.cantidad - item.possibleSourceSalas!.length} sí o sí de marketing`
                            ) : item.possibleSourceSalas!.length > item.cantidad ? (
                              ` - Devolver ${item.possibleSourceSalas!.length - item.cantidad} a marketing`
                            ) : ""}
                          </Text>
                        ) : (
                          <Text style={s.movementSource}>Poster nuevo sin movimiento posible</Text>
                        )}
                      </View>

                      {hasMovement ? (
                        <View style={s.checkBoxCard}>
                          <View style={s.checkOptionRow}>
                            <Text style={s.checkSquare}>☐</Text>
                            <Text style={s.checkLabel}>Nuevo</Text>
                          </View>
                          <View style={s.checkOptionRow}>
                            <Text style={s.checkSquare}>☐</Text>
                            <Text style={s.checkLabel}>Movimiento</Text>
                          </View>
                        </View>
                      ) : (
                        <View style={s.newOnlyBadge}>
                          <Text style={s.newOnlyBadgeText}>Nuevo</Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {quickStats.postersNuevosGlobales.length > 0 && quickStats.postersRetirarGlobales.length > 0 && (
            <View style={s.divider} />
          )}

          {quickStats.postersRetirarGlobales.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionLabel}>🎞️ Salen de cartelera</Text>
              {quickStats.postersRetirarGlobales.map((item, idx) => (
                <View key={`ret-${item.pelicula}-${idx}`} style={s.retireRow}>
                  <Text style={s.retireText}>
                    {item.pelicula}
                  </Text>
                  <Text style={s.retireMeta}>
                    x{item.cantidad} → {item.cantidad === 1 ? "Sala" : "Salas"}{" "}
                    {item.salas.join(", ")} - Devolver {item.cantidad} a marketing
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* EVENTOS */}
      <View style={s.eventosCard}>
        <View style={s.eventosHeaderRow}>
          <Text style={{ fontSize: 16 }}>📅</Text>
          <Text style={s.eventosTitle}>Eventos</Text>
          {loadingEventos && <ActivityIndicator size="small" color="#3b82f6" style={{ marginLeft: 8 }} />}
        </View>
        <Text style={s.eventosNote}>Revisar fecha del evento para ver si se da la semana entrante</Text>
        <View style={s.eventosDivider} />
        {eventos.length > 0 ? (
          eventos.map((ev, idx) => (
            <View key={`ev-${idx}`} style={s.eventoRow}>
              <View style={s.eventoInfo}>
                <Text style={s.eventoName} numberOfLines={1}>{ev.pelicula}</Text>
                <Text style={s.eventoMeta}>
                  {ev.sala.toUpperCase() === "AC" ? (
                    <Text style={s.eventoSalaAc}>A confirmar</Text>
                  ) : (
                    <Text>Sala {ev.sala}</Text>
                  )}
                  {" · "}{ev.fecha} · {ev.hora}
                </Text>
              </View>
            </View>
          ))
        ) : (
          <Text style={s.emptyText}>
            {loadingEventos ? "Cargando eventos..." : "No hay eventos pr\u00f3ximos cargados"}
          </Text>
        )}
      </View>

      {/* SALAS INDIVIDUALES */}
      {result?.salas.map((sala) => (
        <View key={sala.sala} style={s.roomCard}>
          <View style={s.roomHeader}>
            <View style={s.roomBadge}>
              <Text style={s.roomBadgeText}>{sala.sala}</Text>
            </View>
            <Text style={s.roomTitle}>Sala {sala.sala}</Text>
          </View>

          {result?.ponerEnCarteleraPorSala?.[String(sala.sala)] && (
            <View style={s.roomHighlight}>
              <Text style={s.roomHighlightLabel}>🎬 Primera función</Text>
              <Text style={s.roomHighlightValue}>
                {result.ponerEnCarteleraPorSala[String(sala.sala)]}
              </Text>
            </View>
          )}

          <View style={s.roomSection}>
            <Text style={s.roomSectionTitle}>Funciones</Text>
            {sala.funciones.length ? (
              sala.funciones.map((item, idx) => (
                <Text key={`${item.pelicula}-${idx}`} style={s.roomItemText}>
                  • {item.pelicula}
                </Text>
              ))
            ) : (
              <Text style={s.emptyText}>Sin funciones detectadas</Text>
            )}
          </View>
        </View>
      ))}

    </ScrollView>
  );
}

const s = StyleSheet.create({
  main: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16, gap: 16, paddingBottom: 40 },

  tabContainer: {
    flexDirection: "row",
    backgroundColor: COLORS.bg,
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    flexDirection: "row",
  },
  tabButtonActive: {
    backgroundColor: COLORS.card,
    ...THEME.shadow.soft,
  },
  tabButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.muted,
  },
  tabButtonTextActive: {
    color: COLORS.primary,
  },
  singleWeekSelectorContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.card,
    marginTop: 6,
    gap: 12,
  },
  singleWeekLabelContainer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: COLORS.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    minWidth: 220,
    alignItems: "center",
  },
  singleWeekLabelText: {
    fontSize: 12,
    color: COLORS.text,
    fontWeight: "bold",
  },
  arrowButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: COLORS.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: "center",
    alignItems: "center",
  },
  arrowButtonDisabled: {
    opacity: 0.4,
  },

  // Card base — matches ProgramacionTab
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...THEME.shadow.soft,
  },
  section: { gap: 12 },
  sectionLabel: {
    fontSize: 14.5,
    fontWeight: "900",
    color: COLORS.text,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  sectionSublabel: {
    fontSize: 12.5,
    color: COLORS.muted,
    marginTop: 4,
    fontWeight: "500",
  },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 18 },

  // File picker — matches ProgramacionTab
  filePicker: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.bg,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: "dashed",
    gap: 12,
  },
  filePickerActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primarySoft,
    borderStyle: "solid",
  },
  filePickerIcon: {
    width: 44,
    height: 44,
    backgroundColor: COLORS.card,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filePickerInfo: { flex: 1 },
  filePickerText: { fontSize: 13, fontWeight: "700", color: COLORS.text },
  filePickerSubtext: { fontSize: 10, color: COLORS.muted },

  // Row layout
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  // Salas count badge
  salasCountBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  salasCountText: {
    fontSize: 18,
    fontWeight: "900",
    color: COLORS.text,
  },

  // Manual Card — matches ProgramacionTab
  manualCard: { borderColor: COLORS.border, padding: 16 },
  manualCardActive: { borderColor: COLORS.primary, backgroundColor: COLORS.card },
  manualHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  manualTitle: { fontSize: 14, fontWeight: "800", color: COLORS.text },
  manualChevron: { fontSize: 12, color: COLORS.muted, fontWeight: "900" },
  manualContent: { marginTop: 4 },
  step: { flexDirection: "row", gap: 12, marginTop: 16 },
  stepNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.primary,
    color: "#FFF",
    fontSize: 12,
    fontWeight: "900",
    textAlign: "center",
    lineHeight: 22,
    overflow: "hidden",
  },
  stepInfo: { flex: 1, gap: 4 },
  stepTitle: { fontSize: 13, fontWeight: "800", color: COLORS.text },
  stepText: { fontSize: 12, color: COLORS.muted, lineHeight: 18 },

  // Action area — matches ProgramacionTab
  actionArea: { marginTop: 8, alignItems: "center", gap: 12 },
  mainButton: {
    backgroundColor: COLORS.primary,
    width: "100%",
    height: 54,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    ...THEME.shadow.soft,
  },
  secondaryButton: {
    backgroundColor: "#475569",
    width: "100%",
    height: 54,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    ...THEME.shadow.soft,
  },
  mainButtonDisabled: { opacity: 0.4 },
  mainButtonText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 1,
  },

  // Summary card — matches ProgramacionTab
  summaryCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 16,
    ...THEME.shadow.soft,
  },
  summaryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryTitle: { fontSize: 14, fontWeight: "800", color: COLORS.text },
  summaryBadge: {
    backgroundColor: "#DCFCE7",
    color: "#166534",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    fontSize: 10,
    fontWeight: "800",
    overflow: "hidden",
  },
  summaryGrid: {
    flexDirection: "row",
    backgroundColor: COLORS.bg,
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
  },
  summaryItem: { flex: 1, alignItems: "center" },
  summaryValue: { fontSize: 24, fontWeight: "900", color: COLORS.primary },
  summaryLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: COLORS.muted,
    marginTop: 2,
  },
  summaryVerticalDivider: {
    width: 1,
    height: 30,
    backgroundColor: COLORS.border,
  },

  // Cartelera card
  carteleraCard: {
    backgroundColor: MKT.warningBg,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: Platform.OS === "web" ? "var(--warning-border, #ead9a5)" : "#ead9a5",
    ...THEME.shadow.soft,
  },
  carteleraHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  carteleraTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: MKT.warning,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  carteleraDivider: {
    height: 1,
    backgroundColor: "#ead9a5",
    marginVertical: 14,
  },
  carteleraRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  carteleraSalaBadge: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: COLORS.card,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Platform.OS === "web" ? "var(--warning-border, #ead9a5)" : "#ead9a5",
  },
  carteleraSalaText: {
    fontSize: 12,
    fontWeight: "900",
    color: MKT.warning,
  },
  carteleraPelicula: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.text,
  },

  // Details card (nuevos/movimientos + salen)
  detailsCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...THEME.shadow.soft,
  },

  // Movement cards
  movementCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 12,
    backgroundColor: COLORS.bg,
  },
  movementCardRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  movementCardLeft: {
    flex: 1,
    minWidth: 0,
  },
  movementTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.text,
  },
  movementMeta: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 4,
    fontWeight: "600",
  },
  movementSource: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 4,
    fontWeight: "500",
  },

  checkBoxCard: {
    width: 130,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: COLORS.card,
  },
  checkOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  checkSquare: {
    fontSize: 14,
    color: COLORS.text,
    width: 16,
  },
  checkLabel: {
    fontSize: 12,
    color: COLORS.text,
    fontWeight: "700",
  },
  newOnlyBadge: {
    minWidth: 80,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: COLORS.card,
    alignItems: "center",
    justifyContent: "center",
  },
  newOnlyBadgeText: {
    fontSize: 12,
    fontWeight: "800",
    color: COLORS.text,
  },

  // Retire rows
  retireRow: {
    backgroundColor: COLORS.bg,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  retireText: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.text,
  },
  retireMeta: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 4,
    fontWeight: "600",
  },

  // Room cards
  roomCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...THEME.shadow.soft,
  },
  roomHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  roomBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  roomBadgeText: {
    fontSize: 16,
    fontWeight: "900",
    color: "#FFF",
  },
  roomTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  roomHighlight: {
    backgroundColor: MKT.warningBg,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Platform.OS === "web" ? "var(--warning-border, #ead9a5)" : "#ead9a5",
    marginBottom: 14,
  },
  roomHighlightLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: MKT.warning,
    marginBottom: 4,
  },
  roomHighlightValue: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.text,
  },
  roomSection: {
    gap: 6,
  },
  roomSectionTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: COLORS.text,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  roomItemText: {
    fontSize: 13,
    color: COLORS.text,
    lineHeight: 20,
    fontWeight: "500",
  },
  emptyText: {
    fontSize: 12,
    color: "#94A3B8",
    fontStyle: "italic",
  },

  // Eventos card
  eventosCard: {
    backgroundColor: Platform.OS === "web" ? "var(--info-bg, #F0F7FF)" : "#F0F7FF",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: Platform.OS === "web" ? "var(--info-border, #b8d4f0)" : "#b8d4f0",
    ...THEME.shadow.soft,
  },
  eventosHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  eventosTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: Platform.OS === "web" ? "var(--info, #1e40af)" : "#1e40af",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  eventosNote: {
    fontSize: 11,
    color: COLORS.muted,
    fontStyle: "italic",
    marginTop: 8,
  },
  eventosDivider: {
    height: 1,
    backgroundColor: Platform.OS === "web" ? "var(--info-border, #b8d4f0)" : "#b8d4f0",
    marginVertical: 14,
  },
  eventoRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Platform.OS === "web" ? "var(--info-border, #d4e4f4)" : "#d4e4f4",
    marginBottom: 8,
  },
  eventoInfo: {
    flex: 1,
    gap: 4,
  },
  eventoName: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.text,
  },
  eventoMeta: {
    fontSize: 11,
    color: COLORS.muted,
    fontWeight: "600",
  },
  eventoSalaAc: {
    color: "#c26200",
    fontWeight: "800",
  },
});