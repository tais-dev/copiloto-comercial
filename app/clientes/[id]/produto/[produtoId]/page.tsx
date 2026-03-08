"use client";

// ====== PRODUCT SEARCH — DETALHE DO PRODUTO POR CLIENTE ======
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { FABRICA_COR, FABRICA_LABEL } from "@/lib/types";

// ====== TYPES LOCAIS ======
type ModalidadeFrete = "fob" | "cif" | "redespacho";

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
  // ====== AMAPÁ: preços diretos por modalidade de frete ======
  preco_fob: number | null;
  preco_cif: number | null;
  preco_redespacho: number | null;
  condicao_pagamento: string | null;
  regiao: string | null;
  icms: number | null;
};

type DadosPreco = {
  preco_vigente: number;
  preco_com_frete: number | null;
};

type DadosFrete = {
  regiao: string;
  fob: number;
  cif: number | null;
  redespacho: number | null;
};

// ====== AMAPÁ: CONDIÇÕES DE PAGAMENTO ======
// Multiplicadores aplicados sobre o preço base (FOB/CIF/Redespacho)
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

// ====== UI: SKELETON ======
function Skeleton({ width, height }: { width: string | number; height: number }) {
  return <div className="skeleton" style={{ width, height, borderRadius: 8 }} />;
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

// ====== HELPERS ======
function slugFromNome(nome: string): string {
  const n = nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (n.includes("amapa")) return "amapa";
  if (n.includes("paniz")) return "gpaniz";
  if (n.includes("bermar") || n.includes("gastromaq")) return "bermar";
  return n;
}

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ====== PRODUCT SEARCH — PAGE DETALHE ======
export default function ProdutoDetalhe({ params }: { params: Promise<{ id: string; produtoId: string }> }) {
  const { id: clienteId, produtoId } = use(params);
  const router = useRouter();

  console.log("produtoId:", produtoId, "clienteId:", clienteId);

  const [produto, setProduto] = useState<DadosProduto | null>(null);
  const [preco, setPreco] = useState<DadosPreco | null>(null);
  const [fabricaSlug, setFabricaSlug] = useState<string>("");
  const [gpanizTipoTabela, setGpanizTipoTabela] = useState<string>("normal");
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // ====== AMAPÁ: modalidade de frete + condição de pagamento ======
  const [modalidade, setModalidade] = useState<ModalidadeFrete>("fob");
  const [condicaoIdx, setCondicaoIdx] = useState<number>(0);

  // ====== G.PANIZ / BERMAR: frete por região do cliente ======
  const [freteCliente, setFreteCliente] = useState<DadosFrete | null>(null);

  // ====== UI: COPY BUTTON ======
  const [copiado, setCopiado] = useState(false);

  function copiarPreco(valor: number) {
    navigator.clipboard.writeText(
      new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor)
    );
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  // ====== SEARCH QUERY (SUPABASE) — produto + identificação de fábrica ======
  useEffect(() => {
    async function carregar() {
      setLoading(true);
      setErro(null);

      // 1. Produto — inclui campos Amapá (preco_fob/cif/redespacho)
      const { data: prodData, error: prodError } = await supabase
        .from("produtos")
        .select(
          "id, codigo, id_fabrica, descricao, ncm, ean, ipi, icms, valor_unitario, valor_com_frete, fabrica_id, preco_fob, preco_cif, preco_redespacho, condicao_pagamento, regiao"
        )
        .eq("id", produtoId)
        .single();

      if (prodError || !prodData) {
        setErro("Produto não encontrado.");
        setLoading(false);
        return;
      }
      setProduto(prodData);

      // 2. Slug da fábrica
      const { data: fabricaData } = await supabase
        .from("fabricas")
        .select("nome")
        .eq("id", prodData.fabrica_id)
        .single();

      const slug = fabricaData ? slugFromNome(fabricaData.nome) : "";
      setFabricaSlug(slug);

      // ====== G.PANIZ: buscar preço na tabela configurada do cliente ======
      if (slug === "gpaniz") {
        const { data: cfGpaniz } = await supabase
          .from("clientes_fabricas")
          .select("tabela")
          .eq("cliente_id", clienteId)
          .eq("fabrica", "gpaniz")
          .maybeSingle();

        const tipoTabela = cfGpaniz?.tabela ?? "normal";
        setGpanizTipoTabela(tipoTabela);

        const { data: prodTabela } = await supabase
          .from("produtos")
          .select("valor_unitario, valor_com_frete")
          .eq("fabrica_id", prodData.fabrica_id)
          .eq("codigo", prodData.codigo)
          .eq("tipo_tabela", tipoTabela)
          .maybeSingle();

        if (prodTabela) {
          setPreco({
            preco_vigente: prodTabela.valor_unitario ?? 0,
            preco_com_frete: prodTabela.valor_com_frete ?? null,
          });
        }
      }

      // ====== BERMAR: frete por região do cliente ======
      if (slug === "bermar") {
        const { data: clienteData } = await supabase
          .from("clientes")
          .select("regiao, uf")
          .eq("id", clienteId)
          .single();

        const regiao = clienteData?.regiao ?? clienteData?.uf;
        if (regiao) {
          const { data: freteData } = await supabase
            .from("regioes_frete")
            .select("regiao, fob, cif, redespacho")
            .eq("regiao", regiao)
            .maybeSingle();
          setFreteCliente(freteData ?? null);
        }
      }

      setLoading(false);
    }

    carregar();
  }, [clienteId, produtoId]);

  // ====== ORDERS + INSTALLMENTS — cálculo de preço ======
  const isAmapa = fabricaSlug === "amapa";
  const isGpaniz = fabricaSlug === "gpaniz";
  const isBermar = fabricaSlug === "bermar";
  const cor = FABRICA_COR[fabricaSlug] ?? "#888";
  const fabLabel = FABRICA_LABEL[fabricaSlug] ?? fabricaSlug;
  const ipi = produto?.ipi ?? 0;

  // ── Amapá: preço base direto do banco × condição de pagamento
  // FOB = frete por conta do cliente (preço de fábrica)
  // CIF = frete incluso até o cliente (preço já calculado pela Amapá)
  // Redespacho = via transportadora intermediária
  const condicao = CONDICOES_PAGAMENTO[condicaoIdx];
  const precoBaseAmapa =
    modalidade === "fob"
      ? (produto?.preco_fob ?? produto?.valor_unitario ?? 0)
      : modalidade === "cif"
      ? (produto?.preco_cif ?? 0)
      : (produto?.preco_redespacho ?? 0);
  const precoFinalAmapa = precoBaseAmapa * condicao.fator;
  const valorIpiAmapa = precoFinalAmapa * (ipi / 100);
  const totalComIpiAmapa = precoFinalAmapa + valorIpiAmapa;

  // ── G.Paniz / Bermar
  const isGpanizEcommerce = isGpaniz && gpanizTipoTabela === "ecommerce";
  const precoBase = isBermar
    ? (produto?.valor_unitario ?? 0)
    : isGpanizEcommerce
    ? (preco?.preco_com_frete ?? preco?.preco_vigente ?? 0)
    : (preco?.preco_vigente ?? 0);
  const pctFreteCliente =
    modalidade === "fob" ? 0
    : modalidade === "cif" ? (freteCliente?.cif ?? 0)
    : (freteCliente?.redespacho ?? 0);
  const totalOutros = precoBase * (1 + pctFreteCliente / 100);
  const valorFreteOutros = precoBase * (pctFreteCliente / 100);
  const valorIpiOutros = totalOutros * (ipi / 100);
  const totalComIpiOutros = totalOutros + valorIpiOutros;

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
            <Skeleton width="70%" height={18} />
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
            {/* ====== AMAPÁ: badge de região ====== */}
            {isAmapa && produto?.regiao && (
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

      {/* ====== UI: CONTEÚDO PRINCIPAL ====== */}
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

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Skeleton width="100%" height={80} />
            <Skeleton width="100%" height={120} />
            <Skeleton width="100%" height={140} />
            <Skeleton width="100%" height={160} />
          </div>
        ) : (
          <>
            {/* ====== AMAPÁ: MODALIDADE DE FRETE ====== */}
            {isAmapa && (
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
                      { value: "fob" as ModalidadeFrete, label: "FOB", disponivel: true },
                      { value: "cif" as ModalidadeFrete, label: "CIF", disponivel: !!produto?.preco_cif },
                      { value: "redespacho" as ModalidadeFrete, label: "Redespacho", disponivel: !!produto?.preco_redespacho },
                    ] as const
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

                {/* FOB badge informativo */}
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
            )}

            {/* ====== AMAPÁ: CONDIÇÃO DE PAGAMENTO ====== */}
            {isAmapa && (
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
            )}

            {/* ====== UI: PREÇO PRINCIPAL ====== */}
            <div
              style={{
                background: "#1a1a1a",
                border: `1px solid ${cor}30`,
                borderRadius: 16,
                padding: "20px",
                marginBottom: 16,
                textAlign: "center",
              }}
            >
              <div
                className="mono"
                style={{ fontSize: 38, fontWeight: 700, color: cor, letterSpacing: -1 }}
              >
                {isAmapa ? brl(precoFinalAmapa) : brl(totalOutros)}
              </div>

              {/* G.Paniz badge */}
              {isGpaniz && (
                <div
                  style={{
                    display: "inline-block",
                    marginTop: 10,
                    fontSize: 12,
                    fontWeight: 600,
                    color: cor,
                    background: `${cor}15`,
                    border: `1px solid ${cor}30`,
                    borderRadius: 20,
                    padding: "3px 12px",
                  }}
                >
                  {isGpanizEcommerce
                    ? "E-commerce · c/ frete incluso"
                    : gpanizTipoTabela === "especial"
                    ? "Especial"
                    : "Normal"}
                </div>
              )}

              {/* ====== UI: COPY BUTTON — PREÇO PRINCIPAL ====== */}
              <button
                onClick={() => copiarPreco(isAmapa ? precoFinalAmapa : totalOutros)}
                style={{
                  marginTop: 14,
                  padding: "8px 24px",
                  borderRadius: 20,
                  border: `1px solid ${copiado ? cor + "60" : "#2e2e2e"}`,
                  background: copiado ? cor + "15" : "transparent",
                  color: copiado ? cor : "#555",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 200ms ease",
                  minHeight: 36,
                }}
              >
                {copiado ? "copiado ✓" : "copiar preço"}
              </button>
            </div>

            {/* ====== UI: SELETOR DE FRETE — apenas Bermar (G.Paniz e Amapá não usam) ====== */}
            {isBermar && (
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
                      { value: "fob" as ModalidadeFrete, label: "FOB", sub: "0%" },
                      { value: "cif" as ModalidadeFrete, label: "CIF", sub: freteCliente?.cif ? `${freteCliente.cif}%` : "—" },
                      { value: "redespacho" as ModalidadeFrete, label: "Redespacho", sub: freteCliente?.redespacho ? `${freteCliente.redespacho}%` : "—" },
                    ] as const
                  ).map((opt) => {
                    const ativo = modalidade === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setModalidade(opt.value)}
                        style={{
                          flex: 1,
                          padding: "8px 4px",
                          borderRadius: 10,
                          border: `1px solid ${ativo ? cor : "#2e2e2e"}`,
                          background: ativo ? `${cor}18` : "transparent",
                          color: ativo ? cor : "#888",
                          cursor: "pointer",
                          textAlign: "center",
                          transition: "all 150ms ease",
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 700 }}>{opt.label}</div>
                        <div className="mono" style={{ fontSize: 11, color: ativo ? cor : "#555", marginTop: 2 }}>
                          {opt.sub}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ====== UI: RESUMO DE PREÇOS ====== */}
            <div
              style={{
                background: "#1a1a1a",
                border: "1px solid #2e2e2e",
                borderRadius: 16,
                padding: "4px 20px",
                marginBottom: 16,
              }}
            >
              {isAmapa ? (
                // ====== AMAPÁ: preço base (condição já aplicada) + IPI ======
                <>
                  <DetalheRow label="Preço base" valor={brl(precoFinalAmapa)} mono />
                  {ipi > 0 && (
                    <>
                      <DetalheRow label={`IPI (${(ipi * 100).toFixed(2).replace('.', ',')}%)`} valor={brl(valorIpiAmapa)} mono />
                      <DetalheRow label="Total c/ IPI" valor={brl(totalComIpiAmapa)} mono />
                    </>
                  )}
                </>
              ) : isGpaniz ? (
                // ====== G.PANIZ: preço já é final, sem frete separado ======
                <>
                  <DetalheRow
                    label={isGpanizEcommerce ? "Preço c/ frete incluso" : "Preço"}
                    valor={brl(precoBase)}
                    mono
                  />
                  {ipi > 0 && (
                    <>
                      <DetalheRow label={`IPI (${(ipi * 100).toFixed(2).replace('.', ',')}%)`} valor={brl(valorIpiOutros)} mono />
                      <DetalheRow label="Total c/ IPI" valor={brl(totalComIpiOutros)} mono />
                    </>
                  )}
                </>
              ) : (
                // ====== BERMAR: preço + frete separado ======
                <>
                  <DetalheRow label="Preço" valor={brl(precoBase)} mono />
                  <DetalheRow label={`Frete (${pctFreteCliente}%)`} valor={brl(valorFreteOutros)} mono />
                  <DetalheRow label="Total c/ frete" valor={brl(totalOutros)} mono />
                  {ipi > 0 && (
                    <>
                      <DetalheRow label={`IPI (${(ipi * 100).toFixed(2).replace('.', ',')}%)`} valor={brl(valorIpiOutros)} mono />
                      <DetalheRow label="Total c/ IPI" valor={brl(totalComIpiOutros)} mono />
                    </>
                  )}
                </>
              )}
            </div>

            {/* ====== BERMAR: CONDIÇÃO DE PAGAMENTO ====== */}
            {isBermar && (
              <div
                style={{
                  background: "#1a1a1a",
                  border: "1px solid #2e2e2e",
                  borderRadius: 16,
                  padding: "14px 20px",
                  marginBottom: 16,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <span style={{ fontSize: 13, color: "#888" }}>Condição de pagamento:</span>
                <span
                  className="mono"
                  style={{
                    fontSize: 12,
                    background: "#242424",
                    border: "1px solid #2e2e2e",
                    color: "#fb923c",
                    padding: "4px 12px",
                    borderRadius: 20,
                    fontWeight: 600,
                  }}
                >
                  28/56/84 dias
                </span>
                <span style={{ fontSize: 12, color: "#555" }}>· preço único</span>
              </div>
            )}

            {/* ====== GRID DE DETALHES TÉCNICOS ====== */}
            <div
              style={{
                background: "#1a1a1a",
                border: "1px solid #2e2e2e",
                borderRadius: 16,
                padding: "4px 20px",
                marginBottom: 16,
              }}
            >
              <DetalheRow label="IPI" valor={ipi ? `${(ipi * 100).toFixed(2).replace('.', ',')}%` : "Sem IPI"} />
              <DetalheRow label="ICMS" valor={produto?.icms != null ? `${(produto.icms * 100).toFixed(0)}%` : null} />
              <DetalheRow label="NCM" valor={produto?.ncm} mono />
              <DetalheRow label="EAN" valor={produto?.ean} mono />
              <DetalheRow label="Cód. Ref." valor={produto?.codigo} mono />
              <DetalheRow label="Cód. Fábrica" valor={produto?.id_fabrica} mono />
              {isAmapa && produto?.regiao && (
                <DetalheRow label="Região" valor={produto.regiao} mono />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
