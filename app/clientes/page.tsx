"use client";

// ====== CLIENTS (CRUD) — TELA DE SELEÇÃO DE CLIENTES ======
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { FABRICA_COR, FABRICA_LABEL } from "@/lib/types";
import { nomeCliente } from "@/lib/utils";

// ====== TYPES LOCAIS ======
type FiltroFabrica = "todos" | "amapa" | "gpaniz" | "bermar";

type ClienteFabricaCfg = {
  fabrica: string;
  tabela: string | null;
  canal: string | null;
  modalidade_frete: string | null;
};

type ClienteItem = {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  canal: string | null;
  clientes_fabricas: ClienteFabricaCfg[];
};

// ====== UI: HELPER — LABEL DA TABELA G.PANIZ ======
const TABELA_LABEL: Record<string, string> = {
  normal: "Normal",
  especial: "Especial",
  ecommerce: "E-commerce",
};

// ====== UI: BADGE COMPOSTA POR FÁBRICA ======
// Amapá: "Amapá · REVENDA · FOB"
// G.Paniz: "G.Paniz · E-commerce"
// Bermar: "Bermar"
// Canal e tabela lidos de clientes_fabricas (não de clientes.canal)
function FabricaBadge({ cfg }: { cfg: ClienteFabricaCfg }) {
  const cor = FABRICA_COR[cfg.fabrica] ?? "#888";
  const nome = FABRICA_LABEL[cfg.fabrica] ?? cfg.fabrica;

  const partes: string[] = [nome];
  if (cfg.fabrica === "amapa") {
    if (cfg.canal) partes.push(cfg.canal.toUpperCase());
    if (cfg.modalidade_frete) partes.push(cfg.modalidade_frete.toUpperCase());
  } else if (cfg.fabrica === "gpaniz" && cfg.tabela) {
    partes.push(TABELA_LABEL[cfg.tabela] ?? cfg.tabela);
  }

  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 600,
        color: cor,
        background: `${cor}18`,
        border: `1px solid ${cor}40`,
        letterSpacing: 0.2,
        whiteSpace: "nowrap",
      }}
    >
      {partes.join(" · ")}
    </span>
  );
}

// ====== UI: SKELETON CARD ======
function SkeletonCard() {
  return (
    <div
      style={{
        background: "#1a1a1a",
        border: "1px solid #2e2e2e",
        borderRadius: 16,
        padding: "16px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div className="skeleton" style={{ height: 18, width: "60%", borderRadius: 6 }} />
      <div className="skeleton" style={{ height: 14, width: "40%", borderRadius: 6 }} />
    </div>
  );
}

const FILTROS: { label: string; value: FiltroFabrica }[] = [
  { label: "Todos", value: "todos" },
  { label: "Amapá", value: "amapa" },
  { label: "G.Paniz", value: "gpaniz" },
  { label: "Bermar", value: "bermar" },
];

// ====== CLIENTS (CRUD) — PAGE PRINCIPAL ======
export default function ClientesPage() {
  const router = useRouter();
  const [clientes, setClientes] = useState<ClienteItem[]>([]);
  const [filtrado, setFiltrado] = useState<ClienteItem[]>([]);
  const [busca, setBusca] = useState("");
  const [filtroFabrica, setFiltroFabrica] = useState<FiltroFabrica>("todos");
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // ====== SEARCH QUERY (SUPABASE) — clientes com sub-configs de fábrica ======
  // canal e modalidade_frete lidos de clientes_fabricas (fonte da verdade)
  useEffect(() => {
    async function carregar() {
      setLoading(true);
      setErro(null);

      const { data, error } = await supabase
        .from("clientes")
        .select(`
          id,
          razao_social,
          nome_fantasia,
          canal,
          clientes_fabricas (
            fabrica,
            tabela,
            canal,
            modalidade_frete
          )
        `)
        .eq("ativo", true)
        .order("razao_social");

      if (error) {
        setErro("Erro ao carregar clientes.");
        setLoading(false);
        return;
      }

      const lista = (data ?? []) as ClienteItem[];
      setClientes(lista);
      setFiltrado(lista);
      setLoading(false);
    }

    carregar();
  }, []);

  // ====== PRODUCT SEARCH — filtro em tempo real ======
  const aplicarFiltro = useCallback(
    (termo: string, fab: FiltroFabrica, lista: ClienteItem[]) => {
      let resultado = lista;

      if (fab !== "todos") {
        resultado = resultado.filter((c) =>
          c.clientes_fabricas.some((f) => f.fabrica === fab)
        );
      }

      if (termo.trim()) {
        const t = termo.toLowerCase();
        resultado = resultado.filter(
          (c) =>
            c.razao_social.toLowerCase().includes(t) ||
            (c.nome_fantasia ?? "").toLowerCase().includes(t)
        );
      }

      setFiltrado(resultado);
    },
    []
  );

  function handleBusca(valor: string) {
    setBusca(valor);
    aplicarFiltro(valor, filtroFabrica, clientes);
  }

  function handleFiltro(fab: FiltroFabrica) {
    setFiltroFabrica(fab);
    aplicarFiltro(busca, fab, clientes);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f0f0f",
        maxWidth: 480,
        margin: "0 auto",
      }}
    >
      {/* ====== UI: STICKY HEADER ====== */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "#0f0f0f",
          padding: "24px 20px 0",
          borderBottom: "1px solid #2e2e2e",
        }}
      >
        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "#555",
              letterSpacing: 1.5,
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            Copiloto Comercial
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#f0f0f0" }}>
              Clientes
            </div>
            {/* ====== CLIENTS (CRUD) — BOTÃO NOVO CLIENTE ====== */}
            <button
              onClick={() => router.push("/clientes/novo")}
              style={{
                padding: "8px 16px",
                borderRadius: 20,
                border: "none",
                background: "#00e5a0",
                color: "#0f0f0f",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              + Novo
            </button>
          </div>
        </div>

        {/* Campo de busca */}
        <input
          type="text"
          value={busca}
          onChange={(e) => handleBusca(e.target.value)}
          placeholder="Buscar cliente por nome..."
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "12px 16px",
            borderRadius: 12,
            border: "1px solid #2e2e2e",
            background: "#1a1a1a",
            color: "#f0f0f0",
            fontSize: 15,
            outline: "none",
            marginBottom: 16,
          }}
        />

        {/* ====== UI: ABAS DE FILTRO POR FÁBRICA ====== */}
        <div
          style={{
            display: "flex",
            gap: 6,
            overflowX: "auto",
            paddingBottom: 16,
            scrollbarWidth: "none",
          }}
        >
          {FILTROS.map((f) => {
            const ativo = filtroFabrica === f.value;
            const cor =
              f.value === "todos" ? "#f0f0f0" : (FABRICA_COR[f.value] ?? "#f0f0f0");
            return (
              <button
                key={f.value}
                onClick={() => handleFiltro(f.value)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 20,
                  border: `1px solid ${ativo ? cor : "#2e2e2e"}`,
                  background: ativo ? `${cor}18` : "transparent",
                  color: ativo ? cor : "#888",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  transition: "all 150ms ease",
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ====== UI: LISTA DE CLIENTES ====== */}
      <div style={{ padding: "20px 20px 40px" }}>
        {erro && (
          <div
            style={{
              padding: "14px 16px",
              borderRadius: 12,
              background: "#1a1a1a",
              border: "1px solid #f59e0b40",
              color: "#f59e0b",
              fontSize: 14,
              marginBottom: 16,
            }}
          >
            {erro}
          </div>
        )}

        {loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[...Array(5)].map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {!loading && !erro && (
          <>
            {filtrado.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  color: "#555",
                  fontSize: 14,
                  marginTop: 48,
                }}
              >
                Nenhum cliente encontrado.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontSize: 12, color: "#555", marginBottom: 4 }}>
                  {filtrado.length} cliente{filtrado.length !== 1 ? "s" : ""}
                </div>

                {/* ====== UI: CARD DO CLIENTE ====== */}
                {filtrado.map((cliente) => {
                  const nome = nomeCliente(cliente);
                  return (
                    <button
                      key={cliente.id}
                      onClick={() => router.push(`/clientes/${cliente.id}/configurar`)}
                      style={{
                        width: "100%",
                        background: "#1a1a1a",
                        border: "1px solid #2e2e2e",
                        borderRadius: 16,
                        padding: "16px 20px",
                        cursor: "pointer",
                        textAlign: "left",
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                        transition: "border-color 200ms ease",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.borderColor = "#3e3e3e";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.borderColor = "#2e2e2e";
                      }}
                    >
                      {/* Nome do cliente */}
                      <span
                        style={{
                          fontSize: 15,
                          fontWeight: 600,
                          color: "#f0f0f0",
                          lineHeight: 1.3,
                        }}
                      >
                        {nome}
                      </span>

                      {/* Badges compostas: [Amapá · REVENDA · FOB] [G.Paniz · Normal] [Bermar] */}
                      {cliente.clientes_fabricas.length > 0 && (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {cliente.clientes_fabricas.map((cf, i) => (
                            <FabricaBadge key={i} cfg={cf} />
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
