"use client";

// ====== AUTH GUARD: PROTEÇÃO DE ROTAS + SHELL AUTENTICADO ======
// Todos os hooks são chamados antes de qualquer return condicional (Rules of Hooks).
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Sidebar from "./Sidebar";

const PUBLIC_ROUTES = ["/login"];

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);
  const [authed, setAuthed] = useState(false);

  // ====== AUTH GUARD: VERIFICAÇÃO DE SESSÃO ======
  // useEffect sempre chamado na mesma posição — sem returns condicionais antes disso.
  useEffect(() => {
    const isPublic = PUBLIC_ROUTES.includes(pathname);

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session && !isPublic) {
        router.replace("/login");
        return;
      }
      if (session && pathname === "/login") {
        router.replace("/");
        return;
      }
      setAuthed(true);
      setChecked(true);
    });

    // Escuta mudanças de auth (ex: logout em outra aba)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session && !isPublic) {
        router.replace("/login");
      }
    });

    return () => subscription.unsubscribe();
  }, [pathname, router]);

  // Aguardando verificação de autenticação — não renderiza nada
  if (!checked) return null;

  const isPublic = PUBLIC_ROUTES.includes(pathname);

  // Rota pública (tela de login) → sem sidebar
  if (isPublic) {
    return <>{children}</>;
  }

  // Logado → sidebar + conteúdo
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#0f0f0f" }}>
      <Sidebar />
      {/* ====== UI: MOBILE CONTRAST — área principal ====== */}
      <main
        className="uvvt-content"
        style={{ flex: 1, minWidth: 0, background: "#0f0f0f" }}
      >
        {children}
      </main>
    </div>
  );
}
