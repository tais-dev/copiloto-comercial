"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// ====== TYPES ======

type Fabrica = { id: string; nome: string; prazo_label: string | null };

type Produto = {
  id: string;
  fabrica_id: string | null;
  fabricante?: string | null;
  codigo: string | null;
  descricao: string;
  preco: number | null;
  unidade: string | null;
  valor_unitario?: number | null;
  valor_com_frete?: number | null;
  tipo_tabela?: string | null; // ecommerce | especial | normal
};

// Grupo: um produto (codigo + fabricante) com todas as tabelas de preço disponíveis
type ProdutoGrupo = {
  chave: string;
  fabricante: string;
  fabrica_id: string | null;
  prazo_label: string | null;
  codigo: string | null;
  descricao: string;
  unidade: string | null;
  tabelas: {
    tipo_tabela: string | null;
    valor_unitario: number | null;
    valor_com_frete: number | null;
  }[];
};

// ====== HELPERS ======

function money(v: number | null | undefined) {
  if (v === null || v === undefined) return "-";
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
  } catch {
    return String(v);
  }
}

// Label amigável para tipo_tabela
function labelTipo(tipo: string | null | undefined) {
  if (!tipo) return "Tabela";
  const map: Record<string, string> = {
    ecommerce: "Ecommerce",
    especial: "Especial",
    normal: "Normal",
  };
  return map[tipo.toLowerCase()] ?? tipo;
}

// ====== PRODUCT SEARCH: AGRUPAMENTO POR TABELA ======
// Agrupa linhas de produto pelo par (fabrica_id || fabricante, codigo).
// Cada grupo representa um produto único com N linhas de preço (uma por tipo_tabela).
function agruparProdutos(rows: Produto[], fabricaPorId: Map<string, Fabrica>): ProdutoGrupo[] {
  const map = new Map<string, ProdutoGrupo>();

  for (const p of rows) {
    const nomeTexto = (p.fabricante ?? "").trim();
    const fab = p.fabrica_id ? fabricaPorId.get(p.fabrica_id) : null;
    const nomeFab = nomeTexto || fab?.nome || "Fábrica";
    const chave = `${p.fabrica_id ?? nomeFab}__${p.codigo ?? p.descricao}`;

    if (!map.has(chave)) {
      map.set(chave, {
        chave,
        fabricante: nomeFab,
        fabrica_id: p.fabrica_id,
        prazo_label: fab?.prazo_label ?? null,
        codigo: p.codigo,
        descricao: p.descricao,
        unidade: p.unidade,
        tabelas: [],
      });
    }

    const grupo = map.get(chave)!;

    // Evita duplicar a mesma tipo_tabela dentro do grupo
    const jaExiste = grupo.tabelas.some((t) => t.tipo_tabela === (p.tipo_tabela ?? null));
    if (!jaExiste) {
      grupo.tabelas.push({
        tipo_tabela: p.tipo_tabela ?? null,
        valor_unitario: p.valor_unitario ?? p.preco ?? null,
        valor_com_frete: p.valor_com_frete ?? null,
      });
    }
  }

  return Array.from(map.values());
}

// ====== WHATSAPP: MONTAR TEXTO DE RESPOSTA ======
function montarTextoResposta(g: ProdutoGrupo): string {
  const linhaCodigo = g.codigo ? `${g.codigo} — ` : "";
  const linhaUnidade = g.unidade ? ` (${g.unidade})` : "";

  const linhasPreco = g.tabelas
    .map((t) => {
      const vistaStr = `À vista: ${money(t.valor_unitario)}`;
      const prazoStr = t.valor_com_frete != null
        ? `  |  ${g.prazo_label ?? "A prazo"}: ${money(t.valor_com_frete)}`
        : "";
      return `${vistaStr}${prazoStr}`;
    })
    .join("\n");

  return (
    `Encontrei aqui ✅\n` +
    `Fábrica: ${g.fabricante}\n` +
    `${linhaCodigo}${g.descricao}${linhaUnidade}\n\n` +
    `${linhasPreco}\n\n` +
    `Quer que eu já monte a cotação com quantidade e condição de pagamento?`
  );
}

// ====== MAIN PAGE ======

export default function Home() {
  const [fabricas, setFabricas] = useState<Fabrica[]>([]);
  const [fabricaId, setFabricaId] = useState("");
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<Produto[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null); // chave do grupo copiado

  // Mapa id -> nome da fábrica
  const fabricaPorId = useMemo(() => {
    const m = new Map<string, Fabrica>();
    for (const f of fabricas) m.set(f.id, f);
    return m;
  }, [fabricas]);

  // ====== PRODUCT SEARCH: AGRUPAMENTO ======
  const grupos = useMemo(
    () => agruparProdutos(resultados, fabricaPorId),
    [resultados, fabricaPorId]
  );

  useEffect(() => {
    async function loadFabricas() {
      const { data, error } = await supabase.from("fabricas").select("*").order("nome");
      if (error) return;
      if (data) setFabricas(data as Fabrica[]);
    }
    loadFabricas();
  }, []);

  const dica = useMemo(
    () =>
      `Dica: busque por código (ex.: FT-200) ou descrição (ex.: coifa 1.20). Selecione uma fábrica para filtrar.`,
    []
  );

  // ====== SEARCH QUERY (SUPABASE) ======
  const buscar = async () => {
    setErro(null);
    setResultados([]);
    setCopiado(null);

    const t = termo.trim();
    if (!t) {
      setErro("Digite um termo para buscar (código ou descrição).");
      return;
    }

    setCarregando(true);

    try {
      // Normalização: separa letras de números (cc500 -> cc 500)
      const normalized = t
        .trim()
        .replace(/[-_]/g, " ")
        .replace(/([A-Za-z])(\d)/g, "$1 $2")
        .replace(/(\d)([A-Za-z])/g, "$1 $2");

      const parts = normalized.split(/\s+/).filter(Boolean);

      // Limpa caracteres que quebram a sintaxe do PostgREST
      const safeParts = parts
        .map((p) => p.replace(/[*(),]/g, "").trim())
        .filter(Boolean);

      const spaced = safeParts.join(" ");   // "CC 500"
      const compact = safeParts.join("");   // "CC500"
      const seq = safeParts.join("%");      // "CC%500"

      const orParts = [
        `codigo.ilike.*${spaced}*`,
        `descricao.ilike.*${spaced}*`,
        `codigo.ilike.*${compact}*`,
        `descricao.ilike.*${compact}*`,
        `codigo.ilike.*${seq}*`,
        `descricao.ilike.*${seq}*`,
      ].join(",");

      let q = supabase.from("produtos").select("*").limit(120);

      if (fabricaId) {
        q = q.eq("fabrica_id", fabricaId);
      }

      q = q.or(orParts);

      const { data, error } = await q;

      if (error) {
        setErro(error.message);
        return;
      }

      setResultados((data ?? []) as Produto[]);

      if (!data || data.length === 0) {
        setErro("Não encontrei nenhum item com esse termo.");
      }
    } finally {
      setCarregando(false);
    }
  };

  // ====== WHATSAPP: COPIAR RESPOSTA ======
  const copiarResposta = (g: ProdutoGrupo) => {
    const texto = montarTextoResposta(g);
    navigator.clipboard.writeText(texto);

    // Feedback visual temporário
    setCopiado(g.chave);
    setTimeout(() => setCopiado(null), 2000);
  };

  // ====== UI ======
  return (
    <div
      style={{
        padding: 24,
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
      }}
    >
      <div style={{ maxWidth: 860, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ margin: 0, fontSize: 26, letterSpacing: -0.5, color: "#0F172A", fontWeight: 900 }}>
            Consulta de Preços
          </h1>
          <p style={{ marginTop: 6, color: "#6B7280", fontSize: 14, margin: "4px 0 0" }}>
            Busque por código ou descrição em todas as fábricas.
          </p>
        </div>

        {/* ====== UI: PAINEL DE BUSCA ====== */}
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
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: "#0F172A" }}>
            Consulta rápida de catálogo
          </h2>

          <p style={{ marginTop: 8, color: "#374151", fontSize: 14 }}>{dica}</p>

          {/* Filtro por fábrica */}
          <select
            value={fabricaId}
            onChange={(e) => setFabricaId(e.target.value)}
            style={{
              width: "100%",
              marginTop: 12,
              padding: 14,
              borderRadius: 14,
              border: "1px solid #D1D5DB",
              fontSize: 16,
              fontWeight: 800,
              background: "#FFFFFF",
              color: "#111827",
              outline: "none",
            }}
          >
            <option value="">Todas as fábricas</option>
            {fabricas.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>

          {/* Campo de busca + botão */}
          <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
            <input
              placeholder="Buscar por código ou descrição (ex.: FT-200 / coifa 1.20)"
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") buscar(); }}
              style={{
                flex: 1,
                minWidth: 240,
                padding: 14,
                borderRadius: 14,
                border: "1px solid #D1D5DB",
                fontSize: 16,
                background: "#FFFFFF",
                color: "#111827",
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
                fontSize: 16,
                cursor: "pointer",
                opacity: carregando ? 0.7 : 1,
              }}
            >
              {carregando ? "Buscando..." : "Buscar"}
            </button>
          </div>

          {/* Erro */}
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

          {/* ====== UI: RESULTADOS AGRUPADOS ====== */}
          {grupos.length > 0 && (
            <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
              {/* Contagem */}
              <div style={{ fontSize: 13, color: "#6B7280", fontWeight: 700 }}>
                {grupos.length} produto{grupos.length !== 1 ? "s" : ""} encontrado{grupos.length !== 1 ? "s" : ""}
              </div>

              {grupos.map((g) => {
                const foiCopiado = copiado === g.chave;

                return (
                  <div
                    key={g.chave}
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
                    {/* Info do produto */}
                    <div style={{ minWidth: 240, flex: 1 }}>

                      {/* Código + descrição */}
                      <div style={{ fontWeight: 900, fontSize: 16, color: "#0F172A" }}>
                        {g.codigo ? `${g.codigo} — ` : ""}
                        {g.descricao}
                      </div>

                      {/* Fábrica */}
                      <div style={{ marginTop: 4, fontSize: 13, fontWeight: 700, color: "#6B7280" }}>
                        {g.fabricante}
                        {g.unidade ? ` • ${g.unidade}` : ""}
                      </div>

                      {/* ====== UI: PREÇOS POR TABELA ====== */}
                      <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                        {g.tabelas.map((t, i) => (
                          <div
                            key={i}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 3,
                              padding: "8px 10px",
                              borderRadius: 10,
                              background: "#F8FAFC",
                              border: "1px solid #E2E8F0",
                            }}
                          >
                            {/* Label da tabela */}
                            <span style={{ fontSize: 12, fontWeight: 800, color: "#64748B", letterSpacing: 0.3 }}>
                              Tabela: {labelTipo(t.tipo_tabela)}
                            </span>

                            {/* Preços na mesma linha */}
                            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "baseline" }}>
                              {/* À vista */}
                              <span style={{ fontSize: 13, color: "#374151", fontWeight: 700 }}>
                                À vista:{" "}
                                <span style={{ fontWeight: 900, fontSize: 15, color: "#111827" }}>
                                  {money(t.valor_unitario)}
                                </span>
                              </span>

                              {/* Prazo (se existir) */}
                              {t.valor_com_frete != null && (
                                <span style={{ fontSize: 13, color: "#374151", fontWeight: 700 }}>
                                  {g.prazo_label ?? "A prazo"}:{" "}
                                  <span style={{ fontWeight: 900, fontSize: 15, color: "#111827" }}>
                                    {money(t.valor_com_frete)}
                                  </span>
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Botão copiar */}
                    <button
                      onClick={() => copiarResposta(g)}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 14,
                        border: foiCopiado ? "1px solid #86EFAC" : "1px solid #E5E7EB",
                        background: foiCopiado ? "#ECFDF5" : "#FFFFFF",
                        color: foiCopiado ? "#065F46" : "#111827",
                        fontWeight: 900,
                        fontSize: 15,
                        cursor: "pointer",
                        minWidth: 160,
                        transition: "background 0.2s",
                      }}
                    >
                      {foiCopiado ? "Copiado ✅" : "Copiar resposta"}
                    </button>
                  </div>
                );
              })}
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
    </div>
  );
}
