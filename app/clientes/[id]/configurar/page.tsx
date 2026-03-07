"use client";

// ====== CLIENTS (CRUD) — TELA DE CONFIGURAÇÃO DO CLIENTE ======
import { useEffect, useState } from "react";
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
};

type ClienteFabricaConfig = {
  fabrica: string;
  tabela: string | null;
  canal: string | null;
  regiao: string | null;
  modalidade_frete: string | null;
};

type RegiaoFrete = {
  regiao: string;
  cif: number | null;
  redespacho: number | null;
};

// ====== CONSTANTES DE CONFIGURAÇÃO ======
const CANAIS_AMAPA = [
  { value: "distribuidor", label: "Distribuidor", desconto: "−45%" },
  { value: "revenda", label: "Revenda", desconto: "−37%" },
  { value: "atacado", label: "Atacado", desconto: "−31%" },
];

const MODALIDADES_FRETE = [
  { value: "fob", label: "FOB" },
  { value: "cif", label: "CIF" },
  { value: "redespacho", label: "Redespacho" },
];

const TABELAS_GPANIZ = [
  { value: "normal", label: "Normal" },
  { value: "especial", label: "Especial" },
  { value: "ecommerce", label: "E-commerce" },
];

// ====== CLIENTS (CRUD) — PAGE DE CONFIGURAÇÃO ======
export default function ClienteConfigurarPage() {
  const params = useParams();
  const router = useRouter();
  const clienteId = params.id as string;

  const [cliente, setCliente] = useState<ClienteInfo | null>(null);
  const [fabricasDoCliente, setFabricasDoCliente] = useState<string[]>([]);

  // G.Paniz
  const [tabelaGpaniz, setTabelaGpaniz] = useState<string>("normal");

  // Amapá
  const [canalAmapa, setCanalAmapa] = useState<string>("atacado");
  const [modalidadeAmapa, setModalidadeAmapa] = useState<string>("fob");
  const [regiaoAmapa, setRegiaoAmapa] = useState<string>("");
  const [regioes, setRegioes] = useState<RegiaoFrete[]>([]);

  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [toast, setToast] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // ====== CLIENTS (CRUD) — edição do nome fantasia ======
  const [editandoNome, setEditandoNome] = useState(false);
  const [nomeFantasiaEdit, setNomeFantasiaEdit] = useState("");

  // ====== SEARCH QUERY (SUPABASE) — carregar cliente + configs existentes ======
  useEffect(() => {
    async function carregar() {
      setLoading(true);

      const { data: clienteData } = await supabase
        .from("clientes")
        .select("id, razao_social, nome_fantasia, canal")
        .eq("id", clienteId)
        .single();

      if (!clienteData) {
        setErro("Cliente não encontrado.");
        setLoading(false);
        return;
      }
      setCliente(clienteData);
      setNomeFantasiaEdit(clienteData.nome_fantasia ?? "");

      const { data: configs } = await supabase
        .from("clientes_fabricas")
        .select("fabrica, tabela, canal, regiao, modalidade_frete")
        .eq("cliente_id", clienteId);

      const cfgs = (configs ?? []) as ClienteFabricaConfig[];
      setFabricasDoCliente(cfgs.map((c) => c.fabrica));

      const gpanizCfg = cfgs.find((c) => c.fabrica === "gpaniz");
      if (gpanizCfg?.tabela) setTabelaGpaniz(gpanizCfg.tabela);

      const amapaCfg = cfgs.find((c) => c.fabrica === "amapa");
      if (amapaCfg?.canal) setCanalAmapa(amapaCfg.canal);
      if (amapaCfg?.modalidade_frete) setModalidadeAmapa(amapaCfg.modalidade_frete);
      if (amapaCfg?.regiao) setRegiaoAmapa(amapaCfg.regiao ?? "");

      if (cfgs.some((c) => c.fabrica === "amapa")) {
        const { data: regioesData } = await supabase
          .from("regioes_frete")
          .select("regiao, cif, redespacho")
          .eq("fabrica_slug", "amapa")
          .order("regiao");
        setRegioes(regioesData ?? []);
      }

      setLoading(false);
    }

    carregar();
  }, [clienteId]);

  // ====== CLIENTS (CRUD) — salvar configurações por fábrica ======
  async function salvar() {
    setSalvando(true);
    setErro(null);

    try {
      if (fabricasDoCliente.includes("gpaniz")) {
        await supabase
          .from("clientes_fabricas")
          .upsert(
            { cliente_id: clienteId, fabrica: "gpaniz", tabela: tabelaGpaniz },
            { onConflict: "cliente_id,fabrica" }
          );
      }

      if (fabricasDoCliente.includes("amapa")) {
        await supabase
          .from("clientes_fabricas")
          .upsert(
            {
              cliente_id: clienteId,
              fabrica: "amapa",
              canal: canalAmapa,
              modalidade_frete: modalidadeAmapa,
              regiao: modalidadeAmapa !== "fob" ? regiaoAmapa || null : null,
            },
            { onConflict: "cliente_id,fabrica" }
          );
      }

      setToast(true);
      setTimeout(() => setToast(false), 2000);
    } catch {
      setErro("Erro ao salvar configurações.");
    } finally {
      setSalvando(false);
    }
  }

  // ====== CLIENTS (CRUD) — salvar nome fantasia ======
  async function salvarNome() {
    if (!cliente) return;
    await supabase
      .from("clientes")
      .update({ nome_fantasia: nomeFantasiaEdit.trim() || null })
      .eq("id", clienteId);
    setCliente({ ...cliente, nome_fantasia: nomeFantasiaEdit.trim() || null });
    setEditandoNome(false);
  }

  const nomeMostrado = cliente ? nomeCliente(cliente) : "Cliente";
  const isAtacado = cliente?.canal?.toUpperCase().includes("ATAC");

  // ====== UI: HELPER PARA ESTILO DE BOTÃO DE GRUPO ======
  function btnGrupo(value: string, current: string, cor: string): React.CSSProperties {
    const ativo = value === current;
    return {
      padding: "10px 12px",
      borderRadius: 10,
      border: `1px solid ${ativo ? cor : "#2e2e2e"}`,
      background: ativo ? `${cor}18` : "#1a1a1a",
      color: ativo ? cor : "#888",
      fontSize: 14,
      fontWeight: 600,
      cursor: "pointer",
      flex: 1,
      minHeight: 48,
      transition: "all 150ms ease",
    };
  }

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
          borderBottom: "1px solid #2e2e2e",
          padding: "16px 20px 12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={() => router.push("/clientes")}
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
              <>
                {/* ====== UI: EDIÇÃO DE NOME FANTASIA ====== */}
                {editandoNome ? (
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      value={nomeFantasiaEdit}
                      onChange={(e) => setNomeFantasiaEdit(e.target.value)}
                      autoFocus
                      onKeyDown={(e) => { if (e.key === "Enter") salvarNome(); if (e.key === "Escape") setEditandoNome(false); }}
                      style={{
                        flex: 1,
                        padding: "6px 12px",
                        borderRadius: 10,
                        border: "1px solid #00e5a0",
                        background: "#242424",
                        color: "#f0f0f0",
                        fontSize: 16,
                        fontWeight: 700,
                        outline: "none",
                      }}
                    />
                    <button onClick={salvarNome} style={{ background: "none", border: "none", color: "#00e5a0", fontSize: 18, cursor: "pointer", padding: "4px 6px" }}>✓</button>
                    <button onClick={() => setEditandoNome(false)} style={{ background: "none", border: "none", color: "#555", fontSize: 18, cursor: "pointer", padding: "4px 6px" }}>✕</button>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
                    <button
                      onClick={() => setEditandoNome(true)}
                      style={{ background: "none", border: "none", color: "#555", fontSize: 13, cursor: "pointer", padding: "2px 6px", flexShrink: 0 }}
                    >
                      Editar
                    </button>
                  </div>
                )}
                <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                  {fabricasDoCliente.map((fab) => {
                    const cor = FABRICA_COR[fab] ?? "#888";
                    return (
                      <span
                        key={fab}
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
                        {FABRICA_LABEL[fab] ?? fab}
                      </span>
                    );
                  })}
                  {cliente?.canal && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: isAtacado ? "#a78bfa" : "#888",
                        background: isAtacado ? "rgba(167,139,250,0.1)" : "rgba(136,136,136,0.1)",
                        border: `1px solid ${isAtacado ? "rgba(167,139,250,0.2)" : "rgba(136,136,136,0.2)"}`,
                        borderRadius: 20,
                        padding: "2px 8px",
                      }}
                    >
                      {cliente.canal.toUpperCase()}
                    </span>
                  )}
                </div>
              </>
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
              marginBottom: 20,
            }}
          >
            {erro}
          </div>
        )}

        {!loading && (
          <>
            {/* ====== UI: SEÇÃO CONFIGURAÇÕES ====== */}
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#555",
                letterSpacing: 1.5,
                textTransform: "uppercase",
                marginBottom: 16,
              }}
            >
              Configurações
            </div>

            {/* G.Paniz */}
            {fabricasDoCliente.includes("gpaniz") && (
              <div
                style={{
                  marginBottom: 16,
                  background: "#1a1a1a",
                  border: "1px solid #2e2e2e",
                  borderRadius: 16,
                  padding: "16px 20px",
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#60a5fa",
                    letterSpacing: 0.5,
                    textTransform: "uppercase",
                    marginBottom: 12,
                  }}
                >
                  G.Paniz
                </div>
                <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>
                  Tipo de tabela
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {TABELAS_GPANIZ.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => setTabelaGpaniz(t.value)}
                      style={btnGrupo(t.value, tabelaGpaniz, "#60a5fa")}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Amapá */}
            {fabricasDoCliente.includes("amapa") && (
              <div
                style={{
                  marginBottom: 16,
                  background: "#1a1a1a",
                  border: "1px solid #2e2e2e",
                  borderRadius: 16,
                  padding: "16px 20px",
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#00e5a0",
                    letterSpacing: 0.5,
                    textTransform: "uppercase",
                    marginBottom: 12,
                  }}
                >
                  Amapá
                </div>

                <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>Canal</div>
                <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                  {CANAIS_AMAPA.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => setCanalAmapa(c.value)}
                      style={{
                        ...btnGrupo(c.value, canalAmapa, "#00e5a0"),
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 2,
                      }}
                    >
                      <span>{c.label}</span>
                      <span style={{ fontSize: 11, opacity: 0.7 }}>{c.desconto}</span>
                    </button>
                  ))}
                </div>

                <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>
                  Modalidade de frete padrão
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: modalidadeAmapa !== "fob" ? 16 : 0 }}>
                  {MODALIDADES_FRETE.map((m) => (
                    <button
                      key={m.value}
                      onClick={() => setModalidadeAmapa(m.value)}
                      style={btnGrupo(m.value, modalidadeAmapa, "#00e5a0")}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                {/* Região — só aparece quando CIF ou Redespacho */}
                {modalidadeAmapa !== "fob" && (
                  <>
                    <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>
                      Região padrão
                    </div>
                    <select
                      value={regiaoAmapa}
                      onChange={(e) => setRegiaoAmapa(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "12px 16px",
                        borderRadius: 10,
                        border: `1px solid ${regiaoAmapa ? "#00e5a040" : "#2e2e2e"}`,
                        background: "#242424",
                        color: regiaoAmapa ? "#f0f0f0" : "#888",
                        fontSize: 14,
                        outline: "none",
                        cursor: "pointer",
                        appearance: "none",
                        boxSizing: "border-box",
                      }}
                    >
                      <option value="">Selecionar região...</option>
                      {regioes.map((r) => (
                        <option key={r.regiao} value={r.regiao}>
                          {r.regiao}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </div>
            )}

            {fabricasDoCliente.length === 0 && (
              <div
                style={{
                  textAlign: "center",
                  color: "#555",
                  fontSize: 14,
                  padding: "24px 0",
                }}
              >
                Nenhuma fábrica configurada para este cliente.
              </div>
            )}

            {/* Botão Salvar */}
            {fabricasDoCliente.length > 0 && (
              <button
                onClick={salvar}
                disabled={salvando}
                style={{
                  width: "100%",
                  minHeight: 52,
                  borderRadius: 14,
                  border: "none",
                  background: salvando ? "#1a1a1a" : "#00e5a0",
                  color: salvando ? "#555" : "#0f0f0f",
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: salvando ? "not-allowed" : "pointer",
                  marginBottom: 28,
                  transition: "all 200ms ease",
                }}
              >
                {salvando ? "Salvando..." : "Salvar configurações"}
              </button>
            )}

            {/* ====== UI: HISTÓRICO DE PEDIDOS — placeholder ====== */}
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
              Histórico de Pedidos
            </div>
            <div
              style={{
                background: "#1a1a1a",
                border: "1px solid #2e2e2e",
                borderRadius: 16,
                padding: "24px 20px",
                textAlign: "center",
                color: "#555",
                fontSize: 14,
                marginBottom: 28,
              }}
            >
              Em breve
            </div>

            {/* Botão buscar produtos */}
            <button
              onClick={() => router.push(`/buscar-produtos?cliente_id=${clienteId}`)}
              style={{
                width: "100%",
                minHeight: 52,
                borderRadius: 14,
                border: "1px solid #2e2e2e",
                background: "#1a1a1a",
                color: "#f0f0f0",
                fontSize: 15,
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              Buscar produtos para este cliente
            </button>
          </>
        )}
      </div>

      {/* ====== UI: TOAST DE CONFIRMAÇÃO ====== */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 32,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#1a2e25",
            border: "1px solid #00e5a040",
            color: "#00e5a0",
            padding: "12px 24px",
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 600,
            zIndex: 100,
            whiteSpace: "nowrap",
          }}
        >
          Configuracoes salvas
        </div>
      )}
    </div>
  );
}
