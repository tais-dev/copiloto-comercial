"use client";

// ====== IMPORT (CSV -> STAGING -> UPSERT): TELA DE UPLOAD DE TABELAS ======
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// ====== TYPES ======
type FabricaSlug = "amapa" | "gpaniz" | "bermar";
type TipoTabela = "normal" | "especial" | "ecommerce";

type DeteccaoArquivo = {
  fabrica: FabricaSlug | null;
  fabricaNome: string;
  tipoTabela: TipoTabela;
  clienteEstimado: string;
  confianca: "alta" | "media" | "baixa";
  aviso?: string;
};

type FileItem = DeteccaoArquivo & {
  id: string;
  file: File;
  fabricaOverride: FabricaSlug | null;
  tipoTabelaOverride: TipoTabela | null;
  status: "pending" | "importing" | "done" | "error";
  resultado: string | null;
  erro: string | null;
};

// Catalog types
type ResumoLinha = {
  fabrica_slug: string;
  tipo_tabela: string;
  total: number;
};

type ResumoGrupo = {
  fabrica_slug: string;
  tabelas: { tipo_tabela: string; total: number }[];
};

// ====== HELPERS ======
const FABRICA_COR: Record<string, string> = {
  amapa: "#00e5a0",
  gpaniz: "#60a5fa",
  bermar: "#fb923c",
};

const TIPO_LABEL: Record<string, string> = {
  normal: "Normal",
  especial: "Especial",
  ecommerce: "E-commerce",
};

// Formata nome da loja Obramax a partir do slug: 'obramax_cariacica_es' → 'Cariacica Es'
function nomeLoja(tipo: string): string {
  return tipo
    .replace("obramax_", "")
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

function agruparResumo(linhas: ResumoLinha[]): ResumoGrupo[] {
  const map = new Map<string, ResumoGrupo>();
  for (const l of linhas) {
    if (!map.has(l.fabrica_slug)) {
      map.set(l.fabrica_slug, { fabrica_slug: l.fabrica_slug, tabelas: [] });
    }
    map.get(l.fabrica_slug)!.tabelas.push({ tipo_tabela: l.tipo_tabela, total: l.total });
  }
  return Array.from(map.values()).sort((a, b) =>
    a.fabrica_slug.localeCompare(b.fabrica_slug, "pt-BR")
  );
}

// ====== PRODUCT SEARCH: DETECÇÃO AUTOMÁTICA DE FÁBRICA PELO NOME DO ARQUIVO ======
function extrairNomeAmapa(filename: string): string {
  let nome = filename;
  nome = nome.replace(/\.(xlsx|xls|csv)$/i, "");
  nome = nome.replace(/^planilha[_\s]*amapa[_\s]*/i, "");
  nome = nome.replace(
    /[_\s]*(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)[_\s]*\d{2,4}$/i,
    ""
  );
  nome = nome.replace(/[_\s]*\d{4}$/, "");
  nome = nome.replace(/__+/g, "_").replace(/^_|_$/g, "");
  if (!nome) return "Desconhecido";
  return nome
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w) =>
      w.toLowerCase() === "e"
        ? "e"
        : w.length <= 2 && /^[A-Za-z]+$/.test(w)
        ? w.toUpperCase()
        : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    )
    .join(" ");
}

function detectarPlanilha(filename: string): DeteccaoArquivo {
  const upper = filename.toUpperCase();

  // Bermar / Gastromaq
  if (upper.includes("BERMAR") || upper.includes("GASTROMAQ")) {
    return {
      fabrica: "bermar",
      fabricaNome: "Bermar",
      tipoTabela: "normal",
      clienteEstimado: "Geral",
      confianca: "alta",
    };
  }

  // Amapá — tabela geral (TABELA_AMAPA_...): catálogo completo, importar como "Amapá Geral"
  if ((upper.includes("AMAPA") || upper.includes("AMAPÁ")) && upper.startsWith("TABELA")) {
    return {
      fabrica: "amapa",
      fabricaNome: "Amapá",
      tipoTabela: "normal",
      clienteEstimado: "Amapá Geral",
      confianca: "alta",
    };
  }

  // Amapá — planilha por cliente (PLANILHA_AMAPA_...): extrair nome do cliente
  if (upper.includes("AMAPA") || upper.includes("AMAPÁ")) {
    const clienteEstimado = extrairNomeAmapa(filename);
    return {
      fabrica: "amapa",
      fabricaNome: "Amapá",
      tipoTabela: "normal",
      clienteEstimado,
      confianca: clienteEstimado !== "Desconhecido" ? "alta" : "media",
    };
  }

  // G.Paniz
  if (upper.includes("PANIZ") || upper.includes("GPANIZ")) {
    if (
      upper.includes("ESPECIAL") ||
      upper.includes("MILENIO") ||
      upper.includes("MILÊNIO") ||
      upper.includes("MILENIODIST")
    ) {
      return {
        fabrica: "gpaniz",
        fabricaNome: "G.Paniz",
        tipoTabela: "especial",
        clienteEstimado: "Milênio Distribuição",
        confianca: "alta",
      };
    }
    if (
      upper.includes("ECOMMERCE") ||
      upper.includes("E-COMMERCE") ||
      upper.includes("ECOM")
    ) {
      return {
        fabrica: "gpaniz",
        fabricaNome: "G.Paniz",
        tipoTabela: "ecommerce",
        clienteEstimado: "E-commerce SP",
        confianca: "alta",
      };
    }
    return {
      fabrica: "gpaniz",
      fabricaNome: "G.Paniz",
      tipoTabela: "normal",
      clienteEstimado: "Sul/Sudeste",
      confianca: "alta",
    };
  }

  // Não detectado
  return {
    fabrica: null,
    fabricaNome: "Não detectado",
    tipoTabela: "normal",
    clienteEstimado: "Desconhecido",
    confianca: "baixa",
  };
}

// ====== UI: CARD DE ARQUIVO NA FILA ======
function FileCard({
  item,
  onRemove,
  onUpdate,
}: {
  item: FileItem;
  onRemove: () => void;
  onUpdate: (patch: Partial<FileItem>) => void;
}) {
  const fabrica = item.fabricaOverride ?? item.fabrica;
  const tipoTabela = item.tipoTabelaOverride ?? item.tipoTabela;
  const cor = fabrica ? (FABRICA_COR[fabrica] ?? "#888") : "#f59e0b";
  const isLowConf = item.confianca === "baixa";
  const isPending = item.status === "pending";

  return (
    <div
      style={{
        background: "#1a1a1a",
        border: `1px solid ${
          item.status === "error"
            ? "#f59e0b40"
            : item.status === "done"
            ? "#00e5a030"
            : "#2e2e2e"
        }`,
        borderRadius: 14,
        padding: "14px 16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        {/* Indicador de fábrica */}
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: cor,
            flexShrink: 0,
            marginTop: 5,
            boxShadow: `0 0 8px ${cor}50`,
          }}
        />

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Nome do arquivo */}
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#f0f0f0",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              marginBottom: 5,
            }}
          >
            {item.file.name}
          </div>

          {/* Detecção bem-sucedida */}
          {!isLowConf && isPending && (
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: "#888" }}>
                {item.fabricaNome} · {TIPO_LABEL[tipoTabela]} · {item.clienteEstimado}
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#00e5a0",
                  background: "rgba(0,229,160,0.1)",
                  borderRadius: 20,
                  padding: "1px 8px",
                  letterSpacing: 0.3,
                }}
              >
                Auto-detectado
              </span>
            </div>
          )}

          {/* Aviso especial (ex: tabela mestre Amapá) */}
          {item.aviso && isPending && (
            <div
              style={{
                fontSize: 12,
                color: "#f59e0b",
                background: "rgba(245,158,11,0.08)",
                border: "1px solid rgba(245,158,11,0.2)",
                borderRadius: 8,
                padding: "6px 10px",
                marginTop: 4,
              }}
            >
              ⚠ {item.aviso}
            </div>
          )}

          {/* Detecção com confiança baixa: selects manuais (só se não for aviso especial) */}
          {isLowConf && isPending && !item.aviso && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#f59e0b",
                  background: "rgba(245,158,11,0.1)",
                  borderRadius: 20,
                  padding: "1px 8px",
                  letterSpacing: 0.3,
                }}
              >
                Verificar
              </span>
              <select
                value={item.fabricaOverride ?? ""}
                onChange={(e) =>
                  onUpdate({
                    fabricaOverride: (e.target.value as FabricaSlug) || null,
                  })
                }
                style={{
                  padding: "4px 10px",
                  borderRadius: 8,
                  border: "1px solid #2e2e2e",
                  background: "#242424",
                  color: "#f0f0f0",
                  fontSize: 12,
                  outline: "none",
                  cursor: "pointer",
                }}
              >
                <option value="">Selecionar fábrica</option>
                <option value="amapa">Amapá</option>
                <option value="gpaniz">G.Paniz</option>
                <option value="bermar">Bermar</option>
              </select>
              <select
                value={item.tipoTabelaOverride ?? item.tipoTabela}
                onChange={(e) =>
                  onUpdate({ tipoTabelaOverride: e.target.value as TipoTabela })
                }
                style={{
                  padding: "4px 10px",
                  borderRadius: 8,
                  border: "1px solid #2e2e2e",
                  background: "#242424",
                  color: "#f0f0f0",
                  fontSize: 12,
                  outline: "none",
                  cursor: "pointer",
                }}
              >
                <option value="normal">Normal</option>
                <option value="especial">Especial</option>
                <option value="ecommerce">E-commerce</option>
              </select>
            </div>
          )}

          {/* Status: importando */}
          {item.status === "importing" && (
            <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>
              Importando...
            </div>
          )}

          {/* Status: concluído */}
          {item.status === "done" && (
            <div style={{ fontSize: 12, color: "#00e5a0", marginTop: 4 }}>
              ✓ {item.resultado}
            </div>
          )}

          {/* Status: erro */}
          {item.status === "error" && (
            <div style={{ fontSize: 12, color: "#f59e0b", marginTop: 4 }}>
              ✕ {item.erro}
            </div>
          )}
        </div>

        {/* Botão remover (apenas pending) */}
        {isPending && (
          <button
            onClick={onRemove}
            aria-label="Remover arquivo"
            style={{
              background: "none",
              border: "none",
              color: "#555",
              fontSize: 20,
              cursor: "pointer",
              padding: "0 4px",
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

// ====== IMPORT (CSV -> STAGING -> UPSERT): PAGE PRINCIPAL ======
export default function UploadTabelasPage() {
  // ====== FILE QUEUE ======
  const [fileItems, setFileItems] = useState<FileItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [importando, setImportando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ====== CATALOG STATE ======
  const [resumoGrupos, setResumoGrupos] = useState<ResumoGrupo[]>([]);
  const [resumoCarregando, setResumoCarregando] = useState(false);
  const [deletando, setDeletando] = useState<string | null>(null);

  // ====== CATALOG LOGIC: CARREGAR RESUMO ======
  // Amapá usa UUID diretamente (mais confiável) + query separada para Obramax.
  // G.Paniz e Bermar: fetch tipo_tabela leve + dedup + count (poucos produtos).
  const AMAPA_FABRICA_ID = "d6c7f740-c998-48b4-bae6-ae22d4b2d662";

  async function loadResumo() {
    setResumoCarregando(true);
    try {
      const linhas: ResumoLinha[] = [];

      // ── AMAPÁ ──────────────────────────────────────────────────────────────
      // 1) Count direto da tabela principal (tipo_tabela = "amapa") — sem baixar linhas
      const { count: amapaPrincipalCount } = await supabase
        .from("produtos")
        .select("id", { count: "exact", head: true })
        .eq("fabrica_id", AMAPA_FABRICA_ID)
        .eq("tipo_tabela", "amapa");

      if (amapaPrincipalCount && amapaPrincipalCount > 0) {
        linhas.push({ fabrica_slug: "amapa", tipo_tabela: "amapa", total: amapaPrincipalCount });
      }

      // 2) Buscar tipos Obramax (tudo que não é "amapa") usando fabrica_id UUID
      //    Obramax products = tipo_tabela começa com "obramax_" — são poucos registros
      const { data: tiposObramax } = await supabase
        .from("produtos")
        .select("tipo_tabela")
        .eq("fabrica_id", AMAPA_FABRICA_ID)
        .neq("tipo_tabela", "amapa")
        .limit(5000);

      const obramaxUnicos = [
        ...new Set((tiposObramax ?? []).map((t) => t.tipo_tabela ?? "").filter(Boolean)),
      ];

      for (const tipo of obramaxUnicos) {
        const { count } = await supabase
          .from("produtos")
          .select("id", { count: "exact", head: true })
          .eq("fabrica_id", AMAPA_FABRICA_ID)
          .eq("tipo_tabela", tipo);
        linhas.push({ fabrica_slug: "amapa", tipo_tabela: tipo, total: count ?? 0 });
      }

      // ── G.PANIZ e BERMAR ───────────────────────────────────────────────────
      for (const fab of ["gpaniz", "bermar"] as FabricaSlug[]) {
        const { data: tipos } = await supabase
          .from("produtos")
          .select("tipo_tabela")
          .eq("fabrica_slug", fab)
          .limit(10000);

        if (!tipos || tipos.length === 0) continue;

        const tiposUnicos = [...new Set(tipos.map((t) => t.tipo_tabela ?? ""))];

        for (const tipo of tiposUnicos) {
          const { count } = await supabase
            .from("produtos")
            .select("id", { count: "exact", head: true })
            .eq("fabrica_slug", fab)
            .eq("tipo_tabela", tipo);
          linhas.push({ fabrica_slug: fab, tipo_tabela: tipo, total: count ?? 0 });
        }
      }

      setResumoGrupos(agruparResumo(linhas));
    } finally {
      setResumoCarregando(false);
    }
  }

  // ====== CATALOG LOGIC: DELETAR TABELA ======
  async function deletarTabela(grupo: ResumoGrupo, tipo_tabela: string) {
    const label = `${grupo.fabrica_slug} — ${TIPO_LABEL[tipo_tabela] ?? tipo_tabela}`;
    if (
      !window.confirm(
        `Excluir todos os produtos de:\n\n${label}\n\nEssa ação não pode ser desfeita.`
      )
    )
      return;

    const chave = `${grupo.fabrica_slug}__${tipo_tabela}`;
    setDeletando(chave);
    try {
      const { error } = await supabase
        .from("produtos")
        .delete()
        .eq("fabrica_slug", grupo.fabrica_slug)
        .eq("tipo_tabela", tipo_tabela);
      if (error) {
        alert(`Erro ao excluir: ${error.message}`);
        return;
      }
      await loadResumo();
    } finally {
      setDeletando(null);
    }
  }

  useEffect(() => {
    loadResumo();
  }, []);

  // ====== FILE HANDLING: ADICIONAR ARQUIVOS À FILA ======
  const addFiles = useCallback((files: File[]) => {
    const validos = files.filter((f) => /\.(xlsx|xls|xlsm|csv)$/i.test(f.name));
    const novos: FileItem[] = validos.map((file) => ({
      id: genId(),
      file,
      ...detectarPlanilha(file.name),
      fabricaOverride: null,
      tipoTabelaOverride: null,
      status: "pending",
      resultado: null,
      erro: null,
    }));
    setFileItems((prev) => [...prev, ...novos]);
  }, []);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    addFiles(Array.from(e.dataTransfer.files));
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    // Só desativa se saiu da drop zone de fato (não de um filho)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOver(false);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) addFiles(Array.from(e.target.files));
    e.target.value = "";
  }

  function removerItem(id: string) {
    setFileItems((prev) => prev.filter((f) => f.id !== id));
  }

  function atualizarItem(id: string, patch: Partial<FileItem>) {
    setFileItems((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  // ====== IMPORT (CSV -> STAGING -> UPSERT): IMPORTAR UM ARQUIVO ======
  async function importarArquivo(item: FileItem): Promise<string> {
    const fabrica = item.fabricaOverride ?? item.fabrica;
    const tipoTabela = item.tipoTabelaOverride ?? item.tipoTabela;

    if (!fabrica) {
      throw new Error("Selecione a fábrica antes de importar.");
    }

    // Ler o arquivo completamente antes de montar o FormData
    // Evita problemas com arquivos grandes que não são lidos a tempo pelo fetch
    const arrayBuffer = await item.file.arrayBuffer();
    const blob = new Blob([arrayBuffer], {
      type: item.file.type || "application/octet-stream",
    });

    console.log("[upload] Enviando arquivo:", {
      name: item.file.name,
      size: item.file.size,
      blobSize: blob.size,
      type: blob.type,
      fabrica,
      tipoTabela,
    });

    const form = new FormData();
    form.append("file", blob, item.file.name);
    form.append("fabrica_slug", fabrica);
    form.append("tipo_tabela", tipoTabela);

    const res = await fetch("/api/upload-tabelas", { method: "POST", body: form });
    const body = await res.json().catch(() => ({}));

    if (!res.ok) throw new Error(body?.error || "Falha no import.");

    const total = body?.imported ?? 0;
    const partes: string[] = [`${total} produto${total !== 1 ? "s" : ""}`];
    if (body?.fabrica_slug === "amapa") {
      // Amapá: tabela geral — frete calculado em tempo real, sem precos_cliente
      partes.push("Tabela geral importada");
      partes.push("Preço FOB base salvo");
    } else {
      if (body?.cliente) partes.push(`Cliente: ${body.cliente}`);
      if (body?.precos_importados) partes.push(`Preços: ${body.precos_importados}`);
    }
    if (body?.avisos?.length) partes.push(`⚠️ ${body.avisos.join(" | ")}`);

    return partes.join(" · ");
  }

  // ====== IMPORT (CSV -> STAGING -> UPSERT): IMPORTAR TODOS EM SEQUÊNCIA ======
  async function importarTudo() {
    const pendentes = fileItems.filter((f) => f.status === "pending");
    if (!pendentes.length) return;

    setImportando(true);

    for (const item of pendentes) {
      // Marca como importando
      setFileItems((prev) =>
        prev.map((f) => (f.id === item.id ? { ...f, status: "importing" } : f))
      );

      try {
        const resultado = await importarArquivo(item);
        setFileItems((prev) =>
          prev.map((f) =>
            f.id === item.id ? { ...f, status: "done", resultado } : f
          )
        );
      } catch (e: any) {
        setFileItems((prev) =>
          prev.map((f) =>
            f.id === item.id
              ? { ...f, status: "error", erro: e?.message || "Erro desconhecido." }
              : f
          )
        );
      }
    }

    setImportando(false);
    await loadResumo();
  }

  const pendentes = useMemo(
    () => fileItems.filter((f) => f.status === "pending"),
    [fileItems]
  );

  const totalGeral = useMemo(
    () =>
      resumoGrupos.reduce(
        (sum, g) => sum + g.tabelas.reduce((s, t) => s + t.total, 0),
        0
      ),
    [resumoGrupos]
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f0f0f",
        padding: "32px 20px 48px",
        maxWidth: 700,
        margin: "0 auto",
      }}
    >
      {/* ====== UI: HEADER ====== */}
      <div style={{ marginBottom: 28 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "#555",
            letterSpacing: 1.5,
            textTransform: "uppercase",
            marginBottom: 6,
          }}
        >
          Importação
        </div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#f0f0f0" }}>
          Upload de Tabelas
        </h1>
        <p style={{ margin: "6px 0 0", color: "#888", fontSize: 14 }}>
          Arraste planilhas das fábricas — a fábrica é detectada automaticamente pelo nome do arquivo.
        </p>
      </div>

      {/* ====== UI: DROP ZONE ====== */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? "#00e5a0" : "#2e2e2e"}`,
          borderRadius: 20,
          padding: "44px 24px",
          textAlign: "center",
          cursor: "pointer",
          background: dragOver ? "rgba(0,229,160,0.06)" : "transparent",
          transition: "all 200ms ease",
          marginBottom: 20,
          userSelect: "none",
        }}
      >
        <div style={{ fontSize: 28, marginBottom: 10, opacity: dragOver ? 1 : 0.4 }}>
          ↑
        </div>
        <div
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: dragOver ? "#00e5a0" : "#888",
            marginBottom: 4,
            transition: "color 200ms ease",
          }}
        >
          {dragOver ? "Solte os arquivos aqui" : "Arraste arquivos ou clique para selecionar"}
        </div>
        <div style={{ fontSize: 12, color: "#555" }}>
          .xlsx, .xls, .xlsm, .csv · múltiplos arquivos permitidos
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.xlsm,.csv"
          multiple
          onChange={handleInputChange}
          style={{ display: "none" }}
        />
      </div>

      {/* ====== UI: FILA DE ARQUIVOS ====== */}
      {fileItems.length > 0 && (
        <div style={{ marginBottom: 20 }}>
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
            Arquivos detectados ({fileItems.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {fileItems.map((item) => (
              <FileCard
                key={item.id}
                item={item}
                onRemove={() => removerItem(item.id)}
                onUpdate={(patch) => atualizarItem(item.id, patch)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ====== UI: BOTÃO IMPORTAR TUDO ====== */}
      {pendentes.length > 0 && (
        <button
          onClick={importarTudo}
          disabled={importando}
          style={{
            width: "100%",
            padding: "16px",
            borderRadius: 14,
            border: "none",
            background: importando ? "#242424" : "#00e5a0",
            color: importando ? "#555" : "#0f0f0f",
            fontWeight: 700,
            fontSize: 16,
            cursor: importando ? "not-allowed" : "pointer",
            marginBottom: 36,
            transition: "all 200ms ease",
            opacity: importando ? 0.7 : 1,
          }}
        >
          {importando
            ? "Importando..."
            : `Importar tudo (${pendentes.length} arquivo${pendentes.length !== 1 ? "s" : ""})`}
        </button>
      )}

      {/* ====== UI: RESUMO DO CATÁLOGO ====== */}
      <div
        style={{
          background: "#1a1a1a",
          border: "1px solid #2e2e2e",
          borderRadius: 16,
          padding: 20,
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
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#f0f0f0" }}>
            Situação do catálogo
          </h2>
          {totalGeral > 0 && (
            <span style={{ fontSize: 13, color: "#888" }}>
              {totalGeral.toLocaleString("pt-BR")} produtos
            </span>
          )}
        </div>

        {resumoCarregando && (
          <div style={{ color: "#555", fontSize: 14 }}>Carregando...</div>
        )}

        {!resumoCarregando && resumoGrupos.length === 0 && (
          <div style={{ color: "#555", fontSize: 14 }}>
            Nenhuma tabela importada ainda.
          </div>
        )}

        {!resumoCarregando && resumoGrupos.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {resumoGrupos.map((g) => {
              const cor = FABRICA_COR[g.fabrica_slug] ?? "#555";
              const nomeDisplay =
                g.fabrica_slug === "amapa" ? "Amapá" :
                g.fabrica_slug === "gpaniz" ? "G.Paniz" :
                g.fabrica_slug === "bermar" ? "Bermar" :
                g.fabrica_slug;

              return (
                <div
                  key={g.fabrica_slug}
                  style={{
                    background: "#242424",
                    borderRadius: 12,
                    padding: "14px 16px",
                    borderLeft: `3px solid ${cor}`,
                  }}
                >
                  {/* Nome da fábrica */}
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 14,
                      color: "#f0f0f0",
                      marginBottom: 10,
                    }}
                  >
                    {nomeDisplay}
                  </div>

                  {/* Linhas por tipo_tabela — tabelas principais (não-Obramax) */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {g.tabelas
                      .filter((t) => !t.tipo_tabela.startsWith("obramax_"))
                      .sort((a, b) => a.tipo_tabela.localeCompare(b.tipo_tabela))
                      .map((t) => {
                        const chave = `${g.fabrica_slug}__${t.tipo_tabela}`;
                        const estaDeletando = deletando === chave;
                        return (
                          <div key={t.tipo_tabela} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ padding: "2px 10px", borderRadius: 20, background: "#1a1a1a", border: "1px solid #2e2e2e", fontSize: 11, fontWeight: 700, color: "#888" }}>
                                {TIPO_LABEL[t.tipo_tabela] ?? t.tipo_tabela}
                              </span>
                              <span style={{ fontWeight: 600, fontSize: 14, color: "#f0f0f0" }}>
                                {t.total.toLocaleString("pt-BR")} produto{t.total !== 1 ? "s" : ""}
                              </span>
                            </div>
                            <button onClick={() => deletarTabela(g, t.tipo_tabela)} disabled={estaDeletando} style={{ padding: "3px 10px", borderRadius: 8, border: "1px solid #f59e0b30", background: "transparent", color: estaDeletando ? "#555" : "#f59e0b", fontWeight: 600, fontSize: 12, cursor: estaDeletando ? "not-allowed" : "pointer", transition: "opacity 150ms ease", opacity: estaDeletando ? 0.5 : 1 }}>
                              {estaDeletando ? "Excluindo..." : "Excluir"}
                            </button>
                          </div>
                        );
                      })}

                    {/* ====== UI: OBRAMAX SUBSECTION — só aparece na seção Amapá ====== */}
                    {g.tabelas.some((t) => t.tipo_tabela.startsWith("obramax_")) && (
                      <div style={{ borderTop: "1px solid #333", paddingTop: 10, marginTop: 2 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#555", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>
                          Obramax
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {g.tabelas
                            .filter((t) => t.tipo_tabela.startsWith("obramax_"))
                            .sort((a, b) => a.tipo_tabela.localeCompare(b.tipo_tabela))
                            .map((t) => {
                              const chave = `${g.fabrica_slug}__${t.tipo_tabela}`;
                              const estaDeletando = deletando === chave;
                              return (
                                <div key={t.tipo_tabela} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <span style={{ fontWeight: 500, fontSize: 13, color: "#ccc" }}>
                                      {nomeLoja(t.tipo_tabela)}
                                    </span>
                                    <span style={{ fontSize: 12, color: "#888" }}>
                                      {t.total.toLocaleString("pt-BR")} produto{t.total !== 1 ? "s" : ""}
                                    </span>
                                  </div>
                                  <button onClick={() => deletarTabela(g, t.tipo_tabela)} disabled={estaDeletando} style={{ padding: "3px 10px", borderRadius: 8, border: "1px solid #f59e0b30", background: "transparent", color: estaDeletando ? "#555" : "#f59e0b", fontWeight: 600, fontSize: 12, cursor: estaDeletando ? "not-allowed" : "pointer", transition: "opacity 150ms ease", opacity: estaDeletando ? 0.5 : 1 }}>
                                    {estaDeletando ? "Excluindo..." : "Excluir"}
                                  </button>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
