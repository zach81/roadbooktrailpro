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
  const [loading, setLoading] = useState(true);

  // Sign up with Email
  async function signup(email, password) {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    // Créer un document utilisateur dans Firestore
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
    const result = await signInWithPopup(auth, provider);
    
    // Check if user doc exists, if not create it
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
    return signOut(auth);
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      // TEMPORAIRE : On simule un utilisateur connecté pour pouvoir tester l'upload GPX
      const mockUser = { 
        uid: "test-user-123", 
        email: "test@example.com", 
        displayName: "Testeur" 
      };
      
      setCurrentUser(user || mockUser);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    signup,
    login,
    loginWithGoogle,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
