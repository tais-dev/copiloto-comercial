"use client";

// ====== CLIENTS (CRUD) — TELA DE PRODUTOS DO CLIENTE ======
import { useEffect, useState, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { FABRICA_COR, FABRICA_LABEL } from "@/lib/types";
import { nomeCliente } from "@/lib/utils";

// ====== TYPES LOCAIS ======
type ClienteInfo = {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  canal: string | null;
  regiao: string | null;
  uf: string | null;
};

type ClienteFabricaEntry = {
  fabrica: string;
  tabela: string | null;
  regiao: string | null;
};

type ProdutoCard = {
  id: string;
  codigo: string | null;
  descricao: string;
  fabrica: string;
  preco: number | null;
  isAmapa: boolean;
};

// ====== HELPERS ======
function slugFromNome(nome: string): string {
  const n = nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (n.includes("amapa")) return "amapa";
  if (n.includes("paniz")) return "gpaniz";
  if (n.includes("bermar") || n.includes("gastromaq")) return "bermar";
  return n;
}

function brl(v: number | null) {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ====== UI: SKELETON ======
function Skeleton({ h }: { h: number }) {
  return (
    <div className="skeleton" style={{ height: h, borderRadius: 12, marginBottom: 8 }} />
  );
}

// ====== CLIENTS (CRUD) — PAGE PRODUTOS DO CLIENTE ======
export default function ClienteProdutosPage() {
  const params = useParams();
  const router = useRouter();
  const clienteId = params.id as string;

  const [cliente, setCliente] = useState<ClienteInfo | null>(null);
  const [clienteFabricas, setClienteFabricas] = useState<ClienteFabricaEntry[]>([]);
  const [produtosOutros, setProdutosOutros] = useState<ProdutoCard[]>([]); // G.Paniz + Bermar
  const [produtosAmapa, setProdutosAmapa] = useState<ProdutoCard[]>([]);
  const [busca, setBusca] = useState("");
  const [loadingInit, setLoadingInit] = useState(true);
  const [loadingAmapa, setLoadingAmapa] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [totalAmapa, setTotalAmapa] = useState(0);

  // Refs para re-query de Amapá sem re-montar o componente
  const amapaCfRef = useRef<ClienteFabricaEntry | null>(null);
  const amapaProdutosUUIDRef = useRef<string | null>(null);
  const carregadoRef = useRef(false);

  // ====== SEARCH QUERY (SUPABASE) — carga inicial: cliente + fabricas + G.Paniz/Bermar + Amapá ======
  useEffect(() => {
    async function carregar() {
      setLoadingInit(true);
      setErro(null);

      // 1. Cliente
      const { data: clienteData, error: clienteError } = await supabase
        .from("clientes")
        .select("id, razao_social, nome_fantasia, canal, regiao, uf")
        .eq("id", clienteId)
        .single();

      if (clienteError || !clienteData) {
        setErro("Cliente não encontrado.");
        setLoadingInit(false);
        return;
      }
      setCliente(clienteData);

      // 2. Fábricas do cliente
      const { data: cfData } = await supabase
        .from("clientes_fabricas")
        .select("fabrica, tabela, regiao")
        .eq("cliente_id", clienteId);

      const fabricasDoCliente: ClienteFabricaEntry[] = cfData ?? [];
      setClienteFabricas(fabricasDoCliente);

      // 3. Mapa fabrica_id (UUID) ↔ slug
      const { data: fabricasData } = await supabase
        .from("fabricas")
        .select("id, nome");

      const fabricaIdToSlug: Record<string, string> = {};
      const fabricaSlugToId: Record<string, string> = {};
      for (const f of fabricasData ?? []) {
        const slug = slugFromNome(f.nome);
        fabricaIdToSlug[f.id] = slug;
        fabricaSlugToId[slug] = f.id;
      }

      // 4. Amapá: guardar params em refs + carregar primeiros 100 produtos
      const amapaCf = fabricasDoCliente.find((cf) => cf.fabrica === "amapa") ?? null;
      const amapaProdutosUUID = fabricaSlugToId["amapa"] ?? null;
      amapaCfRef.current = amapaCf;
      amapaProdutosUUIDRef.current = amapaProdutosUUID;

      if (amapaCf && amapaProdutosUUID) {
        const { data: prodAmapa, count } = await supabase
          .from("produtos")
          .select("id, codigo, descricao, valor_unitario", { count: "exact" })
          .eq("fabrica_id", amapaProdutosUUID)
          .eq("tipo_tabela", amapaCf.tabela ?? "normal")
          .order("descricao")
          .limit(100);

        setTotalAmapa(count ?? 0);
        setProdutosAmapa(
          (prodAmapa ?? [])
            .filter((p) => p.descricao)
            .map((p) => ({
              id: p.id,
              codigo: p.codigo,
              descricao: p.descricao,
              fabrica: "amapa",
              preco: p.valor_unitario,
              isAmapa: true,
            }))
        );
      }

      // ====== BERMAR — preço base em produtos.valor_unitario (tabela universal) ======
      const bermarCf = fabricasDoCliente.find((cf) => cf.fabrica === "bermar");
      const bermarProdutosUUID = fabricaSlugToId["bermar"];
      const outros: ProdutoCard[] = [];

      if (bermarCf && bermarProdutosUUID) {
        const { data: prodBermar } = await supabase
          .from("produtos")
          .select("id, codigo, descricao, valor_unitario")
          .eq("fabrica_id", bermarProdutosUUID)
          .eq("tipo_tabela", bermarCf.tabela ?? "normal")
          .order("descricao");

        for (const p of prodBermar ?? []) {
          if (!p.descricao) continue;
          outros.push({
            id: p.id,
            codigo: p.codigo,
            descricao: p.descricao,
            fabrica: "bermar",
            preco: p.valor_unitario,
            isAmapa: false,
          });
        }
      }

      // ====== ORDERS + INSTALLMENTS: G.PANIZ — preço negociado via precos_cliente ======
      // Amapá e Bermar têm tabela universal (já carregados acima via produtos)
      const { data: precosData } = await supabase
        .from("precos_cliente")
        .select(`
          preco_vigente,
          produto_id,
          produtos (
            id,
            codigo,
            descricao,
            fabrica_id
          )
        `)
        .eq("cliente_id", clienteId);
      for (const p of precosData ?? []) {
        const prod = (p as any).produtos;
        if (!prod?.descricao) continue;
        const fabSlug = fabricaIdToSlug[prod.fabrica_id] ?? "outros";
        if (fabSlug === "amapa" || fabSlug === "bermar") continue; // já carregados acima
        outros.push({
          id: prod.id,
          codigo: prod.codigo,
          descricao: prod.descricao,
          fabrica: fabSlug,
          preco: p.preco_vigente,
          isAmapa: false,
        });
      }
      setProdutosOutros(outros);

      carregadoRef.current = true;
      setLoadingInit(false);
    }

    carregar();
  }, [clienteId]);

  // ====== PRODUCT SEARCH: AMAPÁ — busca server-side quando term muda ======
  useEffect(() => {
    if (!carregadoRef.current) return;
    if (!amapaCfRef.current || !amapaProdutosUUIDRef.current) return;

    async function buscarAmapa() {
      setLoadingAmapa(true);

      let query = supabase
        .from("produtos")
        .select("id, codigo, descricao, valor_unitario", { count: "exact" })
        .eq("fabrica_id", amapaProdutosUUIDRef.current!)
        .eq("tipo_tabela", amapaCfRef.current!.tabela ?? "normal")
        .order("descricao")
        .limit(100);

      if (busca.trim()) {
        query = query.or(
          `descricao.ilike.%${busca.trim()}%,codigo.ilike.%${busca.trim()}%`
        );
      }

      const { data, count } = await query;
      setTotalAmapa(count ?? 0);
      setProdutosAmapa(
        (data ?? [])
          .filter((p) => p.descricao)
          .map((p) => ({
            id: p.id,
            codigo: p.codigo,
            descricao: p.descricao,
            fabrica: "amapa",
            preco: p.valor_unitario,
            isAmapa: true,
          }))
      );
      setLoadingAmapa(false);
    }

    buscarAmapa();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca]);

  // ====== PRODUCT SEARCH — filtro client-side para G.Paniz / Bermar ======
  const filtrado = useMemo(() => {
    const outrosFiltrados = busca.trim()
      ? produtosOutros.filter(
          (p) =>
            p.descricao.toLowerCase().includes(busca.toLowerCase()) ||
            (p.codigo ?? "").toLowerCase().includes(busca.toLowerCase())
        )
      : produtosOutros;
    return [...produtosAmapa, ...outrosFiltrados];
  }, [produtosAmapa, produtosOutros, busca]);

  // Agrupar por fábrica
  const ORDEM_FABRICAS = ["amapa", "gpaniz", "bermar"] as const;
  const porFabrica = filtrado.reduce<Record<string, ProdutoCard[]>>((acc, p) => {
    if (!acc[p.fabrica]) acc[p.fabrica] = [];
    acc[p.fabrica].push(p);
    return acc;
  }, {});

  const nomeMostrado = cliente ? nomeCliente(cliente) : "Cliente";
  const loading = loadingInit;

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
          borderBottom: "1px solid #2e2e2e",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "16px 20px 12px",
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
              <div className="skeleton" style={{ height: 20, width: "60%", borderRadius: 6 }} />
            ) : (
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 700,
                  color: "#f0f0f0",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {nomeMostrado}
              </div>
            )}

            {!loading && clienteFabricas.length > 0 && (
              <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                {clienteFabricas.map((cf, i) => {
                  const cor = FABRICA_COR[cf.fabrica] ?? "#888";
                  return (
                    <span
                      key={i}
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: cor,
                        background: `${cor}18`,
                        border: `1px solid ${cor}40`,
                        borderRadius: 20,
                        padding: "1px 6px",
                      }}
                    >
                      {FABRICA_LABEL[cf.fabrica] ?? cf.fabrica}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div style={{ padding: "0 20px 16px" }}>
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar produto por nome ou código..."
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "10px 16px",
              borderRadius: 10,
              border: "1px solid #2e2e2e",
              background: "#1a1a1a",
              color: "#f0f0f0",
              fontSize: 14,
              outline: "none",
            }}
          />
        </div>
      </div>

      {/* ====== UI: CONTEÚDO ====== */}
      <div style={{ padding: "16px 0 40px" }}>
        {erro && (
          <div
            style={{
              margin: "0 20px",
              padding: "14px 16px",
              borderRadius: 12,
              background: "#1a1a1a",
              border: "1px solid #f59e0b40",
              color: "#f59e0b",
              fontSize: 14,
            }}
          >
            {erro}
          </div>
        )}

        {loading && (
          <div style={{ padding: "0 20px" }}>
            {[...Array(6)].map((_, i) => <Skeleton key={i} h={72} />)}
          </div>
        )}

        {!loading && !erro && (
          <>
            {Object.keys(porFabrica).length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  color: "#555",
                  fontSize: 14,
                  marginTop: 48,
                }}
              >
                {busca ? "Nenhum produto encontrado para esta busca." : "Nenhum produto cadastrado para este cliente."}
              </div>
            ) : (
              ORDEM_FABRICAS.filter((fab) => (porFabrica[fab]?.length ?? 0) > 0).map((fab) => {
                const itens = porFabrica[fab];
                const cor = FABRICA_COR[fab] ?? "#888";
                const label = FABRICA_LABEL[fab] ?? fab;

                return (
                  <div key={fab} style={{ marginBottom: 28 }}>
                    {/* ====== UI: SEPARADOR DE FÁBRICA ====== */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "0 20px",
                        marginBottom: 12,
                      }}
                    >
                      <div
                        style={{
                          width: 3,
                          height: 16,
                          borderRadius: 2,
                          background: cor,
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: cor,
                          letterSpacing: 0.5,
                          textTransform: "uppercase",
                        }}
                      >
                        {label}
                      </span>
                      <span style={{ fontSize: 12, color: "#555" }}>
                        {loadingAmapa && fab === "amapa" ? (
                          "Buscando..."
                        ) : (
                          <>
                            {itens.length} produto{itens.length !== 1 ? "s" : ""}
                            {/* Amapá: indica quando mostrando parcial */}
                            {fab === "amapa" && !busca && totalAmapa > 100 && (
                              <span style={{ color: "#444", marginLeft: 6 }}>
                                · use a busca para filtrar ({totalAmapa.toLocaleString("pt-BR")} no total)
                              </span>
                            )}
                            {fab === "amapa" && busca && totalAmapa > 100 && (
                              <span style={{ color: "#444", marginLeft: 6 }}>
                                · {totalAmapa.toLocaleString("pt-BR")} encontrados, mostrando 100
                              </span>
                            )}
                          </>
                        )}
                      </span>
                    </div>

                    {/* ====== UI: CARDS DE PRODUTOS ====== */}
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                        padding: "0 20px",
                      }}
                    >
                      {(loadingAmapa && fab === "amapa"
                        ? [] // oculta cards durante re-busca Amapá
                        : itens
                      ).map((p) => (
                        <button
                          key={p.id}
                          onClick={() =>
                            router.push(`/clientes/${clienteId}/produto/${p.id}`)
                          }
                          style={{
                            width: "100%",
                            background: "#1a1a1a",
                            border: "1px solid #2e2e2e",
                            borderRadius: 12,
                            padding: "14px 16px",
                            cursor: "pointer",
                            textAlign: "left",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 12,
                            transition: "border-color 200ms ease",
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.borderColor = "#3e3e3e";
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.borderColor = "#2e2e2e";
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {p.codigo && (
                              <div
                                className="mono"
                                style={{ fontSize: 11, color: "#555", marginBottom: 2 }}
                              >
                                {p.codigo}
                              </div>
                            )}
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
                              {p.descricao}
                            </div>
                            {p.isAmapa && (
                              <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
                                Base FOB
                              </div>
                            )}
                          </div>

                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            <div className="mono" style={{ fontSize: 15, fontWeight: 600, color: cor }}>
                              {brl(p.preco)}
                            </div>
                            <div style={{ color: "#555", fontSize: 16, marginTop: 2 }}>›</div>
                          </div>
                        </button>
                      ))}

                      {/* Skeleton durante busca Amapá */}
                      {loadingAmapa && fab === "amapa" && (
                        <>
                          {[...Array(4)].map((_, i) => <Skeleton key={i} h={64} />)}
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}
      </div>
    </div>
  );
}
