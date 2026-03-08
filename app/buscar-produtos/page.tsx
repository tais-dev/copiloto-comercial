"use client";

// ====== PRODUCT SEARCH — busca global multi-fábrica com contexto de cliente ======
import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { FABRICA_COR, FABRICA_LABEL } from "@/lib/types";
import { nomeCliente as formatNomeCliente } from "@/lib/utils";

// ====== TYPES LOCAIS ======
type ProdutoResult = {
  id: string;
  codigo: string | null;
  descricao: string;
  modelo: string | null;
  valor_unitario: number | null;
  fabrica: string;
  precoCalculado?: number | null;
  labelPreco?: string;
};

type ClienteOpcao = {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
};

type ClienteConfig = {
  fabrica: string;
  tabela: string | null;
  canal: string | null;
  regiao: string | null;
  modalidade_frete: string | null;
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

const FATOR_CANAL: Record<string, number> = {
  distribuidor: 0.55,
  revenda: 0.63,
  atacado: 0.69,
};

// ====== PRODUCT SEARCH — componente interno ======
function BuscarProdutosInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Busca
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<ProdutoResult[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [copiadoId, setCopiadoId] = useState<string | null>(null);

  // Cliente
  const [clientes, setClientes] = useState<ClienteOpcao[]>([]);
  const [clienteSelecionado, setClienteSelecionado] = useState<ClienteOpcao | null>(null);
  const [clienteConfigs, setClienteConfigs] = useState<ClienteConfig[]>([]);
  const [buscarCliente, setBuscarCliente] = useState("");
  const [dropdownAberto, setDropdownAberto] = useState(false);
  const [carregandoCliente, setCarregandoCliente] = useState(false);

  // Mapa UUIDs das fábricas
  const fabricaSlugToId = useRef<Record<string, string>>({});
  const fabricasCarregadas = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ====== SEARCH QUERY (SUPABASE) — inicializar fábricas + clientes ======
  useEffect(() => {
    async function init() {
      const { data: fabricasData } = await supabase.from("fabricas").select("id, nome");
      for (const f of fabricasData ?? []) {
        const slug = slugFromNome(f.nome);
        fabricaSlugToId.current[slug] = f.id;
      }
      fabricasCarregadas.current = true;

      const { data: clientesData } = await supabase
        .from("clientes")
        .select("id, razao_social, nome_fantasia")
        .eq("ativo", true)
        .order("razao_social");
      setClientes(clientesData ?? []);

      const clienteIdParam = searchParams.get("cliente_id");
      const storedId = sessionStorage.getItem("busca_cliente_id");
      const idToLoad = clienteIdParam ?? storedId;

      if (idToLoad && clientesData) {
        const found = clientesData.find((c) => c.id === idToLoad);
        if (found) await selecionarCliente(found);
      }

      inputRef.current?.focus();
    }

    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ====== CLIENTS (CRUD) — selecionar cliente e carregar configs ======
  async function selecionarCliente(cliente: ClienteOpcao) {
    setCarregandoCliente(true);
    setClienteSelecionado(cliente);
    setDropdownAberto(false);
    setBuscarCliente("");

    const nome = formatNomeCliente(cliente);
    sessionStorage.setItem("busca_cliente_id", cliente.id);
    sessionStorage.setItem("busca_cliente_nome", nome);

    const { data: configs } = await supabase
      .from("clientes_fabricas")
      .select("fabrica, tabela, canal, regiao, modalidade_frete")
      .eq("cliente_id", cliente.id);

    setClienteConfigs(configs ?? []);
    setCarregandoCliente(false);
  }

  function limparCliente() {
    setClienteSelecionado(null);
    setClienteConfigs([]);
    sessionStorage.removeItem("busca_cliente_id");
    sessionStorage.removeItem("busca_cliente_nome");
  }

  // ====== PRODUCT SEARCH — copia preço para clipboard ======
  function copiarPreco(e: React.MouseEvent, id: string, preco: number) {
    e.stopPropagation();
    navigator.clipboard.writeText(
      new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(preco)
    );
    setCopiadoId(id);
    setTimeout(() => setCopiadoId(null), 2000);
  }

  // ====== PRODUCT SEARCH — busca multi-fábrica com preço calculado ======
  const buscar = useCallback(async (t: string, configs: ClienteConfig[]) => {
    if (t.trim().length < 2) {
      setResultados([]);
      return;
    }
    if (!fabricasCarregadas.current) return;

    setBuscando(true);

    // ====== PRODUCT SEARCH: normalização do termo ======
    // Gera variações para cobrir casos como "AE05" ↔ "AE 05" e "BATEDEIRA5L" ↔ "BATEDEIRA 5L"
    function normalizarTermo(termo: string): string[] {
      const limpo = termo.trim();
      const semEspacos = limpo.replace(/\s+/g, "");
      // Insere espaço entre bloco de letras seguido de dígitos: "AE05" → "AE 05"
      const letraNum = semEspacos.replace(/([A-Za-z]+)(\d)/g, "$1 $2");
      // Insere espaço entre dígito seguido de letra: "05G" → "05 G"
      const numLetra = semEspacos.replace(/(\d)([A-Za-z])/g, "$1 $2");
      return [...new Set([limpo, semEspacos, letraNum, numLetra])];
    }

    const variacoes = normalizarTermo(t);
    const filtros = variacoes.flatMap((v) => [
      `descricao.ilike.%${v}%`,
      `codigo.ilike.%${v}%`,
    ]);
    const orFilter = filtros.join(",");

    const amapId = fabricaSlugToId.current["amapa"];
    const gpanizId = fabricaSlugToId.current["gpaniz"];
    const bermarId = fabricaSlugToId.current["bermar"];
    const gpanizCfg = configs.find((c) => c.fabrica === "gpaniz");

    const [resAmapa, resGpaniz, resBermar] = await Promise.all([
      amapId
        ? supabase
            .from("produtos")
            .select("id, codigo, descricao, valor_unitario")
            .eq("fabrica_id", amapId)
            .or(orFilter)
            .limit(20)
        : { data: [] },
      gpanizId
        ? (() => {
            let q = supabase
              .from("produtos")
              .select("id, codigo, descricao, valor_unitario")
              .eq("fabrica_id", gpanizId)
              .or(orFilter)
              .limit(20);
            if (gpanizCfg?.tabela) q = q.eq("tipo_tabela", gpanizCfg.tabela);
            return q;
          })()
        : { data: [] },
      bermarId
        ? supabase
            .from("produtos")
            .select("id, codigo, descricao, modelo, valor_unitario")
            .eq("fabrica_id", bermarId)
            .or(orFilter)
            .limit(20)
        : { data: [] },
    ]);

    const todos: ProdutoResult[] = [
      ...((resAmapa.data ?? []) as any[]).map((p) => ({
        id: p.id, codigo: p.codigo, descricao: p.descricao,
        modelo: null, valor_unitario: p.valor_unitario, fabrica: "amapa",
      })),
      ...((resGpaniz.data ?? []) as any[]).map((p) => ({
        id: p.id, codigo: p.codigo, descricao: p.descricao,
        modelo: null, valor_unitario: p.valor_unitario, fabrica: "gpaniz",
      })),
      ...((resBermar.data ?? []) as any[]).map((p) => ({
        id: p.id, codigo: p.codigo, descricao: p.descricao,
        modelo: p.modelo ?? null, valor_unitario: p.valor_unitario, fabrica: "bermar",
      })),
    ];

    // ====== ORDERS + INSTALLMENTS: calcular preço com contexto do cliente ======
    if (configs.length > 0) {
      const amapaCfg = configs.find((c) => c.fabrica === "amapa");
      let freteAmapaPct = 0;

      if (amapaCfg?.regiao && amapaCfg?.modalidade_frete && amapaCfg.modalidade_frete !== "fob") {
        const { data: freteData } = await supabase
          .from("regioes_frete")
          .select("cif, redespacho")
          .eq("fabrica_slug", "amapa")
          .eq("regiao", amapaCfg.regiao)
          .single();

        if (freteData) {
          freteAmapaPct = amapaCfg.modalidade_frete === "cif"
            ? (freteData.cif ?? 0)
            : (freteData.redespacho ?? 0);
        }
      }

      for (const p of todos) {
        if (p.fabrica === "amapa" && amapaCfg) {
          const fatorCanal = FATOR_CANAL[amapaCfg.canal ?? "atacado"] ?? 0.69;
          const precoCheio = (p.valor_unitario ?? 0) / 0.69;
          p.precoCalculado = precoCheio * fatorCanal * (1 + freteAmapaPct / 100);
          p.labelPreco = amapaCfg.modalidade_frete !== "fob" && amapaCfg.regiao
            ? `${amapaCfg.modalidade_frete?.toUpperCase()} ${amapaCfg.regiao}`
            : "FOB";
        } else if (p.fabrica === "bermar") {
          p.precoCalculado = p.valor_unitario;
          p.labelPreco = "preco unico";
        } else if (p.fabrica === "gpaniz") {
          p.precoCalculado = p.valor_unitario;
          p.labelPreco = gpanizCfg?.tabela ?? "normal";
        }
      }
    }

    setResultados(todos);
    setBuscando(false);
  }, []);

  // Debounce 300ms
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => buscar(termo, clienteConfigs), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [termo, clienteConfigs, buscar]);

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
      }}
    >
      {/* ====== UI: STICKY HEADER ====== */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: "#0f0f0f",
          borderBottom: "1px solid #2e2e2e",
          padding: "20px 20px 16px",
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 700, color: "#f0f0f0", marginBottom: 16 }}>
          Buscar Produtos
        </div>

        {/* Input de busca */}
        <input
          ref={inputRef}
          type="text"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Digite o produto..."
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "14px 16px",
            borderRadius: 14,
            border: `1px solid ${termo.length >= 2 ? "#00e5a040" : "#2e2e2e"}`,
            background: "#1a1a1a",
            color: "#f0f0f0",
            fontSize: 16,
            outline: "none",
            marginBottom: 12,
            transition: "border-color 150ms ease",
          }}
        />

        {/* ====== UI: SELETOR DE CLIENTE ====== */}
        <div style={{ position: "relative" }}>
          {clienteSelecionado ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "12px 16px",
                borderRadius: 14,
                border: "1px solid #2e2e2e",
                background: "#1a1a1a",
                minHeight: 48,
              }}
            >
              <span style={{ fontSize: 14, color: "#f0f0f0", flex: 1 }}>
                {carregandoCliente ? "Carregando..." : formatNomeCliente(clienteSelecionado)}
              </span>
              <button
                onClick={limparCliente}
                style={{
                  background: "none",
                  border: "none",
                  color: "#555",
                  fontSize: 20,
                  cursor: "pointer",
                  padding: 0,
                  lineHeight: 1,
                  flexShrink: 0,
                }}
              >
                ×
              </button>
            </div>
          ) : (
            <button
              onClick={() => setDropdownAberto((v) => !v)}
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: 14,
                border: `1px solid ${dropdownAberto ? "#3e3e3e" : "#2e2e2e"}`,
                background: "#1a1a1a",
                color: "#555",
                fontSize: 14,
                cursor: "pointer",
                textAlign: "left",
                minHeight: 48,
              }}
            >
              Selecionar cliente...
            </button>
          )}

          {dropdownAberto && !clienteSelecionado && (
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
                    onClick={() => selecionarCliente(c)}
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
                    {formatNomeCliente(c)}
                  </button>
                ))}
                {clientesFiltrados.length === 0 && (
                  <div style={{ padding: 16, color: "#555", fontSize: 14, textAlign: "center" }}>
                    Nenhum cliente encontrado
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ====== UI: RESULTADOS ====== */}
      <div style={{ padding: "16px 20px 48px" }}>
        {termo.trim().length > 0 && termo.trim().length < 2 && (
          <div style={{ color: "#555", fontSize: 14, textAlign: "center", marginTop: 32 }}>
            Digite pelo menos 2 caracteres para buscar.
          </div>
        )}

        {buscando && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 80, borderRadius: 12 }} />
            ))}
          </div>
        )}

        {!buscando && resultados.length > 0 && (
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
              Resultados ({resultados.length} encontrados)
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {resultados.map((p) => {
                const cor = FABRICA_COR[p.fabrica] ?? "#888";
                const label = FABRICA_LABEL[p.fabrica] ?? p.fabrica;
                const temCliente = !!clienteSelecionado;
                const precoMostrar = temCliente ? p.precoCalculado : p.valor_unitario;
                const labelMostrar = temCliente ? p.labelPreco : "base FOB";
                const foiCopiado = copiadoId === p.id;

                return (
                  // ====== UI: CARD RESULTADO — div em vez de button para evitar nested buttons ======
                  <div
                    key={`${p.fabrica}-${p.id}`}
                    onClick={() => {
                      if (clienteSelecionado) {
                        router.push(`/clientes/${clienteSelecionado.id}/produto/${p.id}`);
                      } else {
                        router.push(`/produto/${p.id}`);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        if (clienteSelecionado) {
                          router.push(`/clientes/${clienteSelecionado.id}/produto/${p.id}`);
                        } else {
                          router.push(`/produto/${p.id}`);
                        }
                      }
                    }}
                    style={{
                      width: "100%",
                      background: "#1a1a1a",
                      border: "1px solid #2e2e2e",
                      borderRadius: 12,
                      padding: "14px 16px",
                      cursor: "pointer",
                      textAlign: "left",
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      boxSizing: "border-box",
                    }}
                  >
                    {/* Linha 1: código + badge fábrica */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11, color: "#555", fontFamily: "monospace" }}>
                        {p.codigo ?? "—"}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: cor,
                          background: `${cor}18`,
                          border: `1px solid ${cor}30`,
                          borderRadius: 20,
                          padding: "1px 8px",
                          flexShrink: 0,
                        }}
                      >
                        {label}
                      </span>
                    </div>

                    {/* Linha 2: descrição — exibir completa, sem truncar */}
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: "#f0f0f0",
                        lineHeight: 1.4,
                      }}
                    >
                      {p.descricao}
                    </div>

                    {/* Modelo Bermar (ex: "BM 03 NR BIV") — só quando existir */}
                    {p.modelo && (
                      <div style={{ fontSize: 11, color: "#555", fontFamily: "monospace" }}>
                        {p.modelo}
                      </div>
                    )}

                    {/* Linha 3: preço + label + botão copiar */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                        <span
                          style={{
                            fontSize: 15,
                            fontWeight: 700,
                            color: cor,
                            fontFamily: "monospace",
                          }}
                        >
                          {brl(precoMostrar)}
                        </span>
                        {labelMostrar && (
                          <span style={{ fontSize: 11, color: "#555" }}>{labelMostrar}</span>
                        )}
                      </div>

                      {/* Botão copiar preço */}
                      {precoMostrar != null && (
                        <button
                          onClick={(e) => copiarPreco(e, p.id, precoMostrar)}
                          style={{
                            fontSize: 11,
                            color: foiCopiado ? "#00e5a0" : "#888",
                            border: `1px solid ${foiCopiado ? "#00e5a040" : "#2e2e2e"}`,
                            background: foiCopiado ? "#00e5a010" : "transparent",
                            borderRadius: 8,
                            padding: "4px 10px",
                            cursor: "pointer",
                            flexShrink: 0,
                            transition: "all 150ms ease",
                          }}
                        >
                          {foiCopiado ? "copiado" : "copiar"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {!buscando && termo.trim().length >= 2 && resultados.length === 0 && (
          <div style={{ color: "#555", fontSize: 14, textAlign: "center", marginTop: 48 }}>
            Nenhum produto encontrado para &ldquo;{termo}&rdquo;.
          </div>
        )}

        {!termo.trim() && (
          <div style={{ color: "#555", fontSize: 14, textAlign: "center", marginTop: 48 }}>
            Digite o nome ou codigo de um produto para buscar.
          </div>
        )}
      </div>
    </div>
  );
}

// ====== PRODUCT SEARCH — wrapper Suspense (useSearchParams) ======
export default function BuscarProdutosPage() {
  return (
    <Suspense fallback={null}>
      <BuscarProdutosInner />
    </Suspense>
  );
}
