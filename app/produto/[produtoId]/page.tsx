"use client";

// ====== PRODUCT SEARCH — DETALHE DO PRODUTO SEM CLIENTE ======
import { use, useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { FABRICA_COR, FABRICA_LABEL } from "@/lib/types";
import { nomeCliente } from "@/lib/utils";

// ====== TYPES LOCAIS ======
type DadosProduto = {
  id: string;
  codigo: string | null;
  id_fabrica: string | null;
  descricao: string;
  ncm: string | null;
  ean: string | null;
  ipi: number | null;
  valor_unitario: number | null;
  valor_com_frete: number | null;
  fabrica_id: string;
  fabrica_slug: string | null;
  // ====== AMAPÁ: preços por modalidade (novos campos) ======
  preco_fob: number | null;
  preco_cif: number | null;
  preco_redespacho: number | null;
  condicao_pagamento: string | null;
  regiao: string | null;
  icms: number | null;
};

type GpanizPreco = {
  id: string;
  valor_unitario: number | null;
  valor_com_frete: number | null;
  tipo_tabela: string | null;
};

type ClienteOpcao = {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
};

// ====== HELPERS ======
function slugFromNome(nome: string): string {
  const n = nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (n.includes("amapa")) return "amapa";
  if (n.includes("paniz")) return "gpaniz";
  if (n.includes("bermar") || n.includes("gastromaq")) return "bermar";
  return n;
}

function brl(v: number | null | undefined) {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ====== UI: LINHA DE DETALHE ======
function DetalheRow({
  label,
  valor,
  mono,
}: {
  label: string;
  valor: string | number | null | undefined;
  mono?: boolean;
}) {
  if (!valor && valor !== 0) return null;
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "10px 0",
        borderBottom: "1px solid #2e2e2e",
      }}
    >
      <span style={{ fontSize: 13, color: "#888" }}>{label}</span>
      <span
        style={{
          fontSize: 14,
          color: "#f0f0f0",
          fontFamily: mono ? "var(--font-dm-mono, monospace)" : undefined,
          fontWeight: mono ? 500 : 600,
        }}
      >
        {valor}
      </span>
    </div>
  );
}

// ====== UI: COR DO BADGE POR TIPO TABELA ======
const COR_TABELA: Record<string, string> = {
  normal: "#60a5fa",
  especial: "#a78bfa",
  ecommerce: "#00e5a0",
};

function labelTabela(tipo: string | null): string {
  if (!tipo) return "Normal";
  if (tipo === "ecommerce") return "E-commerce";
  return tipo.charAt(0).toUpperCase() + tipo.slice(1);
}

// ====== AMAPÁ: CONDIÇÕES DE PAGAMENTO ======
const CONDICOES_PAGAMENTO = [
  { label: "Antecipado",           fator: 1.000 },
  { label: "14 DDL",               fator: 1.010 },
  { label: "Entrada/14/28",        fator: 1.010 },
  { label: "28 DDL",               fator: 1.020 },
  { label: "28 BNDES",             fator: 1.027 },
  { label: "42 DDL",               fator: 1.030 },
  { label: "28/56",                fator: 1.030 },
  { label: "28/56/84",             fator: 1.040 },
  { label: "28/56/84/112",         fator: 1.050 },
  { label: "56/84/112",            fator: 1.060 },
  { label: "56 DDL",               fator: 1.040 },
  { label: "28/56/84/112/140",     fator: 1.100 },
] as const;

// ====== PRODUCT SEARCH — componente interno ======
function ProdutoDetalheInner({ produtoId }: { produtoId: string }) {
  const router = useRouter();

  console.log("produtoId:", produtoId);

  const [produto, setProduto] = useState<DadosProduto | null>(null);
  const [fabricaSlug, setFabricaSlug] = useState<string>("");
  const [gpanizPrecos, setGpanizPrecos] = useState<GpanizPreco[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // ====== UI: COPY BUTTON ======
  const [copiadoCardId, setCopiadoCardId] = useState<string | null>(null);
  const [copiadoAmapa, setCopiadoAmapa] = useState(false);
  const [copiadoBermar, setCopiadoBermar] = useState(false);

  // ====== AMAPÁ: modalidade de frete + condição de pagamento ======
  const [modalidade, setModalidade] = useState<"fob" | "cif" | "redespacho">("fob");
  const [condicaoIdx, setCondicaoIdx] = useState<number>(0);

  // ====== AMAPÁ: seletor de cliente (bottom sheet) ======
  const [mostrarClientes, setMostrarClientes] = useState(false);
  const [buscaCliente, setBuscaCliente] = useState("");

  function copiarValor(valor: number, setCopied: (v: boolean) => void) {
    navigator.clipboard.writeText(
      new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor)
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ====== AMAPÁ: abrir seletor de cliente — carrega lista lazy ======
  async function abrirSeletor() {
    setMostrarClientes(true);
    if (clientes.length === 0) {
      const { data } = await supabase
        .from("clientes")
        .select("id, razao_social, nome_fantasia")
        .eq("ativo", true)
        .order("razao_social");
      setClientes(data ?? []);
    }
  }

  // Cliente selector (Amapá)
  const [clientes, setClientes] = useState<ClienteOpcao[]>([]);
  const [buscarCliente, setBuscarCliente] = useState("");
  const [dropdownAberto, setDropdownAberto] = useState(false);

  // ====== SEARCH QUERY (SUPABASE) — produto + fábrica ======
  useEffect(() => {
    async function carregar() {
      setLoading(true);
      setErro(null);

      // 1. Produto
      const { data: prodData, error: prodError } = await supabase
        .from("produtos")
        .select(
          "id, codigo, id_fabrica, descricao, ncm, ean, ipi, icms, valor_unitario, valor_com_frete, fabrica_id, fabrica_slug, preco_fob, preco_cif, preco_redespacho, condicao_pagamento, regiao"
        )
        .eq("id", produtoId)
        .single();

      if (prodError || !prodData) {
        setErro("Produto não encontrado.");
        setLoading(false);
        return;
      }
      setProduto(prodData);

      // Defaultar condição de pagamento pela armazenada no banco
      if (prodData.condicao_pagamento) {
        const idx = CONDICOES_PAGAMENTO.findIndex((c) => c.label === prodData.condicao_pagamento);
        if (idx >= 0) setCondicaoIdx(idx);
      }

      // 2. Slug da fábrica
      const { data: fabricaData } = await supabase
        .from("fabricas")
        .select("nome")
        .eq("id", prodData.fabrica_id)
        .single();

      const slug = fabricaData ? slugFromNome(fabricaData.nome) : "";
      setFabricaSlug(slug);

      // 3. G.Paniz: buscar os 3 tipos de tabela pelo id_fabrica (chave única por variação)
      if (slug === "gpaniz" && prodData.id_fabrica) {
        const { data: variacoes } = await supabase
          .from("produtos")
          .select("id, valor_unitario, valor_com_frete, tipo_tabela")
          .eq("fabrica_id", prodData.fabrica_id)
          .eq("id_fabrica", prodData.id_fabrica);

        // Deduplicar por tipo_tabela — manter apenas um registro por tipo
        const seen = new Map<string, typeof variacoes extends (infer T)[] | null ? T : never>();
        for (const v of variacoes ?? []) {
          const tipo = v.tipo_tabela ?? "normal";
          if (!seen.has(tipo)) seen.set(tipo, v);
        }
        setGpanizPrecos(Array.from(seen.values()));
      }

      setLoading(false);
    }

    carregar();
  }, [produtoId]);

  const cor = FABRICA_COR[fabricaSlug] ?? "#888";
  const fabLabel = FABRICA_LABEL[fabricaSlug] ?? fabricaSlug;

  const clientesFiltrados = buscaCliente.trim()
    ? clientes.filter((c) =>
        nomeCliente(c).toLowerCase().includes(buscaCliente.toLowerCase())
      )
    : clientes;

  // ====== AMAPÁ: cálculo de preço (sem cliente, para referência) ======
  const condicao = CONDICOES_PAGAMENTO[condicaoIdx];
  const precoBaseAmapa =
    modalidade === "fob" ? (produto?.preco_fob ?? 0) :
    modalidade === "cif" ? (produto?.preco_cif ?? 0) :
    (produto?.preco_redespacho ?? 0);
  const precoFinalAmapa = precoBaseAmapa * condicao.fator;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f0f0f",
        maxWidth: 480,
        margin: "0 auto",
        paddingBottom: 48,
      }}
    >
      {/* ====== UI: STICKY HEADER ====== */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "#0f0f0f",
          padding: "16px 20px 12px",
          borderBottom: "1px solid #2e2e2e",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <button
          onClick={() => router.back()}
          style={{
            background: "#1a1a1a",
            border: "1px solid #2e2e2e",
            borderRadius: 8,
            color: "#888",
            fontSize: 18,
            cursor: "pointer",
            padding: "4px 10px",
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          ‹
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          {loading ? (
            <div className="skeleton" style={{ height: 18, width: "70%", borderRadius: 6 }} />
          ) : (
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "#f0f0f0",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {produto?.descricao ?? "Produto"}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
            <span style={{ fontSize: 12, color: cor, fontWeight: 600 }}>{fabLabel}</span>
            {/* ====== AMAPÁ: badge de região no header ====== */}
            {fabricaSlug === "amapa" && produto?.regiao && (
              <span
                style={{
                  fontSize: 11,
                  color: "#555",
                  background: "#1a1a1a",
                  border: "1px solid #2e2e2e",
                  borderRadius: 20,
                  padding: "1px 8px",
                }}
              >
                {produto.regiao}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ====== UI: CONTEÚDO ====== */}
      <div style={{ padding: "24px 20px 0" }}>
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
            {[...Array(4)].map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 72, borderRadius: 12 }} />
            ))}
          </div>
        )}

        {!loading && !erro && (
          <>
            {/* ====== G.PANIZ: PREÇOS POR TABELA ====== */}
            {fabricaSlug === "gpaniz" && (
              <>
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
                  Precos Disponíveis
                </div>

                {gpanizPrecos.length === 0 ? (
                  <div
                    style={{
                      background: "#1a1a1a",
                      border: "1px solid #2e2e2e",
                      borderRadius: 16,
                      padding: "20px",
                      textAlign: "center",
                      color: "#555",
                      fontSize: 14,
                      marginBottom: 16,
                    }}
                  >
                    Nenhum preço disponível.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                    {gpanizPrecos.map((pc) => {
                      const tipoCor = COR_TABELA[pc.tipo_tabela ?? "normal"] ?? "#60a5fa";
                      const isEcommerce = pc.tipo_tabela === "ecommerce";
                      const valorCopiar = isEcommerce ? (pc.valor_com_frete ?? pc.valor_unitario) : pc.valor_unitario;
                      const copiado = copiadoCardId === pc.id;
                      return (
                        <div
                          key={pc.id}
                          style={{
                            background: "#1a1a1a",
                            border: "1px solid #2e2e2e",
                            borderRadius: 16,
                            overflow: "hidden",
                          }}
                        >
                          {/* ====== G.PANIZ: BADGE + PREÇO BASE ====== */}
                          <div style={{ padding: "16px 20px 14px" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                              <div
                                style={{
                                  fontSize: 12,
                                  fontWeight: 700,
                                  color: tipoCor,
                                  textTransform: "uppercase",
                                  letterSpacing: 0.5,
                                }}
                              >
                                {labelTabela(pc.tipo_tabela)}
                              </div>
                              {/* ====== UI: COPY BUTTON — G.PANIZ CARD ====== */}
                              <button
                                onClick={() => valorCopiar != null && copiarValor(valorCopiar, (v) => setCopiadoCardId(v ? pc.id : null))}
                                style={{
                                  padding: "4px 12px",
                                  borderRadius: 20,
                                  border: `1px solid ${copiado ? tipoCor + "60" : "#2e2e2e"}`,
                                  background: copiado ? tipoCor + "15" : "transparent",
                                  color: copiado ? tipoCor : "#555",
                                  fontSize: 12,
                                  fontWeight: 600,
                                  cursor: "pointer",
                                  transition: "all 200ms ease",
                                  minHeight: 32,
                                }}
                              >
                                {copiado ? "copiado ✓" : "copiar"}
                              </button>
                            </div>
                            <div
                              className="mono"
                              style={{
                                fontSize: 26,
                                fontWeight: 700,
                                color: isEcommerce ? "#888" : "#f0f0f0",
                                letterSpacing: -0.5,
                              }}
                            >
                              {brl(pc.valor_unitario)}
                            </div>
                            {isEcommerce && (
                              <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>
                                Preço base (sem frete)
                              </div>
                            )}
                          </div>

                          {/* ====== G.PANIZ: SEÇÃO FRETE ECOMMERCE ====== */}
                          {isEcommerce && pc.valor_com_frete && (
                            <div
                              style={{
                                borderTop: "1px solid #2e2e2e",
                                padding: "12px 20px",
                                background: "rgba(0,229,160,0.04)",
                              }}
                            >
                              <div style={{ fontSize: 11, fontWeight: 700, color: "#00e5a0", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                                Com frete incluso
                              </div>
                              <div
                                className="mono"
                                style={{ fontSize: 22, fontWeight: 700, color: "#00e5a0" }}
                              >
                                {brl(pc.valor_com_frete)}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* ====== BERMAR: PREÇO ÚNICO ====== */}
            {fabricaSlug === "bermar" && (
              <div
                style={{
                  background: "#1a1a1a",
                  border: `1px solid ${cor}30`,
                  borderRadius: 16,
                  padding: "20px",
                  textAlign: "center",
                  marginBottom: 16,
                }}
              >
                <div
                  className="mono"
                  style={{ fontSize: 38, fontWeight: 700, color: cor, letterSpacing: -1 }}
                >
                  {brl(produto?.valor_unitario)}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    marginTop: 10,
                  }}
                >
                  <span
                    className="mono"
                    style={{
                      fontSize: 12,
                      background: "#242424",
                      border: "1px solid #2e2e2e",
                      color: cor,
                      padding: "4px 12px",
                      borderRadius: 20,
                      fontWeight: 600,
                    }}
                  >
                    28/56/84 dias
                  </span>
                  <span style={{ fontSize: 12, color: "#555" }}>· preco unico</span>
                </div>
                {/* ====== UI: COPY BUTTON — BERMAR ====== */}
                {produto?.valor_unitario != null && (
                  <button
                    onClick={() => copiarValor(produto.valor_unitario!, setCopiadoBermar)}
                    style={{
                      marginTop: 14,
                      padding: "8px 20px",
                      borderRadius: 20,
                      border: `1px solid ${copiadoBermar ? cor + "60" : "#2e2e2e"}`,
                      background: copiadoBermar ? cor + "15" : "transparent",
                      color: copiadoBermar ? cor : "#555",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 200ms ease",
                      minHeight: 36,
                    }}
                  >
                    {copiadoBermar ? "copiado ✓" : "copiar preço"}
                  </button>
                )}
              </div>
            )}

            {/* ====== AMAPÁ: MODALIDADE + CONDIÇÃO + PREÇO + CLIENTE ====== */}
            {fabricaSlug === "amapa" && (
              <>
                {/* ====== AMAPÁ: MODALIDADE DE FRETE ====== */}
                <div
                  style={{
                    background: "#1a1a1a",
                    border: "1px solid #2e2e2e",
                    borderRadius: 16,
                    padding: 20,
                    marginBottom: 16,
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#555",
                      letterSpacing: 1,
                      textTransform: "uppercase",
                      marginBottom: 12,
                    }}
                  >
                    Modalidade de Frete
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {(
                      [
                        { value: "fob" as const, label: "FOB", disponivel: true },
                        { value: "cif" as const, label: "CIF", disponivel: !!produto?.preco_cif },
                        { value: "redespacho" as const, label: "Redespacho", disponivel: !!produto?.preco_redespacho },
                      ]
                    ).map((opt) => {
                      const ativo = modalidade === opt.value;
                      return (
                        <button
                          key={opt.value}
                          onClick={() => { if (opt.disponivel) setModalidade(opt.value); }}
                          style={{
                            flex: 1,
                            padding: "10px 4px",
                            borderRadius: 10,
                            border: `1px solid ${ativo ? cor : opt.disponivel ? "#2e2e2e" : "#1e1e1e"}`,
                            background: ativo ? `${cor}18` : "transparent",
                            color: ativo ? cor : opt.disponivel ? "#888" : "#333",
                            cursor: opt.disponivel ? "pointer" : "default",
                            textAlign: "center",
                            transition: "all 150ms ease",
                            minHeight: 52,
                          }}
                        >
                          <div style={{ fontSize: 12, fontWeight: 700 }}>{opt.label}</div>
                          {!opt.disponivel && (
                            <div style={{ fontSize: 10, color: "#333", marginTop: 2 }}>—</div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {modalidade === "fob" && (
                    <div
                      style={{
                        marginTop: 12,
                        padding: "8px 12px",
                        borderRadius: 8,
                        background: "rgba(245,158,11,0.08)",
                        border: "1px solid rgba(245,158,11,0.2)",
                        fontSize: 12,
                        color: "#f59e0b",
                      }}
                    >
                      FOB — frete por conta do cliente
                    </div>
                  )}
                </div>

                {/* ====== AMAPÁ: CONDIÇÃO DE PAGAMENTO ====== */}
                <div
                  style={{
                    background: "#1a1a1a",
                    border: "1px solid #2e2e2e",
                    borderRadius: 16,
                    padding: 20,
                    marginBottom: 16,
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#555",
                      letterSpacing: 1,
                      textTransform: "uppercase",
                      marginBottom: 12,
                    }}
                  >
                    Condição de Pagamento
                  </div>
                  <select
                    value={condicaoIdx}
                    onChange={(e) => setCondicaoIdx(Number(e.target.value))}
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      borderRadius: 10,
                      border: "1px solid #2e2e2e",
                      background: "#242424",
                      color: "#f0f0f0",
                      fontSize: 15,
                      outline: "none",
                      cursor: "pointer",
                      minHeight: 48,
                    }}
                  >
                    {CONDICOES_PAGAMENTO.map((c, i) => (
                      <option key={i} value={i}>
                        {c.label}
                        {c.fator > 1 ? ` (+${((c.fator - 1) * 100).toFixed(1)}%)` : " (base)"}
                      </option>
                    ))}
                  </select>
                </div>

                {/* ====== AMAPÁ: PREÇO PRINCIPAL ====== */}
                <div
                  style={{
                    background: "#1a1a1a",
                    border: `1px solid ${cor}30`,
                    borderRadius: 16,
                    padding: "20px",
                    textAlign: "center",
                    marginBottom: 16,
                  }}
                >
                  <div
                    className="mono"
                    style={{ fontSize: 38, fontWeight: 700, color: cor, letterSpacing: -1 }}
                  >
                    {brl(precoFinalAmapa)}
                  </div>
                  {/* ====== UI: COPY BUTTON — AMAPÁ ====== */}
                  <button
                    onClick={() => copiarValor(precoFinalAmapa, setCopiadoAmapa)}
                    style={{
                      marginTop: 14,
                      padding: "8px 20px",
                      borderRadius: 20,
                      border: `1px solid ${copiadoAmapa ? cor + "60" : "#2e2e2e"}`,
                      background: copiadoAmapa ? cor + "15" : "transparent",
                      color: copiadoAmapa ? cor : "#555",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 200ms ease",
                      minHeight: 36,
                    }}
                  >
                    {copiadoAmapa ? "copiado ✓" : `copiar ${modalidade.toUpperCase()}`}
                  </button>
                </div>

                {/* ====== AMAPÁ: AVISO — SELECIONAR CLIENTE ====== */}
                <div
                  style={{
                    background: "rgba(245,158,11,0.08)",
                    border: "1px solid rgba(245,158,11,0.25)",
                    borderRadius: 16,
                    padding: "16px 20px",
                    marginBottom: 16,
                  }}
                >
                  <div style={{ fontSize: 13, color: "#f59e0b", fontWeight: 600, marginBottom: 4 }}>
                    ⚠ Selecione um cliente para ver
                  </div>
                  <div style={{ fontSize: 13, color: "#f59e0b", opacity: 0.8 }}>
                    o preço personalizado
                  </div>
                </div>

                {/* ====== UI: SELETOR DE CLIENTE — BOTÃO (AMAPÁ) ====== */}
                <div style={{ marginBottom: 16 }}>
                  <button
                    onClick={abrirSeletor}
                    style={{
                      width: "100%",
                      padding: "14px 16px",
                      borderRadius: 14,
                      border: `1px solid ${cor}`,
                      background: "#1a1a1a",
                      color: cor,
                      fontSize: 15,
                      fontWeight: 600,
                      cursor: "pointer",
                      textAlign: "center",
                      minHeight: 52,
                    }}
                  >
                    👤 Selecionar cliente
                  </button>
                </div>
              </>
            )}

            {/* ====== GRID DE DETALHES TÉCNICOS ====== */}
            <div
              style={{
                background: "#1a1a1a",
                border: "1px solid #2e2e2e",
                borderRadius: 16,
                padding: "4px 20px",
              }}
            >
              <DetalheRow
                label="IPI"
                valor={produto?.ipi ? `${(produto.ipi * 100).toFixed(2).replace('.', ',')}%` : "Sem IPI"}
              />
              <DetalheRow label="ICMS" valor={produto?.icms != null ? `${(produto.icms * 100).toFixed(0)}%` : null} />
              <DetalheRow label="NCM" valor={produto?.ncm} mono />
              <DetalheRow label="EAN" valor={produto?.ean} mono />
              <DetalheRow label="Cod." valor={produto?.codigo} mono />
              <DetalheRow label="Cod. Fabrica" valor={produto?.id_fabrica} mono />
            </div>
          </>
        )}
      </div>

      {/* ====== AMAPÁ: BOTTOM SHEET — SELETOR DE CLIENTE ====== */}
      {mostrarClientes && (
        <>
          {/* Overlay */}
          <div
            onClick={() => { setMostrarClientes(false); setBuscaCliente(""); }}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.6)",
              zIndex: 40,
            }}
          />
          {/* Sheet */}
          <div
            style={{
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              background: "#1a1a1a",
              borderRadius: "20px 20px 0 0",
              zIndex: 50,
              padding: "20px 20px 32px",
              maxHeight: "70vh",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <span style={{ fontSize: 16, fontWeight: 700, color: "#f0f0f0" }}>
                Selecionar cliente
              </span>
              <button
                onClick={() => { setMostrarClientes(false); setBuscaCliente(""); }}
                style={{
                  background: "none",
                  border: "none",
                  color: "#888",
                  fontSize: 18,
                  cursor: "pointer",
                  padding: "4px 8px",
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>

            <input
              type="text"
              value={buscaCliente}
              onChange={(e) => setBuscaCliente(e.target.value)}
              placeholder="Buscar cliente..."
              autoFocus
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid #2e2e2e",
                background: "#242424",
                color: "#f0f0f0",
                fontSize: 15,
                outline: "none",
                marginBottom: 12,
              }}
            />

            <div style={{ overflowY: "auto", flex: 1 }}>
              {clientesFiltrados.length === 0 ? (
                <div
                  style={{
                    padding: "24px 0",
                    textAlign: "center",
                    color: "#555",
                    fontSize: 14,
                  }}
                >
                  {clientes.length === 0 ? "Carregando..." : "Nenhum cliente encontrado"}
                </div>
              ) : (
                clientesFiltrados.slice(0, 50).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => router.push(`/clientes/${c.id}/produto/${produtoId}`)}
                    style={{
                      width: "100%",
                      padding: "14px 4px",
                      background: "none",
                      border: "none",
                      borderBottom: "1px solid #2e2e2e",
                      color: "#f0f0f0",
                      fontSize: 15,
                      cursor: "pointer",
                      textAlign: "left",
                      minHeight: 52,
                    }}
                  >
                    {nomeCliente(c)}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ====== PRODUCT SEARCH — wrapper Suspense (useSearchParams) ======
export default function ProdutoDetalheSemClientePage({ params }: { params: Promise<{ produtoId: string }> }) {
  const { produtoId } = use(params);
  return (
    <Suspense fallback={null}>
      <ProdutoDetalheInner produtoId={produtoId} />
    </Suspense>
  );
}
