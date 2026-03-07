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
        setErro(error.message);
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
        background: "linear-gradient(135deg, #0f0f0f 0%, #1a1a1a 100%)",
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
          background: "#1a1a1a",
          borderRadius: 24,
          padding: "40px 32px",
          border: "1px solid #2e2e2e",
        }}
      >
        {/* Identidade */}
        <div style={{ marginBottom: 36, textAlign: "center" }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#555",
              letterSpacing: 2,
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            Sistema Comercial
          </div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              color: "#f0f0f0",
              letterSpacing: -0.5,
            }}
          >
            Uniao VVT
          </div>
        </div>

        <form onSubmit={handleLogin}>
          {/* E-mail */}
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: "block",
                fontSize: 13,
                color: "#888",
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
                padding: "14px 16px",
                borderRadius: 14,
                border: "1px solid #2e2e2e",
                background: "#242424",
                color: "#f0f0f0",
                fontSize: 16,
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
                color: "#888",
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
                padding: "14px 16px",
                borderRadius: 14,
                border: "1px solid #2e2e2e",
                background: "#242424",
                color: "#f0f0f0",
                fontSize: 16,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Erro */}
          {erro && (
            <div
              style={{
                marginBottom: 20,
                padding: "12px 16px",
                borderRadius: 12,
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.2)",
                color: "#fca5a5",
                fontSize: 14,
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
              padding: "16px",
              borderRadius: 14,
              border: "none",
              background: carregando ? "#1a2e25" : "#00e5a0",
              color: carregando ? "#555" : "#0f0f0f",
              fontSize: 16,
              fontWeight: 700,
              cursor: carregando ? "not-allowed" : "pointer",
              transition: "all 200ms ease",
            }}
          >
            {carregando ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
