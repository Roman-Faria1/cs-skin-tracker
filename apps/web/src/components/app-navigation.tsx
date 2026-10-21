"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";

export function AppNavigation({ authEnabled = false }: { authEnabled?: boolean }) {
  const path = usePathname();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (path === "/login") return null;
  async function signOut() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/auth/sign-out", { method: "POST" });
      if (!response.ok) throw new Error("Unable to sign out");
      window.location.assign("/login");
    } catch {
      setError("Unable to sign out");
      setBusy(false);
    }
  }
  return (
    <nav className="app-nav" aria-label="Main navigation">
      <span className="app-brand">CS Skin Tracker</span>
      <Link href="/" aria-current={path === "/" || path.startsWith("/items/") ? "page" : undefined}>
        Watchlist
      </Link>
      <Link href="/alerts" aria-current={path === "/alerts" ? "page" : undefined}>
        Alerts
      </Link>
      <Link href="/portfolio" aria-current={path === "/portfolio" ? "page" : undefined}>
        Portfolio
      </Link>
      {authEnabled && (
        <button
          className="button secondary icon-button"
          type="button"
          title="Sign out"
          aria-label="Sign out"
          disabled={busy}
          onClick={() => void signOut()}
        >
          <LogOut size={18} />
        </button>
      )}
      {error && <span role="alert">{error}</span>}
    </nav>
  );
}
