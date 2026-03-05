"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Sidebar from "./Sidebar";
import type { Session } from "@supabase/supabase-js";

const PUBLIC_ROUTES = ["/login"];

// ====== AUTH GUARD: PROTEÇÃO DE ROTAS + SHELL AUTENTICADO ======
// - Rota pública (/login): renderiza apenas o children, sem sidebar
// - Sem sessão em rota protegida: redireciona para /login
// - Com sessão: renderiza sidebar + conteúdo
export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    // Busca sessão inicial
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    // Escuta mudanças de auth (login/logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Carregando sessão
  if (session === undefined) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          background: "#0F172A",
        }}
      >
        <div style={{ color: "#475569", fontSize: 14, fontWeight: 600 }}>
          Carregando...
        </div>
      </div>
    );
  }

  const isPublic = PUBLIC_ROUTES.includes(pathname);

  // Não logado em rota protegida → redireciona para login
  if (!session && !isPublic) {
    router.replace("/login");
    return null;
  }

  // Rota pública (tela de login) → sem sidebar
  if (isPublic) {
    return <>{children}</>;
  }

  // Logado → sidebar + conteúdo
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <main
        className="uvvt-content"
        style={{ flex: 1, minWidth: 0, background: "#F1F5F9" }}
      >
        {children}
      </main>
    </div>
  );
}
