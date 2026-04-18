import { initializeApp } from "firebase/app";
import { getAnalytics, logEvent, setUserId } from "firebase/analytics";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase only if API Key is present to prevent crashes in dev/native environments without .env
const hasConfig = !!import.meta.env.VITE_FIREBASE_API_KEY;
const app = hasConfig ? initializeApp(firebaseConfig) : null;
const analytics = (hasConfig && typeof window !== 'undefined') ? getAnalytics(app!) : null;

if (!hasConfig) {
  console.warn("[ANALYTICS] Firebase config missing. Analytics disabled for this session.");
}

export const logGameEvent = (eventName: string, eventParams?: Record<string, any>) => {
  if (analytics) {
    logEvent(analytics, eventName, eventParams);
    console.log(`[ANALYTICS] Event Logged: ${eventName}`, eventParams);
  }
};

export const identifyCommander = (userId: string) => {
  if (analytics) {
    setUserId(analytics, userId);
    console.log(`[ANALYTICS] User Identified: ${userId}`);
  }
};

export default analytics;
