import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Copiloto Comercial",
  description: "Sistema inteligente de apoio ao representante comercial",
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
        style={{
          margin: 0,
          background: "#f6f7fb",
        }}
      >
        <div
          style={{
            minHeight: "100vh",
            padding: "32px 16px",
          }}
        >
          <div
            style={{
              maxWidth: "1100px",
              margin: "0 auto",
              width: "100%",
            }}
          >
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}