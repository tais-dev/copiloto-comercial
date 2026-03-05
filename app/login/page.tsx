"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

// ====== LOGIN PAGE ======
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: senha,
      });

      if (error) {
  console.log("ERRO SUPABASE:", error.message, error.status);
  setErro(error.message); // mostra o erro real na tela
  return;
}

      router.replace("/");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0F172A",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          background: "#1E293B",
          borderRadius: 20,
          padding: "40px 36px",
          boxShadow: "0 25px 50px rgba(0,0,0,0.5)",
          border: "1px solid #334155",
        }}
      >
        {/* Logo */}
        <div style={{ marginBottom: 36, textAlign: "center" }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "#475569",
              letterSpacing: 2,
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            Sistema Comercial
          </div>
          <div
            style={{
              fontSize: 30,
              fontWeight: 900,
              color: "#F8FAFC",
              letterSpacing: -0.5,
            }}
          >
            União VVT
          </div>
        </div>

        <form onSubmit={handleLogin}>
          {/* E-mail */}
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 700,
                color: "#94A3B8",
                marginBottom: 6,
              }}
            >
              E-mail
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setErro(null); }}
              required
              autoFocus
              placeholder="seu@email.com"
              style={{
                width: "100%",
                padding: "13px 14px",
                borderRadius: 12,
                border: "1px solid #334155",
                background: "#0F172A",
                color: "#F8FAFC",
                fontSize: 15,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Senha */}
          <div style={{ marginBottom: 28 }}>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 700,
                color: "#94A3B8",
                marginBottom: 6,
              }}
            >
              Senha
            </label>
            <input
              type="password"
              value={senha}
              onChange={(e) => { setSenha(e.target.value); setErro(null); }}
              required
              placeholder="••••••••"
              style={{
                width: "100%",
                padding: "13px 14px",
                borderRadius: 12,
                border: "1px solid #334155",
                background: "#0F172A",
                color: "#F8FAFC",
                fontSize: 15,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Erro */}
          {erro && (
            <div
              style={{
                marginBottom: 18,
                padding: "10px 14px",
                borderRadius: 10,
                background: "rgba(239,68,68,0.12)",
                border: "1px solid rgba(239,68,68,0.25)",
                color: "#FCA5A5",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {erro}
            </div>
          )}

          {/* Botão */}
          <button
            type="submit"
            disabled={carregando}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: 12,
              border: "none",
              background: "#3B82F6",
              color: "#FFFFFF",
              fontSize: 16,
              fontWeight: 900,
              cursor: carregando ? "not-allowed" : "pointer",
              opacity: carregando ? 0.7 : 1,
              letterSpacing: 0.2,
            }}
          >
            {carregando ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
