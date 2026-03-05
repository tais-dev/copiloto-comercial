import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AuthGuard from "./components/AuthGuard";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "União VVT",
  description: "Sistema comercial União VVT",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={{ margin: 0, background: "#0F172A" }}
      >
        {/* ====== AUTH GUARD: controla login e shell da aplicação ====== */}
        <AuthGuard>{children}</AuthGuard>
      </body>
    </html>
  );
}
