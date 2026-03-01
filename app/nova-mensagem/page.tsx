"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { buscarProdutos } from "@/lib/produtos";
import { useRouter } from "next/navigation";

type ResultadoIA = {
  categoria: string;
  prioridade: string;
  sugestao: string;
  dadosExtraidos?: {
    quantidade?: number | null;
    condicao?: string | null;
    codigoProduto?: string | null;
  };
};

function Badge({ children }: { children: React.ReactNode }) {
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
        fontWeight: 700,
        color: "#111827",
      }}
    >
      {children}
    </span>
  );
}

export default function NovaMensagem() {
  const router = useRouter();

  const [mensagem, setMensagem] = useState("");
  const [cliente, setCliente] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // ✅ Fábricas
  const [fabricas, setFabricas] = useState<{ id: string; nome: string }[]>([]);
  const [fabricaId, setFabricaId] = useState<string>("");

  useEffect(() => {
    async function loadFabricas() {
      const { data } = await supabase.from("fabricas").select("*").order("nome");
      if (data) setFabricas(data);
    }
    loadFabricas();
  }, []);

  const exemplo = useMemo(
    () =>
      `Ex.: "Preciso de 2 GPX45 30/60/90"\nEx.: "Quanto tá o FT-200?"\nEx.: "Oi Pedro, me passa o preço da coifa 1.20 inox?"\nEx.: "Urgente: preciso disso hoje"`,
    []
  );

  const montarSugestaoCatalogo = (itens: any[]) => {
    if (!itens || itens.length === 0) {
      return "Não encontrei esse item na tabela dessa fábrica. Você tem o código do produto ou pode me passar mais detalhes (modelo/voltagem/medida)?";
    }

    if (itens.length === 1) {
      const p = itens[0];
      return `Encontrei aqui ✅\n${p.codigo ? `${p.codigo} — ` : ""}${p.descricao}\nPreço: ${
        p.preco ?? "-"
      }${p.unidade ? ` (${p.unidade})` : ""}\n\nQuer que eu já monte a cotação com quantidade e condição de pagamento?`;
    }

    const top = itens.slice(0, 3);
    return (
      "Encontrei algumas opções parecidas ✅\n" +
      top
        .map(
          (p: any, i: number) =>
            `${i + 1}) ${p.codigo ? `${p.codigo} — ` : ""}${p.descricao} | ${p.preco ?? "-"}${
              p.unidade ? ` (${p.unidade})` : ""
            }`
        )
        .join("\n") +
      "\n\nQual dessas opções é a correta?"
    );
  };

  const handleAnalisar = async () => {
    setErro(null);

    if (!mensagem.trim()) {
      setErro("Cole uma mensagem primeiro.");
      return;
    }

    setCarregando(true);

    try {
      // 1) IA
      const res = await fetch("/api/analisar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensagem }),
      });

      if (!res.ok) throw new Error("Falha ao analisar a mensagem.");

      const data = (await res.json()) as ResultadoIA;

      // 2) Insere no banco com sugestão da IA (salva também sugestao_ia)
      const { data: inserted, error: insertError } = await supabase
        .from("mensagens")
        .insert([
          {
            cliente: cliente || "Cliente",
            mensagem_original: mensagem,
            categoria: data.categoria,
            prioridade: data.prioridade,
            sugestao: data.sugestao, // sugestão final (inicialmente IA)
            sugestao_ia: data.sugestao, // guarda IA
            sugestao_catalogo: null, // ainda vazio
            status: "Novo",
            fabrica_id: fabricaId || null,
          },
        ])
        .select()
        .single();

      if (insertError) throw new Error(insertError.message);

      // 3) Se tiver fábrica, busca catálogo e atualiza a sugestão final
      if (fabricaId) {
        const itens = await buscarProdutos({ fabricaId, termo: mensagem });
        const sugestaoCat = montarSugestaoCatalogo(itens as any[]);

        const { error: updError } = await supabase
          .from("mensagens")
          .update({
            sugestao: sugestaoCat,
            sugestao_catalogo: sugestaoCat,
          })
          .eq("id", inserted.id);

        if (updError) throw new Error(updError.message);
      }

      // 4) Vai para tela da mensagem
      router.push(`/mensagem/${inserted.id}`);
    } catch (e: any) {
      setErro(e?.message || "Não consegui analisar agora. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  };

  const handleLimpar = () => {
    setMensagem("");
    setCliente("");
    setErro(null);
  };

  return (
    <main>
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <a
            href="/"
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
            }}
          >
            ← Início
          </a>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a
              href="/upload-tabelas"
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
              }}
            >
              Upload de tabelas
            </a>

            <a
              href="/inbox"
              style={{
                display: "inline-block",
                padding: "10px 14px",
                borderRadius: 14,
                background: "#111827",
                color: "#FFFFFF",
                fontWeight: 900,
                textDecoration: "none",
                fontSize: 16,
              }}
            >
              Ver Inbox →
            </a>
          </div>
        </div>

        <div
          style={{
            background: "#FFFFFF",
            border: "1px solid #E5E7EB",
            borderRadius: 16,
            padding: 20,
            boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 30, letterSpacing: -0.5 }}>Copiloto – Nova Mensagem</h1>
              <p style={{ margin: "6px 0 0", color: "#6B7280", fontSize: 16 }}>
                Cole a mensagem do WhatsApp, analise e o sistema já abre a tela da mensagem.
              </p>
            </div>

            <Badge>Versão 0.1</Badge>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Mensagem</h2>
            <button
              onClick={() => setMensagem(exemplo)}
              style={{
                border: "1px solid #E5E7EB",
                background: "#FFFFFF",
                borderRadius: 12,
                padding: "8px 10px",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Usar exemplos
            </button>
          </div>

          <input
            placeholder="Cliente (ex.: Padaria do João)"
            value={cliente}
            onChange={(e) => setCliente(e.target.value)}
            style={{
              width: "100%",
              marginTop: 12,
              padding: 14,
              borderRadius: 14,
              border: "1px solid #E5E7EB",
              outline: "none",
              fontSize: 16,
              background: "#FCFCFD",
            }}
          />

          <select
            value={fabricaId}
            onChange={(e) => setFabricaId(e.target.value)}
            style={{
              width: "100%",
              marginTop: 12,
              padding: 14,
              borderRadius: 14,
              border: "1px solid #E5E7EB",
              outline: "none",
              fontSize: 16,
              background: "#FCFCFD",
              fontWeight: 800,
            }}
          >
            <option value="">Selecione a fábrica (para buscar no catálogo)</option>
            {fabricas.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>

          <textarea
            placeholder="Cole aqui a mensagem do WhatsApp..."
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            style={{
              width: "100%",
              height: 220,
              marginTop: 12,
              padding: 14,
              borderRadius: 14,
              border: "1px solid #E5E7EB",
              outline: "none",
              fontSize: 16,
              lineHeight: 1.4,
              resize: "vertical",
              background: "#FCFCFD",
            }}
          />

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

          <div style={{ display: "flex", gap: 12, marginTop: 14 }}>
            <button
              onClick={handleAnalisar}
              disabled={carregando}
              style={{
                flex: 1,
                padding: "12px 14px",
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
              {carregando ? "Analisando..." : "Analisar e abrir"}
            </button>

            <button
              onClick={handleLimpar}
              style={{
                padding: "12px 14px",
                fontSize: 16,
                fontWeight: 900,
                borderRadius: 14,
                border: "1px solid #E5E7EB",
                background: "#FFFFFF",
                cursor: "pointer",
              }}
            >
              Limpar
            </button>
          </div>

          <p style={{ marginTop: 12, color: "#6B7280", fontSize: 14 }}>
            Dica: selecione a fábrica para buscar preço automático no catálogo.
          </p>
        </div>
      </div>
    </main>
  );
}