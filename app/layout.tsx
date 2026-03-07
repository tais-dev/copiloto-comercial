import type { Metadata } from "next";
import { DM_Sans, DM_Mono } from "next/font/google";
import "./globals.css";
import AuthGuard from "./components/AuthGuard";

// ====== UI: FONTES GOOGLE (DM Sans + DM Mono) ======
const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "900"],
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Copiloto Comercial",
  description: "Sistema comercial inteligente para representantes",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        className={`${dmSans.variable} ${dmMono.variable} antialiased`}
        style={{ margin: 0, background: "#0f0f0f" }}
      >
        {/* ====== AUTH GUARD: controla login e shell da aplicação ====== */}
        <AuthGuard>{children}</AuthGuard>
      </body>
    </html>
  );
}
