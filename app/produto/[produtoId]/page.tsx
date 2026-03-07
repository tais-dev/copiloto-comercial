"use client";

// ====== PRODUCT SEARCH — DETALHE DO PRODUTO SEM CLIENTE ======
import { useEffect, useState, useRef, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { FABRICA_COR, FABRICA_LABEL } from "@/lib/types";

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

// ====== PRODUCT SEARCH — componente interno ======
function ProdutoDetalheInner() {
  const params = useParams();
  const router = useRouter();
  const produtoId = params.produtoId as string;

  const [produto, setProduto] = useState<DadosProduto | null>(null);
  const [fabricaSlug, setFabricaSlug] = useState<string>("");
  const [gpanizPrecos, setGpanizPrecos] = useState<GpanizPreco[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // ====== UI: COPY BUTTON ======
  const [copiadoCardId, setCopiadoCardId] = useState<string | null>(null);
  const [copiadoAmapa, setCopiadoAmapa] = useState(false);
  const [copiadoBermar, setCopiadoBermar] = useState(false);

  function copiarValor(valor: number, setCopied: (v: boolean) => void) {
    navigator.clipboard.writeText(
      new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor)
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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

      // 2. Slug da fábrica
      const { data: fabricaData } = await supabase
        .from("fabricas")
        .select("nome")
        .eq("id", prodData.fabrica_id)
        .single();

      const slug = fabricaData ? slugFromNome(fabricaData.nome) : "";
      setFabricaSlug(slug);

      // 3. G.Paniz: buscar preços nas 3 tabelas pelo código
      if (slug === "gpaniz" && prodData.codigo) {
        const { data: precosData } = await supabase
          .from("produtos")
          .select("id, valor_unitario, valor_com_frete, tipo_tabela")
          .eq("fabrica_id", prodData.fabrica_id)
          .eq("codigo", prodData.codigo);
        setGpanizPrecos(precosData ?? []);
      }

      // 4. Amapá: carregar lista de clientes para seletor
      if (slug === "amapa") {
        const { data: clientesData } = await supabase
          .from("clientes")
          .select("id, razao_social, nome_fantasia")
          .eq("ativo", true)
          .order("razao_social");
        setClientes(clientesData ?? []);
      }

      setLoading(false);
    }

    carregar();
  }, [produtoId]);

  const cor = FABRICA_COR[fabricaSlug] ?? "#888";
  const fabLabel = FABRICA_LABEL[fabricaSlug] ?? fabricaSlug;

  const clientesFiltrados = buscarCliente.trim()
    ? clientes.filter((c) => {
        const t = buscarCliente.toLowerCase();
        return (
          c.razao_social.toLowerCase().includes(t) ||
          (c.nome_fantasia ?? "").toLowerCase().includes(t)
        );
      })
    : clientes;

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
          <div style={{ fontSize: 12, color: cor, fontWeight: 600, marginTop: 2 }}>
            {fabLabel}
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

            {/* ====== AMAPÁ: FOB + SELECIONAR CLIENTE ====== */}
            {fabricaSlug === "amapa" && (
              <>
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
                  <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>
                    Base FOB
                  </div>
                  <div
                    className="mono"
                    style={{ fontSize: 38, fontWeight: 700, color: cor, letterSpacing: -1 }}
                  >
                    {brl(produto?.valor_unitario)}
                  </div>
                  {/* ====== UI: COPY BUTTON — AMAPÁ ====== */}
                  {produto?.valor_unitario != null && (
                    <button
                      onClick={() => copiarValor(produto.valor_unitario!, setCopiadoAmapa)}
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
                      {copiadoAmapa ? "copiado ✓" : "copiar FOB"}
                    </button>
                  )}
                </div>

                {/* Aviso para selecionar cliente */}
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
                    Selecione um cliente para calcular
                  </div>
                  <div style={{ fontSize: 13, color: "#f59e0b", opacity: 0.8 }}>
                    o preco com canal e frete
                  </div>
                </div>

                {/* ====== UI: SELETOR DE CLIENTE (AMAPÁ) ====== */}
                <div style={{ position: "relative", marginBottom: 16 }}>
                  <button
                    onClick={() => setDropdownAberto((v) => !v)}
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
                      textAlign: "left",
                      minHeight: 52,
                    }}
                  >
                    Selecionar cliente
                  </button>

                  {dropdownAberto && (
                    <div
                      style={{
                        position: "absolute",
                        top: "calc(100% + 4px)",
                        left: 0,
                        right: 0,
                        background: "#1a1a1a",
                        border: "1px solid #2e2e2e",
                        borderRadius: 12,
                        zIndex: 30,
                        overflow: "hidden",
                      }}
                    >
                      <div style={{ padding: 8 }}>
                        <input
                          type="text"
                          value={buscarCliente}
                          onChange={(e) => setBuscarCliente(e.target.value)}
                          placeholder="Buscar cliente..."
                          autoFocus
                          style={{
                            width: "100%",
                            boxSizing: "border-box",
                            padding: "10px 12px",
                            borderRadius: 8,
                            border: "1px solid #2e2e2e",
                            background: "#242424",
                            color: "#f0f0f0",
                            fontSize: 14,
                            outline: "none",
                          }}
                        />
                      </div>
                      <div style={{ maxHeight: 240, overflowY: "auto" }}>
                        {clientesFiltrados.slice(0, 30).map((c) => (
                          <button
                            key={c.id}
                            onClick={() =>
                              router.push(`/clientes/${c.id}/produto/${produtoId}`)
                            }
                            style={{
                              width: "100%",
                              padding: "12px 16px",
                              background: "none",
                              border: "none",
                              borderTop: "1px solid #242424",
                              color: "#f0f0f0",
                              fontSize: 14,
                              cursor: "pointer",
                              textAlign: "left",
                              minHeight: 48,
                            }}
                          >
                            {c.nome_fantasia || c.razao_social}
                          </button>
                        ))}
                        {clientesFiltrados.length === 0 && (
                          <div
                            style={{
                              padding: 16,
                              color: "#555",
                              fontSize: 14,
                              textAlign: "center",
                            }}
                          >
                            Nenhum cliente encontrado
                          </div>
                        )}
                      </div>
                    </div>
                  )}
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
                valor={produto?.ipi ? `${produto.ipi}%` : "Sem IPI"}
              />
              <DetalheRow label="NCM" valor={produto?.ncm} mono />
              <DetalheRow label="EAN" valor={produto?.ean} mono />
              <DetalheRow label="Cod." valor={produto?.codigo} mono />
              <DetalheRow label="Cod. Fabrica" valor={produto?.id_fabrica} mono />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ====== PRODUCT SEARCH — wrapper Suspense (useSearchParams) ======
export default function ProdutoDetalheSemClientePage() {
  return (
    <Suspense fallback={null}>
      <ProdutoDetalheInner />
    </Suspense>
  );
}
