import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabaseClient";

// (Opcional, mas ajuda quando o Next tenta rodar em edge)
// export const runtime = "nodejs";

// ====== PARSER: NORMALIZAÇÃO DE TEXTO ======
function norm(s: any) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[^a-z0-9]+/g, " ") // troca símbolos por espaço
    .trim()
    .replace(/\s+/g, " ");
}

// ====== PARSER: NÚMERO BRL (1.234,56) ======
function toNumberBR(v: any): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;

  const s = String(v).trim();
  if (!s) return null;

  const cleaned = s
    .replace(/\s/g, "")
    .replace("R$", "")
    .replace(/\./g, "") // remove milhar
    .replace(",", "."); // decimal

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// ====== PARSER: ACHAR LINHA DE CABEÇALHO ======
// Suporta múltiplos formatos de planilha:
// - GPANIZ:      "Codigo", "Descricao do Equipamento", "Valor Unitario"
// - Gastromaq:   "Modelo Produto", "Descrição do Produto", "Valor Unitario", "28/56/84"
function findHeaderRow(rows: any[][]) {
  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    const r = rows[i] || [];
    const headers = r.map((c) => norm(c));

    // Indicadores de coluna de código (vários formatos)
    const hasCodigo = headers.some(
      (h) => h === "codigo" || h === "modelo produto" || h.includes("cod prod") || h.includes("modelo produto")
    );
    const hasDesc = headers.some((h) => h.includes("descricao"));
    const hasValor = headers.some((h) => h.includes("valor"));

    if (hasCodigo && (hasDesc || hasValor)) return i;
  }
  return -1;
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();

    // ====== UPLOAD: PEGAR ARQUIVO (ACEITA NOMES DIFERENTES) ======
    const file =
      (form.get("file") as File | null) ||
      (form.get("arquivo") as File | null) ||
      (form.get("planilha") as File | null);

    // ====== UPLOAD: PEGAR FABRICA (ACEITA NOVO E ANTIGO) ======
    const fabrica_id =
      (form.get("fabrica_id") as string | null) ||
      (form.get("fabricaId") as string | null);

    const tipo_tabela = ((form.get("tipo_tabela") as string | null) ?? "ecommerce").toLowerCase();

    if (!file) return NextResponse.json({ error: "Arquivo não enviado." }, { status: 400 });
    if (!fabrica_id) return NextResponse.json({ error: "Fábrica não informada." }, { status: 400 });

    const filename = (file.name || "").toLowerCase();

    // ====== PARSE: LER XLSX/CSV ======
    let matrix: any[][] = [];

    if (filename.endsWith(".xlsx") || filename.endsWith(".xls")) {
      const buf = Buffer.from(await file.arrayBuffer());
      const wb = XLSX.read(buf, { type: "buffer" });
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      matrix = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }) as any[][];
    } else if (filename.endsWith(".csv")) {
      const text = await file.text();
      const wb = XLSX.read(text, { type: "string" });
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      matrix = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }) as any[][];
    } else {
      return NextResponse.json({ error: "Formato inválido. Envie .xlsx, .xls ou .csv." }, { status: 400 });
    }

    if (!matrix.length) {
      return NextResponse.json({ error: "Planilha vazia." }, { status: 400 });
    }

    // ====== PARSE: ACHAR CABEÇALHO ======
    const headerIndex = findHeaderRow(matrix);
    if (headerIndex < 0) {
      return NextResponse.json(
        { error: "Não encontrei o cabeçalho (preciso de colunas como 'Código' e 'Descrição...')." },
        { status: 400 }
      );
    }

    const headerRow = (matrix[headerIndex] || []).map((c) => norm(c));
    const dataRows = matrix.slice(headerIndex + 1);

    // ====== PARSE: MAPEAR COLUNAS (FLEXÍVEL) ======
    const colMap: { [k: string]: number | null } = {
      codigo: null,
      descricao: null,
      valor_unitario: null,
      valor_com_frete: null,
      unidade: null,
    };

    // ====== PARSE: MAPEAMENTO DE COLUNAS (MULTI-FORMATO) ======
    // Suporta variações de nomes de coluna entre fábricas diferentes.
    headerRow.forEach((col, idx) => {
      // Código do produto
      if (col === "codigo" || col === "modelo produto" || col.includes("cod prod"))
        colMap.codigo = colMap.codigo ?? idx;

      // Descrição
      else if (col.includes("descricao"))
        colMap.descricao = colMap.descricao ?? idx;

      // Valor unitário / à vista
      else if (col.includes("valor unitario") || col === "valor")
        colMap.valor_unitario = colMap.valor_unitario ?? idx;

      // Valor com frete / a prazo (ex: "28/56/84" → normalizado "28 56 84")
      else if (col.includes("frete") || col === "28 56 84")
        colMap.valor_com_frete = colMap.valor_com_frete ?? idx;

      // Unidade
      else if (col.includes("unidade"))
        colMap.unidade = colMap.unidade ?? idx;
    });

    if (colMap.codigo === null || colMap.descricao === null) {
      return NextResponse.json(
        { error: "Colunas obrigatórias não encontradas: 'Código' e 'Descrição'." },
        { status: 400 }
      );
    }

    // ====== PARSE: TRANSFORMAR EM LINHAS PARA UPSERT ======
    const rowsForUpsert = dataRows
      .map((r) => {
        const rawCodigo = r[colMap.codigo as number];
        const rawDescricao = r[colMap.descricao as number];

        const codigo = String(rawCodigo ?? "").trim();
        const descricao = String(rawDescricao ?? "").trim();

        if (!codigo || !descricao) return null;

        const valor_unitario =
          colMap.valor_unitario !== null ? toNumberBR(r[colMap.valor_unitario]) : null;

        const valor_com_frete =
          colMap.valor_com_frete !== null ? toNumberBR(r[colMap.valor_com_frete]) : null;

        const unidade =
          colMap.unidade !== null ? (String(r[colMap.unidade] ?? "").trim() || null) : null;

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

    // ====== DEDUP: EVITAR ON CONFLICT DUPLICADO ======
    // PostgreSQL não aceita dois updates na mesma linha num único upsert batch.
    // Deduplica por (fabrica_id, tipo_tabela, codigo) mantendo a última ocorrência.
    const deduped = Object.values(
      rowsForUpsert.reduce((acc, row) => {
        const key = `${row.fabrica_id}||${row.tipo_tabela}||${row.codigo}`;
        acc[key] = row; // última ocorrência vence
        return acc;
      }, {} as Record<string, (typeof rowsForUpsert)[0]>)
    );

    // ====== DB: UPSERT (NÃO SOBRESCREVER ECOMMERCE/ESPECIAL) ======
    // usa o client já existente

    const { error } = await supabase
      .from("produtos")
      .upsert(deduped, { onConflict: "fabrica_id,tipo_tabela,codigo" });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ imported: deduped.length, tipo_tabela });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erro inesperado." }, { status: 500 });
  }
}