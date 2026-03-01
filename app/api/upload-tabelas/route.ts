import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

function supabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

function normKey(k: string) {
  return k.trim().toLowerCase();
}

function pick(row: any, keys: string[]) {
  const rowKeys = Object.keys(row);
  for (const k of keys) {
    const found = rowKeys.find((kk) => normKey(kk) === normKey(k));
    if (found) return row[found];
  }
  return null;
}

function toNumber(v: any): number | null {
  if (v === "" || v === null || v === undefined) return null;
  const s = v.toString().trim().replace(/\./g, "").replace(",", "."); // suporta 1.234,56
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const fabricaId = (form.get("fabricaId") as string | null) || "";

    if (!file) return NextResponse.json({ error: "Arquivo não enviado." }, { status: 400 });
    if (!fabricaId) return NextResponse.json({ error: "Fábrica não informada." }, { status: 400 });

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // 1) Ler XLSX/CSV
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" }) as any[];

    if (!rows.length) return NextResponse.json({ error: "Planilha vazia." }, { status: 400 });

    // 2) Montar payload
    const payload = rows
      .map((r) => {
        const codigo = (pick(r, ["codigo", "código", "sku", "ref"]) ?? "").toString().trim();
        const descricao = (pick(r, ["descricao", "descrição", "produto", "descricao_produto"]) ?? "")
          .toString()
          .trim();
        const preco = toNumber(pick(r, ["preco", "preço", "valor", "preco_unitario"]));
        const unidade = (pick(r, ["unidade", "und", "unid"]) ?? "").toString().trim();

        // exige pelo menos descrição
        if (!descricao) return null;

        return {
          fabrica_id: fabricaId,
          codigo: codigo || null,
          descricao,
          preco,
          unidade: unidade || null,
          updated_at: new Date().toISOString(),
        };
      })
      .filter(Boolean) as any[];

    if (!payload.length) {
      return NextResponse.json({ error: "Nenhuma linha válida para importar." }, { status: 400 });
    }

    const sb = supabaseServer();

    // 3) UPSERT (sem duplicar)
    // IMPORTANTÍSSIMO: isso depende do seu unique index (fabrica_id, codigo) where codigo not null
    // Para linhas sem codigo, o upsert não consegue "bater" e vai inserir como novo (ok).
    const { error: upsertError } = await sb
      .from("produtos")
      .upsert(payload, { onConflict: "fabrica_id,codigo", ignoreDuplicates: false });

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 400 });
    }

    // 4) Salvar arquivo no Storage também (auditoria)
    const path = `${fabricaId}/${Date.now()}-${file.name}`;
    const { error: storageErr } = await sb.storage.from("tabelas-fabricas").upload(path, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: true,
    });

    if (storageErr) {
      // Não falha a importação por causa do storage
      return NextResponse.json(
        { total: payload.length, warning: storageErr.message, path: null },
        { status: 200 }
      );
    }

    return NextResponse.json({ total: payload.length, path }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erro inesperado." }, { status: 500 });
  }
}