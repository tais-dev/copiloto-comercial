"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

// ====== SIDEBAR: ITENS DE MENU ======
const NAV = [
  { label: "Consulta de Preços", href: "/" },
  { label: "Upload de Tabelas", href: "/upload-tabelas" },
  { label: "Inbox", href: "/inbox" },
];

// ====== SIDEBAR: ITEM DE MENU ======
function NavItem({
  href,
  label,
  onClick,
  active,
}: {
  href: string;
  label: string;
  onClick?: () => void;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      style={{
        display: "block",
        padding: "10px 14px",
        borderRadius: 8,
        marginBottom: 2,
        textDecoration: "none",
        background: active ? "rgba(59,130,246,0.12)" : "transparent",
        color: active ? "#60A5FA" : "#94A3B8",
        fontWeight: active ? 700 : 500,
        fontSize: 14,
        borderLeft: `3px solid ${active ? "#3B82F6" : "transparent"}`,
        letterSpacing: 0.1,
      }}
    >
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
        background: "#0F172A",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div
        style={{
          padding: "28px 22px 22px",
          borderBottom: "1px solid #1E293B",
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "#475569",
            letterSpacing: 2,
            textTransform: "uppercase",
            marginBottom: 6,
          }}
        >
          Sistema Comercial
        </div>
        <div
          style={{
            fontSize: 22,
            fontWeight: 900,
            color: "#F8FAFC",
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
            color: "#334155",
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
            active={pathname === item.href}
            onClick={onClose}
          />
        ))}
      </nav>

      {/* Footer: versão + logout */}
      <div
        style={{
          padding: "16px 12px",
          borderTop: "1px solid #1E293B",
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
            color: "#64748B",
            fontWeight: 600,
            fontSize: 13,
            textAlign: "left",
            cursor: "pointer",
          }}
        >
          Sair
        </button>
        <div style={{ fontSize: 11, color: "#1E293B", fontWeight: 600, padding: "0 14px" }}>
          v0.1 — União VVT
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
          background: "#0F172A",
          zIndex: 100,
          alignItems: "center",
          padding: "0 16px",
          gap: 14,
          borderBottom: "1px solid #1E293B",
        }}
      >
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir menu"
          style={{
            background: "none",
            border: "none",
            color: "#94A3B8",
            fontSize: 22,
            cursor: "pointer",
            padding: "4px 6px",
            borderRadius: 6,
            lineHeight: 1,
          }}
        >
          ☰
        </button>
        <span style={{ fontSize: 17, fontWeight: 900, color: "#F8FAFC" }}>
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
              background: "rgba(0,0,0,0.55)",
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
