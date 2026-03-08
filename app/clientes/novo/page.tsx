"use client";

// ====== CLIENTS (CRUD) — CADASTRO DE NOVO CLIENTE ======
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

// ====== CONSTANTES ======
const CANAIS = [
  { value: "distribuidor", label: "Distribuidor" },
  { value: "revenda", label: "Revenda" },
  { value: "atacado", label: "Atacado" },
] as const;

const TABELAS_GPANIZ = [
  { value: "normal", label: "Normal" },
  { value: "especial", label: "Especial" },
  { value: "ecommerce", label: "E-commerce" },
] as const;

type FabricaVinculo = {
  slug: string;
  tabela?: string;
};

// ====== UI: HELPER BOTÃO DE GRUPO ======
function BtnGrupo({
  value,
  current,
  cor,
  label,
  onClick,
}: {
  value: string;
  current: string;
  cor: string;
  label: string;
  onClick: () => void;
}) {
  const ativo = value === current;
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: "10px 8px",
        borderRadius: 10,
        border: `1px solid ${ativo ? cor : "#2e2e2e"}`,
        background: ativo ? `${cor}18` : "#1a1a1a",
        color: ativo ? cor : "#888",
        fontSize: 14,
        fontWeight: 600,
        cursor: "pointer",
        minHeight: 48,
        transition: "all 150ms ease",
      }}
    >
      {label}
    </button>
  );
}

// ====== CLIENTS (CRUD) — PAGE NOVO CLIENTE ======
export default function NovoClientePage() {
  const router = useRouter();

  const [razaoSocial, setRazaoSocial] = useState("");
  const [nomeFantasia, setNomeFantasia] = useState("");
  const [canal, setCanal] = useState("distribuidor");

  // Vínculos com fábricas
  const [temAmapa, setTemAmapa] = useState(false);
  const [temGpaniz, setTemGpaniz] = useState(false);
  const [tabelaGpaniz, setTabelaGpaniz] = useState("normal");
  const [temBermar, setTemBermar] = useState(false);

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // ====== CLIENTS (CRUD) — SALVAR NOVO CLIENTE ======
  async function salvar() {
    if (!razaoSocial.trim()) {
      setErro("Razão social é obrigatória.");
      return;
    }

    setSalvando(true);
    setErro(null);

    // 1. Inserir cliente
    const { data: novoCliente, error: clienteError } = await supabase
      .from("clientes")
      .insert({
        razao_social: razaoSocial.trim(),
        nome_fantasia: nomeFantasia.trim() || null,
        canal,
        ativo: true,
      })
      .select("id")
      .single();

    if (clienteError || !novoCliente) {
      setErro(`Erro ao salvar cliente: ${clienteError?.message ?? "desconhecido"}`);
      setSalvando(false);
      return;
    }

    // 2. Inserir vínculos com fábricas selecionadas
    const vinculos: FabricaVinculo[] = [];
    if (temAmapa) vinculos.push({ slug: "amapa" });
    if (temGpaniz) vinculos.push({ slug: "gpaniz", tabela: tabelaGpaniz });
    if (temBermar) vinculos.push({ slug: "bermar" });

    if (vinculos.length > 0) {
      await supabase.from("clientes_fabricas").insert(
        vinculos.map((v) => ({
          cliente_id: novoCliente.id,
          fabrica: v.slug,
          tabela: v.tabela ?? null,
        }))
      );
    }

    // 3. Redirecionar para configurar
    router.push(`/clientes/${novoCliente.id}/configurar`);
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
        <div style={{ fontSize: 17, fontWeight: 700, color: "#f0f0f0" }}>
          Novo Cliente
        </div>
      </div>

      {/* ====== UI: FORMULÁRIO ====== */}
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

        {/* ====== DADOS DO CLIENTE ====== */}
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
          Dados do Cliente
        </div>

        <div
          style={{
            background: "#1a1a1a",
            border: "1px solid #2e2e2e",
            borderRadius: 16,
            padding: "16px 20px",
            marginBottom: 16,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>Nome fantasia</div>
            <input
              value={nomeFantasia}
              onChange={(e) => setNomeFantasia(e.target.value)}
              placeholder="Como chama o cliente..."
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "12px 14px",
                borderRadius: 10,
                border: "1px solid #2e2e2e",
                background: "#242424",
                color: "#f0f0f0",
                fontSize: 15,
                outline: "none",
              }}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>
              Razão social <span style={{ color: "#ef4444" }}>*</span>
            </div>
            <input
              value={razaoSocial}
              onChange={(e) => setRazaoSocial(e.target.value)}
              placeholder="Razão social oficial..."
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "12px 14px",
                borderRadius: 10,
                border: `1px solid ${!razaoSocial.trim() && erro ? "#ef4444" : "#2e2e2e"}`,
                background: "#242424",
                color: "#f0f0f0",
                fontSize: 15,
                outline: "none",
              }}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>Canal</div>
            <div style={{ display: "flex", gap: 8 }}>
              {CANAIS.map((c) => (
                <BtnGrupo
                  key={c.value}
                  value={c.value}
                  current={canal}
                  cor="#f0f0f0"
                  label={c.label}
                  onClick={() => setCanal(c.value)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ====== FÁBRICAS ====== */}
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
          Fábricas
        </div>

        <div
          style={{
            background: "#1a1a1a",
            border: "1px solid #2e2e2e",
            borderRadius: 16,
            padding: "8px 20px",
            marginBottom: 24,
          }}
        >
          {/* Amapá */}
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "14px 0",
              borderBottom: "1px solid #2e2e2e",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={temAmapa}
              onChange={(e) => setTemAmapa(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: "#00e5a0", cursor: "pointer" }}
            />
            <span style={{ fontSize: 15, fontWeight: 600, color: "#00e5a0" }}>Amapá</span>
          </label>

          {/* G.Paniz */}
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "14px 0",
              borderBottom: temGpaniz ? "none" : "1px solid #2e2e2e",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={temGpaniz}
              onChange={(e) => setTemGpaniz(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: "#60a5fa", cursor: "pointer" }}
            />
            <span style={{ fontSize: 15, fontWeight: 600, color: "#60a5fa" }}>G.Paniz</span>
          </label>

          {/* G.Paniz: seletor de tabela */}
          {temGpaniz && (
            <div
              style={{
                paddingBottom: 14,
                borderBottom: "1px solid #2e2e2e",
              }}
            >
              <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>Tipo de tabela</div>
              <div style={{ display: "flex", gap: 8 }}>
                {TABELAS_GPANIZ.map((t) => (
                  <BtnGrupo
                    key={t.value}
                    value={t.value}
                    current={tabelaGpaniz}
                    cor="#60a5fa"
                    label={t.label}
                    onClick={() => setTabelaGpaniz(t.value)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Bermar */}
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "14px 0",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={temBermar}
              onChange={(e) => setTemBermar(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: "#fb923c", cursor: "pointer" }}
            />
            <span style={{ fontSize: 15, fontWeight: 600, color: "#fb923c" }}>Bermar</span>
          </label>
        </div>

        {/* ====== BOTÃO SALVAR ====== */}
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
            transition: "all 200ms ease",
          }}
        >
          {salvando ? "Salvando..." : "Salvar cliente"}
        </button>
      </div>
    </div>
  );
}
