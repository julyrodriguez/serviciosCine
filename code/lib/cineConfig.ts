import {
    doc,
    getDoc,
    serverTimestamp,
    setDoc,
  } from "@/lib/dbService";
  
  import { CINES_COLLECTION, db } from "./firebaseConfig";
  
  export type CineConfig = {
    nombre: string;
    authEmail: string;
    salasCount: number;
    proyeccionPin?: string;
    updatedAt?: any;
  };
  
  export function getCineConfigRef(cineId: string) {
    return doc(db, CINES_COLLECTION, cineId, "info", "config");
  }
  
  export async function getCineConfig(cineId: string): Promise<CineConfig | null> {
    const ref = getCineConfigRef(cineId);
    const snap = await getDoc(ref);
  
    if (!snap.exists()) return null;
  
    const data = snap.data() as Partial<CineConfig>;
  
    return {
      nombre: String(data.nombre ?? ""),
      authEmail: String(data.authEmail ?? ""),
      salasCount: Number(data.salasCount ?? 0),
      proyeccionPin: data.proyeccionPin ? String(data.proyeccionPin) : "",
      updatedAt: data.updatedAt,
    };
  }
  
  export async function saveCineConfig(
    cineId: string,
    data: Partial<CineConfig>
  ) {
    const ref = getCineConfigRef(cineId);
  
    await setDoc(
      ref,
      {
        ...data,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }
  
  export function buildSalasFromCount(salasCount: number) {
    const safeCount = Number.isFinite(salasCount)
      ? Math.max(0, Math.floor(salasCount))
      : 0;
  
    return [
      ...Array.from({ length: safeCount }, (_, i) => String(i + 1)),
      "AC",
    ];
  }