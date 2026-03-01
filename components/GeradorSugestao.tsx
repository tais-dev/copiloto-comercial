"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { buscarProdutos } from "@/lib/produtos";

type Fabrica = { id: string; nome: string };

export default function GeradorSugestao({
  mensagemId,
  mensagemOriginal,
  fabricaIdInicial,
  onSaved,
}: {
  mensagemId: string;
  mensagemOriginal: string;
  fabricaIdInicial?: string | null;
  onSaved?: () => void;
}) {
  const [fabricas, setFabricas] = useState<Fabrica[]>([]);
  const [fabricaId, setFabricaId] = useState<string>(fabricaIdInicial || "");
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.from("fabricas").select("*").order("nome");
      if (!error && data) setFabricas(data);
    }
    load();
  }, []);

  async function salvarFabrica(id: string) {
    setFabricaId(id);
    setStatus("Salvando fábrica...");

    const { error } = await supabase.from("mensagens").update({ fabrica_id: id }).eq("id", mensagemId);

    if (error) setStatus("Erro ao salvar fábrica: " + error.message);
    else {
      setStatus("Fábrica salva.");
      onSaved?.();
    }
  }

  async function gerarSugestao() {
    if (!fabricaId) {
      setStatus("Selecione a fábrica antes.");
      return;
    }

    setStatus("Gerando sugestão...");

    const itens = await buscarProdutos({ fabricaId, termo: mensagemOriginal });

    let sugestao = "";

    if (!itens || itens.length === 0) {
      sugestao =
        "Não encontrei esse item na tabela dessa fábrica. Você tem o código do produto ou pode me passar mais detalhes (modelo/voltagem/medida)?";
    } else if (itens.length === 1) {
      const p: any = itens[0];
      sugestao = `Encontrei aqui ✅\n${p.codigo ? `${p.codigo} — ` : ""}${p.descricao}\nPreço: ${
        p.preco ?? "-"
      }${p.unidade ? ` (${p.unidade})` : ""}\n\nQuer que eu já monte a cotação com quantidade e condição de pagamento?`;
    } else {
      const top = (itens as any[]).slice(0, 3);
      sugestao =
        "Encontrei algumas opções parecidas ✅\n" +
        top
          .map(
            (p, i) =>
              `${i + 1}) ${p.codigo ? `${p.codigo} — ` : ""}${p.descricao} | ${
                p.preco ?? "-"
              }${p.unidade ? ` (${p.unidade})` : ""}`
          )
          .join("\n") +
        "\n\nQual dessas opções é a correta?";
    }

    const { error } = await supabase.from("mensagens").update({ sugestao }).eq("id", mensagemId);

    if (error) setStatus("Erro ao salvar sugestão: " + error.message);
    else {
      setStatus("Sugestão gerada e salva!");
      onSaved?.();
    }
  }

  return (
    <div
      style={{
        marginTop: 14,
        padding: 14,
        borderRadius: 14,
        border: "1px solid #E5E7EB",
        background: "#FFFFFF",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 900, color: "#111827" }}>Gerar sugestão (Catálogo)</div>
        {status ? (
          <div style={{ color: "#6B7280", fontSize: 13, fontWeight: 800 }}>{status}</div>
        ) : null}
      </div>

      <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <select
          value={fabricaId}
          onChange={(e) => salvarFabrica(e.target.value)}
          style={{ padding: 10, borderRadius: 12, border: "1px solid #E5E7EB", minWidth: 280 }}
        >
          <option value="">Selecione a fábrica</option>
          {fabricas.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome}
            </option>
          ))}
        </select>

        <button
          onClick={gerarSugestao}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid #E5E7EB",
            background: "#111827",
            color: "#FFFFFF",
            cursor: "pointer",
            fontWeight: 900,
          }}
        >
          Gerar sugestão
        </button>
      </div>
    </div>
  );
}