"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Msg = {
  id: string;
  cliente: string | null;
  mensagem_original: string;
  categoria: string | null;
  prioridade: string | null;
  sugestao: string | null; // sugestão final
  sugestao_ia?: string | null;
  sugestao_catalogo?: string | null;
  status: string | null;
  created_at: string;
  fabrica_id?: string | null;
};

type Fabrica = { id: string; nome: string };

function formatHora(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString();
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid #E5E7EB",
        background: "#F9FAFB",
        fontSize: 14,
        fontWeight: 800,
        color: "#111827",
      }}
    >
      {children}
    </span>
  );
}

function CardBox({
  title,
  subtitle,
  children,
  tone = "light",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  tone?: "light" | "dark";
}) {
  const bg = tone === "dark" ? "#111827" : "#F9FAFB";
  const color = tone === "dark" ? "#FFFFFF" : "#111827";
  const border = tone === "dark" ? "#111827" : "#E5E7EB";

  return (
    <div style={{ marginTop: 14, border: `1px solid ${border}`, borderRadius: 14, padding: 14, background: bg }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 900, color: tone === "dark" ? "#E5E7EB" : "#6B7280" }}>
            {title}
          </div>
          {subtitle ? (
            <div style={{ marginTop: 4, fontSize: 14, fontWeight: 800, color: tone === "dark" ? "#FFFFFF" : "#111827" }}>
              {subtitle}
            </div>
          ) : null}
        </div>
      </div>

      <div style={{ marginTop: 10, whiteSpace: "pre-wrap", fontSize: 16, lineHeight: 1.4, fontWeight: 800, color }}>
        {children}
      </div>
    </div>
  );
}

export default function MensagemDetalhe() {
  const pathname = usePathname();
  const router = useRouter();
  const id = pathname?.split("/mensagem/")[1] ?? "";

  const [msg, setMsg] = useState<Msg | null>(null);
  const [fabrica, setFabrica] = useState<Fabrica | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const sugestaoFinal = useMemo(() => msg?.sugestao ?? "", [msg]);
  const sugestaoIA = useMemo(() => msg?.sugestao_ia ?? null, [msg]);
  const sugestaoCat = useMemo(() => msg?.sugestao_catalogo ?? null, [msg]);

  const carregar = async () => {
    if (!id) return;

    setErro(null);
    setCarregando(true);

    const { data, error } = await supabase.from("mensagens").select("*").eq("id", id).single();

    if (error) {
      setErro(error.message);
      setCarregando(false);
      return;
    }

    const m = data as Msg;
    setMsg(m);

    // carrega nome da fábrica (se tiver)
    if (m.fabrica_id) {
      const { data: fab } = await supabase.from("fabricas").select("id,nome").eq("id", m.fabrica_id).single();
      if (fab) setFabrica(fab as Fabrica);
      else setFabrica(null);
    } else {
      setFabrica(null);
    }

    setCarregando(false);
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const marcarResolvido = async () => {
    if (!id) return;

    const { error } = await supabase.from("mensagens").update({ status: "Resolvido" }).eq("id", id);

    if (error) {
      alert("Erro: " + error.message);
      return;
    }

    await carregar();
  };

  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      alert("Não consegui copiar automaticamente. Copie manualmente.");
    }
  };

  const irConsultarCatalogo = () => {
    if (!msg) return;
    const fab = msg.fabrica_id ? `fabricaId=${encodeURIComponent(msg.fabrica_id)}` : "";
    const q = msg.mensagem_original ? `q=${encodeURIComponent(msg.mensagem_original)}` : "";
    const join = fab && q ? "&" : "";
    const qs = fab || q ? `?${fab}${join}${q}` : "";
    router.push(`/${qs}`);
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#F3F4F6",
        padding: 24,
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
      }}
    >
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "space-between" }}>
          <a
            href="/inbox"
            style={{
              display: "inline-block",
              padding: "10px 14px",
              borderRadius: 14,
              background: "#FFFFFF",
              border: "1px solid #E5E7EB",
              color: "#111827",
              fontWeight: 900,
              textDecoration: "none",
              fontSize: 16,
              height: "fit-content",
            }}
          >
            ← Voltar para Inbox
          </a>

          <button
            onClick={irConsultarCatalogo}
            style={{
              padding: "10px 14px",
              borderRadius: 14,
              border: "1px solid #E5E7EB",
              background: "#FFFFFF",
              fontWeight: 900,
              cursor: "pointer",
              fontSize: 16,
            }}
          >
            Consultar catálogo →
          </button>
        </div>

        {erro && (
          <div
            style={{
              marginTop: 14,
              padding: 12,
              borderRadius: 14,
              border: "1px solid #FCA5A5",
              background: "#FEF2F2",
              color: "#991B1B",
              fontWeight: 900,
            }}
          >
            Erro: {erro}
          </div>
        )}

        {carregando ? (
          <div
            style={{
              marginTop: 16,
              padding: 14,
              borderRadius: 14,
              border: "1px dashed #D1D5DB",
              background: "#FAFAFA",
              color: "#6B7280",
              fontWeight: 800,
            }}
          >
            Carregando...
          </div>
        ) : !msg ? (
          <div
            style={{
              marginTop: 16,
              padding: 14,
              borderRadius: 14,
              border: "1px dashed #D1D5DB",
              background: "#FAFAFA",
              color: "#6B7280",
              fontWeight: 800,
            }}
          >
            Mensagem não encontrada.
          </div>
        ) : (
          <div
            style={{
              marginTop: 16,
              background: "#FFFFFF",
              border: "1px solid #E5E7EB",
              borderRadius: 16,
              padding: 16,
              boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <h1 style={{ margin: 0, fontSize: 26, letterSpacing: -0.5 }}>{msg.cliente ?? "Cliente"}</h1>
                <p style={{ marginTop: 6, color: "#6B7280", fontSize: 14, fontWeight: 800 }}>
                  {formatHora(msg.created_at)}
                </p>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", height: "fit-content" }}>
                {msg.categoria ? <Pill>{msg.categoria}</Pill> : null}
                {msg.prioridade ? <Pill>Prioridade: {msg.prioridade}</Pill> : null}
                <Pill>Status: {msg.status ?? "Novo"}</Pill>
                {fabrica?.nome ? <Pill>Fábrica: {fabrica.nome}</Pill> : null}
              </div>
            </div>

            <CardBox title="Mensagem original">{msg.mensagem_original}</CardBox>

            {/* ✅ Sugestão FINAL (o que ele vai enviar) */}
            <CardBox title="Sugestão final (para enviar)" tone="dark">
              {sugestaoFinal || "—"}
            </CardBox>

            <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
              <button
                onClick={() => copiar(sugestaoFinal)}
                disabled={!sugestaoFinal}
                style={{
                  flex: 1,
                  minWidth: 220,
                  padding: "12px 12px",
                  borderRadius: 14,
                  border: "1px solid #E5E7EB",
                  background: "#FFFFFF",
                  fontWeight: 900,
                  cursor: "pointer",
                  opacity: sugestaoFinal ? 1 : 0.6,
                }}
              >
                Copiar sugestão final
              </button>

              <button
                onClick={marcarResolvido}
                style={{
                  flex: 1,
                  minWidth: 220,
                  padding: "12px 12px",
                  borderRadius: 14,
                  border: "1px solid #111827",
                  background: "#111827",
                  color: "#FFFFFF",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                Marcar como Resolvido
              </button>
            </div>

            {/* ✅ Extras: mostra IA e Catálogo separados (se existirem) */}
            {sugestaoCat && sugestaoCat !== sugestaoFinal ? (
              <CardBox title="Sugestão do Catálogo (referência)">{sugestaoCat}</CardBox>
            ) : null}

            {sugestaoIA && sugestaoIA !== sugestaoFinal ? (
              <CardBox title="Sugestão da IA (referência)">{sugestaoIA}</CardBox>
            ) : null}

            {msg.fabrica_id ? (
              <p style={{ marginTop: 12, color: "#6B7280", fontSize: 14, fontWeight: 800 }}>
                Dica: se não encontrar o item, clique em <b>Consultar catálogo</b> para pesquisar manualmente por código/descrição.
              </p>
            ) : (
              <p style={{ marginTop: 12, color: "#6B7280", fontSize: 14, fontWeight: 800 }}>
                Dica: selecione uma fábrica na Nova Mensagem para o sistema buscar preço automático.
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}