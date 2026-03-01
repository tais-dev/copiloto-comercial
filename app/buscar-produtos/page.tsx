"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { buscarProdutos } from "@/lib/produtos";

type Fabrica = { id: string; nome: string };

type Produto = {
  id: string;
  codigo: string | null;
  descricao: string;
  preco: number | null;
  unidade: string | null;
};

export default function BuscarProdutosPage() {
  const [fabricas, setFabricas] = useState<Fabrica[]>([]);
  const [fabricaId, setFabricaId] = useState("");
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<Produto[]>([]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    async function loadFabricas() {
      const { data } = await supabase.from("fabricas").select("*").order("nome");
      if (data) setFabricas(data);
    }
    loadFabricas();
  }, []);

  async function handleBuscar() {
    setStatus("Buscando...");
    const itens = await buscarProdutos({ fabricaId, termo });
    setResultados(itens as Produto[]);
    setStatus(`Encontrados: ${itens.length}`);
  }

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800 }}>Buscar Produtos</h1>

      <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <select
          value={fabricaId}
          onChange={(e) => setFabricaId(e.target.value)}
          style={{ padding: 10, borderRadius: 8, minWidth: 260 }}
        >
          <option value="">Selecione a fábrica</option>
          {fabricas.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome}
            </option>
          ))}
        </select>

        <input
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Digite o código (FT-100) ou parte da descrição (forno)"
          style={{ padding: 10, borderRadius: 8, minWidth: 360, border: "1px solid #ddd" }}
        />

        <button
          onClick={handleBuscar}
          disabled={!fabricaId || !termo.trim()}
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid #ddd",
            background: "white",
            cursor: "pointer",
            fontWeight: 700,
            opacity: !fabricaId || !termo.trim() ? 0.5 : 1,
          }}
        >
          Buscar
        </button>
      </div>

      {status && <div style={{ marginTop: 12 }}>{status}</div>}

      <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
        {resultados.map((p) => (
          <div
            key={p.id}
            style={{
              background: "white",
              border: "1px solid #e5e7eb",
              borderRadius: 14,
              padding: 14,
            }}
          >
            <div style={{ fontWeight: 800 }}>
              {p.codigo || "Sem código"} — {p.descricao}
            </div>
            <div style={{ marginTop: 6, color: "#444" }}>
              Preço: {p.preco ?? "-"} {p.unidade ? `(${p.unidade})` : ""}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}