import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import voiceService from "./services/VoiceService";

const firebaseConfig = {
  apiKey: "AIzaSyCfLCGhA-cv1Fn2UINr_GSBMEbTbictKkM",
  authDomain: "niyogax.firebaseapp.com",
  projectId: "niyogax",
  storageBucket: "niyogax.firebasestorage.app",
  messagingSenderId: "451980624601",
  appId: "1:451980624601:web:8d3bbb852a39f8e96234c8",
  measurementId: "G-FHZVFHT7LW"
};

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

const vapidKey = "BGrjhQMjEhN1HlIocjgCdP93aqUHJA87VDTuvepwg2XMY2JWeRwnplS01Ky6yKQIRZrGQ2LAA0GVFM_kKon_U2I";
let lastSavedFcmToken = null;

const saveFcmTokenToBackend = async (token) => {
  if (!token || token === lastSavedFcmToken) {
    return;
  }

  const authToken = localStorage.getItem("niyoga_token") || "";
  if (!authToken) {
    return;
  }

  try {
    const response = await fetch(`${BACKEND_URL}/api/accounts/save-fcm-token/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Token ${authToken}`,
      },
      body: JSON.stringify({ token }),
    });

    if (response.ok) {
      lastSavedFcmToken = token;
    } else {
      const responseBody = await response.text();
      console.error("Failed to save FCM token to backend with status", response.status, responseBody);
    }
  } catch (error) {
    console.error("Failed to save FCM token to backend:", error);
  }
};

const getStoredLanguage = () => {
  if (typeof window === "undefined") {
    return "te";
  }

  const savedLang = localStorage.getItem("niyoga_lang") || "te";
  return savedLang === "en" ? "en" : "te";
};

const speakJobAccepted = (lang) => {
  const text = lang === "en"
    ? "Congratulations! Your job has been accepted."
    : "🎉 మీ పని ఆమోదించబడింది!";

  try {
    voiceService.speak(text, { lang: lang === "en" ? "en-IN" : "te-IN" });
  } catch (error) {
    console.error("Failed to speak job acceptance notification:", error);
  }
};

export const initializeFirebaseMessaging = async () => {
  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) {
    console.warn("Firebase Messaging is not supported in this browser environment.");
    return null;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.warn("Notification permission was not granted.");
      return null;
    }

    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    const activeRegistration = await navigator.serviceWorker.ready;
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: activeRegistration,
    });

    await saveFcmTokenToBackend(token);
    return token;
  } catch (error) {
    console.error("Firebase Messaging initialization failed:", error);
    return null;
  }
};

if (typeof window !== "undefined") {
  initializeFirebaseMessaging();
}

// Foreground message listener
if (typeof window !== "undefined") {
  try {
    onMessage(messaging, (payload) => {
      console.log("[firebase.js] Foreground message received:", payload);
      
      const notificationTitle = payload.notification?.title || "NiyogaX";
      const notificationOptions = {
        body: payload.notification?.body || "You have a new message",
        icon: "/icon-192x192.png",
        badge: "/badge-72x72.png",
        data: payload.data || {},
      };

      const messageType = payload.data?.type || payload?.data?.messageType || "";
      if (messageType === "job_accepted") {
        speakJobAccepted(getStoredLanguage());
      }
      
      if (Notification.permission === "granted") {
        new Notification(notificationTitle, notificationOptions);
      }
    });
  } catch (error) {
    console.error("[firebase.js] Failed to set up onMessage listener:", error);
  }
}

export default app;
export { messaging };