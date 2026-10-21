import "./styles.css";

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppNavigation } from "../src/components/app-navigation";
import { loadAuthConfig } from "@csst/shared";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "CS Skin Tracker",
  description: "Personal CS2 skin market dashboard"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppNavigation authEnabled={loadAuthConfig(process.env).enabled} />
        {children}
      </body>
    </html>
  );
}
