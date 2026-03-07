"use client";

// ====== HOME — tela de boas-vindas mobile first ======
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();
  const [clienteRecente, setClienteRecente] = useState<{ id: string; nome: string } | null>(null);

  const hora = new Date().getHours();
  const saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";

  useEffect(() => {
    const id = sessionStorage.getItem("busca_cliente_id");
    const nome = sessionStorage.getItem("busca_cliente_nome");
    if (id && nome) {
      setClienteRecente({ id, nome });
    }
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f0f0f",
        maxWidth: 480,
        margin: "0 auto",
        padding: "40px 20px 48px",
      }}
    >
      {/* ====== UI: SAUDAÇÃO ====== */}
      <div style={{ marginBottom: 40 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#555",
            letterSpacing: 1.5,
            textTransform: "uppercase",
            marginBottom: 12,
          }}
        >
          Copiloto Comercial
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, color: "#f0f0f0", marginBottom: 4 }}>
          Olá,{" "}
          <span style={{ color: "#00e5a0" }}>Pedro</span>
        </div>
        <div style={{ fontSize: 17, color: "#888" }}>{saudacao}!</div>
      </div>

      {/* ====== UI: BOTOES PRINCIPAIS ====== */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Buscar Produtos — botão principal */}
        <button
          onClick={() => router.push("/buscar-produtos")}
          style={{
            width: "100%",
            minHeight: 68,
            borderRadius: 20,
            border: "none",
            background: "#00e5a0",
            color: "#0f0f0f",
            fontSize: 18,
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 24px",
            transition: "opacity 150ms ease",
          }}
        >
          <span>Buscar Produtos</span>
          <span style={{ fontSize: 24 }}>›</span>
        </button>

        {/* Clientes — botão secundário */}
        <button
          onClick={() => router.push("/clientes")}
          style={{
            width: "100%",
            minHeight: 68,
            borderRadius: 20,
            border: "1px solid #2e2e2e",
            background: "#1a1a1a",
            color: "#f0f0f0",
            fontSize: 18,
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 24px",
          }}
        >
          <span>Clientes</span>
          <span style={{ fontSize: 24, color: "#888" }}>›</span>
        </button>
      </div>

      {/* ====== UI: ACESSO RÁPIDO (cliente recente do sessionStorage) ====== */}
      {clienteRecente && (
        <div style={{ marginTop: 40 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#555",
              letterSpacing: 1.5,
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            Acesso rapido
          </div>
          <button
            onClick={() => router.push(`/clientes/${clienteRecente.id}/configurar`)}
            style={{
              width: "100%",
              padding: "16px 20px",
              borderRadius: 16,
              border: "1px solid #2e2e2e",
              background: "#1a1a1a",
              color: "#f0f0f0",
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
              textAlign: "left",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              minHeight: 56,
            }}
          >
            <span>{clienteRecente.nome}</span>
            <span style={{ fontSize: 20, color: "#888" }}>›</span>
          </button>
        </div>
      )}
    </div>
  );
}
