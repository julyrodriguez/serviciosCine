import { Platform } from "react-native";
import {
  collection as firestoreCollection,
  doc as firestoreDoc,
  getDocs as firestoreGetDocs,
  getDoc as firestoreGetDoc,
  addDoc as firestoreAddDoc,
  setDoc as firestoreSetDoc,
  updateDoc as firestoreUpdateDoc,
  deleteDoc as firestoreDeleteDoc,
  onSnapshot as firestoreOnSnapshot,
  query as firestoreQuery,
  orderBy as firestoreOrderBy,
  where as firestoreWhere,
  limit as firestoreLimit,
  serverTimestamp as firestoreServerTimestamp,
  startAt as firestoreStartAt,
  endAt as firestoreEndAt,
  startAfter as firestoreStartAfter,
  QueryConstraint
} from "firebase/firestore";
import { db as realFirestoreDb, auth } from "./firebaseConfig";

// Base URL de la API local (se puede configurar mediante variables de entorno)
// Reemplazar con la URL final del túnel de Cloudflare o la IP de tu servidor
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || "https://api-cinemark.jariel.com.ar/api";

// Estado global para rastrear si el servidor local está caído
let fallbackModeActive = false;

export function isFallbackMode() {
  return fallbackModeActive;
}

// Obtener el ID Token de Firebase Auth actual para autenticar con la API Docker
async function getAuthToken(): Promise<string | null> {
  const currentUser = auth.currentUser;
  if (!currentUser) return null;
  try {
    return await currentUser.getIdToken(true);
  } catch (err) {
    console.error("Error al obtener Firebase Auth Token:", err);
    return null;
  }
}

// Representa una referencia compatible con el SDK de Firestore
export class DbRef {
  type: "collection" | "document" | "query";
  path: string[];
  firestoreRef: any;
  constraints?: QueryConstraint[];

  constructor(type: "collection" | "document" | "query", path: string[], firestoreRef: any, constraints?: QueryConstraint[]) {
    this.type = type;
    this.path = path;
    this.firestoreRef = firestoreRef;
    this.constraints = constraints;
  }
}

// Mock de la base de datos local
export const db = {};

// 1. Mock de collection()
export function collection(database: any, ...pathSegments: string[]): DbRef {
  const firestoreRef = firestoreCollection(realFirestoreDb, pathSegments[0], ...pathSegments.slice(1));
  return new DbRef("collection", pathSegments, firestoreRef);
}

// 2. Mock de doc()
export function doc(database: any, ...pathSegments: string[]): DbRef {
  // Manejar caso donde se pasa una referencia de colección como primer argumento
  if (database instanceof DbRef) {
    const parentRef = database;
    let segments = [...parentRef.path, ...pathSegments];
    
    // Si no se pasaron segmentos adicionales (ej: doc(collectionRef)),
    // el SDK de Firestore genera un ID automático de documento.
    if (pathSegments.length === 0) {
      const firestoreRef = firestoreDoc(parentRef.firestoreRef);
      segments.push(firestoreRef.id);
      return new DbRef("document", segments, firestoreRef);
    }
    
    const firestoreRef = firestoreDoc(realFirestoreDb, segments[0], ...segments.slice(1));
    return new DbRef("document", segments, firestoreRef);
  }
  const firestoreRef = firestoreDoc(realFirestoreDb, pathSegments[0], ...pathSegments.slice(1));
  return new DbRef("document", pathSegments, firestoreRef);
}

// Helper para convertir cualquier tipo de fecha (Date, Timestamp, ISO string, objeto seconds) a un valor numérico comparable (ms)
function toComparableValue(val: any): any {
  if (val === null || val === undefined) return val;
  if (val instanceof Date) return val.getTime();
  if (typeof val?.toDate === "function") return val.toDate().getTime();
  if (typeof val?.toMillis === "function") return val.toMillis();
  if (typeof val?.seconds === "number") return val.seconds * 1000 + (val.nanoseconds || 0) / 1000000;
  if (typeof val?._seconds === "number") return val._seconds * 1000 + (val._nanoseconds || 0) / 1000000;
  if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) {
    const ms = Date.parse(val);
    if (!isNaN(ms)) return ms;
  }
  return val;
}

// Helper para aplicar las restricciones de la consulta del lado del cliente
function applyConstraints(data: any[], constraints: any[]): any[] {
  if (!constraints || constraints.length === 0) return data;

  let result = [...data];

  // 1. Filtrar con 'where'
  for (const c of constraints) {
    if (c.type === "where") {
      const { field, op, val } = c;
      const targetVal = toComparableValue(val);
      result = result.filter(item => {
        const itemVal = toComparableValue(item[field]);
        if (op === "==") return itemVal === targetVal;
        if (op === "!=") return itemVal !== targetVal;
        if (op === ">") return itemVal > targetVal;
        if (op === ">=") return itemVal >= targetVal;
        if (op === "<") return itemVal < targetVal;
        if (op === "<=") return itemVal <= targetVal;
        if (op === "array-contains") return Array.isArray(itemVal) && itemVal.includes(targetVal);
        return true;
      });
    }
  }

  // 2. Ordenar con 'orderBy'
  const orderBys = constraints.filter(c => c.type === "orderBy");
  if (orderBys.length > 0) {
    result.sort((a, b) => {
      for (const ob of orderBys) {
        const { field, direction } = ob;
        const valA = toComparableValue(a[field]);
        const valB = toComparableValue(b[field]);

        if (valA === valB) continue;
        if (valA === undefined || valA === null) return direction === "asc" ? -1 : 1;
        if (valB === undefined || valB === null) return direction === "asc" ? 1 : -1;

        if (typeof valA === "string" && typeof valB === "string") {
          const cmp = valA.localeCompare(valB);
          if (cmp !== 0) return direction === "asc" ? cmp : -cmp;
        } else {
          if (valA < valB) return direction === "asc" ? -1 : 1;
          if (valA > valB) return direction === "asc" ? 1 : -1;
        }
      }
      return 0;
    });
  }

  // 3. Filtrar con 'startAt', 'endAt' o 'startAfter'
  const startAtConstraint = constraints.find(c => c.type === "startAt");
  const endAtConstraint = constraints.find(c => c.type === "endAt");
  const startAfterConstraint = constraints.find(c => c.type === "startAfter");

  if (startAtConstraint || endAtConstraint || startAfterConstraint) {
    const primaryOrderBy = orderBys[0];
    if (primaryOrderBy) {
      const field = primaryOrderBy.field;

      if (startAtConstraint) {
        const targetVal = toComparableValue(startAtConstraint.values[0]);
        result = result.filter(item => toComparableValue(item[field]) >= targetVal);
      }

      if (endAtConstraint) {
        const targetVal = toComparableValue(endAtConstraint.values[0]);
        result = result.filter(item => toComparableValue(item[field]) <= targetVal);
      }

      if (startAfterConstraint) {
        const targetDocOrVal = startAfterConstraint.values[0];
        let rawVal: any;
        if (targetDocOrVal && typeof targetDocOrVal === "object" && typeof targetDocOrVal.data === "function") {
          rawVal = targetDocOrVal.data()[field];
        } else if (targetDocOrVal && typeof targetDocOrVal === "object" && targetDocOrVal.id) {
          rawVal = targetDocOrVal[field];
        } else {
          rawVal = targetDocOrVal;
        }
        const targetVal = toComparableValue(rawVal);

        if (targetVal !== undefined && targetVal !== null) {
          result = result.filter(item => {
            const itemVal = toComparableValue(item[field]);
            if (primaryOrderBy.direction === "desc") {
              return itemVal < targetVal;
            } else {
              return itemVal > targetVal;
            }
          });
        }
      }
    }
  }

  // 4. Limitar con 'limit'
  const limitConstraint = constraints.find(c => c.type === "limit");
  if (limitConstraint) {
    result = result.slice(0, limitConstraint.count);
  }

  return result;
}

// 3. Mock de query()
export function query(dbRef: DbRef, ...queryConstraints: any[]): DbRef {
  let firestoreRef: any = null;
  try {
    const realConstraints = queryConstraints
      .map(c => (c && c._realConstraint !== undefined) ? c._realConstraint : c)
      .filter(c => c !== null && c !== undefined);
    if (dbRef.firestoreRef) {
      firestoreRef = firestoreQuery(dbRef.firestoreRef, ...realConstraints);
    }
  } catch (err) {
    // Gracefully catch errors if firestoreQuery complains about mock snapshots
  }
  return new DbRef("query", dbRef.path, firestoreRef, queryConstraints);
}

// Envolver constraints para capturar sus valores y poder evaluarlas del lado del cliente
export function where(field: string, op: any, val: any) {
  const real = firestoreWhere(field, op, val);
  return {
    type: "where",
    field,
    op,
    val,
    _realConstraint: real
  };
}

export function orderBy(field: string, direction: "asc" | "desc" = "asc") {
  const real = firestoreOrderBy(field, direction);
  return {
    type: "orderBy",
    field,
    direction,
    _realConstraint: real
  };
}

export function limit(count: number) {
  const real = firestoreLimit(count);
  return {
    type: "limit",
    count,
    _realConstraint: real
  };
}

export function startAt(...values: any[]) {
  let real: any = null;
  try {
    real = firestoreStartAt(...values);
  } catch (e) {
    // Catch mock document snapshot errors
  }
  return {
    type: "startAt",
    values,
    _realConstraint: real
  };
}

export function endAt(...values: any[]) {
  let real: any = null;
  try {
    real = firestoreEndAt(...values);
  } catch (e) {
    // Catch mock document snapshot errors
  }
  return {
    type: "endAt",
    values,
    _realConstraint: real
  };
}

export function startAfter(...values: any[]) {
  let real: any = null;
  try {
    real = firestoreStartAfter(...values);
  } catch (e) {
    // Catch mock document snapshot errors
  }
  return {
    type: "startAfter",
    values,
    _realConstraint: real
  };
}

export const serverTimestamp = firestoreServerTimestamp;

// 4. Mock de getDocs() (Lectura de colecciones)
export async function getDocs(dbRef: DbRef) {
  if (fallbackModeActive) {
    console.warn("[DB Service] Servidor offline: Leyendo desde Firestore de respaldo.");
    return await firestoreGetDocs(dbRef.firestoreRef);
  }

  try {
    const token = await getAuthToken();
    if (!token) throw new Error("Usuario no autenticado");

    // Construir ruta de la API según los segmentos
    // Ruta en Firestore: cines/{cineId}/{subColName} o cines/{cineId}/{subColName}/{parentId}/{subSubColName}
    const path = dbRef.path;
    let url = "";

    if (path.length === 1 && path[0] === "cines") {
      url = `${API_BASE_URL}/cines`;
    } else if (path.length === 3 && path[0] === "cines") {
      const [_, cineId, subColName] = path;
      url = `${API_BASE_URL}/cines/${cineId}/${subColName}`;
    } else if (path.length === 5 && path[0] === "cines") {
      const [_, cineId, subColName, parentId, subSubColName] = path;
      url = `${API_BASE_URL}/cines/${cineId}/${subColName}/${parentId}/${subSubColName}`;
    } else {
      // Si la colección no sigue el patrón estándar, usar fallback a Firestore directamente
      return await firestoreGetDocs(dbRef.firestoreRef);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 segundos de timeout

    const res = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${token}`
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`Error HTTP: ${res.status}`);
    }

    const data = await res.json();

    // Aplicar las restricciones de consulta (filtros, orden, límite, paginación) localmente
    const filteredData = applyConstraints(data, dbRef.constraints || []);

    // Mapear el array JSON devuelto a la estructura de QuerySnapshot que espera Firestore
    return {
      empty: filteredData.length === 0,
      size: filteredData.length,
      docs: filteredData.map((docData: any) => ({
        id: docData.id,
        exists: () => true,
        data: () => docData,
        get: (field: string) => docData[field]
      })) as any
    };
  } catch (err: any) {
    console.error("[DB Service] Error al conectar con la API local, activando Modo Respaldo:", err.message);
    fallbackModeActive = true;
    // Intentar leer de Firestore
    return await firestoreGetDocs(dbRef.firestoreRef);
  }
}

// 5. Mock de getDoc() (Lectura de un documento específico)
export async function getDoc(dbRef: DbRef) {
  if (fallbackModeActive) {
    return await firestoreGetDoc(dbRef.firestoreRef);
  }

  try {
    const token = await getAuthToken();
    if (!token) throw new Error("Usuario no autenticado");

    const path = dbRef.path;
    let url = "";

    if (path.length === 2 && path[0] === "cines") {
      const [_, cineId] = path;
      url = `${API_BASE_URL}/cines/${cineId}`;
    } else if (path.length === 4 && path[0] === "cines") {
      const [_, cineId, subColName, docId] = path;
      url = `${API_BASE_URL}/cines/${cineId}/${subColName}/${docId}`;
    } else {
      return await firestoreGetDoc(dbRef.firestoreRef);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${token}`
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.status === 404) {
      return { exists: () => false, data: () => null };
    }

    if (!res.ok) {
      throw new Error(`Error HTTP: ${res.status}`);
    }

    const data = await res.json();
    return {
      id: path[path.length - 1],
      exists: () => true,
      data: () => data,
      get: (field: string) => data[field]
    } as any;
  } catch (err: any) {
    console.error("[DB Service] Error en getDoc al conectar con la API, usando Firestore:", err.message);
    fallbackModeActive = true;
    return await firestoreGetDoc(dbRef.firestoreRef);
  }
}

// Helper para verificar si estamos en modo lectura obligatoria y bloquear escrituras
function checkWritePermissions() {
  if (fallbackModeActive) {
    const errorMsg = "Servidor local fuera de línea. Modo de solo lectura activo. No se permiten actualizaciones.";
    if (Platform.OS === "web") {
      alert(errorMsg);
    }
    throw new Error(errorMsg);
  }
}

// Helper para serializar datos y reemplazar serverTimestamp y fechas con ISO strings para la API HTTP
function serializeData(val: any): any {
  if (val === null || val === undefined) return val;
  if (val instanceof Date) {
    return val.toISOString();
  }
  if (typeof val === "object") {
    if (val._methodName === "serverTimestamp" || (val.constructor && val.constructor.name === "FieldValue")) {
      return new Date().toISOString();
    }
    if (typeof val.toDate === "function") {
      return val.toDate().toISOString();
    }
    if (typeof val.toMillis === "function") {
      return new Date(val.toMillis()).toISOString();
    }
    if (typeof val.seconds === "number") {
      return new Date(val.seconds * 1000 + (val.nanoseconds || 0) / 1000000).toISOString();
    }
    if (typeof val._seconds === "number") {
      return new Date(val._seconds * 1000 + (val._nanoseconds || 0) / 1000000).toISOString();
    }
    if (Array.isArray(val)) {
      return val.map(serializeData);
    }
    const result: any = {};
    for (const key of Object.keys(val)) {
      result[key] = serializeData(val[key]);
    }
    return result;
  }
  return val;
}

// 6. Mock de addDoc() (Crear documento con ID auto-generado)
export async function addDoc(dbRef: DbRef, data: any) {
  checkWritePermissions();

  try {
    const token = await getAuthToken();
    if (!token) throw new Error("Usuario no autenticado");

    const path = dbRef.path;
    let url = "";

    if (path.length === 3 && path[0] === "cines") {
      const [_, cineId, subColName] = path;
      url = `${API_BASE_URL}/cines/${cineId}/${subColName}`;
    } else if (path.length === 5 && path[0] === "cines") {
      const [_, cineId, subColName, parentId, subSubColName] = path;
      url = `${API_BASE_URL}/cines/${cineId}/${subColName}/${parentId}/${subSubColName}`;
    } else {
      return await firestoreAddDoc(dbRef.firestoreRef, data);
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(serializeData(data))
    });

    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);

    const result = await res.json();
    return { id: result.id };
  } catch (err: any) {
    console.error("[DB Service] Error en addDoc:", err.message);
    throw err;
  }
}

// 7. Mock de setDoc() (Crear/sobreescribir documento con ID específico)
export async function setDoc(dbRef: DbRef, data: any, options?: any) {
  checkWritePermissions();

  try {
    const token = await getAuthToken();
    if (!token) throw new Error("Usuario no autenticado");

    const path = dbRef.path;
    let url = "";

    if (path.length === 2 && path[0] === "cines") {
      const [_, cineId] = path;
      url = `${API_BASE_URL}/cines/${cineId}`;
    } else if (path.length === 4 && path[0] === "cines") {
      const [_, cineId, subColName, docId] = path;
      url = `${API_BASE_URL}/cines/${cineId}/${subColName}/${docId}`;
    } else if (path.length === 6 && path[0] === "cines") {
      const [_, cineId, subColName, parentId, subSubColName, docId] = path;
      url = `${API_BASE_URL}/cines/${cineId}/${subColName}/${parentId}/${subSubColName}/${docId}`;
    } else {
      return await firestoreSetDoc(dbRef.firestoreRef, data, options);
    }

    const res = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(serializeData(data))
    });

    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    return { success: true };
  } catch (err: any) {
    console.error("[DB Service] Error en setDoc:", err.message);
    throw err;
  }
}

// 8. Mock de updateDoc() (Actualizar parcialmente un documento)
export async function updateDoc(dbRef: DbRef, data: any) {
  checkWritePermissions();

  try {
    const token = await getAuthToken();
    if (!token) throw new Error("Usuario no autenticado");

    const path = dbRef.path;
    let url = "";

    if (path.length === 4 && path[0] === "cines") {
      const [_, cineId, subColName, docId] = path;
      url = `${API_BASE_URL}/cines/${cineId}/${subColName}/${docId}`;
    } else if (path.length === 6 && path[0] === "cines") {
      const [_, cineId, subColName, parentId, subSubColName, docId] = path;
      url = `${API_BASE_URL}/cines/${cineId}/${subColName}/${parentId}/${subSubColName}/${docId}`;
    } else {
      return await firestoreUpdateDoc(dbRef.firestoreRef, data);
    }

    const res = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(serializeData(data))
    });

    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    return { success: true };
  } catch (err: any) {
    console.error("[DB Service] Error en updateDoc:", err.message);
    throw err;
  }
}

// 9. Mock de deleteDoc() (Eliminar documento)
export async function deleteDoc(dbRef: DbRef) {
  checkWritePermissions();

  try {
    const token = await getAuthToken();
    if (!token) throw new Error("Usuario no autenticado");

    const path = dbRef.path;
    let url = "";

    if (path.length === 4 && path[0] === "cines") {
      const [_, cineId, subColName, docId] = path;
      url = `${API_BASE_URL}/cines/${cineId}/${subColName}/${docId}`;
    } else if (path.length === 6 && path[0] === "cines") {
      const [_, cineId, subColName, parentId, subSubColName, docId] = path;
      url = `${API_BASE_URL}/cines/${cineId}/${subColName}/${parentId}/${subSubColName}/${docId}`;
    } else {
      return await firestoreDeleteDoc(dbRef.firestoreRef);
    }

    const res = await fetch(url, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });

    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    return { success: true };
  } catch (err: any) {
    console.error("[DB Service] Error en deleteDoc:", err.message);
    throw err;
  }
}

// 10. Mock de onSnapshot() (Escucha en tiempo real)
// Apunta a Firestore directamente, lo que garantiza el tiempo real y el modo de respaldo nativos
export function onSnapshot(dbRef: DbRef, callback: any, errorCallback?: any) {
  return firestoreOnSnapshot(
    dbRef.firestoreRef,
    (snapshot: any) => {
      // Mapeamos los datos para asegurar compatibilidad
      callback(snapshot);
    },
    (err: any) => {
      if (errorCallback) {
        errorCallback(err);
      } else {
        console.error("[DB Service] Error en onSnapshot:", err);
      }
    }
  );
}

// 11. Mock de httpsCallable() para interceptar funciones de Firebase y llamarlas en el backend local
import { httpsCallable as firestoreHttpsCallable } from "firebase/functions";

export { functions } from "./firebaseConfig";

export function httpsCallable(functionsInstance: any, functionName: string) {
  return async (data: any) => {
    if (fallbackModeActive) {
      console.warn(`[DB Service] Servidor offline: Llamando a la Cloud Function de respaldo: ${functionName}`);
      const realCallable = firestoreHttpsCallable(functionsInstance, functionName);
      const res = await realCallable(data);
      return res;
    }

    try {
      const token = process.env.EXPO_PUBLIC_API_TOKEN || "jariel2026";
      const authToken = await getAuthToken();

      const headers: any = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      };

      if (authToken) {
        headers["x-firebase-auth"] = `Bearer ${authToken}`;
      }

      const res = await fetch(`${API_BASE_URL}/functions/${functionName}`, {
        method: "POST",
        headers,
        body: JSON.stringify(data || {})
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Error HTTP: ${res.status}`);
      }

      const result = await res.json();
      return result;
    } catch (err: any) {
      console.error(`[DB Service] Falló la llamada a la función ${functionName} en la API:`, err.message);
      console.warn(`[DB Service] Intentando fallback directo a Firebase Cloud Functions para ${functionName}...`);
      const realCallable = firestoreHttpsCallable(functionsInstance, functionName);
      const res = await realCallable(data);
      return res;
    }
  };
}

// Re-exportar tipos adicionales requeridos por las pantallas
export {
  DocumentData,
  QueryDocumentSnapshot,
  Timestamp
} from "firebase/firestore";
