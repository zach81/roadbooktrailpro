"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  GoogleAuthProvider,
  signInWithPopup
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
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
