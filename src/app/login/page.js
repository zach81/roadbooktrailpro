"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "./auth.module.css";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, loginWithGoogle } = useAuth();
  const router = useRouter();

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      setError("");
      setLoading(true);
      await login(email, password);
      router.push("/dashboard");
    } catch (err) {
      setError("Échec de la connexion. Vérifiez vos identifiants.");
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
        <h2 className={styles.title}>Connexion</h2>
        
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
          
          <button disabled={loading} type="submit" className={`btn btn-primary ${styles.fullWidthBtn}`}>
            Se connecter
          </button>
        </form>

        <div className={styles.divider}>ou</div>

        <button 
          onClick={handleGoogleSignIn} 
          disabled={loading} 
          className={`btn btn-secondary ${styles.fullWidthBtn}`}
        >
          Continuer avec Google
        </button>

        <div className={styles.authLinks}>
          Pas encore de compte ? <Link href="/register">S'inscrire</Link>
        </div>
      </div>
    </div>
  );
}
