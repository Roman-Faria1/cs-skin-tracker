"use client";

import { useState, type FormEvent } from "react";
import { LogIn } from "lucide-react";

export function LoginForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.get("email"), password: data.get("password") })
      });
      if (!response.ok)
        throw new Error(
          response.status === 403
            ? "Owner access required"
            : response.status === 503
              ? "Sign-in temporarily unavailable"
              : "Unable to sign in with these credentials"
        );
      window.location.assign("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to sign in");
      setBusy(false);
    }
  }
  return (
    <form className="login-form" onSubmit={(event) => void submit(event)}>
      <label>
        Email
        <input
          className="input"
          name="email"
          type="email"
          autoComplete="username"
          required
          disabled={busy}
        />
      </label>
      <label>
        Password
        <input
          className="input"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={busy}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button className="button" disabled={busy}>
        <LogIn size={18} aria-hidden="true" />
        {busy ? "Signing In..." : "Sign In"}
      </button>
    </form>
  );
}
