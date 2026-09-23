"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "../login/auth.module.css";

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { signup, loginWithGoogle } = useAuth();
  const router = useRouter();

  async function handleSubmit(e) {
    e.preventDefault();

    if (password !== confirmPassword) {
      return setError("Les mots de passe ne correspondent pas.");
    }

    try {
      setError("");
      setLoading(true);
      await signup(email, password);
      router.push("/dashboard");
    } catch (err) {
      setError("Échec de la création du compte. Vérifiez votre saisie.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    try {
      setError("");
      setLoading(true);
      await loginWithGoogle();
      router.push("/dashboard");
    } catch (err) {
      setError("Échec de la connexion avec Google.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.authContainer}>
      <div className={`card ${styles.authCard}`}>
        <h2 className={styles.title}>Créer un compte</h2>
        
        {error && <div className={styles.errorAlert}>{error}</div>}
        
        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label className="input-label">Email</label>
            <input 
              type="email" 
              className="input-field" 
              required 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          
          <div className="input-group">
            <label className="input-label">Mot de passe</label>
            <input 
              type="password" 
              className="input-field" 
              required 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="input-group">
            <label className="input-label">Confirmer le mot de passe</label>
            <input 
              type="password" 
              className="input-field" 
              required 
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          
          <button disabled={loading} type="submit" className={`btn btn-primary ${styles.fullWidthBtn}`}>
            S'inscrire
          </button>
        </form>

        <div className={styles.divider}>ou</div>

        <button 
          onClick={handleGoogleSignIn} 
          disabled={loading} 
          className={`btn btn-secondary ${styles.fullWidthBtn}`}
        >
          S'inscrire avec Google
        </button>

        <div className={styles.authLinks}>
          Déjà un compte ? <Link href="/login">Se connecter</Link>
        </div>
      </div>
    </div>
  );
}
