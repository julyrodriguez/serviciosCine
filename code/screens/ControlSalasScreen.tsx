import React, { useEffect, useState, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Switch,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { doc, getDoc, onSnapshot, setDoc } from "@/lib/dbService";

import { db, CINES_COLLECTION } from "../../lib/firebaseConfig";
import { COLORS, THEME } from "../../lib/theme";
import { useAuthUser } from "../../lib/useAuthUser";
import { getCineConfig } from "../../lib/cineConfig";

// Sala capacity metadata as provided by user
const SALAS_INFO = [
  { id: 1, capacity: 225, name: "Sala 1" },
  { id: 2, capacity: 267, name: "Sala 2" },
  { id: 3, capacity: 267, name: "Sala 3" },
  { id: 4, capacity: 211, name: "Sala 4" },
  { id: 5, capacity: 254, name: "Sala 5" },
  { id: 6, capacity: 136, name: "Sala 6" },
  { id: 7, capacity: 136, name: "Sala 7" },
  { id: 8, capacity: 284, name: "Sala 8" },
  { id: 9, capacity: 302, name: "Sala 9" },
  { id: 10, capacity: 299, name: "Sala 10" },
  { id: 11, capacity: 279, name: "Sala 11" },
  { id: 12, capacity: 277, name: "Sala 12" },
];

interface SeatIssue {
  respaldo: boolean;
  asiento: boolean;
  apoyabrazos: boolean;
  detalles: string;
}

interface RoomIssues {
  [seatKey: string]: SeatIssue;
}

interface ActiveReport {
  updatedAt: string;
  updatedBy: string;
  issues: {
    [salaId: string]: RoomIssues;
  };
  generalIssues?: {
    [salaId: string]: string[];
  };
}

export interface SeatInfo {
  row: string;
  number: number;
  colIndex: number;
  type: "seat" | "empty";
  isDbox?: boolean;
}

export interface RoomLayout {
  rows: string[];
  maxCol: number;
  aisles: number[];
  rowAisles?: string[];
  seats: { [row: string]: SeatInfo[] };
  invertSeats?: boolean;
}

export interface FirestoreSalaLayout {
  rows: string[];
  maxCol: number;
  aisles: number[];
  customSeats: {
    [seatKey: string]: "empty" | "dbox";
  };
  invertSeats?: boolean;
  rowAisles?: string[];
  customSeatNumbers?: {
    [seatKey: string]: number;
  };
}

// Default layout builder for all 12 rooms based on exact user specification
export const getRoomLayout = (salaId: number): RoomLayout => {
  let rows: string[] = [];
  let maxCol = 21;
  let aisles = [4, 17];

  if (salaId === 1 || salaId === 4) {
    rows = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"];
  } else if (salaId === 2 || salaId === 3) {
    rows = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"];
  } else if (salaId === 5) {
    rows = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"];
    maxCol = 20;
    aisles = [4, 16];
  } else if (salaId === 6 || salaId === 7) {
    rows = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
    maxCol = 14;
    aisles = [];
  } else if (salaId === 8) {
    rows = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O"];
  } else if (salaId === 9 || salaId === 10) {
    rows = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q"];
  } else if (salaId === 11) {
    rows = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O"];
  } else if (salaId === 12) {
    rows = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"];
  }

  const seats: { [row: string]: SeatInfo[] } = {};

  for (const row of rows) {
    const rowSeats: SeatInfo[] = [];
    for (let c = 1; c <= maxCol; c++) {
      let isSeat = false;
      let isDbox = false;

      if (salaId === 1) {
        if (row === "A" || row === "B" || row === "C") {
          isSeat = c >= 2 && c <= 20;
        } else if (row === "K") {
          isSeat = c >= 5 && c <= 17;
        } else {
          isSeat = true; // D to J: 1 to 21
        }
      } else if (salaId === 2 || salaId === 3) {
        if (row === "A") {
          isSeat = c >= 3 && c <= 19;
        } else if (row === "N") {
          isSeat = c >= 15 && c <= 17;
        } else if (row === "M") {
          isSeat = true; // 1 to 21
        } else {
          isSeat = c >= 2 && c <= 20; // B to L
        }
      } else if (salaId === 4) {
        if (row === "K") {
          isSeat = c >= 5 && c <= 17;
        } else {
          isSeat = c >= 2 && c <= 20; // A to J
        }
      } else if (salaId === 5) {
        if (row === "A") {
          isSeat = c >= 3 && c <= 18;
        } else if (row === "M" || row === "N") {
          isSeat = c >= 5 && c <= 16;
        } else if (row === "I" || row === "J" || row === "K" || row === "L") {
          isSeat = c >= 1 && c <= 20;
        } else {
          isSeat = c >= 2 && c <= 19; // B to H
        }
      } else if (salaId === 6 || salaId === 7) {
        if (row === "J") {
          isSeat = c >= 4 && c <= 11;
        } else {
          isSeat = c >= 1 && c <= 14; // A to I
        }
      } else if (salaId === 8) {
        if (row === "L" || row === "M") {
          isSeat = true; // 1 to 21
        } else if (row === "O") {
          isSeat = c >= 6 && c <= 16;
        } else {
          isSeat = c >= 2 && c <= 20; // A to K, and N (which is same as A)
        }
      } else if (salaId === 9) {
        if (row === "A") {
          isSeat = c >= 3 && c <= 19;
        } else if (row === "B") {
          isSeat = c >= 2 && c <= 20;
        } else if (row === "C" || row === "D" || row === "E" || row === "F") {
          isSeat = true; // 1 to 21
        } else if (row === "G") {
          isSeat = (c >= 1 && c <= 4) || (c >= 18 && c <= 21) || (c >= 7 && c <= 15);
          isDbox = c >= 7 && c <= 15;
        } else if (row === "H") {
          isSeat = (c >= 2 && c <= 4) || (c >= 18 && c <= 20);
        } else if (row === "I" || row === "J") {
          isSeat = (c >= 2 && c <= 4) || (c >= 18 && c <= 20) || (c >= 7 && c <= 15);
          isDbox = c >= 7 && c <= 15;
        } else if (row === "K" || row === "L" || row === "M" || row === "N" || row === "O") {
          isSeat = c >= 2 && c <= 20;
        } else if (row === "P") {
          isSeat = true; // 1 to 21
        } else if (row === "Q") {
          isSeat = c >= 6 && c <= 16;
        }
      } else if (salaId === 10) {
        if (row === "A") {
          isSeat = c >= 3 && c <= 19;
        } else if (row === "B" || row === "C" || row === "F") {
          isSeat = c >= 2 && c <= 20;
        } else if (row === "D" || row === "E") {
          isSeat = true; // 1 to 21
        } else if (row === "G") {
          isSeat = (c >= 2 && c <= 4) || (c >= 18 && c <= 20) || (c >= 7 && c <= 15);
          isDbox = c >= 7 && c <= 15;
        } else if (row === "H") {
          isSeat = (c >= 2 && c <= 4) || (c >= 18 && c <= 20);
        } else if (row === "I" || row === "J") {
          isSeat = (c >= 2 && c <= 4) || (c >= 18 && c <= 20) || (c >= 7 && c <= 15);
          isDbox = c >= 7 && c <= 15;
        } else if (row === "K" || row === "L" || row === "M" || row === "N" || row === "O") {
          isSeat = c >= 2 && c <= 20;
        } else if (row === "P") {
          isSeat = true; // 1 to 21
        } else if (row === "Q") {
          isSeat = c >= 5 && c <= 17;
        }
      } else if (salaId === 11) {
        if (row === "A") {
          isSeat = c >= 3 && c <= 19;
        } else if (row === "B" || row === "C" || row === "F" || row === "J" || row === "K") {
          isSeat = c >= 2 && c <= 20;
        } else if (row === "D" || row === "E" || row === "L" || row === "M" || row === "N") {
          isSeat = true; // 1 to 21
        } else if (row === "G" || row === "H" || row === "I") {
          isSeat = (c >= 2 && c <= 4) || (c >= 18 && c <= 20) || (c >= 7 && c <= 16);
          isDbox = c >= 7 && c <= 16;
        } else if (row === "O") {
          isSeat = c >= 6 && c <= 16;
        }
      } else if (salaId === 12) {
        if (row === "A") {
          isSeat = c >= 3 && c <= 19;
        } else if (row === "B" || row === "C") {
          isSeat = c >= 2 && c <= 20;
        } else if (row === "M" || row === "N") {
          isSeat = c >= 5 && c <= 17;
        } else {
          isSeat = true; // D to L: 1 to 21
        }
      }

      rowSeats.push({
        row,
        number: c,
        colIndex: c,
        type: isSeat ? "seat" : "empty",
        isDbox,
      });
    }
    seats[row] = rowSeats;
  }

  return { rows, maxCol, aisles, rowAisles: [], seats };
};

// Helper to convert getRoomLayout configuration to the Firestore layout schema
const convertLayoutToFirestoreSchema = (salaId: number): FirestoreSalaLayout => {
  const defaultLayout = getRoomLayout(salaId);
  const customSeats: { [key: string]: "empty" | "dbox" } = {};

  for (const row of defaultLayout.rows) {
    for (const seat of defaultLayout.seats[row]) {
      const key = `${row}-${seat.colIndex}`;
      if (seat.type === "empty") {
        customSeats[key] = "empty";
      } else if (seat.isDbox) {
        customSeats[key] = "dbox";
      }
    }
  }

  return {
    rows: defaultLayout.rows,
    maxCol: defaultLayout.maxCol,
    aisles: defaultLayout.aisles,
    customSeats,
    invertSeats: defaultLayout.invertSeats || false,
    rowAisles: defaultLayout.rowAisles || [],
    customSeatNumbers: {},
  };
};

export default function ControlSalasScreen() {
  const { cineId, user, displayName } = useAuthUser();
  const userEmail = user?.email || "usuario.anonimo";
  const cineLabelRaw = displayName || cineId || "Cine";
  const cineLabel = cineLabelRaw ? cineLabelRaw.charAt(0).toUpperCase() + cineLabelRaw.slice(1) : "Cine";

  // Component state
  const [selectedSala, setSelectedSala] = useState<number>(1);
  const [report, setReport] = useState<ActiveReport>({
    updatedAt: "",
    updatedBy: "",
    issues: {},
  });
  
  // Custom layouts state (from Firestore)
  const [dbLayouts, setDbLayouts] = useState<{ [salaId: string]: FirestoreSalaLayout }>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  // Modal editing seat state
  const [editingSeat, setEditingSeat] = useState<{ row: string; num: number; isDbox?: boolean } | null>(null);
  const [respaldoRoto, setRespaldoRoto] = useState(false);
  const [asientoRoto, setAsientoRoto] = useState(false);
  const [apoyabrazosRoto, setApoyabrazosRoto] = useState(false);
  const [extraDetails, setExtraDetails] = useState("");
  const [newItemText, setNewItemText] = useState("");

  // Seating grid configuration editor state
  const [isLayoutEditorMode, setIsLayoutEditorMode] = useState<boolean>(false);
  const [editorRowsInput, setEditorRowsInput] = useState<string>("");
  const [editorMaxColInput, setEditorMaxColInput] = useState<string>("");
  const [editorAislesInput, setEditorAislesInput] = useState<string>("");
  const [editorRowAislesInput, setEditorRowAislesInput] = useState<string>("");
  const [editorCustomSeats, setEditorCustomSeats] = useState<{ [seatKey: string]: "empty" | "dbox" }>({});
  const [editorCustomSeatNumbers, setEditorCustomSeatNumbers] = useState<{ [seatKey: string]: number }>({});
  const [editorInvertSeats, setEditorInvertSeats] = useState<boolean>(false);
  const [paintTool, setPaintTool] = useState<"seat" | "dbox" | "empty" | "number">("empty");
  const [editingSeatNumber, setEditingSeatNumber] = useState<{ row: string; colIndex: number; currentNumber: number } | null>(null);
  const [newSeatNumberInput, setNewSeatNumberInput] = useState<string>("");

  const [salasCount, setSalasCount] = useState<number>(12);

  // Load cinema configuration (salas count)
  useEffect(() => {
    if (!cineId) return;

    getCineConfig(cineId)
      .then((cfg) => {
        if (cfg?.salasCount && Number.isFinite(cfg.salasCount) && cfg.salasCount > 0) {
          setSalasCount(Math.floor(cfg.salasCount));
        }
      })
      .catch((e) => console.error("Error loading cine config in ControlSalasScreen:", e));
  }, [cineId]);

  const salasInfoList = useMemo(() => {
    const list = [];
    for (let i = 1; i <= salasCount; i++) {
      const staticInfo = SALAS_INFO.find((s) => s.id === i);
      list.push({
        id: i,
        name: `Sala ${i}`,
        capacity: staticInfo ? staticInfo.capacity : 200,
      });
    }
    return list;
  }, [salasCount]);

  // Load custom layouts for all rooms dynamically
  useEffect(() => {
    if (!cineId) return;

    let loadedCount = 0;
    const unsubscribers = salasInfoList.map((sala) => {
      const ref = doc(db, CINES_COLLECTION, cineId, "salas_layouts", String(sala.id));
      return onSnapshot(
        ref,
        (snapshot: any) => {
          if (snapshot.exists()) {
            const data = snapshot.data() as FirestoreSalaLayout;
            setDbLayouts((prev) => ({
              ...prev,
              [String(sala.id)]: data,
            }));
          } else {
            // Remove from dbLayouts if deleted from firestore
            setDbLayouts((prev) => {
              const copy = { ...prev };
              delete copy[String(sala.id)];
              return copy;
            });
          }
          loadedCount++;
          if (loadedCount >= salasInfoList.length) {
            setLoading(false);
          }
        },
        (error: any) => {
          console.error(`Error loading layout for Sala ${sala.id}:`, error);
          loadedCount++;
          if (loadedCount >= salasInfoList.length) {
            setLoading(false);
          }
        }
      );
    });

    if (salasInfoList.length === 0) {
      setLoading(false);
    }

    return () => unsubscribers.forEach((unsub) => unsub());
  }, [cineId, salasInfoList]);

  // Proactive Auto-Migration: If there are no custom layouts in Firestore for the active cinema, upload the default layouts automatically.
  useEffect(() => {
    if (!cineId) return;

    const checkAndMigrate = async () => {
      try {
        const docRef = doc(db, CINES_COLLECTION, cineId, "salas_layouts", "1");
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) {
          console.log(`Auto-migrating default layouts for ${cineId}...`);
          for (let sId = 1; sId <= salasCount; sId++) {
            const schema = convertLayoutToFirestoreSchema(sId);
            const ref = doc(db, CINES_COLLECTION, cineId, "salas_layouts", String(sId));
            await setDoc(ref, schema);
          }
          console.log("Auto-migration complete.");
        }
      } catch (e) {
        console.error("Auto-migration check error:", e);
      }
    };

    checkAndMigrate();
  }, [cineId]);

  // Listen to Firestore active inspection report
  useEffect(() => {
    if (!cineId) return;

    setLoading(true);
    const docRef = doc(db, CINES_COLLECTION, cineId, "control_salas", "active");
    const unsubscribe = onSnapshot(
      docRef,
      (snapshot: any) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as ActiveReport;
          setReport({
            updatedAt: data.updatedAt || "",
            updatedBy: data.updatedBy || "",
            issues: data.issues || {},
            generalIssues: data.generalIssues || {},
          });
        } else {
          setReport({
            updatedAt: "",
            updatedBy: "",
            issues: {},
            generalIssues: {},
          });
        }
        setLoading(false);
      },
      (error: any) => {
        console.error("Error reading room control report:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [cineId]);


  // Get active layout for a sala (loads from DB if exists, otherwise falls back to hardcoded defaults)
  const getActiveSalaLayout = (salaId: number): RoomLayout => {
    const dbLayout = dbLayouts[String(salaId)];
    if (!dbLayout) {
      return getRoomLayout(salaId); // fallback to defaults
    }

    const seats: { [row: string]: SeatInfo[] } = {};
    const customSeats = dbLayout.customSeats || {};
    const customSeatNumbers = dbLayout.customSeatNumbers || {};
    const invertSeats = dbLayout.invertSeats || false;

    for (const row of dbLayout.rows) {
      const rowSeats: SeatInfo[] = [];
      for (let c = 1; c <= dbLayout.maxCol; c++) {
        const key = `${row}-${c}`;
        const exception = customSeats[key];
        
        let type: "seat" | "empty" = "seat";
        let isDbox = false;

        if (exception === "empty") {
          type = "empty";
        } else if (exception === "dbox") {
          isDbox = true;
        }

        const customNum = customSeatNumbers[key];
        const seatNumber = customNum !== undefined ? customNum : (invertSeats ? (dbLayout.maxCol - c + 1) : c);

        rowSeats.push({
          row,
          number: seatNumber,
          colIndex: c,
          type,
          isDbox,
        });
      }
      seats[row] = rowSeats;
    }

    return {
      rows: dbLayout.rows,
      maxCol: dbLayout.maxCol,
      aisles: dbLayout.aisles || [],
      rowAisles: dbLayout.rowAisles || [],
      seats,
      invertSeats,
    };
  };

  // Save report updates to Firestore helper
  const saveReportToFirebase = async (updatedIssues: { [salaId: string]: RoomIssues }) => {
    if (!cineId) return;
    setSaving(true);
    try {
      const docRef = doc(db, CINES_COLLECTION, cineId, "control_salas", "active");
      const payload: ActiveReport = {
        updatedAt: new Date().toISOString(),
        updatedBy: userEmail,
        issues: updatedIssues,
        generalIssues: report?.generalIssues || {},
      };
      await setDoc(docRef, payload);
    } catch (e) {
      console.error("Error saving report to Firestore:", e);
      Alert.alert("Error", "No se pudo sincronizar la información en la nube.");
    } finally {
      setSaving(false);
    }
  };

  // Selector to get itemized general issues for the selected room
  const generalIssuesList = useMemo(() => {
    const salaKey = String(selectedSala);
    const raw: any = report?.generalIssues?.[salaKey];
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.filter(Boolean);
    if (typeof raw === "string" && raw.trim()) return [raw.trim()];
    return [];
  }, [selectedSala, report]);

  const handleAddNewGeneralItem = async () => {
    if (!newItemText.trim() || !cineId) return;
    const salaKey = String(selectedSala);
    const currentList = [...generalIssuesList];
    currentList.push(newItemText.trim());

    const newGeneralIssues = { ...report?.generalIssues };
    newGeneralIssues[salaKey] = currentList;

    setSaving(true);
    try {
      const docRef = doc(db, CINES_COLLECTION, cineId, "control_salas", "active");
      const payload: ActiveReport = {
        ...report,
        updatedAt: new Date().toISOString(),
        updatedBy: userEmail,
        generalIssues: newGeneralIssues,
      };
      await setDoc(docRef, payload);
      setNewItemText(""); // Clear input
    } catch (e) {
      console.error("Error adding general issue:", e);
      Alert.alert("Error", "No se pudo agregar la observación.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteGeneralItem = async (itemToDelete: string) => {
    if (!cineId) return;
    const salaKey = String(selectedSala);
    const currentList = generalIssuesList.filter((item) => item !== itemToDelete);

    const newGeneralIssues = { ...report?.generalIssues };
    // Always assign currentList (even if it's an empty array []) to ensure the REST API receives the update
    newGeneralIssues[salaKey] = currentList;

    setSaving(true);
    try {
      const docRef = doc(db, CINES_COLLECTION, cineId, "control_salas", "active");
      const payload: ActiveReport = {
        ...report,
        updatedAt: new Date().toISOString(),
        updatedBy: userEmail,
        generalIssues: newGeneralIssues,
      };
      await setDoc(docRef, payload);
    } catch (e: any) {
      console.error("Error deleting general issue:", e);
      Alert.alert("Error", "No se pudo borrar la observación.");
    } finally {
      setSaving(false);
    }
  };

  // Open editor modal for a specific seat (Normal Inspection Mode)
  const handleSeatPress = (row: string, num: number, isDbox?: boolean, colIndex?: number, type?: "seat" | "empty") => {
    if (isLayoutEditorMode) {
      // If we are in layout configuration mode, clicking paints/modifies the seat layout!
      const finalCol = colIndex !== undefined ? colIndex : num;
      handleGridSeatClickInEditorMode(row, finalCol, num, type || "seat");
      return;
    }

    const salaKey = String(selectedSala);
    const seatKey = `${row}-${num}`;
    const existing = report?.issues?.[salaKey]?.[seatKey];

    setEditingSeat({ row, num, isDbox });
    if (existing) {
      setRespaldoRoto(existing.respaldo);
      setAsientoRoto(existing.asiento);
      setApoyabrazosRoto(existing.apoyabrazos);
      setExtraDetails(existing.detalles || "");
    } else {
      setRespaldoRoto(false);
      setAsientoRoto(false);
      setApoyabrazosRoto(false);
      setExtraDetails("");
    }
  };

  // Save seat edits (Normal Inspection Mode)
  const handleSaveSeat = async () => {
    if (!editingSeat) return;
    const { row, num } = editingSeat;
    const salaKey = String(selectedSala);
    const seatKey = `${row}-${num}`;

    const newReportIssues = { ...report?.issues };
    if (!newReportIssues[salaKey]) {
      newReportIssues[salaKey] = {};
    }

    const hasAnyIssue = respaldoRoto || asientoRoto || apoyabrazosRoto || extraDetails.trim().length > 0;

    if (hasAnyIssue) {
      newReportIssues[salaKey][seatKey] = {
        respaldo: respaldoRoto,
        asiento: asientoRoto,
        apoyabrazos: apoyabrazosRoto,
        detalles: extraDetails.trim(),
      };
    } else {
      delete newReportIssues[salaKey][seatKey];
      if (Object.keys(newReportIssues[salaKey]).length === 0) {
        delete newReportIssues[salaKey];
      }
    }

    setEditingSeat(null);
    await saveReportToFirebase(newReportIssues);
  };

  // Quick remove seat report
  const handleClearSeatReport = async (row: string, num: number) => {
    const salaKey = String(selectedSala);
    const seatKey = `${row}-${num}`;

    if (!report?.issues?.[salaKey]?.[seatKey]) return;

    const newReportIssues = { ...report?.issues };
    delete newReportIssues[salaKey][seatKey];
    if (Object.keys(newReportIssues[salaKey]).length === 0) {
      delete newReportIssues[salaKey];
    }
    await saveReportToFirebase(newReportIssues);
  };

  // Reset entire active inspection (after confirmation)
  const handleClearActiveReport = () => {
    const executeClear = async () => {
      if (!cineId) return;
      setSaving(true);
      try {
        const docRef = doc(db, CINES_COLLECTION, cineId, "control_salas", "active");
        const payload: ActiveReport = {
          updatedAt: new Date().toISOString(),
          updatedBy: userEmail,
          issues: {},
          generalIssues: {},
        };
        await setDoc(docRef, payload);
      } catch (e) {
        console.error("Error clearing report:", e);
        Alert.alert("Error", "No se pudo reiniciar el reporte.");
      } finally {
        setSaving(false);
      }
    };

    if (Platform.OS === "web") {
      const confirm = window.confirm("¿Seguro que querés limpiar por completo todo el reporte actual de todas las salas? Esta acción no se puede deshacer.");
      if (confirm) {
        executeClear();
      }
    } else {
      Alert.alert(
        "Confirmar limpieza",
        "¿Seguro que querés borrar todas las butacas marcadas y reportes generales del reporte en todas las salas?",
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Borrar Todo", style: "destructive", onPress: executeClear },
        ]
      );
    }
  };

  // Toggle seat types on click during layout editor mode
  const handleGridSeatClickInEditorMode = (row: string, colNum: number, currentSeatNumber: number, type: "seat" | "empty") => {
    if (paintTool === "number") {
      if (type === "empty") {
        Alert.alert("Acción no permitida", "No podés asignar un número a un espacio vacío.");
        return;
      }
      const key = `${row}-${colNum}`;
      const customNum = editorCustomSeatNumbers[key];
      const currentVal = customNum !== undefined ? customNum : currentSeatNumber;
      
      setEditingSeatNumber({ row, colIndex: colNum, currentNumber: currentVal });
      setNewSeatNumberInput(String(currentVal));
      return;
    }

    const currentMaxCol = parseInt(editorMaxColInput, 10) || 1;
    if (colNum > currentMaxCol) {
      setEditorMaxColInput(String(colNum));
    }

    const newCustomSeats = { ...editorCustomSeats };
    const newCustomSeatNumbers = { ...editorCustomSeatNumbers };
    const key = `${row}-${colNum}`;
    const current = newCustomSeats[key];

    // If it is the new expanded virtual column, paint it with the current paintTool
    if (colNum > currentMaxCol) {
      if (paintTool === "seat") {
        delete newCustomSeats[key];
      } else {
        newCustomSeats[key] = paintTool as "empty" | "dbox";
      }
    } else {
      // Toggle logic for existing seats
      if (!current) {
        newCustomSeats[key] = "empty";
        delete newCustomSeatNumbers[key];
      } else if (current === "empty") {
        newCustomSeats[key] = "dbox";
      } else {
        delete newCustomSeats[key];
      }
    }
    setEditorCustomSeats(newCustomSeats);
    setEditorCustomSeatNumbers(newCustomSeatNumbers);
  };

  // Enter Layout Editor Mode for the active room
  const handleStartLayoutEditor = () => {
    const layout = getActiveSalaLayout(selectedSala);
    const dbLayout = dbLayouts[String(selectedSala)];
    setEditorRowsInput(layout.rows.join(","));
    setEditorMaxColInput(String(layout.maxCol));
    setEditorAislesInput(layout.aisles.join(","));
    setEditorRowAislesInput(dbLayout?.rowAisles?.join(",") || "");
    setEditorCustomSeats(dbLayout?.customSeats || convertLayoutToFirestoreSchema(selectedSala).customSeats || {});
    setEditorCustomSeatNumbers(dbLayout?.customSeatNumbers || {});
    setEditorInvertSeats(layout.invertSeats || false);
    setIsLayoutEditorMode(true);
  };

  // Save layout configurations in Firestore
  const handleSaveLayoutEdits = async () => {
    if (!cineId) return;

    const rows = editorRowsInput
      .split(",")
      .map((r) => r.trim().toUpperCase())
      .filter(Boolean);
    const maxCol = parseInt(editorMaxColInput, 10);
    const aisles = editorAislesInput
      .split(",")
      .map((a) => parseInt(a.trim(), 10))
      .filter((num) => !isNaN(num));
    const rowAisles = editorRowAislesInput
      .split(",")
      .map((r) => r.trim().toUpperCase())
      .filter(Boolean);

    if (rows.length === 0 || isNaN(maxCol) || maxCol <= 0) {
      Alert.alert("Campos inválidos", "Por favor ingresá un listado de filas válido y un número de columnas mayor a 0.");
      return;
    }

    setSaving(true);
    try {
      const ref = doc(db, CINES_COLLECTION, cineId, "salas_layouts", String(selectedSala));
      const payload: FirestoreSalaLayout = {
        rows,
        maxCol,
        aisles,
        customSeats: editorCustomSeats,
        invertSeats: editorInvertSeats,
        rowAisles,
        customSeatNumbers: editorCustomSeatNumbers,
      };
      await setDoc(ref, payload);
      setIsLayoutEditorMode(false);
      Alert.alert("Éxito", `Se guardó la distribución personalizada de la Sala ${selectedSala}.`);
    } catch (e) {
      console.error("Error saving custom layout:", e);
      Alert.alert("Error", "No se pudo guardar el plano de la sala en la base de datos.");
    } finally {
      setSaving(false);
    }
  };

  // Exit layout editor mode without saving
  const handleCancelLayoutEdits = () => {
    setIsLayoutEditorMode(false);
  };

  // Load standard Abasto map template to current selected room layout editor fields
  const handleLoadDefaultAbastoTemplate = () => {
    const schema = convertLayoutToFirestoreSchema(selectedSala);
    setEditorRowsInput(schema.rows.join(","));
    setEditorMaxColInput(String(schema.maxCol));
    setEditorAislesInput(schema.aisles.join(","));
    setEditorRowAislesInput(schema.rowAisles?.join(",") || "");
    setEditorCustomSeats(schema.customSeats);
    setEditorInvertSeats(schema.invertSeats || false);
    setEditorCustomSeatNumbers(schema.customSeatNumbers || {});
  };

  // Upload/Migrate default layouts to Firestore for the current cinema
  const handleMigrateAllDefaultLayouts = async () => {
    if (!cineId) return;

    const executeMigration = async () => {
      setSaving(true);
      try {
        for (let sId = 1; sId <= salasCount; sId++) {
          const schema = convertLayoutToFirestoreSchema(sId);
          const ref = doc(db, CINES_COLLECTION, cineId, "salas_layouts", String(sId));
          await setDoc(ref, schema);
        }
        Alert.alert("Carga Exitosa", `Se guardaron los ${salasCount} mapas por defecto en la base de datos de ${cineLabel}.`);
      } catch (e) {
        console.error("Migration error:", e);
        Alert.alert("Error", "Ocurrió un error al cargar las salas por defecto.");
      } finally {
        setSaving(false);
      }
    };

    if (Platform.OS === "web") {
      const confirm = window.confirm(`¿Querés guardar los ${salasCount} planos de salas por defecto en la base de datos de ${cineLabel}? Esto sobreescribirá los planos guardados anteriormente en este cine.`);
      if (confirm) executeMigration();
    } else {
      Alert.alert(
        "Cargar planos por defecto",
        `¿Querés guardar los ${salasCount} planos de salas por defecto en la base de datos de ${cineLabel}?`,
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Guardar Todo", onPress: executeMigration },
        ]
      );
    }
  };

  // Generate and export/print HTML report
  const handleExportPdf = async () => {
    let totalDamagedSeats = 0;
    const salaReportsList: { 
      salaName: string; 
      issues: { row: string; num: number; seat: string; desc: string; details: string; isDbox?: boolean }[];
      generalDetails: string[];
    }[] = [];

    salasInfoList.forEach((sInfo) => {
      const salaKey = String(sInfo.id);
      const roomIssues = report?.issues?.[salaKey];
      const roomGeneral: any = report?.generalIssues?.[salaKey];
      
      let generalItems: string[] = [];
      if (roomGeneral) {
        if (Array.isArray(roomGeneral)) {
          generalItems = roomGeneral.filter(Boolean);
        } else if (typeof roomGeneral === "string" && roomGeneral.trim()) {
          generalItems = [roomGeneral.trim()];
        }
      }

      const hasIssues = roomIssues && Object.keys(roomIssues).length > 0;
      const hasGeneral = generalItems.length > 0;

      if (hasIssues || hasGeneral) {
        // Load layout parameters (from DB or default) to check DBOX exception
        const layoutObj = getActiveSalaLayout(sInfo.id);

        const issuesSorted = roomIssues
          ? Object.entries(roomIssues)
              .map(([key, val]: any) => {
                const [row, numStr] = key.split("-");
                const num = parseInt(numStr, 10);
                const parts: string[] = [];
                if (val.respaldo) parts.push("Respaldo");
                if (val.asiento) parts.push("Asiento");
                if (val.apoyabrazos) parts.push("Apoyabrazos");

                // Look up seat in layout to verify Dbox status
                const rowSeats = layoutObj.seats[row];
                const seatLayout = rowSeats?.find((s) => s.number === num);
                const isDbox = seatLayout?.isDbox || false;

                return {
                  row,
                  num,
                  seat: `Fila ${row} - Butaca ${num}${isDbox ? " (D-BOX)" : ""}`,
                  desc: parts.length > 0 ? parts.join(", ") : "Detalles manuales",
                  details: val.detalles || "-",
                  isDbox,
                };
              })
              .sort((a, b) => {
                if (a.row !== b.row) return a.row.localeCompare(b.row);
                return a.num - b.num;
              })
          : [];

        if (hasIssues) {
          totalDamagedSeats += issuesSorted.length;
        }

        salaReportsList.push({
          salaName: sInfo.name,
          issues: issuesSorted,
          generalDetails: generalItems,
        });
      }
    });

    if (totalDamagedSeats === 0 && !salaReportsList.some((r) => r.generalDetails.length > 0)) {
      Alert.alert("Reporte Vacío", "No se encontraron butacas rotas ni observaciones generales cargadas en ninguna sala.");
      return;
    }

    try {
      const formattedDate = new Date().toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      let roomsTablesHtml = `<div class="rooms-grid">`;
      salaReportsList.forEach((salaRep) => {
        roomsTablesHtml += `
          <div class="room-section">
            <h2>${salaRep.salaName}</h2>
            
            ${salaRep.generalDetails.length > 0 ? `
              <div class="general-details-box">
                <strong>Detalles Generales:</strong>
                <ul style="margin: 4px 0 0 0; padding-left: 12px; font-size: 9px; color: #451a03;">
                  ${salaRep.generalDetails.map(item => `<li>${item}</li>`).join("")}
                </ul>
              </div>
            ` : ""}

            ${salaRep.issues.length > 0 ? `
              <table>
                <thead>
                  <tr>
                    <th style="width: 30%;">Butaca</th>
                    <th style="width: 35%;">Daño</th>
                    <th style="width: 35%;">Detalles</th>
                  </tr>
                </thead>
                <tbody>
                  ${salaRep.issues
                    .map(
                      (issue) => `
                    <tr>
                      <td>
                        <strong>${issue.row}-${issue.num}</strong>
                        ${issue.isDbox ? `<span class="dbox-tag">D-BOX</span>` : ""}
                      </td>
                      <td><span class="badge">${issue.desc}</span></td>
                      <td>${issue.details}</td>
                    </tr>
                  `
                    )
                    .join("")}
                </tbody>
              </table>
            ` : ""}
          </div>
        `;
      });
      roomsTablesHtml += `</div>`;

      const html = `
        <!doctype html>
        <html lang="es">
        <head>
          <meta charset="utf-8" />
          <title>Reporte de Control de Salas</title>
          <style>
            @page {
              size: A4;
              margin: 10mm;
            }
            body {
              font-family: Arial, sans-serif;
              color: #333;
              margin: 0;
              padding: 0;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
              font-size: 9px;
              line-height: 1.3;
            }
            .header {
              border-bottom: 2px solid #890404;
              padding-bottom: 6px;
              margin-bottom: 12px;
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
            }
            .header-title h1 {
              color: #890404;
              margin: 0 0 2px 0;
              font-size: 16px;
              font-weight: bold;
              text-transform: uppercase;
            }
            .header-title p {
              margin: 0;
              color: #666;
              font-size: 9px;
            }
            .header-meta {
              text-align: right;
              font-size: 9px;
              color: #555;
            }
            .summary {
              background-color: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 6px;
              padding: 8px 12px;
              margin-bottom: 16px;
              display: flex;
              justify-content: space-between;
            }
            .summary-item {
              flex: 1;
            }
            .summary-item span {
              font-size: 9px;
              color: #64748b;
            }
            .summary-item strong {
              display: block;
              font-size: 13px;
              color: #890404;
              margin-top: 2px;
            }
            .rooms-grid {
              display: flex;
              flex-wrap: wrap;
              gap: 12px;
            }
            .room-section {
              width: calc(50% - 6px);
              box-sizing: border-box;
              margin-bottom: 12px;
              break-inside: avoid;
              page-break-inside: avoid;
            }
            .room-section h2 {
              font-size: 11px;
              margin: 0 0 6px 0;
              color: #1e293b;
              border-bottom: 1px solid #cbd5e1;
              padding-bottom: 2px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 6px;
              table-layout: fixed;
            }
            th {
              background-color: #f1f5f9;
              color: #475569;
              font-weight: bold;
              text-align: left;
              padding: 4px 6px;
              border: 1px solid #cbd5e1;
              font-size: 8px;
              text-transform: uppercase;
            }
            td {
              padding: 4px 6px;
              border: 1px solid #e2e8f0;
              font-size: 9px;
              vertical-align: top;
              word-break: break-word;
              white-space: normal;
            }
            tr:nth-child(even) td {
              background-color: #f8fafc;
            }
            .badge {
              background-color: #fee2e2;
              color: #991b1b;
              padding: 1px 4px;
              border-radius: 3px;
              font-size: 8px;
              font-weight: bold;
              display: inline-block;
              word-break: break-word;
              white-space: normal;
            }
            .dbox-tag {
              background-color: #f3e8ff;
              color: #6b21a8;
              border: 1px solid #e9d5ff;
              padding: 1px 4px;
              border-radius: 3px;
              font-size: 8px;
              font-weight: bold;
              margin-left: 4px;
              vertical-align: middle;
            }
            .general-details-box {
              background-color: #fef08a;
              border-left: 3px solid #eab308;
              padding: 6px 8px;
              margin-bottom: 8px;
              border-radius: 4px;
            }
            .general-details-box strong {
              font-size: 8px;
              color: #854d0e;
              display: block;
              margin-bottom: 2px;
              text-transform: uppercase;
            }
            .general-details-box p {
              margin: 0;
              font-size: 9px;
              color: #451a03;
              word-break: break-word;
            }
            .footer-sig {
              margin-top: 20px;
              border-top: 1px solid #cbd5e1;
              padding-top: 8px;
              display: flex;
              justify-content: flex-end;
              font-size: 9px;
              color: #666;
              break-inside: avoid;
              page-break-inside: avoid;
            }
            .sig-line {
              width: 180px;
              border-top: 1px dashed #94a3b8;
              margin-top: 25px;
              text-align: center;
              padding-top: 3px;
            }
            @media print {
              .room-section {
                break-inside: avoid;
                page-break-inside: avoid;
              }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="header-title">
              <h1>Control de Estado de Salas</h1>
              <p>Reporte de Auditoría Física de Butacas</p>
            </div>
            <div class="header-meta">
              <strong>Fecha:</strong> ${formattedDate}<br />
              <strong>Cine:</strong> ${cineLabel}
            </div>
          </div>

          <div class="summary">
            <div class="summary-item">
              <span>Salas con Incidencias</span>
              <strong>${salaReportsList.length} de ${salasInfoList.length}</strong>
            </div>
            <div class="summary-item">
              <span>Total Butacas Dañadas</span>
              <strong>${totalDamagedSeats}</strong>
            </div>
            <div class="summary-item">
              <span>Estado General</span>
              <strong>Revisión Pendiente</strong>
            </div>
          </div>

          ${roomsTablesHtml}

          <div class="footer-sig">
            <div class="sig-line">
              Firma y Aclaración Responsable
            </div>
          </div>
        </body>
        </html>
      `;

      if (Platform.OS === "web") {
        const printWindow = window.open("", "_blank", "width=1200,height=900");
        if (!printWindow) {
          throw new Error("El navegador bloqueó la ventana de impresión. Permití popups e intentá de nuevo.");
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
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri, {
            mimeType: "application/pdf",
            dialogTitle: `Control de Salas Cinemark Hoyts - ${formattedDate}`,
            UTI: "com.adobe.pdf",
          });
        } else {
          Alert.alert("PDF generado", `El reporte se guardó en:\n${uri}`);
        }
      }
    } catch (e: any) {
      console.error("PDF generation error:", e);
      Alert.alert("Error", e?.message || "No se pudo generar el archivo de reporte PDF.");
    }
  };

  // Build the list of active issues in the currently selected sala
  const getSelectedSalaIssues = () => {
    const salaKey = String(selectedSala);
    const roomIssues = report?.issues?.[salaKey];
    if (!roomIssues) return [];

    const layoutObj = getActiveSalaLayout(selectedSala);

    return Object.entries(roomIssues)
      .map(([key, val]) => {
        const [row, numStr] = key.split("-");
        const num = parseInt(numStr, 10);

        const rowSeats = layoutObj.seats[row];
        const seatLayout = rowSeats?.find((s) => s.number === num);
        const isDbox = seatLayout?.isDbox || false;

        return {
          key,
          row,
          num,
          isDbox,
          ...val,
        };
      })
      .sort((a, b) => {
        if (a.row !== b.row) return a.row.localeCompare(b.row);
        return a.num - b.num;
      });
  };

  const selectedSalaIssues = getSelectedSalaIssues();
  const activeLayout = getActiveSalaLayout(selectedSala);
  const selectedSalaCapacity = activeLayout.rows.reduce((acc, row) => {
    return acc + activeLayout.seats[row].filter((s) => s.type === "seat").length;
  }, 0);

  // Seating grid rendering logic for active Sala (WYSIWYG layout compatible)
  const renderSeatingGrid = () => {
    const salaKey = String(selectedSala);
    
    // In editor mode, we render the draft layout on screen. Otherwise, the saved layout.
    const layout = isLayoutEditorMode ? getDraftLayout() : activeLayout;

    const renderSeat = (seat: SeatInfo, index: number) => {
      const stableKey = `${seat.row}-${seat.colIndex}`;
      if (seat.type === "empty" && !isLayoutEditorMode) {
        return <View key={`empty-${stableKey}`} style={styles.seatEmpty} />;
      }

      const seatKey = `${seat.row}-${seat.number}`;
      const hasIssue = !!report?.issues?.[salaKey]?.[seatKey];
      const isSelected = editingSeat?.row === seat.row && editingSeat?.num === seat.number;
      const isDbox = seat.isDbox;

      // In editor mode, we show empty spaces as light dashed boxes so users can see/paint them!
      const isEditorEmpty = isLayoutEditorMode && seat.type === "empty";

      return (
        <TouchableOpacity
          key={stableKey}
          style={[
            styles.seat,
            isDbox && styles.seatDbox,
            hasIssue && styles.seatDamaged,
            isSelected && styles.seatSelected,
            isEditorEmpty && styles.seatEditorEmpty,
          ]}
          onPress={() => handleSeatPress(seat.row, seat.number, isDbox, seat.colIndex, seat.type)}
          activeOpacity={0.8}
        >
          {isEditorEmpty ? (
            <MaterialCommunityIcons name="plus" size={10} color={COLORS.muted} />
          ) : (
            <Text
              style={[
                styles.seatText,
                isDbox && styles.seatTextDbox,
                hasIssue && styles.seatTextDamaged,
              ]}
            >
              {seat.number}
            </Text>
          )}
        </TouchableOpacity>
      );
    };

    return (
      <View style={styles.mapCard}>
        <View style={styles.mapHeaderRow}>
          <Text style={styles.mapTitle}>
            {isLayoutEditorMode ? "⚙️ Diseñador de Sala en Vivo" : "Mapa de Sala"}
          </Text>
          <TouchableOpacity
            style={[styles.editorModeBtn, isLayoutEditorMode && styles.editorModeBtnActive]}
            onPress={isLayoutEditorMode ? handleCancelLayoutEdits : handleStartLayoutEditor}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons
              name={isLayoutEditorMode ? "close" : "pencil-ruler"}
              size={16}
              color={isLayoutEditorMode ? COLORS.danger : COLORS.primary}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.editorModeBtnText, isLayoutEditorMode && { color: COLORS.danger }]}>
              {isLayoutEditorMode ? "Salir del Editor" : "Editar Plano"}
            </Text>
          </TouchableOpacity>
        </View>

        {isLayoutEditorMode && renderLayoutEditorPanel()}

        {/* Screen layout */}
        <View style={styles.screenIndicatorContainer}>
          <View style={styles.screenLine} />
          <Text style={styles.screenText}>PANTALLA</Text>
        </View>

        {/* Scroll containers for layout safety on small mobile widths */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={true}
          style={styles.mapScrollView}
          contentContainerStyle={styles.horizontalMapScroll}
        >
          <View style={styles.gridContainer}>
            {layout.rows.map((rowName) => {
              const rowSeats = layout.seats[rowName];
              if (!rowSeats) return null;

              // Slice row seats dynamically based on aisles definition
              const sections: SeatInfo[][] = [];
              let prev = 0;
              layout.aisles.forEach((aisleIndex) => {
                sections.push(rowSeats.slice(prev, aisleIndex));
                prev = aisleIndex;
              });
              sections.push(rowSeats.slice(prev, layout.maxCol));

              return (
                <React.Fragment key={rowName}>
                  <View style={styles.rowContainer}>
                    {/* Left row letter */}
                    <View style={styles.rowLetterWrap}>
                      <Text style={styles.rowLetterText}>{rowName}</Text>
                    </View>

                    {/* Render sections separated by aisles */}
                    {sections.map((section, idx) => (
                      <React.Fragment key={idx}>
                        {idx > 0 && <View style={styles.aisleSpace} />}
                        <View style={styles.sectionWrap}>
                          {section.map((seat, idxSeat) => renderSeat(seat, idxSeat))}
                        </View>
                      </React.Fragment>
                    ))}

                    {/* Right row letter */}
                    <View style={styles.rowLetterWrap}>
                      <Text style={styles.rowLetterText}>{rowName}</Text>
                    </View>
                  </View>
                  {layout.rowAisles?.includes(rowName) && <View style={styles.rowAisleSpace} />}
                </React.Fragment>
              );
            })}
          </View>
        </ScrollView>

        {/* Color Legend */}
        <View style={styles.legendContainer}>
          <View style={styles.legendItem}>
            <View style={styles.legendDotNormal} />
            <Text style={styles.legendText}>Buen estado</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={styles.legendDotDbox} />
            <Text style={styles.legendText}>D-BOX</Text>
          </View>
          {isLayoutEditorMode ? (
            <View style={styles.legendItem}>
              <View style={styles.legendDotEditorEmpty} />
              <Text style={styles.legendText}>Espacio Vacío</Text>
            </View>
          ) : (
            <View style={styles.legendItem}>
              <View style={styles.legendDotDamaged} />
              <Text style={styles.legendText}>Daño reportado</Text>
            </View>
          )}
        </View>

        <Text style={styles.mapHint}>
          {isLayoutEditorMode
            ? "Seleccioná una herramienta arriba y pintá las butacas haciendo clic en ellas."
            : "Hacé clic en cualquier butaca para informar un daño o ver detalles."}
        </Text>
      </View>
    );
  };

  // Render WYSIWYG parameters editing panel
  const renderLayoutEditorPanel = () => {
    return (
      <View style={styles.editorPanelCard}>
        <Text style={styles.editorPanelSectionTitle}>Herramientas de Configuración:</Text>
        <View style={styles.editorFormGrid}>
          <View style={styles.editorFormRow}>
            <View style={styles.editorFormCol}>
              <Text style={styles.editorLabel}>Letras de Fila (Fila superior a inferior, separadas por coma)</Text>
              <TextInput
                value={editorRowsInput}
                onChangeText={setEditorRowsInput}
                style={styles.editorTextInput}
                placeholder="Ej. A,B,C,D,E,F"
                placeholderTextColor={COLORS.muted}
                autoCapitalize="characters"
              />
            </View>
          </View>

          <View style={styles.editorFormRow}>
            <View style={styles.editorFormCol}>
              <Text style={styles.editorLabel}>Cantidad Máxima Columnas</Text>
              <TextInput
                value={editorMaxColInput}
                onChangeText={setEditorMaxColInput}
                style={styles.editorTextInput}
                placeholder="Ej. 21"
                placeholderTextColor={COLORS.muted}
                keyboardType="number-pad"
              />
            </View>
            <View style={styles.editorFormCol}>
              <Text style={styles.editorLabel}>Pasillos de Columnas (después de col, sep. coma)</Text>
              <TextInput
                value={editorAislesInput}
                onChangeText={setEditorAislesInput}
                style={styles.editorTextInput}
                placeholder="Ej. 4,17"
                placeholderTextColor={COLORS.muted}
              />
            </View>
            <View style={styles.editorFormCol}>
              <Text style={styles.editorLabel}>Pasillos de Filas (después de fila, sep. coma)</Text>
              <TextInput
                value={editorRowAislesInput}
                onChangeText={setEditorRowAislesInput}
                style={styles.editorTextInput}
                placeholder="Ej. D,H"
                placeholderTextColor={COLORS.muted}
                autoCapitalize="characters"
              />
            </View>
          </View>

          <View style={styles.editorFormRow}>
            <TouchableOpacity 
              style={[
                styles.editorFormCol, 
                { 
                  flexDirection: "row", 
                  alignItems: "center", 
                  justifyContent: "space-between", 
                  backgroundColor: COLORS.bg, 
                  padding: 12, 
                  borderRadius: 10, 
                  borderWidth: 1, 
                  borderColor: COLORS.border,
                  marginTop: 8
                }
              ]}
              onPress={() => setEditorInvertSeats(!editorInvertSeats)}
              activeOpacity={0.8}
            >
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={{ fontSize: 13, fontWeight: "bold", color: COLORS.text }}>Invertir numeración de butacas</Text>
                <Text style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>Si se activa, el número más bajo (butaca 1) comenzará desde el lado derecho.</Text>
              </View>
              <Switch
                value={editorInvertSeats}
                onValueChange={setEditorInvertSeats}
                trackColor={{ false: COLORS.border, true: COLORS.primary }}
                thumbColor="#FFFFFF"
              />
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.editorPanelSectionTitle}>Pincel para el Mapa:</Text>
        <View style={styles.paintToolsRow}>
          <TouchableOpacity
            style={[styles.paintToolBtn, paintTool === "seat" && styles.paintToolBtnActive]}
            onPress={() => setPaintTool("seat")}
            activeOpacity={0.8}
          >
            <View style={[styles.legendDotNormal, { backgroundColor: COLORS.border }]} />
            <Text style={[styles.paintToolText, paintTool === "seat" && styles.paintToolTextActive]}>
              Pintar Butaca Normal
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.paintToolBtn, paintTool === "dbox" && styles.paintToolBtnActive]}
            onPress={() => setPaintTool("dbox")}
            activeOpacity={0.8}
          >
            <View style={[styles.legendDotNormal, { backgroundColor: COLORS.betaBorder }]} />
            <Text style={[styles.paintToolText, paintTool === "dbox" && styles.paintToolTextActive]}>
              Pintar Butaca D-BOX
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.paintToolBtn, paintTool === "empty" && styles.paintToolBtnActive]}
            onPress={() => setPaintTool("empty")}
            activeOpacity={0.8}
          >
            <View style={styles.legendDotEditorEmpty} />
            <Text style={[styles.paintToolText, paintTool === "empty" && styles.paintToolTextActive]}>
              Pintar Vacío (Espacio)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.paintToolBtn, paintTool === "number" && styles.paintToolBtnActive]}
            onPress={() => setPaintTool("number")}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons 
              name="numeric" 
              size={14} 
              color={paintTool === "number" ? COLORS.primary : COLORS.muted} 
            />
            <Text style={[styles.paintToolText, paintTool === "number" && styles.paintToolTextActive]}>
              Cambiar Número
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.editorBtnRow}>
          <TouchableOpacity style={styles.btnLoadTemplate} onPress={handleLoadDefaultAbastoTemplate} activeOpacity={0.8}>
            <MaterialCommunityIcons name="history" size={16} color={COLORS.muted} />
            <Text style={styles.btnLoadTemplateText}>Cargar Plantilla por Defecto</Text>
          </TouchableOpacity>

          <View style={styles.editorMainActions}>
            <TouchableOpacity style={styles.btnEditorCancel} onPress={handleCancelLayoutEdits} activeOpacity={0.7}>
              <Text style={styles.btnEditorCancelText}>Descartar</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.btnEditorSave} onPress={handleSaveLayoutEdits} activeOpacity={0.85}>
              <MaterialCommunityIcons name="content-save" size={16} color="#FFF" style={{ marginRight: 4 }} />
              <Text style={styles.btnEditorSaveText}>Guardar Plano</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  // Convert current input editor parameters to a preview layout in real-time
  const getDraftLayout = (): RoomLayout => {
    const rows = editorRowsInput
      .split(",")
      .map((r) => r.trim().toUpperCase())
      .filter(Boolean);
    const maxCol = parseInt(editorMaxColInput, 10) || 1;
    const aisles = editorAislesInput
      .split(",")
      .map((a) => parseInt(a.trim(), 10))
      .filter((num) => !isNaN(num));
    const rowAisles = editorRowAislesInput
      .split(",")
      .map((r) => r.trim().toUpperCase())
      .filter(Boolean);

    const seats: { [row: string]: SeatInfo[] } = {};
    const colsToRender = maxCol + 1; // Always show one extra column on the right for expanding in editor mode!

    for (const row of rows) {
      const rowSeats: SeatInfo[] = [];
      for (let c = 1; c <= colsToRender; c++) {
        const key = `${row}-${c}`;
        const exception = editorCustomSeats[key];
        
        let type: "seat" | "empty" = "seat";
        let isDbox = false;

        if (c > maxCol) {
          type = "empty";
        } else if (exception === "empty") {
          type = "empty";
        } else if (exception === "dbox") {
          isDbox = true;
        }

        const customNum = editorCustomSeatNumbers[key];
        const defaultSeatNum = editorInvertSeats ? (maxCol - c + 1) : c;
        const seatNumber = c > maxCol
          ? (editorInvertSeats ? 0 : c)
          : (customNum !== undefined ? customNum : defaultSeatNum);

        rowSeats.push({
          row,
          number: seatNumber,
          colIndex: c,
          type,
          isDbox,
        });
      }
      seats[row] = rowSeats;
    }

    return { 
      rows, 
      maxCol: colsToRender, 
      aisles, 
      rowAisles, 
      seats, 
      invertSeats: editorInvertSeats 
    };
  };

  return (
    <View style={styles.container}>
      {/* Rooms Tab Selector */}
      <View style={styles.tabsCard}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardHeaderTitle}>Control de Estado Físico de Salas</Text>
          
          {isLayoutEditorMode && (
            <TouchableOpacity
              style={styles.adminMigrationBtn}
              onPress={handleMigrateAllDefaultLayouts}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="database-import" size={16} color={COLORS.primary} style={{ marginRight: 4 }} />
              <Text style={styles.adminMigrationBtnText}>Guardar Plantillas por Defecto</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.roomsGridContainer}>
          {salasInfoList.map((sala) => {
            const isSel = selectedSala === sala.id;
            const salaKey = String(sala.id);
            const damagedCount = Object.keys(report?.issues?.[salaKey] || {}).length;

            return (
              <TouchableOpacity
                key={sala.id}
                style={[styles.salaTabBtn, isSel && styles.salaTabBtnActive]}
                onPress={() => {
                  setSelectedSala(sala.id);
                  setIsLayoutEditorMode(false); // reset layout editor on room toggle
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.salaTabText, isSel && styles.salaTabTextActive]}>
                  {sala.name}
                </Text>
                {damagedCount > 0 && (
                  <View style={styles.badgeContainer}>
                    <Text style={styles.badgeText}>{damagedCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Main Panel grid */}
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Cargando estado de salas...</Text>
        </View>
      ) : (
        <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
          {/* Header info */}
          <View style={styles.roomStatusRow}>
            <View style={styles.roomStatusCard}>
              <Text style={styles.statusLabel}>SALA SELECCIONADA</Text>
              <Text style={styles.statusValue}>Sala {selectedSala}</Text>
            </View>
            <View style={styles.roomStatusCard}>
              <Text style={styles.statusLabel}>CAPACIDAD TOTAL</Text>
              <Text style={styles.statusValue}>{selectedSalaCapacity} butacas</Text>
            </View>
            <View style={styles.roomStatusCard}>
              <Text style={styles.statusLabel}>BUTACAS DAÑADAS</Text>
              <Text style={[styles.statusValue, selectedSalaIssues.length > 0 && { color: COLORS.danger }]}>
                {selectedSalaIssues.length}
              </Text>
            </View>
            {saving && (
              <View style={styles.syncingCard}>
                <ActivityIndicator size="small" color={COLORS.primary} style={{ marginRight: 6 }} />
                <Text style={styles.syncingText}>Sincronizando...</Text>
              </View>
            )}
          </View>

          {renderSeatingGrid()}

          {/* Detalles Generales de la Sala */}
          <View style={styles.listCard}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <MaterialCommunityIcons name="clipboard-text-outline" size={20} color={COLORS.primary} />
              <Text style={[styles.listCardTitle, { marginBottom: 0 }]}>
                Observaciones Generales (Sala {selectedSala})
              </Text>
            </View>

            {generalIssuesList.length > 0 ? (
              <View style={{ gap: 6, marginBottom: 12, width: "100%" }}>
                {generalIssuesList.map((item, index) => (
                  <View 
                    key={index} 
                    style={{ 
                      flexDirection: "row", 
                      justifyContent: "space-between", 
                      alignItems: "flex-start", 
                      backgroundColor: COLORS.bg, 
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                      borderRadius: THEME.radius.sm, 
                      borderWidth: 1, 
                      borderColor: COLORS.border,
                      gap: 12,
                      width: "100%"
                    }}
                  >
                    <View style={{ flex: 1, flexShrink: 1 }}>
                      <Text 
                        style={{ 
                          fontSize: 13, 
                          color: COLORS.text, 
                          fontWeight: "500",
                          flexWrap: "wrap",
                          // Web wrapping fallback
                          wordBreak: "break-word",
                        } as any}
                      >
                        • {item}
                      </Text>
                    </View>
                    <TouchableOpacity 
                      onPress={() => handleDeleteGeneralItem(item)} 
                      style={{ padding: 4, minWidth: 32, alignItems: "center" }}
                      activeOpacity={0.7}
                    >
                      <MaterialCommunityIcons name="trash-can-outline" size={18} color={COLORS.danger} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={{ fontSize: 12, color: COLORS.muted, marginBottom: 12, fontStyle: "italic" }}>
                Sin observaciones generales. Agregá ítems para reportar fallas de sonido, pantalla, limpieza o clima.
              </Text>
            )}

            {/* Form to add a new observation item */}
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput
                value={newItemText}
                onChangeText={setNewItemText}
                onSubmitEditing={handleAddNewGeneralItem}
                placeholder="Nueva observación (ej: parlante con ruido, pantalla sucia...)"
                placeholderTextColor={COLORS.muted}
                style={[styles.modalDetailsInput, { flex: 1, paddingVertical: 8, height: 40 }]}
              />
              <TouchableOpacity
                onPress={handleAddNewGeneralItem}
                style={{ 
                  backgroundColor: COLORS.primary, 
                  width: 40,
                  height: 40,
                  borderRadius: THEME.radius.md, 
                  justifyContent: "center", 
                  alignItems: "center" 
                }}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="plus" size={20} color="#FFF" />
              </TouchableOpacity>
            </View>
          </View>

          {/* List of reported issues in current room */}
          <View style={styles.listCard}>
            <Text style={styles.listCardTitle}>
              Registro de Daños en Sala {selectedSala} ({selectedSalaIssues.length})
            </Text>

            {selectedSalaIssues.length === 0 ? (
              <View style={styles.emptyStateContainer}>
                <MaterialCommunityIcons name="check-circle-outline" size={48} color={COLORS.success} />
                <Text style={styles.emptyStateTitle}>Sala en óptimas condiciones</Text>
                <Text style={styles.emptyStateSub}>
                  No se registraron daños. Para agregar una butaca rota, hacela clic en el mapa superior.
                </Text>
              </View>
            ) : (
              <View style={styles.issuesList}>
                {selectedSalaIssues.map((item) => (
                  <View key={item.key} style={styles.issueItemCard}>
                    <View style={styles.issueItemHeader}>
                      <View style={styles.issueItemTitleWrap}>
                        <MaterialCommunityIcons name="sofa-single" size={18} color={item.isDbox ? COLORS.betaText : COLORS.danger} />
                        <Text style={styles.issueSeatName}>
                          Fila {item.row} - Butaca {item.num}
                          {item.isDbox ? " (D-BOX)" : ""}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => handleClearSeatReport(item.row, item.num)}
                        style={styles.deleteIssueBtn}
                        activeOpacity={0.7}
                      >
                        <MaterialCommunityIcons name="trash-can-outline" size={18} color={COLORS.danger} />
                      </TouchableOpacity>
                    </View>

                    <View style={styles.issueBadgesRow}>
                      {item.respaldo && (
                        <View style={styles.partBadge}>
                          <Text style={styles.partBadgeText}>Respaldo</Text>
                        </View>
                      )}
                      {item.asiento && (
                        <View style={styles.partBadge}>
                          <Text style={styles.partBadgeText}>Asiento</Text>
                        </View>
                      )}
                      {item.apoyabrazos && (
                        <View style={styles.partBadge}>
                          <Text style={styles.partBadgeText}>Apoyabrazos</Text>
                        </View>
                      )}
                    </View>

                    {item.detalles ? (
                      <View style={styles.issueDetailsWrap}>
                        <Text style={styles.issueDetailsLabel}>Comentarios:</Text>
                        <Text style={styles.issueDetailsText}>{item.detalles}</Text>
                      </View>
                    ) : null}

                    <TouchableOpacity
                      onPress={() => handleSeatPress(item.row, item.num, item.isDbox)}
                      style={styles.editIssueBtn}
                      activeOpacity={0.7}
                    >
                      <MaterialCommunityIcons name="pencil-outline" size={14} color={COLORS.primary} />
                      <Text style={styles.editIssueBtnText}>Editar daños</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Action Buttons Footer */}
          <View style={styles.actionButtonsRow}>
            <TouchableOpacity style={styles.pdfBtn} onPress={handleExportPdf} activeOpacity={0.85}>
              <MaterialCommunityIcons name="file-pdf-box" size={22} color="#FFF" style={{ marginRight: 8 }} />
              <Text style={styles.pdfBtnText}>Generar Reporte PDF</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.clearBtn} onPress={handleClearActiveReport} activeOpacity={0.8}>
              <MaterialCommunityIcons name="refresh" size={20} color={COLORS.danger} style={{ marginRight: 6 }} />
              <Text style={styles.clearBtnText}>Reiniciar Todo</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* Seat Edit Modal */}
      <Modal
        visible={editingSeat !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingSeat(null)}
      >
        {editingSeat !== null && (
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>
                Editar Butaca {editingSeat.row}-{editingSeat.num}
                {editingSeat.isDbox ? " (Premium D-BOX)" : ""}
              </Text>
              <Text style={styles.modalSubtitle}>Sala {selectedSala}</Text>

              <Text style={styles.modalSectionTitle}>Informar Componentes Dañados:</Text>
              <View style={styles.modalCheckboxes}>
                <TouchableOpacity
                  style={[styles.modalCheckbox, respaldoRoto && styles.modalCheckboxChecked]}
                  onPress={() => setRespaldoRoto(!respaldoRoto)}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons
                    name={respaldoRoto ? "checkbox-marked" : "checkbox-blank-outline"}
                    size={24}
                    color={respaldoRoto ? COLORS.primary : COLORS.muted}
                    style={{ marginRight: 8 }}
                  />
                  <Text style={[styles.modalCheckboxLabel, respaldoRoto && styles.modalCheckboxLabelChecked]}>
                    Respaldo roto
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalCheckbox, asientoRoto && styles.modalCheckboxChecked]}
                  onPress={() => setAsientoRoto(!asientoRoto)}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons
                    name={asientoRoto ? "checkbox-marked" : "checkbox-blank-outline"}
                    size={24}
                    color={asientoRoto ? COLORS.primary : COLORS.muted}
                    style={{ marginRight: 8 }}
                  />
                  <Text style={[styles.modalCheckboxLabel, asientoRoto && styles.modalCheckboxLabelChecked]}>
                    Asiento roto
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalCheckbox, apoyabrazosRoto && styles.modalCheckboxChecked]}
                  onPress={() => setApoyabrazosRoto(!apoyabrazosRoto)}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons
                    name={apoyabrazosRoto ? "checkbox-marked" : "checkbox-blank-outline"}
                    size={24}
                    color={apoyabrazosRoto ? COLORS.primary : COLORS.muted}
                    style={{ marginRight: 8 }}
                  />
                  <Text style={[styles.modalCheckboxLabel, apoyabrazosRoto && styles.modalCheckboxLabelChecked]}>
                    Apoyabrazos roto
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.modalInputBlock}>
                <Text style={styles.modalInputLabel}>Detalles adicionales / Comentarios</Text>
                <TextInput
                  value={extraDetails}
                  onChangeText={setExtraDetails}
                  placeholder="Ej. costura rota, falta tornillo de base, chicle pegado"
                  placeholderTextColor={COLORS.muted}
                  style={styles.modalDetailsInput}
                  multiline
                  numberOfLines={3}
                />
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalBtnCancel, { marginRight: 12 }]}
                  onPress={() => setEditingSeat(null)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.modalBtnCancelText}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalBtnPrimary]}
                  onPress={handleSaveSeat}
                  activeOpacity={0.8}
                >
                  <Text style={styles.modalBtnPrimaryText}>Guardar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </Modal>

      {/* Seat Number Edit Modal */}
      <Modal
        visible={editingSeatNumber !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingSeatNumber(null)}
      >
        {editingSeatNumber !== null && (
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>
                Modificar Número de Butaca
              </Text>
              <Text style={styles.modalSubtitle}>
                Fila {editingSeatNumber.row} - Columna {editingSeatNumber.colIndex}
              </Text>

              <View style={styles.modalInputBlock}>
                <Text style={styles.modalInputLabel}>Número de Butaca</Text>
                <TextInput
                  value={newSeatNumberInput}
                  onChangeText={setNewSeatNumberInput}
                  keyboardType="number-pad"
                  style={styles.modalDetailsInput}
                  placeholder="Ej. 15"
                  placeholderTextColor={COLORS.muted}
                />
              </View>

              <View style={[styles.modalActions, { flexDirection: "column", gap: 8 }]}>
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalBtnCancel]}
                    onPress={() => setEditingSeatNumber(null)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.modalBtnCancelText}>Cancelar</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalBtnPrimary]}
                    onPress={() => {
                      const parsed = parseInt(newSeatNumberInput.trim(), 10);
                      if (isNaN(parsed) || parsed < 0) {
                        Alert.alert("Error", "Por favor ingrese un número válido.");
                        return;
                      }
                      const key = `${editingSeatNumber.row}-${editingSeatNumber.colIndex}`;
                      setEditorCustomSeatNumbers(prev => ({
                        ...prev,
                        [key]: parsed,
                      }));
                      setEditingSeatNumber(null);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.modalBtnPrimaryText}>Guardar</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[
                    styles.modalBtn, 
                    { 
                      backgroundColor: "transparent", 
                      borderWidth: 1, 
                      borderColor: COLORS.border,
                      marginTop: 4
                    }
                  ]}
                  onPress={() => {
                    const key = `${editingSeatNumber.row}-${editingSeatNumber.colIndex}`;
                    setEditorCustomSeatNumbers(prev => {
                      const copy = { ...prev };
                      delete copy[key];
                      return copy;
                    });
                    setEditingSeatNumber(null);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={{ color: COLORS.muted, fontWeight: "700" }}>Restaurar por Defecto</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  tabsCard: {
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.lg,
    paddingVertical: THEME.spacing.md,
    paddingHorizontal: THEME.spacing.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: THEME.spacing.md,
    ...THEME.shadow.soft,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: THEME.spacing.sm,
    flexWrap: "wrap",
    gap: 8,
  },
  cardHeaderTitle: {
    fontSize: THEME.fontSize.md,
    fontWeight: "700",
    color: COLORS.text,
  },
  adminMigrationBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primarySoft,
    borderColor: "rgba(137, 4, 4, 0.2)",
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  adminMigrationBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.primary,
  },
  roomsGridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  salaTabBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: THEME.radius.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  salaTabBtnActive: {
    backgroundColor: COLORS.primarySoft,
    borderColor: COLORS.primary,
  },
  salaTabText: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.muted,
  },
  salaTabTextActive: {
    color: COLORS.primary,
  },
  badgeContainer: {
    backgroundColor: COLORS.danger,
    borderRadius: 99,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FFF",
  },
  scrollArea: {
    flex: 1,
  },
  roomStatusRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: THEME.spacing.md,
    flexWrap: "wrap",
    alignItems: "center",
  },
  roomStatusCard: {
    flex: 1,
    minWidth: 100,
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 10,
    alignItems: "center",
  },
  statusLabel: {
    fontSize: 9,
    fontWeight: "600",
    color: COLORS.muted,
    marginBottom: 4,
  },
  statusValue: {
    fontSize: THEME.fontSize.md,
    fontWeight: "800",
    color: COLORS.text,
  },
  syncingCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
  },
  syncingText: {
    fontSize: 11,
    color: COLORS.muted,
  },
  loadingBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: THEME.spacing.xxl,
  },
  loadingText: {
    marginTop: THEME.spacing.sm,
    color: COLORS.muted,
    fontWeight: "600",
  },

  // Interactive Seating Map styling
  mapCard: {
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: THEME.spacing.lg,
    marginBottom: THEME.spacing.md,
    alignItems: "center",
    ...THEME.shadow.soft,
    overflow: "hidden",
  },
  mapHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    marginBottom: THEME.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: 8,
  },
  mapTitle: {
    fontSize: THEME.fontSize.md,
    fontWeight: "700",
    color: COLORS.text,
  },
  editorModeBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: THEME.radius.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  editorModeBtnActive: {
    backgroundColor: COLORS.dangerSoft,
    borderColor: COLORS.danger,
  },
  editorModeBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.primary,
  },
  screenIndicatorContainer: {
    width: "100%",
    alignItems: "center",
    marginBottom: 20,
  },
  screenLine: {
    height: 6,
    width: "70%",
    borderBottomWidth: 3,
    borderColor: COLORS.border,
    borderBottomLeftRadius: 100,
    borderBottomRightRadius: 100,
    marginBottom: 6,
  },
  screenText: {
    fontSize: 9,
    fontWeight: "800",
    color: COLORS.muted,
    letterSpacing: 2,
  },
  horizontalMapScroll: {
    paddingVertical: 10,
    minWidth: "100%",
    justifyContent: "center",
  },
  mapScrollView: {
    width: "100%",
  },
  gridContainer: {
    alignItems: "center",
    gap: 4,
  },
  rowContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  rowLetterWrap: {
    width: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  rowAisleSpace: {
    height: 14,
  },
  rowLetterText: {
    fontSize: 11,
    fontWeight: "800",
    color: COLORS.muted,
  },
  sectionWrap: {
    flexDirection: "row",
    gap: 3,
  },
  aisleSpace: {
    width: 14,
  },
  seat: {
    width: 19,
    height: 19,
    borderRadius: 3,
    backgroundColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
  },
  seatDbox: {
    backgroundColor: COLORS.betaBorder,
    borderColor: COLORS.betaText,
  },
  seatDamaged: {
    backgroundColor: COLORS.danger,
    borderColor: COLORS.danger,
  },
  seatSelected: {
    borderColor: "#EAB308",
    borderWidth: 2,
  },
  seatEmpty: {
    width: 19,
    height: 19,
  },
  seatEditorEmpty: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: COLORS.border,
  },
  seatText: {
    fontSize: 8,
    fontWeight: "600",
    color: COLORS.textSoft,
  },
  seatTextDbox: {
    color: "#FFF",
    fontWeight: "700",
  },
  seatTextDamaged: {
    color: "#FFF",
  },
  legendContainer: {
    flexDirection: "row",
    gap: 16,
    marginTop: THEME.spacing.lg,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDotNormal: {
    width: 12,
    height: 12,
    borderRadius: 2,
    backgroundColor: COLORS.border,
  },
  legendDotDbox: {
    width: 12,
    height: 12,
    borderRadius: 2,
    backgroundColor: COLORS.betaBorder,
  },
  legendDotDamaged: {
    width: 12,
    height: 12,
    borderRadius: 2,
    backgroundColor: COLORS.danger,
  },
  legendDotSelected: {
    width: 12,
    height: 12,
    borderRadius: 2,
    borderWidth: 2,
    borderColor: "#EAB308",
    backgroundColor: COLORS.border,
  },
  legendDotEditorEmpty: {
    width: 12,
    height: 12,
    borderRadius: 2,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: COLORS.muted,
  },
  legendText: {
    fontSize: 11,
    color: COLORS.muted,
    fontWeight: "600",
  },
  mapHint: {
    fontSize: 10,
    fontStyle: "italic",
    color: COLORS.muted,
    marginTop: THEME.spacing.md,
    textAlign: "center",
  },

  // WYSIWYG Layout Editor Panel styles
  editorPanelCard: {
    width: "100%",
    backgroundColor: COLORS.bg,
    borderRadius: THEME.radius.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: THEME.spacing.md,
    marginBottom: THEME.spacing.lg,
  },
  editorPanelSectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 8,
  },
  editorFormGrid: {
    gap: 8,
    marginBottom: 12,
  },
  editorFormRow: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
  },
  editorFormCol: {
    flex: 1,
    minWidth: 150,
  },
  editorLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.muted,
    marginBottom: 4,
  },
  editorTextInput: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    color: COLORS.text,
    fontSize: 12,
  },
  paintToolsRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 16,
  },
  paintToolBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  paintToolBtnActive: {
    backgroundColor: COLORS.primarySoft,
    borderColor: COLORS.primary,
  },
  paintToolText: {
    fontSize: 11,
    color: COLORS.muted,
    fontWeight: "600",
  },
  paintToolTextActive: {
    color: COLORS.primary,
    fontWeight: "700",
  },
  editorBtnRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 12,
    flexWrap: "wrap",
    gap: 10,
  },
  btnLoadTemplate: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  btnLoadTemplateText: {
    fontSize: 11,
    color: COLORS.muted,
    fontWeight: "600",
  },
  editorMainActions: {
    flexDirection: "row",
    gap: 8,
  },
  btnEditorCancel: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
    backgroundColor: COLORS.border,
  },
  btnEditorCancelText: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.text,
  },
  btnEditorSave: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  btnEditorSaveText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFF",
  },

  listCard: {
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: THEME.spacing.lg,
    marginBottom: THEME.spacing.md,
    ...THEME.shadow.soft,
    position: "relative",
    zIndex: 5,
  },
  listCardTitle: {
    fontSize: THEME.fontSize.md,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: THEME.spacing.md,
  },
  emptyStateContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: THEME.spacing.xxl,
    paddingHorizontal: THEME.spacing.md,
  },
  emptyStateTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.text,
    marginTop: 10,
    marginBottom: 6,
  },
  emptyStateSub: {
    fontSize: 12,
    color: COLORS.muted,
    textAlign: "center",
    lineHeight: 16,
    maxWidth: 280,
  },
  issuesList: {
    gap: 10,
  },
  issueItemCard: {
    backgroundColor: COLORS.bg,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: THEME.radius.md,
    padding: THEME.spacing.md,
  },
  issueItemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  issueItemTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  issueSeatName: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.text,
  },
  deleteIssueBtn: {
    padding: 4,
  },
  issueBadgesRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 8,
  },
  partBadge: {
    backgroundColor: COLORS.dangerSoft,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.2)",
  },
  partBadgeText: {
    fontSize: 10,
    color: COLORS.danger,
    fontWeight: "700",
  },
  issueDetailsWrap: {
    backgroundColor: COLORS.card,
    borderRadius: 4,
    padding: 8,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.danger,
  },
  issueDetailsLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: COLORS.muted,
    marginBottom: 2,
  },
  issueDetailsText: {
    fontSize: 12,
    color: COLORS.text,
  },
  editIssueBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  editIssueBtnText: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: "600",
  },

  // PDF & Clear buttons styling
  actionButtonsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },
  pdfBtn: {
    flex: 2,
    backgroundColor: COLORS.primary,
    borderRadius: THEME.radius.md,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    ...THEME.shadow.soft,
  },
  pdfBtnText: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 14,
  },
  clearBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.danger,
    backgroundColor: "transparent",
    borderRadius: THEME.radius.md,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  clearBtnText: {
    color: COLORS.danger,
    fontWeight: "700",
    fontSize: 14,
  },

  // Modal Seat Editor Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: THEME.spacing.lg,
  },
  modalCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: COLORS.card,
    borderRadius: THEME.radius.lg,
    padding: THEME.spacing.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...THEME.shadow.web,
  },
  modalTitle: {
    fontSize: THEME.fontSize.lg,
    fontWeight: "800",
    color: COLORS.text,
    textAlign: "center",
    marginBottom: 2,
  },
  modalSubtitle: {
    fontSize: THEME.fontSize.sm,
    fontWeight: "600",
    color: COLORS.muted,
    textAlign: "center",
    marginBottom: THEME.spacing.lg,
  },
  modalSectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 10,
  },
  modalCheckboxes: {
    marginBottom: THEME.spacing.lg,
  },
  modalCheckbox: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: THEME.radius.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 8,
  },
  modalCheckboxChecked: {
    backgroundColor: COLORS.primarySoft,
    borderColor: COLORS.primary,
  },
  modalCheckboxLabel: {
    fontSize: 14,
    color: COLORS.muted,
    fontWeight: "600",
  },
  modalCheckboxLabelChecked: {
    color: COLORS.primary,
    fontWeight: "700",
  },
  modalInputBlock: {
    marginBottom: THEME.spacing.xl,
  },
  modalInputLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 6,
  },
  modalDetailsInput: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: THEME.radius.md,
    padding: 10,
    color: COLORS.text,
    fontSize: 14,
    textAlignVertical: "top",
  },
  modalActions: {
    flexDirection: "row",
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: THEME.radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBtnCancel: {
    backgroundColor: COLORS.border,
  },
  modalBtnCancelText: {
    color: COLORS.text,
    fontWeight: "700",
  },
  modalBtnPrimary: {
    backgroundColor: COLORS.primary,
  },
  modalBtnPrimaryText: {
    color: "#FFF",
    fontWeight: "700",
  },
  editGeneralReportBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: "transparent",
  },
  editGeneralReportBtnText: {
    fontSize: 11,
    color: COLORS.primary,
    fontWeight: "700",
  },
});
