import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createServerSupabaseClient } from "@/lib/supabase-server";

// Normaliza texto: lower, remove acento, troca símbolos por espaço, colapsa espaços
function norm(s: any) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function toNumberBR(v: any): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;

  const s = String(v).trim();
  if (!s) return null;

  // remove R$, espaços, etc
  const cleaned = s
    .replace(/\s/g, "")
    .replace("R$", "")
    .replace(/\./g, "") // milhar
    .replace(",", "."); // decimal BR -> ponto

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function findHeaderRow(rows: any[][]) {
  // procura até as primeiras 40 linhas
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const r = rows[i] || [];
    const headers = r.map((c) => norm(c));
    const hasCodigo = headers.some((h) => h === "codigo");
    const hasDesc = headers.some((h) => h.includes("descricao"));
    const hasValor = headers.some((h) => h.includes("valor"));
    if (hasCodigo && (hasDesc || hasValor)) return i;
  }
  return -1;
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: "Envie como multipart/form-data" }, { status: 400 });
    }

    const form = await req.formData();
    const file = form.get("file") as File | null;
    const fabrica_id = (form.get("fabrica_id") as string | null) ?? null;
    const tipo_tabela = ((form.get("tipo_tabela") as string | null) ?? "ecommerce").toLowerCase();

    if (!file) return NextResponse.json({ error: "Arquivo não enviado (campo 'file')." }, { status: 400 });
    if (!fabrica_id) return NextResponse.json({ error: "Selecione a fábrica (fabrica_id)." }, { status: 400 });

    // Lê arquivo (xlsx/csv) via XLSX
    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer" });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    if (!ws) return NextResponse.json({ error: "Planilha vazia." }, { status: 400 });

    // Puxa como matriz de linhas/colunas
    const matrix: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }) as any[][];
    if (!matrix.length) return NextResponse.json({ error: "Nenhuma linha encontrada na planilha." }, { status: 400 });

    const headerRowIndex = findHeaderRow(matrix);
    if (headerRowIndex < 0) {
      return NextResponse.json(
        { error: "Não encontrei a linha de cabeçalho (preciso de algo como 'Código' e 'Descrição...')." },
        { status: 400 }
      );
    }

    const headerRow = matrix[headerRowIndex].map((c) => norm(c));
    const dataRows = matrix.slice(headerRowIndex + 1);

    // mapa header -> index
    const idx = new Map<string, number>();
    headerRow.forEach((h, i) => {
      if (h) idx.set(h, i);
    });

    // aceita variações comuns
    const colCodigo =
      idx.get("codigo") ?? idx.get("cod") ?? null;

    const colDescricao =
      idx.get("descricao do equipamento") ??
      idx.get("descricao") ??
      idx.get("descricao equipamento") ??
      idx.get("produto") ??
      null;

    const colValorUnit =
      idx.get("valor unitario") ??
      idx.get("valor") ??
      idx.get("preco") ??
      null;

    // ecommerce costuma ter
    const colValorFrete =
      idx.get("valor c frete") ??
      idx.get("valor com frete") ??
      idx.get("valor c // frete") ??
      idx.get("valor c frete") ??
      null;

    const colUnidade =
      idx.get("unidade") ?? idx.get("unid") ?? null;

    if (colCodigo === null || colDescricao === null) {
      return NextResponse.json(
        { error: "Colunas obrigatórias não encontradas: preciso de 'Código' e 'Descrição do equipamento'." },
        { status: 400 }
      );
    }

    const rowsForUpsert = dataRows
      .map((r) => {
        const codigo = String(r[colCodigo] ?? "").trim();
        const descricao = String(r[colDescricao] ?? "").trim();

        if (!codigo || !descricao) return null;

        const valor_unitario = colValorUnit !== null ? toNumberBR(r[colValorUnit]) : null;
        const valor_com_frete = colValorFrete !== null ? toNumberBR(r[colValorFrete]) : null;
        const unidade = colUnidade !== null ? String(r[colUnidade] ?? "").trim() || null : null;

        return {
          fabrica_id,
          tipo_tabela,
          codigo,
          descricao,
          unidade,
          valor_unitario,
          valor_com_frete,
        };
      })
      .filter(Boolean) as any[];

    if (!rowsForUpsert.length) {
      return NextResponse.json({ error: "Nenhuma linha válida para importar." }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();

    // IMPORTANTE: conflito por fabrica_id + tipo_tabela + codigo
    const { error } = await supabase
      .from("produtos")
      .upsert(rowsForUpsert, { onConflict: "fabrica_id,tipo_tabela,codigo" });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ imported: rowsForUpsert.length, tipo_tabela });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}