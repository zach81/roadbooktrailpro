import { initializeApp } from 'firebase/app';
import { initializeAuth } from 'firebase/auth';

// Your web app's Firebase configuration
// Pour le moment, utilisez des variables d'environnement ou des valeurs vides temporaires 
// jusqu'à ce que le vrai projet Firebase soit créé et lié.
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "dummy-api-key",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "dummy-auth-domain",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "dummy-project-id",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "dummy-storage-bucket",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "dummy-sender-id",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "dummy-app-id"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Auth with proper persistence based on platform
export const auth = initializeAuth(app);

export default app;
