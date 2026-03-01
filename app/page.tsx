"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Fabrica = { id: string; nome: string };

type Produto = {
  id: string;
  fabrica_id: string;
  codigo: string | null;
  descricao: string;
  preco: number | null;
  unidade: string | null;
};

function Badge({ children }: { children: React.ReactNode }) {
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

function money(v: number | null) {
  if (v === null || v === undefined) return "-";
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
  } catch {
    return String(v);
  }
}

export default function Home() {
  const [fabricas, setFabricas] = useState<Fabrica[]>([]);
  const [fabricaId, setFabricaId] = useState("");
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<Produto[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    async function loadFabricas() {
      const { data, error } = await supabase.from("fabricas").select("*").order("nome");
      if (error) return;
      if (data) setFabricas(data as Fabrica[]);
    }
    loadFabricas();
  }, []);

  const dica = useMemo(
    () => `Dica: selecione a fábrica e busque por código (ex.: FT-200) ou descrição (ex.: coifa 1.20).`,
    []
  );

  const buscar = async () => {
    setErro(null);
    setResultados([]);

    if (!fabricaId) {
      setErro("Selecione uma fábrica para consultar o catálogo.");
      return;
    }

    const t = termo.trim();
    if (!t) {
      setErro("Digite um termo para buscar (código ou descrição).");
      return;
    }

    setCarregando(true);

    try {
      const pareceCodigo = /[0-9]/.test(t) || /[-_]/.test(t);

      let q = supabase.from("produtos").select("*").eq("fabrica_id", fabricaId).limit(10);

      if (pareceCodigo) {
        q = q.ilike("codigo", `%${t}%`);
      } else {
        q = q.ilike("descricao", `%${t}%`);
      }

      const { data, error } = await q;

      if (error) {
        setErro(error.message);
        return;
      }

      setResultados((data ?? []) as Produto[]);

      if (!data || data.length === 0) {
        setErro("Não encontrei nenhum item com esse termo para essa fábrica.");
      }
    } finally {
      setCarregando(false);
    }
  };

  const copiarResposta = (p: Produto) => {
    const linhaCodigo = p.codigo ? `${p.codigo} — ` : "";
    const linhaUnidade = p.unidade ? ` (${p.unidade})` : "";
    const texto = `Encontrei aqui ✅\n${linhaCodigo}${p.descricao}\nPreço: ${money(p.preco)}${linhaUnidade}\n\nQuer que eu já monte a cotação com quantidade e condição de pagamento?`;
    navigator.clipboard.writeText(texto);
  };

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
        {/* Top actions */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
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

            <a
              href="/inbox"
              style={{
                display: "inline-block",
                padding: "12px 16px",
                borderRadius: 14,
                background: "#FFFFFF",
                border: "1px solid #E5E7EB",
                color: "#111827",
                fontWeight: 900,
                textDecoration: "none",
                fontSize: 16,
              }}
            >
              Ver Inbox
            </a>

            <a
              href="/upload-tabelas"
              style={{
                display: "inline-block",
                padding: "12px 16px",
                borderRadius: 14,
                background: "#FFFFFF",
                border: "1px solid #E5E7EB",
                color: "#111827",
                fontWeight: 900,
                textDecoration: "none",
                fontSize: 16,
              }}
            >
              Upload de tabelas
            </a>
          </div>

          <Badge>Versão 0.1</Badge>
        </div>

        {/* Header */}
        <div style={{ marginTop: 18 }}>
          <h1 style={{ margin: 0, fontSize: 34, letterSpacing: -0.5 }}>Copiloto Comercial</h1>
          <p style={{ marginTop: 10, color: "#6B7280", fontSize: 16 }}>
            Organize mensagens, consulte preços e gere respostas rápidas.
          </p>
        </div>

        {/* Consulta rápida */}
        <div
          style={{
            marginTop: 18,
            background: "#FFFFFF",
            border: "1px solid #E5E7EB",
            borderRadius: 16,
            padding: 16,
            boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18 }}>Consulta rápida de catálogo</h2>
          <p style={{ marginTop: 8, color: "#6B7280", fontSize: 14 }}>{dica}</p>

          <select
            value={fabricaId}
            onChange={(e) => setFabricaId(e.target.value)}
            style={{
              width: "100%",
              marginTop: 12,
              padding: 14,
              borderRadius: 14,
              border: "1px solid #E5E7EB",
              fontSize: 16,
              fontWeight: 800,
              background: "#FCFCFD",
              outline: "none",
            }}
          >
            <option value="">Selecione a fábrica</option>
            {fabricas.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>

          <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
            <input
              placeholder="Buscar por código ou descrição (ex.: FT-200 / coifa 1.20)"
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") buscar();
              }}
              style={{
                flex: 1,
                minWidth: 240,
                padding: 14,
                borderRadius: 14,
                border: "1px solid #E5E7EB",
                fontSize: 16,
                background: "#FCFCFD",
                outline: "none",
              }}
            />

            <button
              onClick={buscar}
              disabled={carregando}
              style={{
                padding: "12px 16px",
                borderRadius: 14,
                border: "1px solid #111827",
                background: "#111827",
                color: "#FFFFFF",
                fontWeight: 900,
                cursor: "pointer",
                opacity: carregando ? 0.7 : 1,
              }}
            >
              {carregando ? "Buscando..." : "Buscar"}
            </button>
          </div>

          {erro && (
            <div
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 14,
                border: "1px solid #FCA5A5",
                background: "#FEF2F2",
                color: "#991B1B",
                fontWeight: 800,
              }}
            >
              {erro}
            </div>
          )}

          {resultados.length > 0 && (
            <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
              {resultados.map((p) => (
                <div
                  key={p.id}
                  style={{
                    border: "1px solid #E5E7EB",
                    borderRadius: 14,
                    padding: 14,
                    background: "#FFFFFF",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ minWidth: 240 }}>
                    <div style={{ fontWeight: 900, fontSize: 16 }}>
                      {p.codigo ? `${p.codigo} — ` : ""}
                      {p.descricao}
                    </div>
                    <div style={{ marginTop: 6, color: "#6B7280", fontWeight: 800 }}>
                      Preço: {money(p.preco)}
                      {p.unidade ? ` (${p.unidade})` : ""}
                    </div>
                  </div>

                  <button
                    onClick={() => copiarResposta(p)}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 14,
                      border: "1px solid #E5E7EB",
                      background: "#FFFFFF",
                      fontWeight: 900,
                      cursor: "pointer",
                      minWidth: 170,
                    }}
                  >
                    Copiar resposta
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Card de dica */}
        <div
          style={{
            marginTop: 18,
            background: "#FFFFFF",
            border: "1px solid #E5E7EB",
            borderRadius: 16,
            padding: 16,
            boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
          }}
        >
          <p style={{ margin: 0, color: "#6B7280", fontSize: 14 }}>
            Dica: depois de usar <b>Nova mensagem</b>, o sistema abre automaticamente a tela da mensagem para copiar a
            resposta e marcar como resolvido.
          </p>
        </div>
      </div>
    </main>
  );
}