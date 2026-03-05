"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Fabrica = { id: string; nome: string; prazo_label: string | null };

// ====== RESUMO DO CATÁLOGO ======
// Representa a contagem de produtos por fábrica + tipo de tabela
type ResumoLinha = {
  fabricante: string;
  fabrica_id: string | null; // necessário para deletar com precisão
  tipo_tabela: string;
  total: number;
};

type ResumoGrupo = {
  fabricante: string;
  fabrica_id: string | null;
  tabelas: { tipo_tabela: string; total: number }[];
};

// Agrupa as linhas brutas em grupos por fabricante
function agruparResumo(linhas: ResumoLinha[]): ResumoGrupo[] {
  const map = new Map<string, ResumoGrupo>();

  for (const l of linhas) {
    if (!map.has(l.fabricante)) {
      map.set(l.fabricante, {
        fabricante: l.fabricante,
        fabrica_id: l.fabrica_id,
        tabelas: [],
      });
    }
    map.get(l.fabricante)!.tabelas.push({
      tipo_tabela: l.tipo_tabela,
      total: l.total,
    });
  }

  // Ordena fábricas alfabeticamente
  return Array.from(map.values()).sort((a, b) =>
    a.fabricante.localeCompare(b.fabricante, "pt-BR")
  );
}

// Label amigável para tipo_tabela
function labelTipo(tipo: string) {
  const map: Record<string, string> = {
    ecommerce: "Ecommerce",
    especial: "Especial",
    normal: "Normal",
  };
  return map[tipo?.toLowerCase()] ?? tipo ?? "–";
}

export default function UploadTabelasPage() {
  const [fabricas, setFabricas] = useState<Fabrica[]>([]);
  const [fabricaId, setFabricaId] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  // ====== UPLOAD UI: TIPO_TABELA ======
  const [tipoTabela, setTipoTabela] = useState<"ecommerce" | "especial" | "normal">("normal");

  // ====== CADASTRO DE NOVA FÁBRICA ======
  const [novaFabrica, setNovaFabrica] = useState("");
  const [novaPrazoLabel, setNovaPrazoLabel] = useState("");
  const [adicionandoFabrica, setAdicionandoFabrica] = useState(false);
  const [erroFabrica, setErroFabrica] = useState<string | null>(null);
  const [okFabrica, setOkFabrica] = useState<string | null>(null);

  // ====== EDITAR PRAZO DE FÁBRICA EXISTENTE ======
  const [editandoPrazoId, setEditandoPrazoId] = useState<string | null>(null);
  const [prazoLabelEdit, setPrazoLabelEdit] = useState("");

  async function adicionarFabrica() {
    setErroFabrica(null);
    setOkFabrica(null);

    const nome = novaFabrica.trim();
    if (!nome) {
      setErroFabrica("Digite o nome da fábrica.");
      return;
    }

    setAdicionandoFabrica(true);
    try {
      const prazo_label = novaPrazoLabel.trim() || null;

      // Tenta inserir; se o nome já existir, busca o registro existente
      let fabricaData: Fabrica | null = null;

      const { data: inserted, error: insertError } = await supabase
        .from("fabricas")
        .insert({ nome, prazo_label })
        .select()
        .single();

      if (insertError) {
        // Nome duplicado → busca o registro já existente e seleciona
        if (insertError.code === "23505") {
          const { data: existing, error: fetchError } = await supabase
            .from("fabricas")
            .select("*")
            .eq("nome", nome)
            .single();

          if (fetchError || !existing) {
            setErroFabrica(`Fábrica "${nome}" já existe mas não foi possível encontrá-la.`);
            return;
          }

          fabricaData = existing as Fabrica;
          setOkFabrica(`Fábrica "${nome}" já estava cadastrada — selecionada automaticamente.`);
        } else {
          setErroFabrica(`Erro: ${insertError.message}`);
          return;
        }
      } else {
        fabricaData = inserted as Fabrica;
        setOkFabrica(`Fábrica "${fabricaData.nome}" cadastrada com sucesso.`);
      }

      // Adiciona ao dropdown (se não estiver) e seleciona automaticamente
      setFabricas((prev) => {
        const jaExiste = prev.some((f) => f.id === fabricaData!.id);
        return jaExiste ? prev : [...prev, fabricaData!].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      });
      setFabricaId(fabricaData.id);
      setNovaFabrica("");
      setNovaPrazoLabel("");
    } finally {
      setAdicionandoFabrica(false);
    }
  }

  // ====== SALVAR PRAZO_LABEL DE FÁBRICA ======
  async function salvarPrazoLabel(fabricaId: string) {
    const prazo_label = prazoLabelEdit.trim() || null;
    const { error } = await supabase
      .from("fabricas")
      .update({ prazo_label })
      .eq("id", fabricaId);

    if (error) {
      alert(`Erro ao salvar: ${error.message}`);
      return;
    }

    setFabricas((prev) =>
      prev.map((f) => (f.id === fabricaId ? { ...f, prazo_label } : f))
    );
    setEditandoPrazoId(null);
  }

  // ====== RESUMO DO CATÁLOGO: ESTADO ======
  const [resumoGrupos, setResumoGrupos] = useState<ResumoGrupo[]>([]);
  const [resumoCarregando, setResumoCarregando] = useState(false);
  const [deletando, setDeletando] = useState<string | null>(null); // chave sendo deletada

  // ====== RESUMO DO CATÁLOGO: CARREGAR ======
  // Busca fabricante + tipo_tabela de todos os produtos e agrupa client-side.
  // Resolve o nome da fábrica via tabela `fabricas` quando o campo `fabricante` estiver vazio.
  async function loadResumo() {
    setResumoCarregando(true);
    try {
      const [{ data: prodData }, { data: fabData }] = await Promise.all([
        supabase.from("produtos").select("fabricante, fabrica_id, tipo_tabela").limit(5000),
        supabase.from("fabricas").select("id, nome"),
      ]);

      if (!prodData) return;

      // Mapa id -> nome da fábrica
      const fabricasPorId = new Map<string, string>();
      for (const f of fabData ?? []) {
        fabricasPorId.set(f.id, f.nome);
      }

      // ====== RESUMO: AGRUPAMENTO POR fabrica_id (não por texto) ======
      // Usa fabrica_id como chave quando disponível para evitar grupos duplicados
      // quando o campo `fabricante` tem variações de escrita (ex: "G.Paniz" vs "GPANIZ").
      const contagem = new Map<string, ResumoLinha>();

      for (const row of prodData) {
        // Chave de agrupamento: prefere fabrica_id (UUID), fallback para texto fabricante
        const grupoKey = row.fabrica_id ?? (row.fabricante ?? "sem-fabrica").trim();

        // Nome de exibição: prefere nome oficial da tabela fabricas, fallback para texto
        const nomeDisplay = row.fabrica_id
          ? (fabricasPorId.get(row.fabrica_id) ?? (row.fabricante ?? "Sem fábrica").trim())
          : (row.fabricante ?? "Sem fábrica").trim();

        const tipo = (row.tipo_tabela ?? "sem tipo").trim().toLowerCase();
        const key = `${grupoKey}__${tipo}`;

        if (!contagem.has(key)) {
          contagem.set(key, {
            fabricante: nomeDisplay,
            fabrica_id: row.fabrica_id ?? null,
            tipo_tabela: tipo,
            total: 0,
          });
        }
        contagem.get(key)!.total += 1;
      }

      setResumoGrupos(agruparResumo(Array.from(contagem.values())));
    } finally {
      setResumoCarregando(false);
    }
  }

  // ====== DELETAR TABELA ======
  // Remove todos os produtos de uma fábrica + tipo_tabela específicos.
  // Usa fabrica_id quando disponível (mais preciso), senão filtra por fabricante texto.
  async function deletarTabela(
    grupo: ResumoGrupo,
    tipo_tabela: string
  ) {
    const label = `${grupo.fabricante} — ${labelTipo(tipo_tabela)}`;
    const confirmado = window.confirm(
      `Tem certeza que quer EXCLUIR todos os produtos da tabela:\n\n${label}\n\nEssa ação não pode ser desfeita.`
    );
    if (!confirmado) return;

    const chave = `${grupo.fabricante}__${tipo_tabela}`;
    setDeletando(chave);

    try {
      let query = supabase.from("produtos").delete();

      if (grupo.fabrica_id) {
        // Filtra por fabrica_id (UUID) + tipo_tabela — mais preciso
        query = query.eq("fabrica_id", grupo.fabrica_id).eq("tipo_tabela", tipo_tabela);
      } else {
        // Fallback: filtra por fabricante texto + tipo_tabela
        query = query.eq("fabricante", grupo.fabricante).eq("tipo_tabela", tipo_tabela);
      }

      const { error } = await query;

      if (error) {
        alert(`Erro ao excluir: ${error.message}`);
        return;
      }

      // Recarrega o resumo após exclusão
      await loadResumo();
    } finally {
      setDeletando(null);
    }
  }

  useEffect(() => {
    async function loadFabricas() {
      const { data } = await supabase.from("fabricas").select("*").order("nome");
      if (data) setFabricas(data as Fabrica[]);
    }
    loadFabricas();
    loadResumo();
  }, []);

  const dica = useMemo(
    () =>
      "Envie a planilha da fábrica (.xlsx ou .csv). Selecione a fábrica e o tipo de tabela correto antes de importar — cada fábrica pode ter formatos e condições diferentes.",
    []
  );

  const enviar = async () => {
    setErro(null);
    setOk(null);

    if (!fabricaId) {
      setErro("Selecione uma fábrica.");
      return;
    }
    if (!arquivo) {
      setErro("Escolha um arquivo .xlsx ou .csv.");
      return;
    }

    setCarregando(true);

    try {
      // ====== UPLOAD: ENVIO PARA API (FormData) ======
      const form = new FormData();
      form.append("file", arquivo);
      form.append("fabrica_id", fabricaId);
      form.append("tipo_tabela", tipoTabela);

      const res = await fetch("/api/upload-tabelas", {
        method: "POST",
        body: form,
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Falha no upload/import.");

      const total = body?.imported ?? body?.total ?? body?.inserted ?? body?.count ?? 0;

      setOk(`Importação concluída ✅ Itens inseridos/atualizados: ${total}`);
      setArquivo(null);

      await loadResumo();
    } catch (e: any) {
      setErro(e?.message || "Erro inesperado.");
    } finally {
      setCarregando(false);
    }
  };

  const totalGeral = useMemo(
    () => resumoGrupos.reduce((sum, g) => sum + g.tabelas.reduce((s, t) => s + t.total, 0), 0),
    [resumoGrupos]
  );

  return (
    <div style={{ padding: 24 }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, color: "#0F172A" }}>
            Upload de Tabelas
          </h1>
          <p style={{ margin: "4px 0 0", color: "#6B7280", fontSize: 14 }}>{dica}</p>
        </div>

        {/* ====== UI: FORMULÁRIO DE UPLOAD ====== */}
        <div
          style={{
            background: "#FFFFFF",
            border: "1px solid #E5E7EB",
            borderRadius: 16,
            padding: 20,
            boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
          }}
        >
          {/* ====== UI: CADASTRAR NOVA FÁBRICA ====== */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: "#0F172A", marginBottom: 8 }}>
              Nova fábrica (se não estiver na lista) — Nome e Condição de Pagamento
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
              <input
                placeholder="Nome da fábrica (ex: Gastromaq)"
                value={novaFabrica}
                onChange={(e) => { setNovaFabrica(e.target.value); setErroFabrica(null); setOkFabrica(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") adicionarFabrica(); }}
                style={{
                  width: "100%",
                  padding: 14,
                  borderRadius: 14,
                  border: "1px solid #D1D5DB",
                  fontSize: 16,
                  background: "#FFFFFF",
                  color: "#111827",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              <input
                placeholder='Condição de Pagamento (ex: "28/56/84" ou "Com frete")'
                value={novaPrazoLabel}
                onChange={(e) => setNovaPrazoLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") adicionarFabrica(); }}
                style={{
                  width: "100%",
                  padding: 14,
                  borderRadius: 14,
                  border: "1px solid #D1D5DB",
                  fontSize: 15,
                  background: "#FFFFFF",
                  color: "#111827",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
              <button
                onClick={adicionarFabrica}
                disabled={adicionandoFabrica}
                style={{
                  padding: "12px 18px",
                  borderRadius: 14,
                  border: "1px solid #2563EB",
                  background: "#2563EB",
                  color: "#FFFFFF",
                  fontWeight: 900,
                  fontSize: 15,
                  cursor: adicionandoFabrica ? "not-allowed" : "pointer",
                  opacity: adicionandoFabrica ? 0.7 : 1,
                  whiteSpace: "nowrap",
                }}
              >
                {adicionandoFabrica ? "Salvando..." : "+ Adicionar"}
              </button>
            </div>
            {erroFabrica && (
              <div style={{ marginTop: 8, padding: 10, borderRadius: 10, border: "1px solid #FCA5A5", background: "#FEF2F2", color: "#991B1B", fontWeight: 800, fontSize: 14 }}>
                {erroFabrica}
              </div>
            )}
            {okFabrica && (
              <div style={{ marginTop: 8, padding: 10, borderRadius: 10, border: "1px solid #86EFAC", background: "#ECFDF5", color: "#065F46", fontWeight: 800, fontSize: 14 }}>
                {okFabrica}
              </div>
            )}
          </div>

          {/* Select fábrica */}
          <select
            value={fabricaId}
            onChange={(e) => setFabricaId(e.target.value)}
            style={{
              width: "100%",
              marginTop: 16,
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
            <option value="">Selecione a fábrica</option>
            {fabricas.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>

          <input
            type="file"
            accept=".xlsx,.csv"
            onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            style={{
              width: "100%",
              marginTop: 12,
              padding: 14,
              borderRadius: 14,
              border: "1px solid #D1D5DB",
              fontSize: 16,
              background: "#FFFFFF",
              color: "#111827",
              outline: "none",
            }}
          />

          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: "#0F172A", marginBottom: 8 }}>
              Tipo de tabela
            </div>
            <select
              value={tipoTabela}
              onChange={(e) => setTipoTabela(e.target.value as any)}
              style={{
                width: "100%",
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
              <option value="ecommerce">Ecommerce</option>
              <option value="especial">Especial</option>
              <option value="normal">Normal</option>
            </select>
            <div style={{ marginTop: 6, fontSize: 12, color: "#6B7280", fontWeight: 700 }}>
              Dica: selecione corretamente para não misturar preços.
            </div>
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

          {ok && (
            <div
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 14,
                border: "1px solid #86EFAC",
                background: "#ECFDF5",
                color: "#065F46",
                fontWeight: 900,
              }}
            >
              {ok}
            </div>
          )}

          <button
            onClick={enviar}
            disabled={carregando}
            style={{
              marginTop: 16,
              width: "100%",
              padding: "14px",
              fontSize: 16,
              fontWeight: 900,
              borderRadius: 14,
              border: "1px solid #111827",
              background: "#111827",
              color: "#FFFFFF",
              cursor: "pointer",
              opacity: carregando ? 0.7 : 1,
            }}
          >
            {carregando ? "Enviando..." : "Enviar e Importar"}
          </button>
        </div>

        {/* ====== RESUMO DO CATÁLOGO ====== */}
        <div
          style={{
            marginTop: 18,
            background: "#FFFFFF",
            border: "1px solid #E5E7EB",
            borderRadius: 16,
            padding: 20,
            boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: "#0F172A" }}>
              Situação atual do catálogo
            </h2>
            {totalGeral > 0 && (
              <span style={{ fontSize: 14, fontWeight: 700, color: "#6B7280" }}>
                {totalGeral.toLocaleString("pt-BR")} produtos no total
              </span>
            )}
          </div>

          {resumoCarregando && (
            <p style={{ marginTop: 12, color: "#6B7280", fontSize: 15 }}>Carregando...</p>
          )}

          {!resumoCarregando && resumoGrupos.length === 0 && (
            <p style={{ marginTop: 12, color: "#9CA3AF", fontSize: 15 }}>
              Nenhuma tabela importada ainda.
            </p>
          )}

          {!resumoCarregando && resumoGrupos.length > 0 && (
            <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
              {resumoGrupos.map((g) => (
                <div
                  key={g.fabricante}
                  style={{
                    border: "1px solid #E5E7EB",
                    borderRadius: 12,
                    padding: 14,
                    background: "#F9FAFB",
                  }}
                >
                  {/* Nome da fábrica + prazo_label */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontWeight: 900, fontSize: 16, color: "#0F172A" }}>
                      {g.fabricante}
                    </div>

                    {/* ====== PRAZO_LABEL: EXIBIR / EDITAR POR FÁBRICA ====== */}
                    {editandoPrazoId === g.fabrica_id ? (
                      <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                        <input
                          autoFocus
                          placeholder='Ex: "28/56/84" ou "Com frete"'
                          value={prazoLabelEdit}
                          onChange={(e) => setPrazoLabelEdit(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter" && g.fabrica_id) salvarPrazoLabel(g.fabrica_id); if (e.key === "Escape") setEditandoPrazoId(null); }}
                          style={{ flex: 1, minWidth: 180, padding: "6px 10px", borderRadius: 10, border: "1px solid #6366F1", fontSize: 14, outline: "none" }}
                        />
                        <button
                          onClick={() => g.fabrica_id && salvarPrazoLabel(g.fabrica_id)}
                          style={{ padding: "6px 12px", borderRadius: 10, border: "1px solid #6366F1", background: "#6366F1", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}
                        >
                          Salvar
                        </button>
                        <button
                          onClick={() => setEditandoPrazoId(null)}
                          style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #D1D5DB", background: "#fff", color: "#374151", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                        <span style={{ fontSize: 13, color: "#6B7280", fontWeight: 700 }}>
                          {g.fabrica_id && fabricas.find(f => f.id === g.fabrica_id)?.prazo_label
                            ? `Prazo: ${fabricas.find(f => f.id === g.fabrica_id)!.prazo_label}`
                            : "Prazo: não configurado"}
                        </span>
                        {g.fabrica_id && (
                          <button
                            onClick={() => {
                              setEditandoPrazoId(g.fabrica_id);
                              setPrazoLabelEdit(fabricas.find(f => f.id === g.fabrica_id)?.prazo_label ?? "");
                            }}
                            style={{ padding: "2px 8px", borderRadius: 8, border: "1px solid #D1D5DB", background: "#fff", color: "#374151", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
                          >
                            Editar
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Linhas por tipo_tabela */}
                  <div style={{ display: "grid", gap: 8 }}>
                    {g.tabelas
                      .sort((a, b) => a.tipo_tabela.localeCompare(b.tipo_tabela))
                      .map((t) => {
                        const chave = `${g.fabricante}__${t.tipo_tabela}`;
                        const estaDeletando = deletando === chave;

                        return (
                          <div
                            key={t.tipo_tabela}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 10,
                              flexWrap: "wrap",
                            }}
                          >
                            {/* Info da tabela */}
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              {/* Badge tipo */}
                              <span
                                style={{
                                  display: "inline-block",
                                  padding: "2px 10px",
                                  borderRadius: 999,
                                  background: "#E0F2FE",
                                  border: "1px solid #BAE6FD",
                                  fontSize: 13,
                                  fontWeight: 800,
                                  color: "#0369A1",
                                  minWidth: 80,
                                  textAlign: "center",
                                }}
                              >
                                {labelTipo(t.tipo_tabela)}
                              </span>

                              {/* Contagem */}
                              <span style={{ fontWeight: 900, fontSize: 15, color: "#111827" }}>
                                {t.total.toLocaleString("pt-BR")} produto{t.total !== 1 ? "s" : ""}
                              </span>
                            </div>

                            {/* ====== DELETAR TABELA: BOTÃO ====== */}
                            <button
                              onClick={() => deletarTabela(g, t.tipo_tabela)}
                              disabled={estaDeletando}
                              style={{
                                padding: "4px 12px",
                                borderRadius: 10,
                                border: "1px solid #FCA5A5",
                                background: estaDeletando ? "#FEF2F2" : "#FFFFFF",
                                color: "#991B1B",
                                fontWeight: 800,
                                fontSize: 13,
                                cursor: estaDeletando ? "not-allowed" : "pointer",
                                opacity: estaDeletando ? 0.6 : 1,
                              }}
                            >
                              {estaDeletando ? "Excluindo..." : "Excluir tabela"}
                            </button>
                          </div>
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
