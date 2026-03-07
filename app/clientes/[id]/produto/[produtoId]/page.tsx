"use client";

// ====== PRODUCT SEARCH — DETALHE DO PRODUTO POR CLIENTE ======
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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

// ====== AMAPÁ: CANAIS DE VENDA COM DESCONTO ======
// Fonte: aba Dados da planilha Amapá.
// O valor_unitario foi calculado com desconto ATACADO (0.69).
// Para recalcular por canal: precoCheio = valor_unitario / 0.69 → precoCanal = precoCheio × fator
const CANAIS = [
  { label: "Distribuidor", key: "distribuidor", fator: 0.55, cor: "#a78bfa" },
  { label: "Revenda",      key: "revenda",      fator: 0.63, cor: "#60a5fa" },
  { label: "Atacado",      key: "atacado",      fator: 0.69, cor: "#fb923c" },
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
export default function ProdutoDetalhe() {
  const params = useParams();
  const router = useRouter();
  const clienteId = params.id as string;
  const produtoId = params.produtoId as string;

  const [produto, setProduto] = useState<DadosProduto | null>(null);
  const [preco, setPreco] = useState<DadosPreco | null>(null);
  const [fabricaSlug, setFabricaSlug] = useState<string>("");
  const [gpanizTipoTabela, setGpanizTipoTabela] = useState<string>("normal");
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // ====== AMAPÁ: estados de canal, modalidade de frete e região ======
  const [canal, setCanal] = useState<string>("atacado");
  const [modalidade, setModalidade] = useState<ModalidadeFrete>("fob");
  const [regiaoSelecionada, setRegiaoSelecionada] = useState<string | null>(null);
  const [todasRegioes, setTodasRegioes] = useState<DadosFrete[]>([]);

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

      // 1. Produto (colunas reais do schema)
      const { data: prodData, error: prodError } = await supabase
        .from("produtos")
        .select(
          "id, codigo, id_fabrica, descricao, ncm, ean, ipi, valor_unitario, valor_com_frete, fabrica_id"
        )
        .eq("id", produtoId)
        .single();

      if (prodError || !prodData) {
        setErro("Produto não encontrado.");
        setLoading(false);
        return;
      }
      setProduto(prodData);

      // 2. Slug da fábrica via join em fabricas
      const { data: fabricaData } = await supabase
        .from("fabricas")
        .select("nome")
        .eq("id", prodData.fabrica_id)
        .single();

      const slug = fabricaData ? slugFromNome(fabricaData.nome) : "";
      setFabricaSlug(slug);

      if (slug === "amapa") {
        // ====== AMAPÁ: carregar todas as regiões de frete ======
        const { data: regioes } = await supabase
          .from("regioes_frete")
          .select("regiao, fob, cif, redespacho")
          .order("regiao");
        setTodasRegioes(regioes ?? []);

        // Pré-selecionar região do cliente se cadastrada
        const { data: cfData } = await supabase
          .from("clientes_fabricas")
          .select("regiao")
          .eq("cliente_id", clienteId)
          .eq("fabrica", "amapa")
          .maybeSingle();
        if (cfData?.regiao) setRegiaoSelecionada(cfData.regiao);
      } else {
        // ====== G.PANIZ: buscar preço na tabela configurada do cliente ======
        // Bermar usa produto.valor_unitario diretamente (tabela universal, como Amapá)
        if (slug === "gpaniz") {
          // 1. Tabela configurada do cliente para G.Paniz
          const { data: cfGpaniz } = await supabase
            .from("clientes_fabricas")
            .select("tabela")
            .eq("cliente_id", clienteId)
            .eq("fabrica", "gpaniz")
            .maybeSingle();

          const tipoTabela = cfGpaniz?.tabela ?? "normal";
          setGpanizTipoTabela(tipoTabela);

          // 2. Buscar produto na tabela correta pelo código (mesmo fabrica_id + codigo + tipo_tabela)
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

        // Frete por regiao/uf do cliente (G.Paniz e Bermar)
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
  const cor = FABRICA_COR[fabricaSlug] ?? "#888";
  const fabLabel = FABRICA_LABEL[fabricaSlug] ?? fabricaSlug;

  // ── Amapá: canal → % desconto → preço canal → + frete
  const canalDef = CANAIS.find((c) => c.key === canal) ?? CANAIS[2];
  const valorUnitario = produto?.valor_unitario ?? 0;
  const precoCheio = valorUnitario / 0.69;        // reverter desconto atacado
  const precoCanal = precoCheio * canalDef.fator; // aplicar desconto do canal

  const regiaoData = todasRegioes.find((r) => r.regiao === regiaoSelecionada);
  const pctFreteAmapa: number | null =
    modalidade === "fob"
      ? 0
      : modalidade === "cif"
      ? (regiaoData?.cif ?? null)
      : (regiaoData?.redespacho ?? null);

  // null = CIF/Redespacho selecionado mas sem região → preço indeterminado
  const totalAmapa =
    pctFreteAmapa !== null ? precoCanal * (1 + pctFreteAmapa / 100) : null;
  const valorFreteAmapa =
    pctFreteAmapa !== null ? precoCanal * (pctFreteAmapa / 100) : null;

  // ── G.Paniz / Bermar
  const isGpaniz = fabricaSlug === "gpaniz";
  const isBermar = fabricaSlug === "bermar";
  const isGpanizEcommerce = isGpaniz && gpanizTipoTabela === "ecommerce";
  // Bermar: tabela universal → valor_unitario
  // G.Paniz ecommerce: valor_com_frete (frete já incluso no preço)
  // G.Paniz normal/especial: valor_unitario, sem frete separado
  const precoBase = isBermar
    ? (produto?.valor_unitario ?? 0)
    : isGpanizEcommerce
    ? (preco?.preco_com_frete ?? preco?.preco_vigente ?? 0)
    : (preco?.preco_vigente ?? 0);
  // G.Paniz não tem frete separado — preço é final
  const pctFreteCliente = isGpaniz ? 0
    : modalidade === "fob" ? 0
    : modalidade === "cif" ? (freteCliente?.cif ?? 0)
    : (freteCliente?.redespacho ?? 0);
  const totalOutros = precoBase * (1 + pctFreteCliente / 100);
  const valorFreteOutros = precoBase * (pctFreteCliente / 100);

  // IPI (aplicado sobre o total c/ frete)
  const ipi = produto?.ipi ?? 0;
  const totalParaIpi = isAmapa ? (totalAmapa ?? precoCanal) : totalOutros;
  const valorIpi = totalParaIpi * (ipi / 100);
  const totalComIpi = totalParaIpi + valorIpi;

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
          <div style={{ fontSize: 12, color: cor, fontWeight: 600, marginTop: 2 }}>
            {fabLabel}
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
            {/* ====== AMAPÁ: SELETOR DE CANAL ====== */}
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
                  Canal
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {CANAIS.map((c) => {
                    const ativo = canal === c.key;
                    return (
                      <button
                        key={c.key}
                        onClick={() => setCanal(c.key)}
                        style={{
                          flex: 1,
                          padding: "8px 4px",
                          borderRadius: 10,
                          border: `1px solid ${ativo ? c.cor : "#2e2e2e"}`,
                          background: ativo ? `${c.cor}18` : "transparent",
                          color: ativo ? c.cor : "#888",
                          cursor: "pointer",
                          textAlign: "center",
                          transition: "all 150ms ease",
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 700 }}>
                          {c.label}
                        </div>
                        <div
                          className="mono"
                          style={{
                            fontSize: 11,
                            color: ativo ? c.cor : "#555",
                            marginTop: 2,
                          }}
                        >
                          -{Math.round((1 - c.fator) * 100)}%
                        </div>
                      </button>
                    );
                  })}
                </div>
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
              {isAmapa && (
                <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>
                  Base FOB (Atacado): {brl(valorUnitario)}
                </div>
              )}

              {/* Preço principal */}
              {isAmapa ? (
                totalAmapa !== null ? (
                  <div
                    className="mono"
                    style={{ fontSize: 38, fontWeight: 700, color: cor, letterSpacing: -1 }}
                  >
                    {brl(totalAmapa)}
                  </div>
                ) : (
                  <>
                    <div
                      className="mono"
                      style={{ fontSize: 38, fontWeight: 700, color: "#555", letterSpacing: -1 }}
                    >
                      —
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "#f59e0b",
                        marginTop: 6,
                        background: "rgba(245,158,11,0.08)",
                        border: "1px solid rgba(245,158,11,0.2)",
                        borderRadius: 8,
                        padding: "4px 10px",
                        display: "inline-block",
                      }}
                    >
                      Selecione uma região para ver o preço com frete
                    </div>
                  </>
                )
              ) : (
                <>
                  <div
                    className="mono"
                    style={{ fontSize: 38, fontWeight: 700, color: cor, letterSpacing: -1 }}
                  >
                    {brl(totalOutros)}
                  </div>
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
                </>
              )}

              {isAmapa && pctFreteAmapa !== null && pctFreteAmapa > 0 && (
                <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>
                  inclui {pctFreteAmapa}% de frete ({modalidade.toUpperCase()})
                </div>
              )}

              {/* ====== UI: COPY BUTTON — PREÇO PRINCIPAL ====== */}
              {(() => {
                const valorParaCopiar = isAmapa ? (totalAmapa ?? precoCanal) : totalOutros;
                const podecopiar = isAmapa ? totalAmapa !== null : true;
                return podecopiar ? (
                  <button
                    onClick={() => copiarPreco(valorParaCopiar)}
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
                ) : null;
              })()}
            </div>

            {/* ====== UI: SELETOR DE FRETE — não exibir para G.Paniz ====== */}
            {!isGpaniz && (
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

              {/* Pills FOB / CIF / Redespacho */}
              <div style={{ display: "flex", gap: 8, marginBottom: isAmapa && modalidade !== "fob" ? 16 : 0 }}>
                {(
                  [
                    { value: "fob" as ModalidadeFrete, label: "FOB", sub: "0%" },
                    { value: "cif" as ModalidadeFrete, label: "CIF", sub: isAmapa ? "var" : (freteCliente?.cif ? `${freteCliente.cif}%` : "—") },
                    { value: "redespacho" as ModalidadeFrete, label: "Redespacho", sub: isAmapa ? "var" : (freteCliente?.redespacho ? `${freteCliente.redespacho}%` : "—") },
                  ]
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
                      <div
                        className="mono"
                        style={{ fontSize: 11, color: ativo ? cor : "#555", marginTop: 2 }}
                      >
                        {opt.sub}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* ====== AMAPÁ: SELETOR DE REGIÃO ====== */}
              {isAmapa && modalidade !== "fob" && (
                <>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#555",
                      letterSpacing: 1,
                      textTransform: "uppercase",
                      marginBottom: 10,
                    }}
                  >
                    Região
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 6,
                    }}
                  >
                    {todasRegioes.map((r) => {
                      const pct =
                        modalidade === "cif" ? r.cif : r.redespacho;
                      const ativo = regiaoSelecionada === r.regiao;
                      return (
                        <button
                          key={r.regiao}
                          onClick={() => setRegiaoSelecionada(r.regiao)}
                          style={{
                            padding: "7px 10px",
                            borderRadius: 8,
                            border: `1px solid ${ativo ? cor : "#2e2e2e"}`,
                            background: ativo ? `${cor}18` : "transparent",
                            color: ativo ? cor : "#888",
                            cursor: "pointer",
                            textAlign: "left",
                            fontSize: 12,
                            transition: "all 150ms ease",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <span
                            style={{
                              fontWeight: 600,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {r.regiao}
                          </span>
                          <span
                            className="mono"
                            style={{ fontSize: 11, color: ativo ? cor : "#555", flexShrink: 0 }}
                          >
                            {pct != null ? `${pct}%` : "—"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
            )} {/* end !isGpaniz */}

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
                <>
                  <DetalheRow
                    label={`Preço canal (${canalDef.label} −${Math.round((1 - canalDef.fator) * 100)}%)`}
                    valor={brl(precoCanal)}
                    mono
                  />
                  <DetalheRow
                    label={`Frete ${pctFreteAmapa != null ? `(${pctFreteAmapa}%)` : ""}`}
                    valor={valorFreteAmapa != null ? brl(valorFreteAmapa) : "—"}
                    mono
                  />
                  <DetalheRow
                    label="Total c/ frete"
                    valor={totalAmapa != null ? brl(totalAmapa) : "—"}
                    mono
                  />
                  {ipi > 0 && (
                    <>
                      <DetalheRow label={`IPI (${ipi}%)`} valor={totalAmapa != null ? brl(valorIpi) : "—"} mono />
                      <DetalheRow label="Total c/ IPI" valor={totalAmapa != null ? brl(totalComIpi) : "—"} mono />
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
                      <DetalheRow label={`IPI (${ipi}%)`} valor={brl(valorIpi)} mono />
                      <DetalheRow label="Total c/ IPI" valor={brl(totalComIpi)} mono />
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
                      <DetalheRow label={`IPI (${ipi}%)`} valor={brl(valorIpi)} mono />
                      <DetalheRow label="Total c/ IPI" valor={brl(totalComIpi)} mono />
                    </>
                  )}
                </>
              )}
            </div>

            {/* ====== BERMAR: CONDIÇÃO DE PAGAMENTO — apenas informativo ====== */}
            {fabricaSlug === "bermar" && (
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
                <span style={{ fontSize: 13, color: "#888" }}>
                  Condição de pagamento:
                </span>
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
              <DetalheRow label="IPI" valor={ipi ? `${ipi}%` : "Sem IPI"} />
              <DetalheRow label="NCM" valor={produto?.ncm} mono />
              <DetalheRow label="EAN" valor={produto?.ean} mono />
              <DetalheRow label="Cód. Ref." valor={produto?.codigo} mono />
              <DetalheRow label="Cód. Fábrica" valor={produto?.id_fabrica} mono />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
