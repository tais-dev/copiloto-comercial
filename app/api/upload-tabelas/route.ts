import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabaseClient";
import { createClient } from "@supabase/supabase-js";
// ====== UPLOAD: busboy para suportar arquivos grandes (>4MB) sem truncamento ======
import Busboy from "busboy";

// ====== API RUNTIME: Node.js obrigatório para FormData com arquivos grandes ======
// Edge runtime não suporta Buffer nem XLSX corretamente.
export const runtime = "nodejs";

// ====== UPLOAD: tempo máximo de execução para arquivos grandes (~20MB) ======
export const maxDuration = 60; // segundos

// ====== UPLOAD: force-dynamic garante que o Route Handler não é cacheado ======
// e processa o body completo sem truncamento.
export const dynamic = "force-dynamic";

// ====== DB: SUPABASE ADMIN (service_role) para escrita nas tabelas de clientes/preços ======
// O client anon não tem permissão para fazer upsert em clientes/precos_cliente.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

// ====== PARSER: NÚMERO — suporta formato BR (1.234,56) e americano (1,313.00) ======
// Bermar exporta CSV com formato americano: vírgula=milhar, ponto=decimal, ex: "1,313.00"
function toNumberBR(v: any): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;

  // Remove aspas externas e espaços
  const s = String(v).trim().replace(/^"|"$/g, "").trim();
  if (!s || s === "-") return null;

  // Remove R$ e espaços internos
  const clean = s.replace(/\s/g, "").replace("R$", "");

  // Formato americano: 1,313.00 (vírgula=milhar, ponto=decimal)
  if (/^\d{1,3}(,\d{3})*(\.\d+)?$/.test(clean)) {
    const n = Number(clean.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }

  // Formato brasileiro: 1.313,00 (ponto=milhar, vírgula=decimal)
  const n = Number(clean.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// ====== PARSER: ACHAR LINHA DE CABEÇALHO ======
// Suporta múltiplos formatos de planilha:
// - GPANIZ:  "Codigo", "Descricao do Equipamento", "Valor Unitario"
// - Bermar:  "Modelo Produto", "Cod. Prod.", "Descrição do Produto", "Motor", "IPI", "28/56/84", "Valor Unitario"
// - Amapá:   "CÓD. REF. + DERIVAÇÃO", "DESCRIÇÃO + DERIVAÇÃO REF.", "IPI", "NCM", "COD EAN", "PREÇO DE VENDA COM DESCONTO"
function findHeaderRow(rows: any[][]) {
  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    const r = rows[i] || [];
    const headers = r.map((c) => norm(c));

    // Detecção específica Bermar: "Modelo Produto" + "Cod. Prod." na mesma linha
    const hasModeloProduto = headers.some((h) => h === "modelo produto");
    const hasCodProd = headers.some((h) => h.includes("cod prod"));
    if (hasModeloProduto && hasCodProd) return i;

    // Detecção Amapá: "CÓD. REF." (→ "cod ref") + "PREÇO DE VENDA COM DESCONTO"
    const hasCodRef = headers.some((h) => h.includes("cod ref"));
    const hasPrecoVenda = headers.some((h) => h.includes("preco de venda com desconto"));
    if (hasCodRef && hasPrecoVenda) return i;

    // Outros formatos (G.Paniz): "Codigo" + (descricao OU valor)
    const hasCodigo = headers.some((h) => h === "codigo");
    const hasDesc = headers.some((h) => h.includes("descricao"));
    const hasValor = headers.some((h) => h.includes("valor"));
    if (hasCodigo && (hasDesc || hasValor)) return i;
  }
  return -1;
}

// ====== CLIENTS (CRUD): DETECTAR SLUG DA FÁBRICA PELO NOME ======
// Evita depender da coluna `slug` na tabela fabricas (pode não existir no schema).
function nomeParaSlug(nome: string): string {
  const n = nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (n.includes("amapa") || n.includes("amapa")) return "amapa";
  if (n.includes("paniz")) return "gpaniz";
  if (n.includes("bermar") || n.includes("gastromaq")) return "bermar";
  return n.replace(/[^a-z0-9]/g, "");
}

// ====== CLIENTS (CRUD): DETECTAR CLIENTE E REGIÃO POR FÁBRICA ======
// Retorna os dados do cliente a criar/buscar com base na fábrica e no nome do arquivo.
function detectarCliente(
  fabrica_slug: string,
  tipo_tabela: string,
  filename: string
): {
  razao_social: string;
  nome_fantasia: string;
  regiao: string;
  tabela_nome: string;
} {
  // ====== CLIENTS: G.PANIZ ======
  if (fabrica_slug === "gpaniz") {
    if (tipo_tabela === "especial") {
      return {
        razao_social: "Milênio Distribuição",
        nome_fantasia: "Milênio",
        regiao: "SP — CIF",
        tabela_nome: "G.Paniz Especial",
      };
    }
    if (tipo_tabela === "ecommerce") {
      return {
        razao_social: "E-commerce SP",
        nome_fantasia: "E-commerce SP",
        regiao: "SP",
        tabela_nome: "G.Paniz E-commerce",
      };
    }
    // Normal: tabela padrão Sul/Sudeste
    return {
      razao_social: "G.Paniz Sul/Sudeste",
      nome_fantasia: "G.Paniz",
      regiao: "Sul/Sudeste",
      tabela_nome: "G.Paniz Normal",
    };
  }

  // ====== CLIENTS: BERMAR (tabela única, sem cliente específico) ======
  if (fabrica_slug === "bermar") {
    return {
      razao_social: "Bermar Geral",
      nome_fantasia: "Bermar",
      regiao: "Brasil",
      tabela_nome: "Bermar Geral",
    };
  }

  // ====== CLIENTS: AMAPÁ ======
  // Arquivo começando com "tabela" = Tabela Geral → cliente fixo "Amapá Geral"
  // Arquivo começando com "planilha" = planilha de cliente específico → extrai nome do arquivo
  if (fabrica_slug === "amapa") {
    const filenameLower = filename.toLowerCase();
    if (filenameLower.startsWith("planilha")) {
      // Extrai nome do cliente: remove prefixo planilha_amapa__ e sufixo de mês/ano
      const match = filename.match(
        /planilha[_\s]*amap[aá][_\s]*_?(.+?)(?:[_\s]+\d{4}|[_\s]+(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)[_\s]*\d{0,4}|\.(xlsx|xls|xlsm|csv))/i
      );
      const clienteRaw = match
        ? match[1].replace(/_/g, " ").trim()
        : filename.replace(/\.(xlsx|xls|xlsm|csv)$/i, "").replace(/_/g, " ").trim();
      const razao = clienteRaw || "Cliente Amapá";
      return {
        razao_social: razao,
        nome_fantasia: razao,
        regiao: "Brasil",
        tabela_nome: `Amapá - ${razao}`,
      };
    }
    // TABELA (qualquer arquivo que não seja planilha de cliente) → Tabela Geral
    return {
      razao_social: "Amapá Geral",
      nome_fantasia: "Amapá Geral",
      regiao: "Brasil",
      tabela_nome: "Amapá - Tabela Geral",
    };
  }

  // Fallback genérico
  return {
    razao_social: `${fabrica_slug} — Geral`,
    nome_fantasia: fabrica_slug,
    regiao: "BR",
    tabela_nome: `${fabrica_slug} ${tipo_tabela}`,
  };
}

// ====== IMPORT (CSV -> STAGING -> UPSERT): LÓGICA PRINCIPAL ======
export async function POST(req: Request) {
  // ====== UPLOAD: parse multipart com busboy — suporta arquivos grandes (>4MB) ======
  // req.formData() falha silenciosamente para arquivos grandes no Next.js App Router.
  // Solução: ler o body como ArrayBuffer e parsear com busboy manualmente.
  let fileBuffer: Buffer | null = null;
  let fileName = "";
  const fields: Record<string, string> = {};

  try {
    const contentType = req.headers.get("content-type") || "";

    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Content-Type deve ser multipart/form-data." },
        { status: 400 }
      );
    }

    const arrayBuffer = await req.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log("[upload-tabelas] Content-Type:", contentType);
    console.log("[upload-tabelas] Buffer recebido:", buffer.length, "bytes");

    await new Promise<void>((resolve, reject) => {
      const bb = Busboy({
        headers: { "content-type": contentType },
        limits: { fileSize: 50 * 1024 * 1024 },
      });

      bb.on("field", (name, val) => {
        fields[name] = val;
      });

      bb.on("file", (_name, stream, info) => {
        fileName = info.filename;
        const chunks: Buffer[] = [];
        stream.on("data", (chunk: Buffer) => chunks.push(chunk));
        stream.on("end", () => {
          fileBuffer = Buffer.concat(chunks);
        });
        stream.resume();
      });

      bb.on("finish", () => resolve());
      bb.on("error", (err: Error) => reject(err));

      // Escrever o buffer diretamente — mais robusto que pipe com Readable
      bb.write(buffer);
      bb.end();
    });
  } catch (formErr: any) {
    console.error("[upload-tabelas] Falha ao parsear multipart:", formErr);
    return NextResponse.json(
      {
        error: `Erro ao processar o arquivo enviado. Verifique se o arquivo não está corrompido e tente novamente. (${formErr?.message ?? "parse inválido"})`,
      },
      { status: 400 }
    );
  }

  try {
    // ====== UPLOAD: PEGAR FABRICA (ACEITA UUID, NOME ANTIGO E SLUG) ======
    let fabrica_id: string | null =
      fields["fabrica_id"] || fields["fabricaId"] || null;

    // Resolução slug → UUID: aceita 'amapa', 'gpaniz', 'bermar' enviado pelo novo UI
    const fabrica_slug_direto = fields["fabrica_slug"] || null;
    if (!fabrica_id && fabrica_slug_direto) {
      const { data: todasFabricas } = await supabaseAdmin
        .from("fabricas")
        .select("id, nome");
      const match = (todasFabricas ?? []).find(
        (f: { id: string; nome: string }) => nomeParaSlug(f.nome) === fabrica_slug_direto
      );
      if (match) fabrica_id = match.id;
    }

    const tipo_tabela = (fields["tipo_tabela"] ?? "ecommerce").toLowerCase();

    if (!fileBuffer || !fileName)
      return NextResponse.json({ error: "Arquivo não enviado." }, { status: 400 });
    if (!fabrica_id)
      return NextResponse.json(
        { error: "Fábrica não encontrada. Envie fabrica_id ou fabrica_slug válido." },
        { status: 400 }
      );

    const filename = fileName.toLowerCase();

    // ====== PARSE: LER XLSX/CSV ======
    let matrix: any[][] = [];

    if (filename.endsWith(".xlsx") || filename.endsWith(".xls") || filename.endsWith(".xlsm")) {
      const buf = fileBuffer as Buffer;
      const wb = XLSX.read(buf, { type: "buffer" });
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      matrix = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as any[][];
    } else if (filename.endsWith(".csv")) {
      // Tentar latin-1/Windows-1252 primeiro (padrão Excel Windows),
      // com fallback para UTF-8 caso o decoder não exista no ambiente
      let text: string;
      try {
        const decoder = new TextDecoder("windows-1252");
        text = decoder.decode(fileBuffer as Buffer);
      } catch {
        text = (fileBuffer as Buffer).toString("utf-8");
      }
      const wb = XLSX.read(text, { type: "string", codepage: 1252 });
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

    console.log("[upload] headerIndex:", headerIndex);
    console.log("[upload] headerRow length:", headerRow.length);
    console.log("[upload] headerRow normalizado completo:", headerRow);

    // ====== PARSE: MAPEAR COLUNAS (FLEXÍVEL) ======
    const colMap: { [k: string]: number | null } = {
      codigo: null,          // Bermar col 0 = "Modelo Produto" / G.Paniz = "Codigo" / Amapá col 1 = "CÓD. REF."
      id_fabrica: null,      // Bermar col 1 = "Cod. Prod." (código numérico interno)
      descricao: null,       // Bermar col 2 = "Descrição do Produto" / Amapá col 2 = "DESCRIÇÃO + DERIVAÇÃO"
      motor: null,           // Bermar col 3 = "Motor" (lido, não salvo — sem coluna no schema)
      ipi: null,             // Amapá col 4 = IPI em decimal (0.0325 = 3,25%) → convertido para %
      ncm: null,             // Amapá col 5 = NCM
      ean: null,             // Amapá col 7 = COD EAN
      valor_unitario: null,  // Bermar col 6 = "Valor Unitario" / Amapá col 9 = "PREÇO DE VENDA COM DESCONTO"
      valor_com_frete: null, // Bermar col 5 = "28/56/84" — prazo, apenas informativo
      unidade: null,
    };

    // ====== PARSE: MAPEAMENTO DE COLUNAS (MULTI-FORMATO) ======
    // Suporta G.Paniz, Bermar e Amapá.
    headerRow.forEach((col, idx) => {
      // Código do produto:
      // - G.Paniz = "Codigo"
      // - Bermar col 0 = "Modelo Produto"
      // - Amapá col 1 = "CÓD. REF. + DERIVAÇÃO" → norm "cod ref derivacao"
      // NÃO mapear "cod prod" aqui — vai para id_fabrica (Bermar col 1)
      if (col === "codigo" || col === "modelo produto" || col.includes("cod ref"))
        colMap.codigo = colMap.codigo ?? idx;

      // ID interno da fábrica: Bermar col 1 = "Cod. Prod." (ex: "12345")
      else if (col.includes("cod prod"))
        colMap.id_fabrica = colMap.id_fabrica ?? idx;

      // Descrição (G.Paniz, Bermar, Amapá — todos contêm "descricao")
      else if (col.includes("descricao"))
        colMap.descricao = colMap.descricao ?? idx;

      // Motor (Bermar col 3)
      else if (col === "motor")
        colMap.motor = colMap.motor ?? idx;

      // IPI (Amapá col 4 = decimal, ex: 0.0325)
      else if (col === "ipi")
        colMap.ipi = colMap.ipi ?? idx;

      // NCM (Amapá col 5)
      else if (col === "ncm")
        colMap.ncm = colMap.ncm ?? idx;

      // EAN (Amapá col 7 = "COD EAN")
      else if (col.includes("ean"))
        colMap.ean = colMap.ean ?? idx;

      // Valor unitário:
      // - G.Paniz/Bermar = "Valor Unitario"
      // - Amapá col 9 = "PREÇO DE VENDA COM DESCONTO" (apenas 1ª ocorrência = FOB)
      else if (col.includes("valor unitario") || col === "valor" || col.includes("preco de venda com desconto"))
        colMap.valor_unitario = colMap.valor_unitario ?? idx;

      // Prazo/frete — informativo (Bermar col 5 = "28/56/84" → norm "28 56 84")
      else if (col.includes("frete") || col === "28 56 84" || (col.includes("28") && col.includes("56")))
        colMap.valor_com_frete = colMap.valor_com_frete ?? idx;

      // Unidade
      else if (col.includes("unidade"))
        colMap.unidade = colMap.unidade ?? idx;
    });

    console.log("[upload] colMap:", JSON.stringify(colMap));

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

        // id_fabrica: código numérico interno (Bermar col 1 = "Cod. Prod.")
        const id_fabrica =
          colMap.id_fabrica !== null ? (String(r[colMap.id_fabrica] ?? "").trim() || null) : null;

        // ncm e ean (Amapá cols 5 e 7)
        const ncm =
          colMap.ncm !== null ? (String(r[colMap.ncm] ?? "").trim() || null) : null;
        const ean =
          colMap.ean !== null
            ? (String(r[colMap.ean] ?? "").replace(/\.0$/, "").trim() || null)
            : null;

        // ipi: Amapá armazena como decimal (0.0325 = 3,25%) — converter para %
        const ipiRaw = colMap.ipi !== null ? toNumberBR(r[colMap.ipi]) : null;
        const ipi = ipiRaw !== null ? (ipiRaw < 1 ? ipiRaw * 100 : ipiRaw) : null;

        return {
          fabrica_id,
          tipo_tabela,
          codigo,
          descricao,
          unidade,
          id_fabrica,
          ncm,
          ean,
          ipi,
          valor_unitario,
          valor_com_frete,
        };
      })
      .filter((row) => {
        if (!row) return false;
        const codigoStr = String(row.codigo ?? "").toLowerCase();
        // Ignorar linhas de cabeçalho repetido (Bermar = "modelo", Amapá = "cod ref")
        if (codigoStr.includes("modelo") || codigoStr.includes("cod")) return false;
        // Ignorar linhas sem código ou descrição
        if (!row.codigo || !row.descricao) return false;
        // Ignorar linhas de categoria/seção sem preço
        if (row.valor_unitario == null || row.valor_unitario === 0) return false;
        return true;
      }) as any[];

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

    // ====== DB: UPSERT EM PRODUTOS (lógica existente mantida) ======
    const { error: prodError } = await supabase
      .from("produtos")
      .upsert(deduped, { onConflict: "fabrica_id,tipo_tabela,codigo" });

    if (prodError) {
      return NextResponse.json({ error: prodError.message }, { status: 500 });
    }

    // ====== IMPORT (CSV -> STAGING -> UPSERT): VINCULAR CLIENTES E PREÇOS ======
    // Esta etapa é opcional — se falhar, a importação de produtos já foi bem-sucedida.
    let clienteResultado: { razao_social: string; id: string } | null = null;
    let tabelaId: string | null = null;
    let precosImportados = 0;
    const avisos: string[] = [];

    try {
      // 1. Buscar nome da fábrica para derivar o slug
      const { data: fabricaData, error: fabricaError } = await supabaseAdmin
        .from("fabricas")
        .select("nome")
        .eq("id", fabrica_id)
        .single();

      if (fabricaError || !fabricaData) {
        avisos.push("Fábrica não encontrada — preços não vinculados.");
        throw new Error("fabrica-not-found");
      }

      const fabrica_slug = nomeParaSlug(fabricaData.nome);

      // ====== CLIENTS: AMAPÁ — preço base em produtos.valor_unitario, sem precos_cliente ======
      // O frete é calculado em tempo real na consulta por região — não precisa de cliente fictício.
      if (fabrica_slug === "amapa") {
        return NextResponse.json({
          imported: deduped.length,
          tipo_tabela,
          cliente: "Amapá Geral",
          fabrica_slug: "amapa",
          precos_importados: 0,
        });
      }

      // 2. Detectar dados do cliente com base na fábrica + tipo_tabela + filename
      const dadosCliente = detectarCliente(fabrica_slug, tipo_tabela, fileName);

      // 3. Upsert do cliente em `clientes`
      // onConflict em razao_social (deve ter índice unique no banco)
      const { data: clienteUpserted, error: clienteError } = await supabaseAdmin
        .from("clientes")
        .upsert(
          {
            razao_social: dadosCliente.razao_social,
            nome_fantasia: dadosCliente.nome_fantasia,
            regiao: dadosCliente.regiao,
            ativo: true,
          },
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

      // 4. Upsert do vínculo cliente ↔ fábrica em `clientes_fabricas`
      await supabaseAdmin
        .from("clientes_fabricas")
        .upsert(
          {
            cliente_id,
            fabrica: fabrica_slug,
            tabela: tipo_tabela,
            regiao: dadosCliente.regiao,
          },
          { onConflict: "cliente_id,fabrica" }
        );

      // 5. Inserir registro de tabela de preço em `tabelas_preco`
      // Colunas corretas: fabrica_slug, nome, arquivo_nome, ativa
      // (cliente_id, fabrica_id, tipo_tabela NÃO existem nesta tabela)
      const { data: tabelaData, error: tabelaError } = await supabaseAdmin
        .from("tabelas_preco")
        .insert({
          fabrica_slug: fabrica_slug,
          nome: dadosCliente.tabela_nome,
          arquivo_nome: fileName,
          ativa: true,
        })
        .select("id")
        .single();

      if (tabelaError || !tabelaData) {
        avisos.push(`Erro ao criar tabela de preço: ${tabelaError?.message ?? "desconhecido"}`);
        throw new Error("tabela-error");
      }

      tabelaId = tabelaData.id;

      // 6. Buscar os produtos recém-inseridos para pegar seus UUIDs
      const codigos = deduped.map((r: any) => r.codigo);

      const { data: produtosImportados, error: prodBuscaError } = await supabaseAdmin
        .from("produtos")
        .select("id, codigo, valor_unitario, valor_com_frete")
        .eq("fabrica_id", fabrica_id)
        .eq("tipo_tabela", tipo_tabela)
        .in("codigo", codigos);

      if (prodBuscaError || !produtosImportados?.length) {
        avisos.push("Produtos importados mas preços não puderam ser vinculados.");
        throw new Error("produtos-not-found");
      }

      // 7. Montar registros de `precos_cliente` e fazer upsert
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
    } catch (_e) {
      // Erros nas tabelas de clientes/preços não cancelam a importação de produtos
      // Os avisos já foram adicionados acima
    }

    // ====== RETORNO: RESULTADO COMPLETO ======
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
