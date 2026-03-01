"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Fabrica = { id: string; nome: string };

export default function UploadTabelasPage() {
  const [fabricas, setFabricas] = useState<Fabrica[]>([]);
  const [fabricaId, setFabricaId] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    async function loadFabricas() {
      const { data } = await supabase.from("fabricas").select("*").order("nome");
      if (data) setFabricas(data);
    }
    loadFabricas();
  }, []);

  const dica = useMemo(
    () =>
      "Formato esperado: colunas como codigo, descricao, preco, unidade (pode ter outras, mas essas ajudam).",
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
      // 1) Envia arquivo para API (backend importa para o banco)
      const form = new FormData();
      form.append("file", arquivo);
      form.append("fabricaId", fabricaId);

      const res = await fetch("/api/upload-tabelas", {
        method: "POST",
        body: form,
      });

      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Falha no upload/import.");

      setOk(`Importação concluída ✅ Itens inseridos/atualizados: ${body.total}`);
      setArquivo(null);
    } catch (e: any) {
      setErro(e?.message || "Erro inesperado.");
    } finally {
      setCarregando(false);
    }
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
              <h1 style={{ margin: 0, fontSize: 28 }}>Upload de Tabelas</h1>
              <p style={{ margin: "6px 0 0", color: "#6B7280", fontSize: 16 }}>{dica}</p>
            </div>

            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid #E5E7EB",
                background: "#F9FAFB",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              Versão 0.1
            </span>
          </div>

          <select
            value={fabricaId}
            onChange={(e) => setFabricaId(e.target.value)}
            style={{
              width: "100%",
              marginTop: 16,
              padding: 14,
              borderRadius: 14,
              border: "1px solid #E5E7EB",
              fontSize: 16,
              fontWeight: 700,
              background: "#FCFCFD",
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
              border: "1px solid #E5E7EB",
              fontSize: 16,
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
                fontWeight: 700,
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
                fontWeight: 800,
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
      </div>
    </main>
  );
}