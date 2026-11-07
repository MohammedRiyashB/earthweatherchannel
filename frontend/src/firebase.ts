import { initializeApp, getApps } from "firebase/app";
import { getAnalytics, isSupported, type Analytics } from "firebase/analytics";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";

const env = import.meta.env;
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: env.VITE_FIREBASE_DATABASE_URL,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID,
};

export const firebaseReady = Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId);
const app = firebaseReady ? (getApps()[0] ?? initializeApp(firebaseConfig)) : null;
export const auth = app ? getAuth(app) : null;
export const googleProvider = new GoogleAuthProvider();
export const firestore = app ? getFirestore(app) : null;
export const realtimeDb = app && firebaseConfig.databaseURL ? getDatabase(app) : null;

let analyticsInstance: Analytics | null = null;
export async function enableAnalytics() {
  if (!app || !firebaseConfig.measurementId || typeof window === "undefined") return;
  try {
    if (await isSupported()) analyticsInstance = getAnalytics(app);
  } catch {
    analyticsInstance = null;
  }
}
