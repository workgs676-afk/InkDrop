"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isLogin = mode === "login";

  async function onSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const endpoint = isLogin ? "/api/auth/login" : "/api/auth/signup";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Could not continue right now.");
      }
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err.message || "Could not continue right now.");
    } finally {
      setLoading(false);
    }
  }

  function continueAnonymous() {
    router.push("/anonymous");
  }

  return (
    <section className="auth-card">
      <h1>InkDrop</h1>
      <p className="subtle-copy">
        {isLogin ? "Welcome back. Your thoughts are waiting." : "A quiet space just for you."}
      </p>

      <form onSubmit={onSubmit} className="auth-form">
        <label>
          Email
          <input
            type="email"
            className="input"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
            placeholder="you@example.com"
          />
        </label>

        <label>
          Password
          <input
            type="password"
            className="input"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
            autoComplete={isLogin ? "current-password" : "new-password"}
            placeholder="At least 8 characters"
          />
        </label>

        {error ? <p className="soft-error">{error}</p> : null}

        <button className="button" type="submit" disabled={loading}>
          {loading ? "Taking a breath..." : isLogin ? "Enter your sanctuary" : "Create sanctuary"}
        </button>
      </form>

      <div className="auth-actions">
        <button
          className="ghost"
          type="button"
          onClick={() => setMode(isLogin ? "signup" : "login")}
        >
          {isLogin ? "Need an account? Sign up" : "Already have one? Log in"}
        </button>
        <button className="ghost" type="button" onClick={continueAnonymous}>
          Continue without account
        </button>
      </div>
    </section>
  );
}
