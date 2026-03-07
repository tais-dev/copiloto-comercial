"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

// ====== SIDEBAR: ITENS DE MENU ======
const NAV = [
  {
    label: "Clientes",
    href: "/clientes",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    label: "Buscar Produtos",
    href: "/buscar-produtos",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    ),
  },
  {
    label: "Upload de Tabelas",
    href: "/upload-tabelas",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 16 12 12 8 16" />
        <line x1="12" y1="12" x2="12" y2="21" />
        <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
      </svg>
    ),
  },
  // Inbox — oculto temporariamente
  // { label: "Inbox", href: "/inbox", icon: (...) },
];

// ====== SIDEBAR: ITEM DE MENU ======
function NavItem({
  href,
  label,
  icon,
  onClick,
  active,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        borderRadius: 8,
        marginBottom: 2,
        textDecoration: "none",
        background: active ? "rgba(0,229,160,0.08)" : "transparent",
        color: active ? "#00e5a0" : "#888",
        fontWeight: active ? 600 : 500,
        fontSize: 14,
        borderLeft: `3px solid ${active ? "#00e5a0" : "transparent"}`,
        letterSpacing: 0.1,
        transition: "all 150ms ease",
      }}
    >
      <span style={{ opacity: active ? 1 : 0.6 }}>{icon}</span>
      {label}
    </Link>
  );
}

// ====== SIDEBAR: CONTEÚDO INTERNO (COMPARTILHADO DESKTOP + MOBILE) ======
function SidebarContent({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <div
      style={{
        width: 230,
        background: "#0f0f0f",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        borderRight: "1px solid #2e2e2e",
      }}
    >
      {/* Logo */}
      <div
        style={{
          padding: "28px 22px 22px",
          borderBottom: "1px solid #2e2e2e",
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "#555",
            letterSpacing: 2,
            textTransform: "uppercase",
            marginBottom: 6,
          }}
        >
          Copiloto Comercial
        </div>
        <div
          style={{
            fontSize: 20,
            fontWeight: 900,
            color: "#f0f0f0",
            letterSpacing: -0.5,
          }}
        >
          União VVT
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "20px 12px" }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "#555",
            letterSpacing: 1.5,
            textTransform: "uppercase",
            padding: "0 14px",
            marginBottom: 10,
          }}
        >
          Menu
        </div>

        {NAV.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            active={pathname === item.href || pathname.startsWith(item.href + "/")}
            onClick={onClose}
          />
        ))}
      </nav>

      {/* Footer: versão + logout */}
      <div
        style={{
          padding: "16px 12px",
          borderTop: "1px solid #2e2e2e",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {/* Botão Sair */}
        <button
          onClick={handleLogout}
          style={{
            display: "block",
            width: "100%",
            padding: "9px 14px",
            borderRadius: 8,
            border: "none",
            background: "transparent",
            color: "#555",
            fontWeight: 600,
            fontSize: 13,
            textAlign: "left",
            cursor: "pointer",
          }}
        >
          Sair
        </button>
        <div style={{ fontSize: 11, color: "#2e2e2e", fontWeight: 600, padding: "0 14px" }}>
          v0.2 — União VVT
        </div>
      </div>
    </div>
  );
}

// ====== SIDEBAR: COMPONENTE PRINCIPAL ======
export default function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* ====== SIDEBAR: CSS RESPONSIVO ====== */}
      <style>{`
        .uvvt-sidebar-desktop {
          display: flex;
          position: sticky;
          top: 0;
          height: 100vh;
          flex-shrink: 0;
        }
        .uvvt-topbar {
          display: none;
        }
        .uvvt-content {
          padding-top: 0;
        }
        @media (max-width: 768px) {
          .uvvt-sidebar-desktop {
            display: none;
          }
          .uvvt-topbar {
            display: flex;
          }
          .uvvt-content {
            padding-top: 56px;
          }
        }
      `}</style>

      {/* Desktop: sidebar fixa à esquerda */}
      <aside className="uvvt-sidebar-desktop">
        <SidebarContent />
      </aside>

      {/* Mobile: topbar + drawer */}
      <div
        className="uvvt-topbar"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: 56,
          background: "#0f0f0f",
          zIndex: 100,
          alignItems: "center",
          padding: "0 16px",
          gap: 14,
          borderBottom: "1px solid #2e2e2e",
        }}
      >
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir menu"
          style={{
            background: "none",
            border: "none",
            color: "#888",
            fontSize: 22,
            cursor: "pointer",
            padding: "4px 6px",
            borderRadius: 6,
            lineHeight: 1,
          }}
        >
          ☰
        </button>
        <span style={{ fontSize: 17, fontWeight: 900, color: "#f0f0f0" }}>
          União VVT
        </span>
      </div>

      {/* Mobile: overlay + drawer */}
      {mobileOpen && (
        <>
          <div
            onClick={() => setMobileOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.7)",
              zIndex: 200,
            }}
          />
          <aside
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              bottom: 0,
              zIndex: 300,
              display: "flex",
            }}
          >
            <SidebarContent onClose={() => setMobileOpen(false)} />
          </aside>
        </>
      )}
    </>
  );
}
