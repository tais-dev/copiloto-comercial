import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";
// ====== UPLOAD: busboy para suportar arquivos grandes (>4MB) sem truncamento ======
import Busboy from "busboy";

// ====== API RUNTIME: Node.js obrigatório para FormData com arquivos grandes ======
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// ====== DB: SUPABASE ADMIN (service_role) ======
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ====== PARSER: NÚMERO — suporta BR (1.234,56) e americano (1,313.00) ======
function toNumberBR(v: any): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/^"|"$/g, "").trim();
  if (!s || s === "-") return null;
  const clean = s.replace(/\s/g, "").replace("R$", "");
  if (/^\d{1,3}(,\d{3})*(\.\d+)?$/.test(clean)) {
    const n = Number(clean.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(clean.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// ====== PARSER: SLUG DA FÁBRICA PELO NOME ======
function nomeParaSlug(nome: string): string {
  const n = nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (n.includes("amapa")) return "amapa";
  if (n.includes("paniz")) return "gpaniz";
  if (n.includes("bermar") || n.includes("gastromaq")) return "bermar";
  return n.replace(/[^a-z0-9]/g, "");
}

// ====== IMPORT (CSV -> STAGING -> UPSERT): PARSER AMAPÁ ======
// Estrutura por posição fixa (não por header dinâmico):
// L1 col[11] = região, L3 col[11] = condição, L8+ = produtos
// col[1]=codigo, col[2]=descricao, col[4]=ipi, col[5]=ncm, col[7]=ean
// col[9]=preco_fob, col[12]=preco_cif, col[15]=preco_redespacho
function parseAmapa(rows: any[][], fabrica_id: string): any[] {
  const regiao = rows[0]?.[11] != null ? String(rows[0][11]).trim() : null;
  const condicao = rows[2]?.[11] != null ? String(rows[2][11]).trim() : null;

  const isLinhaProduto = (row: any[]) => {
    try {
      return (
        row[1] != null && typeof row[1] === "string" && row[1].trim().length > 0 &&
        row[2] != null && typeof row[2] === "string" && row[2].trim().length > 0 &&
        row[9] != null && !isNaN(Number(row[9])) && Number(row[9]) > 0
      );
    } catch { return false; }
  };

  const produtos: any[] = [];
  for (const row of rows.slice(7)) { // L8+ (índice 7+)
    if (!isLinhaProduto(row)) continue;

    const ipiRaw = toNumberBR(row[4]);
    const ipi = ipiRaw != null ? (ipiRaw < 1 ? ipiRaw * 100 : ipiRaw) : null;

    produtos.push({
      fabrica_id,
      fabrica_slug: "amapa",
      tipo_tabela: "amapa", // chave fixa para Amapá no índice único
      codigo: String(row[1]).trim(),
      descricao: String(row[2]).trim(),
      ipi,
      ncm: row[5] != null ? String(row[5]).trim() : null,
      ean: row[7] != null ? String(row[7]).replace(/\.0$/, "").trim() : null,
      preco_fob: toNumberBR(row[9]),
      preco_cif: toNumberBR(row[12]),
      preco_redespacho: toNumberBR(row[15]),
      valor_unitario: toNumberBR(row[9]), // compatibilidade com código existente
      condicao_pagamento: condicao,
      regiao,
    });
  }

  console.log(`[parse-amapa] ${produtos.length} produtos, regiao=${regiao}, condicao=${condicao}`);
  return produtos;
}

// ====== IMPORT (CSV -> STAGING -> UPSERT): PARSER G.PANIZ ======
// Estrutura por posição fixa:
// col[1]=codigo (pode repetir), col[2]=id_fabrica (único por variação)
// col[3]=descricao, col[4]=ncm, col[5]=ean
// col[6]=valor_unitario, col[7]=valor_com_frete (só ecommerce)
function parseGpaniz(rows: any[][], fabrica_id: string, tipo_tabela: string): any[] {
  const isLinhaProduto = (row: any[]) => {
    try {
      return (
        row[1] != null && !isNaN(Number(row[1])) && Number(row[1]) > 0 &&
        row[2] != null && !isNaN(Number(row[2])) && Number(row[2]) > 0 &&
        row[3] != null && String(row[3]).trim().length > 0 &&
        row[6] != null && !isNaN(Number(row[6])) && Number(row[6]) > 0
      );
    } catch { return false; }
  };

  const produtos: any[] = [];
  for (const row of rows) {
    if (!isLinhaProduto(row)) continue;
    produtos.push({
      fabrica_id,
      fabrica_slug: "gpaniz",
      tipo_tabela,
      codigo: String(row[1]),
      id_fabrica: String(row[2]), // chave única por variação (ex: 38097 EPOXI, 38200 INOX)
      descricao: String(row[3]).trim(),
      ncm: row[4] != null ? String(row[4]).trim() : null,
      ean: row[5] != null ? String(row[5]).trim() : null,
      valor_unitario: toNumberBR(row[6]),
      valor_com_frete: toNumberBR(row[7]) ?? null,
    });
  }

  console.log(`[parse-gpaniz] ${produtos.length} produtos, tipo_tabela=${tipo_tabela}`);
  return produtos;
}

// ====== IMPORT (CSV -> STAGING -> UPSERT): PARSER BERMAR — OPCIONAIS ======
// Parseia linhas que começam com '*' — cada código vira um registro separado com opcional=true
// REQUER migration: ALTER TABLE produtos ADD COLUMN opcional boolean DEFAULT false;
//
// Padrões suportados:
//   1. "* Disco de Ralar: cod. 8540 - R$ 243,00"
//   2. "* Disco Desfiador: cod. (8543 -3 mm),(8542 -5 mm),(8541 -8 mm)- R$ 243,00"
//   3. "* Produto A: cod.(9552 -5 mm)- R$ 283,00   * Produto B: cod. 10035 - R$ 366,00"
//   4. "* Grade: cod.8453 -( 8 mm x 8 mm) - R$ 360,00   e   cod.9691- ( 10 mm x 10 mm) - R$ 360,00"
function parseOpcionaisBermar(
  texto: string,
  fabrica_id: string,
  precoFallback: number | null
): any[] {
  const resultado: any[] = [];

  // Segmentar por '*' — cada segmento é um produto distinto
  const segmentos = texto.split("*").map((s) => s.trim()).filter(Boolean);

  for (const seg of segmentos) {
    // Nome base: tudo antes de ':' (ou antes do primeiro 'cod.')
    const nomeBase = (
      seg.match(/^(.+?)(?=\s*:|\s*cod\.?)/i)?.[1] ??
      seg.split(/cod\./i)[0]
    ).trim().replace(/:\s*$/, "");

    // Preço do segmento
    const precoStr = seg.match(/R\$\s*([\d.,]+)/i)?.[1] ?? null;
    const preco = precoStr ? toNumberBR(precoStr) : precoFallback;
    if (!preco || preco <= 0) continue;
    const precoFinal = Math.round(preco * 0.90 * 100) / 100;

    const entradas: { codigo: string; variacao: string | null }[] = [];

    // Pattern A: "(NNNN -VAR)" agrupados após "cod." — pattern 2
    // Ex: cod. (8543 -3 mm),(8542 -5 mm),(8541 -8 mm)
    const patternA = /\((\d+)\s*[-–]\s*([^)]+)\)/g;
    let mA;
    while ((mA = patternA.exec(seg)) !== null) {
      entradas.push({ codigo: mA[1].trim(), variacao: mA[2].trim() });
    }

    if (entradas.length === 0) {
      // Pattern B: "cod. NNNN -(VAR)" — pattern 4
      // Pattern C: "cod. NNNN" simples — patterns 1 e fallback
      const patternBC = /cod\.?\s*(\d+)\s*[-–]?\s*(?:\(([^)]+)\))?/gi;
      let mBC;
      while ((mBC = patternBC.exec(seg)) !== null) {
        entradas.push({
          codigo: mBC[1].trim(),
          variacao: mBC[2]?.trim() ?? null,
        });
      }
    }

    for (const { codigo, variacao } of entradas) {
      const descricao = variacao ? `${nomeBase} ${variacao}`.trim() : nomeBase;
      resultado.push({
        fabrica_id,
        fabrica_slug: "bermar",
        tipo_tabela: "bermar",
        id_fabrica: codigo,
        codigo,
        descricao,
        ipi: 0,
        valor_unitario: precoFinal,
        opcional: true,
      });
    }
  }

  return resultado;
}

// ====== IMPORT (CSV -> STAGING -> UPSERT): PARSER BERMAR ======
// Estrutura por posição fixa (L11+ = índice 10+):
// col[0]: se começa com '*' → linha de opcional (ver parseOpcionaisBermar)
// col[1]=codigo (número), col[2]=descricao, col[3]=motor, col[4]=ipi
// col[5]=preco base (28/56/84 dias) — pode ser null por célula mesclada (herda ultimoPreco)
// Preço final = col[5] * 0.90 (10% de desconto), arredondado 2 casas decimais
function parseBermar(rows: any[][], fabrica_id: string): any[] {
  const produtos: any[] = [];
  let ultimoPreco: number | null = null; // herança de células mescladas em col[5]

  for (const row of rows.slice(10)) { // L11+ (índice 10+)
    // ====== BERMAR: OPCIONAIS — linhas com col[0] começando em '*' ======
    const col0 = String(row[0] ?? "").trim();
    if (col0.startsWith("*")) {
      const opcionais = parseOpcionaisBermar(col0, fabrica_id, ultimoPreco);
      produtos.push(...opcionais);
      continue;
    }

    const cod = row[1];
    const descricao = String(row[2] || "").trim();
    const precoBase = row[5];

    // Atualizar preço herdado sempre que col[5] tiver valor válido
    if (typeof precoBase === "number" && precoBase > 0) {
      ultimoPreco = precoBase;
    }

    // Usar preço da célula ou herdar do último valor (célula mesclada)
    const precoEfetivo = typeof precoBase === "number" && precoBase > 0
      ? precoBase
      : ultimoPreco;

    // Validação: cod deve ser número > 0, descrição não vazia, preço disponível
    if (!cod || typeof cod !== "number" || !descricao || !precoEfetivo || precoEfetivo <= 0) continue;

    const precoFinal = Math.round(precoEfetivo * 0.90 * 100) / 100;

    produtos.push({
      fabrica_id,
      fabrica_slug: "bermar",
      tipo_tabela: "bermar",
      id_fabrica: String(cod),
      codigo: String(cod),
      modelo: row[0] ? String(row[0]).trim() : null, // col[0] = Modelo (ex: "BM 03 NR BIV")
      descricao,
      motor: String(row[3] || ""),
      ipi: typeof row[4] === "number" && row[4] < 1 ? row[4] : 0,
      valor_unitario: precoFinal,
    });
  }

  console.log(`[parse-bermar] ${produtos.length} produtos`);
  return produtos;
}

// ====== IMPORT (CSV -> STAGING -> UPSERT): PARSER OBRAMAX (variante Amapá) ======
// Detecção automática de estrutura — suporta todas as variantes de planilha Obramax:
// - Linha de título pode ser rows[0] (célula A1) ou espalhada por várias células da linha 0
// - Header dos produtos pode estar em rows[1] ou rows[2]
// - Coluna de preço: primeira col >= 7 cujo header contém "REGIÃO" e tem valores numéricos
// - Coluna de IPI: primeira col após preço cujo valor < 1; fallback = 0.0325 (3,25%)
// - Região extraída de qualquer célula da linha 0 que contenha "AMAPÁ" ou "TABELA"
// - material (col[0]) deve ser numérico; preço > 0 obrigatório
// ID fixo da fábrica Amapá — evita busca dinâmica que pode falhar por acentuação/case
const AMAPA_FABRICA_ID = "d6c7f740-c998-48b4-bae6-ae22d4b2d662";

async function handleObramax(buffer: Buffer, nomeArquivo: string): Promise<Response> {
  // ====== OBRAMAX: GUARD — rejeitar planilhas ANTIGAS ======
  if (nomeArquivo.toUpperCase().includes("ANTIGA")) {
    return NextResponse.json(
      { error: "Planilha antiga detectada. Por favor, use a versão mais recente da tabela Obramax." },
      { status: 400 }
    );
  }

  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as any[][];

  // ====== OBRAMAX: DETECTAR MODALIDADE E REGIÃO DA LINHA DE TÍTULO (rows[0]) ======
  // Varre todas as células da linha 0 até achar "FOB"/"CIF" e "AMAPÁ"/"TABELA"
  const tituloRow: any[] = rows[0] ?? [];
  let modalidade: "fob" | "cif" = "cif";
  let regiao = nomeArquivo.replace(/\.[^.]+$/, ""); // fallback = nome do arquivo sem extensão

  for (const cell of tituloRow) {
    const cellStr = String(cell ?? "").toUpperCase();
    if (cellStr.includes("FOB")) modalidade = "fob";
    // Tenta extrair região: "AMAPÁ NomeDaLoja (..." ou "TABELA NomeDaLoja ..."
    const mAmapa = cellStr.match(/AMAPÁ\s+(.+?)\s*\(/i) ?? String(cell ?? "").match(/AMAPÁ\s+(.+?)\s*\(/i);
    const mTabela = String(cell ?? "").match(/TABELA\s+(.+?)\s*\(/i);
    if (mAmapa) { regiao = mAmapa[1].trim(); break; }
    if (mTabela) { regiao = mTabela[1].trim(); }
  }

  const regiaoSlug = regiao
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
  const tipo_tabela = `obramax_${regiaoSlug}`;
  const fabrica_id = AMAPA_FABRICA_ID;

  // ====== OBRAMAX: DETECTAR LINHA DE HEADER (rows[1] ou rows[2]) ======
  // Header é a primeira linha (de rows[1] ou rows[2]) cujo col[0] é texto não-numérico
  let headerRowIdx = 1;
  for (const candidateIdx of [1, 2]) {
    const candidateRow = rows[candidateIdx] ?? [];
    const col0 = String(candidateRow[0] ?? "").trim();
    if (col0 && isNaN(Number(col0))) {
      headerRowIdx = candidateIdx;
      break;
    }
  }
  const headers = rows[headerRowIdx] ?? [];
  const dataStartIdx = headerRowIdx + 1;

  // ====== OBRAMAX: DETECTAR COLUNA DE PREÇO (primeira col >= 7 com "REGIÃO" no header e valores numéricos) ======
  let precoColIdx = -1;
  for (let c = 7; c < headers.length; c++) {
    const h = String(headers[c] ?? "").toUpperCase();
    if (!h.includes("REGIÃO") && !h.includes("REGIAO") && !h.includes("PRECO") && !h.includes("PREÇO")) continue;
    // Verificar se há pelo menos um valor numérico nessa coluna nos primeiros 20 produtos
    const amostra = rows.slice(dataStartIdx, dataStartIdx + 20);
    const temNumerico = amostra.some((r) => {
      const v = toNumberBR(r[c]);
      return v != null && v > 0;
    });
    if (temNumerico) { precoColIdx = c; break; }
  }
  // Fallback: col[7] se nenhuma foi detectada
  if (precoColIdx === -1) precoColIdx = 7;

  // ====== OBRAMAX: DETECTAR COLUNA DE IPI (primeira col após preço com valor < 1) ======
  let ipiColIdx = -1;
  const amostraIpi = rows.slice(dataStartIdx, dataStartIdx + 20);
  for (let c = precoColIdx + 1; c < (headers.length || precoColIdx + 5); c++) {
    const temIpi = amostraIpi.some((r) => {
      const v = r[c];
      if (v == null) return false;
      const n = Number(v);
      return Number.isFinite(n) && n > 0 && n < 1;
    });
    if (temIpi) { ipiColIdx = c; break; }
  }

  console.log(`[obramax] modalidade=${modalidade}, regiao="${regiao}", headerRow=${headerRowIdx}, precoCol=${precoColIdx}, ipiCol=${ipiColIdx}`);

  // ====== OBRAMAX: PARSE DOS PRODUTOS ======
  const IPI_FALLBACK = 0.0325; // 3,25% quando não detectada coluna de IPI
  const produtos: any[] = [];
  for (const row of rows.slice(dataStartIdx)) {
    const material = row[0];
    const descricao = row[1];
    const matFornec = row[5];

    // material deve ser numérico (código do produto no sistema Obramax)
    if (material == null || isNaN(Number(material)) || Number(material) <= 0) continue;
    if (!descricao || String(descricao).trim() === "") continue;

    const precoRaw = toNumberBR(row[precoColIdx]);
    if (precoRaw == null || precoRaw <= 0) continue;

    // IPI: coluna detectada (valor < 1 = percentual fracionário, ex: 0.0325), ou fallback
    let ipi = IPI_FALLBACK;
    if (ipiColIdx !== -1) {
      const ipiVal = row[ipiColIdx];
      if (ipiVal != null) {
        const n = Number(ipiVal);
        if (Number.isFinite(n) && n >= 0) ipi = n;
      }
    }

    const preco = Math.round(precoRaw * 100) / 100;
    produtos.push({
      fabrica_id,
      fabrica_slug: "amapa",
      tipo_tabela,
      codigo: matFornec != null ? String(matFornec).trim() : String(material).trim(),
      id_fabrica: String(material).trim(),
      descricao: String(descricao).trim(),
      ipi,
      preco_fob: modalidade === "fob" ? preco : null,
      preco_cif: modalidade === "cif" ? preco : null,
      valor_unitario: preco,
      regiao,
      condicao_pagamento: "Antecipado",
    });
  }

  if (produtos.length === 0) {
    return NextResponse.json({ error: "Nenhuma linha válida na planilha Obramax." }, { status: 400 });
  }

  // DELETE + INSERT (escopo por tipo_tabela — não afeta outros produtos Amapá)
  const { error: delErr } = await supabaseAdmin
    .from("produtos")
    .delete()
    .eq("fabrica_slug", "amapa")
    .eq("tipo_tabela", tipo_tabela);

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  const { error: insErr } = await supabaseAdmin.from("produtos").insert(produtos);
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  // Criar/encontrar cliente Obramax e vincular à Amapá
  const nomeClienteObramax = `Obramax ${regiao.charAt(0).toUpperCase() + regiao.slice(1).toLowerCase()}`;

  const { data: clienteExistente } = await supabaseAdmin
    .from("clientes")
    .select("id")
    .ilike("razao_social", `%${nomeClienteObramax}%`)
    .maybeSingle();

  let clienteId = clienteExistente?.id ?? null;

  if (!clienteId) {
    const { data: novoCliente } = await supabaseAdmin
      .from("clientes")
      .insert({ razao_social: nomeClienteObramax, nome_fantasia: nomeClienteObramax, ativo: true })
      .select("id")
      .single();
    clienteId = novoCliente?.id ?? null;
  }

  if (clienteId) {
    await supabaseAdmin
      .from("clientes_fabricas")
      .upsert(
        { cliente_id: clienteId, fabrica: "amapa", tabela: tipo_tabela },
        { onConflict: "cliente_id,fabrica" }
      );
  }

  console.log(`[obramax] ${produtos.length} produtos, tipo_tabela=${tipo_tabela}, cliente=${nomeClienteObramax}`);

  return NextResponse.json({
    imported: produtos.length,
    tipo_tabela,
    cliente: nomeClienteObramax,
    fabrica_slug: "amapa",
    modalidade,
    regiao,
  });
}

// ====== CLIENTS (CRUD): DETECTAR DADOS DO CLIENTE POR FÁBRICA ======
function detectarCliente(
  fabrica_slug: string,
  tipo_tabela: string,
  _filename: string
): { razao_social: string; nome_fantasia: string; regiao: string; tabela_nome: string } {
  if (fabrica_slug === "gpaniz") {
    if (tipo_tabela === "especial") return { razao_social: "Milênio Distribuição", nome_fantasia: "Milênio", regiao: "SP — CIF", tabela_nome: "G.Paniz Especial" };
    if (tipo_tabela === "ecommerce") return { razao_social: "E-commerce SP", nome_fantasia: "E-commerce SP", regiao: "SP", tabela_nome: "G.Paniz E-commerce" };
    return { razao_social: "G.Paniz Sul/Sudeste", nome_fantasia: "G.Paniz", regiao: "Sul/Sudeste", tabela_nome: "G.Paniz Normal" };
  }
  if (fabrica_slug === "bermar") {
    return { razao_social: "Bermar Geral", nome_fantasia: "Bermar", regiao: "Brasil", tabela_nome: "Bermar Geral" };
  }
  return { razao_social: `${fabrica_slug} — Geral`, nome_fantasia: fabrica_slug, regiao: "BR", tabela_nome: `${fabrica_slug} ${tipo_tabela}` };
}

// ====== IMPORT (CSV -> STAGING -> UPSERT): LÓGICA PRINCIPAL ======
export async function POST(req: Request) {
  // ====== UPLOAD: parse multipart — tenta formData() nativo primeiro, fallback busboy ======
  let fileBuffer: Buffer | null = null;
  let fileName = "";
  const fields: Record<string, string> = {};

  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: "Content-Type deve ser multipart/form-data." }, { status: 400 });
  }

  // Clonar request para poder tentar duas vezes sem consumir o body
  const reqClone = req.clone();

  // ====== UPLOAD: tentativa 1 — formData() nativo do Next.js (mais confiável para binários) ======
  let parsedViaNative = false;
  try {
    const formData = await req.formData();
    for (const [key, value] of formData.entries()) {
      if (value instanceof File) {
        fileName = value.name;
        fileBuffer = Buffer.from(await value.arrayBuffer());
      } else {
        fields[key] = String(value);
      }
    }
    console.log("[upload-tabelas] Parsed via formData() nativo. Buffer:", fileBuffer?.length ?? 0, "bytes");
    parsedViaNative = true;
  } catch (nativeErr: any) {
    console.warn("[upload-tabelas] formData() falhou, tentando busboy:", nativeErr?.message);
  }

  // ====== UPLOAD: tentativa 2 — busboy (fallback para casos onde formData() falha) ======
  if (!parsedViaNative) {
    try {
      const arrayBuffer = await reqClone.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      console.log("[upload-tabelas] Buffer via busboy:", buffer.length, "bytes");

      await new Promise<void>((resolve, reject) => {
        const bb = Busboy({ headers: { "content-type": contentType }, limits: { fileSize: 50 * 1024 * 1024 } });
        bb.on("field", (name, val) => { fields[name] = val; });
        bb.on("file", (_name, stream, info) => {
          fileName = info.filename;
          const chunks: Buffer[] = [];
          stream.on("data", (chunk: Buffer) => chunks.push(chunk));
          stream.on("end", () => { fileBuffer = Buffer.concat(chunks); });
        });
        bb.on("finish", () => resolve());
        bb.on("error", (err: Error) => reject(err));
        bb.write(buffer);
        bb.end();
      });
    } catch (busboyErr: any) {
      return NextResponse.json({ error: `Erro ao processar arquivo: ${busboyErr?.message ?? "parse inválido"}` }, { status: 400 });
    }
  }

  try {
    // ====== UPLOAD: RESOLVER FÁBRICA (UUID + SLUG) ======
    let fabrica_id: string | null = fields["fabrica_id"] || fields["fabricaId"] || null;
    const fabrica_slug_direto = fields["fabrica_slug"] || null;

    // Resolução slug → UUID
    if (!fabrica_id && fabrica_slug_direto) {
      const { data: todasFabricas } = await supabaseAdmin.from("fabricas").select("id, nome");
      const match = (todasFabricas ?? []).find(
        (f: { id: string; nome: string }) => nomeParaSlug(f.nome) === fabrica_slug_direto
      );
      if (match) fabrica_id = match.id;
    }

    if (!fileBuffer || !fileName)
      return NextResponse.json({ error: "Arquivo não enviado." }, { status: 400 });

    // ====== UPLOAD: DETECÇÃO OBRAMAX — processa antes da validação de fábrica ======
    if (fileName.toUpperCase().includes("OBRAMAX")) {
      return await handleObramax(fileBuffer as Buffer, fileName);
    }

    if (!fabrica_id)
      return NextResponse.json({ error: "Fábrica não encontrada. Envie fabrica_id ou fabrica_slug válido." }, { status: 400 });

    // ====== UPLOAD: DETERMINAR SLUG DA FÁBRICA ANTES DO PARSE ======
    let fabrica_slug = fabrica_slug_direto ?? "";
    if (!fabrica_slug) {
      const { data: fData } = await supabaseAdmin.from("fabricas").select("nome").eq("id", fabrica_id).single();
      if (fData) fabrica_slug = nomeParaSlug(fData.nome);
    }

    if (!["amapa", "gpaniz", "bermar"].includes(fabrica_slug)) {
      return NextResponse.json({ error: `Fábrica não reconhecida: "${fabrica_slug}". Esperado: amapa, gpaniz ou bermar.` }, { status: 400 });
    }

    const tipo_tabela = (fields["tipo_tabela"] ?? "normal").toLowerCase();

    // ====== PARSE: LER XLSX/CSV ======
    let matrix: any[][] = [];
    if (fileName.toLowerCase().endsWith(".xlsx") || fileName.toLowerCase().endsWith(".xls") || fileName.toLowerCase().endsWith(".xlsm")) {
      const wb = XLSX.read(fileBuffer as Buffer, { type: "buffer" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      matrix = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as any[][];
    } else if (fileName.toLowerCase().endsWith(".csv")) {
      let text: string;
      try {
        text = new TextDecoder("windows-1252").decode(fileBuffer as Buffer);
      } catch {
        text = (fileBuffer as Buffer).toString("utf-8");
      }
      const wb = XLSX.read(text, { type: "string", codepage: 1252 });
      const ws = wb.Sheets[wb.SheetNames[0]];
      matrix = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }) as any[][];
    } else {
      return NextResponse.json({ error: "Formato inválido. Envie .xlsx, .xls ou .csv." }, { status: 400 });
    }

    if (!matrix.length) {
      return NextResponse.json({ error: "Planilha vazia." }, { status: 400 });
    }

    console.log("[upload] fabrica_slug:", fabrica_slug, "tipo_tabela:", tipo_tabela, "rows:", matrix.length);

    // ====== PARSE: PARSER POR FÁBRICA (POSIÇÃO FIXA) ======
    let rowsForUpsert: any[] = [];

    if (fabrica_slug === "amapa") {
      rowsForUpsert = parseAmapa(matrix, fabrica_id);
    } else if (fabrica_slug === "gpaniz") {
      rowsForUpsert = parseGpaniz(matrix, fabrica_id, tipo_tabela);
    } else if (fabrica_slug === "bermar") {
      rowsForUpsert = parseBermar(matrix, fabrica_id);
    }

    if (!rowsForUpsert.length) {
      return NextResponse.json({ error: "Nenhuma linha válida para importar. Verifique o formato da planilha." }, { status: 400 });
    }

    // ====== DEDUP: EVITAR DUPLICATAS NO MESMO BATCH ======
    const deduped = Object.values(
      rowsForUpsert.reduce((acc, row) => {
        // G.Paniz e Bermar: chave por id_fabrica; Amapá: chave por codigo
        const uniqueField = (fabrica_slug === "gpaniz" || fabrica_slug === "bermar")
          ? row.id_fabrica
          : row.codigo;
        const key = `${row.fabrica_id}||${row.tipo_tabela}||${uniqueField}`;
        acc[key] = row;
        return acc;
      }, {} as Record<string, any>)
    );

    console.log("[upload] deduped:", deduped.length, "fabrica_slug:", fabrica_slug);

    // ====== DB: SALVAR PRODUTOS (estratégia por fábrica) ======
    // Amapá: upsert com onConflict pelo código — índice não-parcial existe
    // G.Paniz / Bermar: DELETE + INSERT — evita conflito entre fábricas (índices parciais não funcionam com onConflict)
    if (fabrica_slug === "amapa") {
      // DELETE apenas produtos da tabela 'amapa' (preserva obramax_* e outras variantes)
      const { error: delError } = await supabaseAdmin
        .from("produtos")
        .delete()
        .eq("fabrica_slug", "amapa")
        .eq("tipo_tabela", "amapa");

      if (delError) {
        console.error("[upload] delete amapa error:", delError);
        return NextResponse.json({ error: delError.message }, { status: 500 });
      }

      const { error: insError } = await supabaseAdmin
        .from("produtos")
        .insert(deduped);

      if (insError) {
        console.error("[upload] insert amapa error:", insError);
        return NextResponse.json({ error: insError.message }, { status: 500 });
      }
    } else if (fabrica_slug === "gpaniz") {
      // DELETE por fábrica + tipo_tabela (ex: normal, especial, ecommerce)
      const { error: delError } = await supabaseAdmin
        .from("produtos")
        .delete()
        .eq("fabrica_slug", "gpaniz")
        .eq("tipo_tabela", tipo_tabela);

      if (delError) {
        console.error("[upload] delete gpaniz error:", delError);
        return NextResponse.json({ error: delError.message }, { status: 500 });
      }

      const { error: insError } = await supabaseAdmin
        .from("produtos")
        .insert(deduped);

      if (insError) {
        console.error("[upload] insert gpaniz error:", insError);
        return NextResponse.json({ error: insError.message }, { status: 500 });
      }
    } else if (fabrica_slug === "bermar") {
      // DELETE em duas etapas — normais primeiro, opcionais depois
      // (evita conflito de índice único ao reinserir produtos com opcional=true/false)
      const { error: del1Error } = await supabaseAdmin
        .from("produtos")
        .delete()
        .eq("fabrica_slug", "bermar")
        .eq("opcional", false);

      if (del1Error) {
        console.error("[upload] delete bermar (normal) error:", del1Error);
        return NextResponse.json({ error: del1Error.message }, { status: 500 });
      }

      const { error: del2Error } = await supabaseAdmin
        .from("produtos")
        .delete()
        .eq("fabrica_slug", "bermar")
        .eq("opcional", true);

      if (del2Error) {
        console.error("[upload] delete bermar (opcional) error:", del2Error);
        return NextResponse.json({ error: del2Error.message }, { status: 500 });
      }

      const { error: insError } = await supabaseAdmin
        .from("produtos")
        .insert(deduped);

      if (insError) {
        console.error("[upload] insert bermar error:", insError);
        return NextResponse.json({ error: insError.message }, { status: 500 });
      }
    }

    // ====== AMAPÁ: retorno imediato — sem cliente fictício ======
    if (fabrica_slug === "amapa") {
      return NextResponse.json({
        imported: deduped.length,
        tipo_tabela: "amapa",
        cliente: "Amapá Geral",
        fabrica_slug: "amapa",
        precos_importados: 0,
      });
    }

    // ====== IMPORT (CSV -> STAGING -> UPSERT): VINCULAR CLIENTES E PREÇOS (G.Paniz / Bermar) ======
    let clienteResultado: { razao_social: string; id: string } | null = null;
    let tabelaId: string | null = null;
    let precosImportados = 0;
    const avisos: string[] = [];

    try {
      const dadosCliente = detectarCliente(fabrica_slug, tipo_tabela, fileName);

      const { data: clienteUpserted, error: clienteError } = await supabaseAdmin
        .from("clientes")
        .upsert(
          { razao_social: dadosCliente.razao_social, nome_fantasia: dadosCliente.nome_fantasia, regiao: dadosCliente.regiao, ativo: true },
          { onConflict: "razao_social" }
        )
        .select("id, razao_social")
        .single();

      if (clienteError || !clienteUpserted) {
        avisos.push(`Erro ao criar cliente: ${clienteError?.message ?? "desconhecido"}`);
        throw new Error("cliente-error");
      }

      clienteResultado = clienteUpserted;
      const cliente_id = clienteUpserted.id;

      await supabaseAdmin
        .from("clientes_fabricas")
        .upsert(
          { cliente_id, fabrica: fabrica_slug, tabela: tipo_tabela, regiao: dadosCliente.regiao },
          { onConflict: "cliente_id,fabrica" }
        );

      const { data: tabelaData, error: tabelaError } = await supabaseAdmin
        .from("tabelas_preco")
        .insert({ fabrica_slug, nome: dadosCliente.tabela_nome, arquivo_nome: fileName, ativa: true })
        .select("id")
        .single();

      if (tabelaError || !tabelaData) {
        avisos.push(`Erro ao criar tabela de preço: ${tabelaError?.message ?? "desconhecido"}`);
        throw new Error("tabela-error");
      }

      tabelaId = tabelaData.id;

      // ====== BUSCAR PRODUTOS INSERIDOS PELO id_fabrica ======
      // ATENÇÃO: tipo_tabela do Bermar é hardcodado em "bermar" pelo parser,
      // mas fields["tipo_tabela"] chega como "normal" do frontend — usar o tipo real do produto
      const tipoTabelaEfetivo = (deduped[0] as any)?.tipo_tabela ?? tipo_tabela;
      const idFabricaValues = deduped
        .map((r: any) => r.id_fabrica)
        .filter((v: any) => v != null && String(v).trim() !== "");
      const { data: produtosImportados, error: prodBuscaError } = await supabaseAdmin
        .from("produtos")
        .select("id, codigo, id_fabrica, valor_unitario, valor_com_frete")
        .eq("fabrica_id", fabrica_id)
        .eq("tipo_tabela", tipoTabelaEfetivo)
        .in("id_fabrica", idFabricaValues);

      if (prodBuscaError || !produtosImportados?.length) {
        console.error("[upload] prodBuscaError:", prodBuscaError, "| tipo_tabela:", tipoTabelaEfetivo, "| idFabricaValues count:", idFabricaValues.length, "| found:", produtosImportados?.length ?? 0);
        avisos.push(`Produtos importados mas preços não puderam ser vinculados. [tipo=${tipoTabelaEfetivo}, ids=${idFabricaValues.length}, found=${produtosImportados?.length ?? 0}]`);
        throw new Error("produtos-not-found");
      }

      const precosRows = produtosImportados
        .filter((p: any) => p.valor_unitario != null)
        .map((p: any) => ({
          cliente_id,
          produto_id: p.id,
          tabela_id: tabelaId,
          preco_vigente: p.valor_unitario,
          preco_com_frete: p.valor_com_frete ?? null,
        }));

      if (precosRows.length > 0) {
        const { error: precosError } = await supabaseAdmin
          .from("precos_cliente")
          .upsert(precosRows, { onConflict: "tabela_id,cliente_id,produto_id" });
        if (precosError) {
          avisos.push(`Erro ao inserir preços: ${precosError.message}`);
        } else {
          precosImportados = precosRows.length;
        }
      }
    } catch (_e: any) {
      // Erros nas tabelas de clientes/preços não cancelam a importação de produtos
      // Logado aqui para diagnóstico — não retorna 500 ao usuário
      if (_e?.message !== "produtos-not-found" && _e?.message !== "cliente-error" && _e?.message !== "tabela-error") {
        console.error("[upload] erro inesperado no vínculo de preços:", _e);
      }
    }

    return NextResponse.json({
      imported: deduped.length,
      tipo_tabela,
      cliente: clienteResultado?.razao_social ?? null,
      cliente_id: clienteResultado?.id ?? null,
      tabela_id: tabelaId,
      precos_importados: precosImportados,
      avisos: avisos.length > 0 ? avisos : undefined,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erro inesperado." }, { status: 500 });
  }
}
