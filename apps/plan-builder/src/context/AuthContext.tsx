"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  updateProfile,
  User,
  UserCredential
} from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { purgeLegacyUnscopedStorage, saveUserStravaCredentials } from "@/lib/firebaseUtils";
import { getApiUrl } from "@/lib/apiHelper";

export interface StravaLoginParams {
  code?: string;
  accessToken?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
}

interface AuthContextType {
  currentUser: User | null;
  isAdmin: boolean;
  loading: boolean;
  signup: (email: string, password: string) => Promise<UserCredential>;
  login: (email: string, password: string) => Promise<UserCredential>;
  loginWithGoogle: () => Promise<UserCredential>;
  loginWithStrava: (params?: StravaLoginParams) => Promise<{ userCredential: UserCredential; athlete: any }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  // Sign up with Email
  async function signup(email: string, password: string) {
    if (!auth) throw new Error("Firebase Auth not initialized");
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, "users", userCredential.user.uid), {
      email: userCredential.user.email,
      createdAt: new Date(),
    });
    return userCredential;
  }

  // Login with Email
  function login(email: string, password: string) {
    if (!auth) throw new Error("Firebase Auth not initialized");
    return signInWithEmailAndPassword(auth, email, password);
  }

  // Google Login
  async function loginWithGoogle() {
    if (!auth) throw new Error("Firebase Auth not initialized");
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
      prompt: 'select_account'
    });
    const result = await signInWithPopup(auth, provider);
    
    const userDocRef = doc(db, "users", result.user.uid);
    const docSnap = await getDoc(userDocRef);
    if (!docSnap.exists()) {
      await setDoc(userDocRef, {
        email: result.user.email,
        name: result.user.displayName,
        createdAt: new Date(),
      });
    }
    return result;
  }

  // Strava Login / Sign-up
  async function loginWithStrava(params: StravaLoginParams = {}) {
    if (!auth) throw new Error("Firebase Auth not initialized");
    const { code, accessToken, refreshToken, clientId, clientSecret } = params;

    const res = await fetch(getApiUrl("/api/strava/auth"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        accessToken,
        refreshToken,
        clientId,
        clientSecret,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(data?.error || `Échec de l'authentification Strava (${res.status})`);
      err.missingAppCredentials = Boolean(data?.missingAppCredentials);
      throw err;
    }

    const {
      firebaseEmail,
      firebasePassword,
      accessToken: verifiedAccessToken,
      refreshToken: verifiedRefreshToken,
      expiresAt,
      athlete,
    } = data;

    let userCredential: UserCredential;
    try {
      userCredential = await signInWithEmailAndPassword(auth, firebaseEmail, firebasePassword);
    } catch (authErr: any) {
      if (
        authErr.code === "auth/user-not-found" ||
        authErr.code === "auth/invalid-credential" ||
        authErr.code === "auth/invalid-login-credentials"
      ) {
        userCredential = await createUserWithEmailAndPassword(auth, firebaseEmail, firebasePassword);
      } else {
        throw authErr;
      }
    }

    const athleteFullName =
      `${athlete?.firstname || ""} ${athlete?.lastname || ""}`.trim() ||
      athlete?.username ||
      `Athlète Strava #${athlete?.id}`;

    try {
      await updateProfile(userCredential.user, {
        displayName: athleteFullName,
        ...(athlete?.profile ? { photoURL: athlete.profile } : {}),
      });
    } catch (profileErr) {
      console.warn("Could not update Firebase Auth displayName:", profileErr);
    }

    const userDocRef = doc(db, "users", userCredential.user.uid);
    const docSnap = await getDoc(userDocRef);
    const existing = docSnap.exists() ? docSnap.data() : {};

    const profilePayload: Record<string, any> = {
      email: existing.email || firebaseEmail,
      name: athleteFullName || existing.name,
      authProvider: existing.authProvider || "strava",
      photoURL: athlete?.profile || existing.photoURL || "",
      stravaAvatarUrl: athlete?.profile || existing.stravaAvatarUrl || "",
      stravaConnected: true,
      stravaAthleteId: String(athlete.id),
      stravaAthleteName: athleteFullName,
      stravaAccessToken: verifiedAccessToken || "",
      stravaRefreshToken: verifiedRefreshToken || existing.stravaRefreshToken || "",
      stravaExpiresAt: expiresAt || existing.stravaExpiresAt || 0,
      updatedAt: new Date(),
    };

    if (clientId) profilePayload.stravaClientId = clientId.trim();
    if (clientSecret) profilePayload.stravaClientSecret = clientSecret.trim();

    if (!docSnap.exists()) {
      profilePayload.createdAt = new Date();
      if (athlete?.weight && Number(athlete.weight) > 30) {
        profilePayload.weight = Math.round(Number(athlete.weight));
      }
    }

    await setDoc(userDocRef, profilePayload, { merge: true });

    await saveUserStravaCredentials(userCredential.user.uid, {
      accessToken: verifiedAccessToken || "",
      refreshToken: verifiedRefreshToken || existing.stravaRefreshToken || "",
      expiresAt: expiresAt || existing.stravaExpiresAt || 0,
      athleteId: String(athlete.id),
      athleteName: athleteFullName,
      clientId: clientId?.trim() || existing.stravaClientId || "",
      clientSecret: clientSecret?.trim() || existing.stravaClientSecret || "",
    });

    return { userCredential, athlete };
  }

  // Logout
  function logout() {
    if (!auth) throw new Error("Firebase Auth not initialized");
    purgeLegacyUnscopedStorage();
    return signOut(auth);
  }

  useEffect(() => {
    purgeLegacyUnscopedStorage();

    if (!auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const adminEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "").split(",").map(e => e.trim().toLowerCase());
        const isEmailAdmin = user.email ? adminEmails.includes(user.email.toLowerCase()) : false;
        
        try {
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (userDoc.exists()) {
            if (userDoc.data().role === 'admin') {
              setIsAdmin(true);
            } else if (isEmailAdmin) {
              await setDoc(doc(db, "users", user.uid), { role: 'admin' }, { merge: true });
              setIsAdmin(true);
            } else {
              setIsAdmin(false);
            }
          } else {
            if (isEmailAdmin) {
              await setDoc(doc(db, "users", user.uid), { email: user.email, role: 'admin', createdAt: new Date() }, { merge: true });
              setIsAdmin(true);
            } else {
              setIsAdmin(false);
            }
          }
        } catch (e) {
          console.error("Error fetching user role", e);
          setIsAdmin(isEmailAdmin);
        }
      } else {
        setIsAdmin(false);
      }
      setCurrentUser(user);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    isAdmin,
    loading,
    signup,
    login,
    loginWithGoogle,
    loginWithStrava,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
