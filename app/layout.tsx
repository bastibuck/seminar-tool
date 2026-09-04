import type { Metadata } from "next";
import type { ReactNode } from "react";

import { QueryProvider } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Seminar Tool",
  description: "Live-Steuerung für medizinische Rollenspiel-Workshops",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de">
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
