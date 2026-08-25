import { Platform } from "react-native";
import { getApp, getApps, initializeApp } from "firebase/app";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
// @ts-ignore
import { initializeAuth, getReactNativePersistence } from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "AIzaSyDummyApiKeyForBuild1234567890123",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "dummy-auth-domain",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "dummy-project-id",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "dummy-storage-bucket",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "dummy-sender-id",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "dummy-app-id",
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID || "dummy-measurement-id"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

let dbInstance;

try {
  dbInstance =
    Platform.OS === "web"
      ? getFirestore(app)
      : initializeFirestore(app, {
          localCache: persistentLocalCache(),
        });
} catch {
  dbInstance = getFirestore(app);
}

export const db = dbInstance;

let authInstance;
if (Platform.OS === "web") {
  authInstance = getAuth(app);
} else {
  try {
    authInstance = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (err) {
    authInstance = getAuth(app); // fallback si ya fue inicializado
  }
}

export const auth = authInstance;
export const functions = getFunctions(app, "us-central1");

export const APP_AUTH_DOMAIN = "equipo.local";
export const CINES_COLLECTION = "cines";
