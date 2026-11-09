"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  updateProfile
} from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, setDoc, getDoc } from "firebase/firestore";

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  // Sign up with Email
  async function signup(email, password) {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, "users", userCredential.user.uid), {
      email: userCredential.user.email,
      createdAt: new Date(),
    });
    return userCredential;
  }

  // Login with Email
  function login(email, password) {
    return signInWithEmailAndPassword(auth, email, password);
  }

  // Google Login
  async function loginWithGoogle() {
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

  // Strava Login / Sign-up (OAuth2 code or direct Strava token)
  async function loginWithStrava({
    code,
    accessToken,
    refreshToken,
    clientId,
    clientSecret,
  } = {}) {
    const res = await fetch("/api/strava/auth", {
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
      const err = new Error(data?.error || `Échec de l'authentification Strava (${res.status})`);
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

    let userCredential;
    try {
      userCredential = await signInWithEmailAndPassword(auth, firebaseEmail, firebasePassword);
    } catch (authErr) {
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

    const profilePayload = {
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
    return { userCredential, athlete };
  }

  // Logout
  function logout() {
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("intervalsAthleteId");
        localStorage.removeItem("intervalsApiKey");
      } catch {}
    }
    return signOut(auth);
  }

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("intervalsAthleteId");
        localStorage.removeItem("intervalsApiKey");
      } catch {}
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const adminEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "").split(",").map(e => e.trim().toLowerCase());
        const isEmailAdmin = user.email && adminEmails.includes(user.email.toLowerCase());
        
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
