"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Msg = {
  id: string;
  cliente: string | null;
  mensagem_original: string;
  categoria: string | null;
  prioridade: string | null;
  sugestao: string | null;
  status: string | null;
  created_at: string;
};

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid #E5E7EB",
        background: "#F9FAFB",
        fontSize: 14,
        fontWeight: 700,
        color: "#111827",
      }}
    >
      {children}
    </span>
  );
}

function formatHora(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString();
}

export default function InboxPage() {
  const [itens, setItens] = useState<Msg[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [mostrarSoPendentes, setMostrarSoPendentes] = useState(true);
  const [busca, setBusca] = useState("");
  const total = itens.length;
const resolvidos = itens.filter((m) => (m.status ?? "Novo") === "Resolvido").length;
const pendentes = total - resolvidos;   

  const carregar = async () => {
    setErro(null);
    setCarregando(true);

    const { data, error } = await supabase
      .from("mensagens")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setErro(error.message);
      setCarregando(false);
      return;
    }

    setItens((data ?? []) as Msg[]);
    setCarregando(false);
  };

  useEffect(() => {
    carregar();
  }, []);
const itensFiltrados = itens.filter((m) => {
  const nome = (m.cliente ?? "").toLowerCase();
  const termo = busca.trim().toLowerCase();

  const passaBusca = termo ? nome.includes(termo) : true;
  const passaPendentes = mostrarSoPendentes
    ? (m.status ?? "Novo") !== "Resolvido"
    : true;

  return passaBusca && passaPendentes;
});
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#F3F4F6",
        padding: 24,
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
      }}
    >
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        <div
  style={{
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    alignItems: "center",
  }}
>
  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
    <a
      href="/"
      style={{
        display: "inline-block",
        padding: "10px 14px",
        borderRadius: 14,
        background: "#FFFFFF",
        border: "1px solid #E5E7EB",
        color: "#111827",
        fontWeight: 900,
        textDecoration: "none",
        fontSize: 16,
      }}
    >
      ← Início
    </a>

    <div>
      <h1 style={{ margin: 0, fontSize: 30, letterSpacing: -0.5 }}>
        Inbox
      </h1>
      <p style={{ marginTop: 8, color: "#6B7280", fontSize: 16 }}>
        Mensagens salvas e organizadas.
      </p>
    </div>
  </div>

  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
    <a
      href="/nova-mensagem"
      style={{
        display: "inline-block",
        padding: "12px 16px",
        borderRadius: 14,
        background: "#111827",
        color: "#FFFFFF",
        fontWeight: 900,
        textDecoration: "none",
        fontSize: 16,
      }}
    >
      + Nova mensagem
    </a>

    <button
      onClick={carregar}
      style={{
        padding: "12px 16px",
        borderRadius: 14,
        background: "#FFFFFF",
        border: "1px solid #E5E7EB",
        color: "#111827",
        fontWeight: 900,
        fontSize: 16,
        cursor: "pointer",
      }}
    >
      Atualizar
    </button>
  </div>
</div>
        <div
  style={{
    marginTop: 12,
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 10,
  }}
>
  <div style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: 16, padding: 14 }}>
    <div style={{ color: "#6B7280", fontSize: 13, fontWeight: 900 }}>Pendentes</div>
    <div style={{ fontSize: 26, fontWeight: 900 }}>{pendentes}</div>
  </div>

  <div style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: 16, padding: 14 }}>
    <div style={{ color: "#6B7280", fontSize: 13, fontWeight: 900 }}>Resolvidos</div>
    <div style={{ fontSize: 26, fontWeight: 900 }}>{resolvidos}</div>
  </div>

  <div style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: 16, padding: 14 }}>
    <div style={{ color: "#6B7280", fontSize: 13, fontWeight: 900 }}>Total</div>
    <div style={{ fontSize: 26, fontWeight: 900 }}>{total}</div>
  </div>
</div>
<div
  style={{
    marginTop: 12,
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "center",
  }}
>
  <input
    placeholder="Buscar por cliente..."
    value={busca}
    onChange={(e) => setBusca(e.target.value)}
    style={{
      flex: 1,
      minWidth: 260,
      padding: "12px 14px",
      borderRadius: 14,
      border: "1px solid #E5E7EB",
      outline: "none",
      fontSize: 16,
      background: "#FFFFFF",
      fontWeight: 700,
    }}
  />

  <div
    style={{
      display: "flex",
      gap: 8,
      padding: 6,
      borderRadius: 16,
      border: "1px solid #E5E7EB",
      background: "#FFFFFF",
    }}
  >
    <button
      onClick={() => setMostrarSoPendentes(true)}
      style={{
        padding: "10px 14px",
        borderRadius: 12,
        border: "0",
        background: mostrarSoPendentes ? "#111827" : "transparent",
        color: mostrarSoPendentes ? "#FFFFFF" : "#111827",
        fontWeight: 900,
        fontSize: 16,
        cursor: "pointer",
      }}
    >
      Pendentes
    </button>

    <button
      onClick={() => setMostrarSoPendentes(false)}
      style={{
        padding: "10px 14px",
        borderRadius: 12,
        border: "0",
        background: !mostrarSoPendentes ? "#111827" : "transparent",
        color: !mostrarSoPendentes ? "#FFFFFF" : "#111827",
        fontWeight: 900,
        fontSize: 16,
        cursor: "pointer",
      }}
    >
      Todas
    </button>
  </div>
</div>
        {erro && (
          <div
            style={{
              marginTop: 14,
              padding: 12,
              borderRadius: 14,
              border: "1px solid #FCA5A5",
              background: "#FEF2F2",
              color: "#991B1B",
              fontWeight: 800,
            }}
          >
            Erro: {erro}
          </div>
        )}

        {carregando ? (
          <div
            style={{
              marginTop: 16,
              padding: 14,
              borderRadius: 14,
              border: "1px dashed #D1D5DB",
              background: "#FAFAFA",
              color: "#6B7280",
              fontWeight: 700,
            }}
          >
            Carregando...
          </div>
        ) : itens.length === 0 ? (
          <div
            style={{
              marginTop: 16,
              padding: 14,
              borderRadius: 14,
              border: "1px dashed #D1D5DB",
              background: "#FAFAFA",
              color: "#6B7280",
              fontWeight: 700,
            }}
          >
            Ainda não há mensagens salvas.
          </div>
        ) : (
          <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
  {itensFiltrados.map((m) => (
    <div
      key={m.id}
      style={{
        width: "100%",
        textAlign: "left",
        border: "1px solid #E5E7EB",
        background: "#FFFFFF",
        borderRadius: 16,
        padding: 14,
        boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 900 }}>
          {m.cliente ?? "Cliente"}
        </div>
        <div style={{ color: "#6B7280", fontSize: 14, fontWeight: 700 }}>
          {formatHora(m.created_at)}
        </div>
      </div>

      <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {m.categoria ? <Pill>{m.categoria}</Pill> : null}
        {m.prioridade ? <Pill>Prioridade: {m.prioridade}</Pill> : null}
        <Pill>Status: {m.status ?? "Novo"}</Pill>
      </div>

      <div
        style={{
          marginTop: 10,
          color: "#374151",
          fontSize: 15,
          lineHeight: 1.35,
          whiteSpace: "pre-wrap",
        }}
      >
        {m.mensagem_original}
      </div>

      {m.sugestao ? (
        <div
          style={{
            marginTop: 12,
            border: "1px solid #E5E7EB",
            borderRadius: 14,
            padding: 12,
            background: "#F9FAFB",
          }}
        >
          <div style={{ color: "#6B7280", fontSize: 13, fontWeight: 800 }}>
            Sugestão
          </div>
          <div style={{ marginTop: 6, fontSize: 15, fontWeight: 800 }}>
            {m.sugestao}
          </div>

          <button
            onClick={() => navigator.clipboard.writeText(m.sugestao ?? "")}
            style={{
              marginTop: 10,
              width: "100%",
              padding: "10px 12px",
              borderRadius: 14,
              border: "1px solid #E5E7EB",
              background: "#FFFFFF",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            Copiar resposta
          </button>
        </div>
      ) : null}

      <a
        href={`/mensagem/${m.id}`}
        style={{
          display: "block",
          marginTop: 12,
          width: "100%",
          padding: "12px 12px",
          borderRadius: 14,
          border: "1px solid #E5E7EB",
          background: "#FFFFFF",
          fontWeight: 900,
          textAlign: "center",
          textDecoration: "none",
          color: "#111827",
        }}
      >
        Abrir
      </a>

      <button
        onClick={async () => {
          await supabase
            .from("mensagens")
            .update({ status: "Resolvido" })
            .eq("id", m.id);

          carregar();
        }}
        style={{
          marginTop: 12,
          width: "100%",
          padding: "12px 12px",
          borderRadius: 14,
          border: "1px solid #E5E7EB",
          background: "#111827",
          color: "#FFFFFF",
          fontWeight: 900,
          cursor: "pointer",
        }}
      >
        Marcar como Resolvido
      </button>
    </div>
  ))}
</div>
                
        )}
      </div>
    </main>
  );
}