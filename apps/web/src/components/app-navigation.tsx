"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AppNavigation() {
  const path = usePathname();
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
    </nav>
  );
}
